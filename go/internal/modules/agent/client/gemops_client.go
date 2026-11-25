package client

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"tomo-backend/internal/modules/agent/dto"
)

// UpstreamError represents an HTTP error response returned by gemops-agent.
type UpstreamError struct {
	StatusCode int
	Message    string
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("gemops returned HTTP %d: %s", e.StatusCode, e.Message)
}

// ConnectionError represents a transport/network failure reaching gemops-agent.
type ConnectionError struct {
	Transport dto.GemOpsTransportInfo
	Err       error
}

func (e *ConnectionError) Error() string {
	if e == nil || e.Err == nil {
		return "gemops-agent unreachable"
	}
	return fmt.Sprintf("upstream gemops-agent unreachable (%s: %s): %v", e.Transport.Mode, e.Transport.Target, e.Err)
}

func (e *ConnectionError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type resolvedEndpoint struct {
	info         dto.GemOpsTransportInfo
	baseURL      string
	httpClient   *http.Client
	streamClient *http.Client
	socketNote   string
}

// ClientOptions configures how GemOpsClient connects to gemops-agent or gemops-web.
type ClientOptions struct {
	BaseURL    string
	SocketPath string
	AuthToken  string
	BasicUser  string
	BasicPass  string
}

// GemOpsClient communicates with gemops-agent over HTTP (TCP or Unix Domain Socket).
type GemOpsClient struct {
	socketPath       string
	tcpURL           string
	authToken        string
	basicUser        string
	basicPass        string
	prefixMu         sync.RWMutex
	tcpPathPrefix    string
	unixHTTPClient   *http.Client
	unixStreamClient *http.Client
	tcpHTTPClient    *http.Client
	tcpStreamClient  *http.Client
}

// NewGemOpsClient creates a GemOpsClient following gemops-web transport rules:
//   - socketPath == "-" disables Unix socket and forces TCP via baseURL.
//   - baseURL == "-" disables TCP fallback and forces Unix socket.
//   - When both socketPath and baseURL are configured, prefers Unix when socketPath exists
//     and is accessible, and falls back to TCP otherwise (including runtime dial failures).
//   - When both are empty, defaults to http://127.0.0.1:9090.
func NewGemOpsClient(baseURL, socketPath string) *GemOpsClient {
	return NewGemOpsClientWithOptions(ClientOptions{
		BaseURL:    baseURL,
		SocketPath: socketPath,
	})
}

// NewGemOpsClientWithOptions creates a GemOpsClient with optional gateway authentication.
func NewGemOpsClientWithOptions(opts ClientOptions) *GemOpsClient {
	trimmedBase := strings.TrimRight(strings.TrimSpace(opts.BaseURL), "/")
	trimmedSock := strings.TrimSpace(opts.SocketPath)

	if trimmedBase == "-" {
		trimmedBase = ""
	}
	if trimmedSock == "-" {
		trimmedSock = ""
	}

	if trimmedBase != "" && !strings.HasPrefix(trimmedBase, "http://") && !strings.HasPrefix(trimmedBase, "https://") {
		trimmedBase = "http://" + trimmedBase
	}
	if trimmedSock == "" && trimmedBase == "" {
		trimmedBase = "http://127.0.0.1:9090"
	}

	c := &GemOpsClient{
		socketPath: trimmedSock,
		tcpURL:     trimmedBase,
		authToken:  strings.TrimSpace(opts.AuthToken),
		basicUser:  strings.TrimSpace(opts.BasicUser),
		basicPass:  opts.BasicPass,
	}

	if trimmedSock != "" {
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		unixTransport := &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return dialer.DialContext(ctx, "unix", trimmedSock)
			},
			MaxIdleConns:       16,
			IdleConnTimeout:    60 * time.Second,
			DisableCompression: true,
		}
		c.unixHTTPClient = &http.Client{
			Transport: unixTransport,
			Timeout:   90 * time.Second,
		}
		c.unixStreamClient = &http.Client{
			Transport: unixTransport,
			Timeout:   0,
		}
	}

	if trimmedBase != "" {
		tcpTransport := &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:        16,
			IdleConnTimeout:     60 * time.Second,
			TLSHandshakeTimeout: 5 * time.Second,
			DisableCompression:  true,
		}
		c.tcpHTTPClient = &http.Client{
			Transport: tcpTransport,
			Timeout:   90 * time.Second,
		}
		c.tcpStreamClient = &http.Client{
			Transport: tcpTransport,
			Timeout:   0,
		}
	}

	return c
}

func (c *GemOpsClient) tcpEndpoint(socketNote string) resolvedEndpoint {
	c.prefixMu.RLock()
	prefix := c.tcpPathPrefix
	c.prefixMu.RUnlock()

	base := c.tcpURL
	if prefix != "" && !strings.HasSuffix(base, prefix) {
		base += prefix
	}

	return resolvedEndpoint{
		info: dto.GemOpsTransportInfo{
			Mode:       "tcp",
			Target:     base,
			SocketPath: c.socketPath,
			TCPURL:     base,
		},
		baseURL:      base,
		httpClient:   c.tcpHTTPClient,
		streamClient: c.tcpStreamClient,
		socketNote:   socketNote,
	}
}

func (c *GemOpsClient) canTryAgentPrefix(ep resolvedEndpoint) bool {
	if ep.info.Mode != "tcp" || c.tcpURL == "" {
		return false
	}
	if strings.HasSuffix(ep.baseURL, "/api/agent") {
		return false
	}
	c.prefixMu.RLock()
	prefix := c.tcpPathPrefix
	c.prefixMu.RUnlock()
	return prefix == ""
}

func (c *GemOpsClient) setTCPPathPrefix(prefix string) {
	c.prefixMu.Lock()
	c.tcpPathPrefix = prefix
	c.prefixMu.Unlock()
}

func (c *GemOpsClient) resolveEndpoint() resolvedEndpoint {
	if c.socketPath != "" {
		unixEP := resolvedEndpoint{
			info: dto.GemOpsTransportInfo{
				Mode:       "unix",
				Target:     c.socketPath,
				SocketPath: c.socketPath,
				TCPURL:     c.tcpURL,
			},
			baseURL:      "http://unix",
			httpClient:   c.unixHTTPClient,
			streamClient: c.unixStreamClient,
		}
		if c.tcpURL == "" {
			return unixEP
		}
		if info, statErr := os.Stat(c.socketPath); statErr == nil && !info.IsDir() {
			return unixEP
		} else {
			return c.tcpEndpoint(fmt.Sprintf("socket %s unavailable (%v); tcp fallback failed", c.socketPath, statErr))
		}
	}

	return c.tcpEndpoint("")
}

func (c *GemOpsClient) applyAuthHeaders(req *http.Request) {
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
		req.Header.Set("X-GemOps-Token", c.authToken)
		return
	}
	if c.basicUser != "" && (req.URL == nil || req.URL.User == nil) {
		req.SetBasicAuth(c.basicUser, c.basicPass)
	}
}

func isHTMLContentType(ct string) bool {
	lower := strings.ToLower(strings.TrimSpace(ct))
	return strings.Contains(lower, "text/html") || strings.Contains(lower, "application/xhtml+xml")
}

func (c *GemOpsClient) wrapTransportError(ep resolvedEndpoint, err error) error {
	if err == nil {
		return nil
	}
	if ep.socketNote != "" {
		err = fmt.Errorf("%s: %w", ep.socketNote, err)
	}
	return &ConnectionError{
		Transport: ep.info,
		Err:       err,
	}
}

// Info returns metadata about the currently active upstream transport.
func (c *GemOpsClient) Info() dto.GemOpsTransportInfo {
	return c.resolveEndpoint().info
}

// CheckStatus probes GET /status with a short 2s timeout to determine if gemops-agent is reachable.
func (c *GemOpsClient) CheckStatus(ctx context.Context) (bool, int, string) {
	ep := c.resolveEndpoint()
	probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	doProbe := func(targetEP resolvedEndpoint, path string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, targetEP.baseURL+path, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/json")
		c.applyAuthHeaders(req)
		return targetEP.httpClient.Do(req)
	}

	resp, err := doProbe(ep, "/status")
	if err != nil && ep.info.Mode == "unix" && c.tcpURL != "" && c.tcpHTTPClient != nil && ctx.Err() == nil {
		ep = c.tcpEndpoint(fmt.Sprintf("unix socket %s failed (%v); tcp fallback failed", c.socketPath, err))
		resp, err = doProbe(ep, "/status")
	}
	if err != nil {
		return false, 0, c.wrapTransportError(ep, err).Error()
	}

	if (resp.StatusCode == http.StatusNotFound || isHTMLContentType(resp.Header.Get("Content-Type"))) && c.canTryAgentPrefix(ep) {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()

		prefixedResp, prefErr := doProbe(ep, "/api/agent/status")
		if prefErr == nil {
			resp = prefixedResp
			if resp.StatusCode == http.StatusOK && !isHTMLContentType(resp.Header.Get("Content-Type")) {
				c.setTCPPathPrefix("/api/agent")
			}
		} else {
			return false, 0, c.wrapTransportError(ep, prefErr).Error()
		}
	}

	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode == http.StatusOK && isHTMLContentType(resp.Header.Get("Content-Type")) {
		return false, http.StatusBadGateway, "upstream returned HTML instead of JSON; verify GEMOPS_BASE_URL points to gemops-agent or gemops-web /api/agent"
	}
	return resp.StatusCode == http.StatusOK, resp.StatusCode, ""
}

func (c *GemOpsClient) GetStatus(ctx context.Context) (*dto.GemOpsStatusResponse, error) {
	var out dto.GemOpsStatusResponse
	if err := c.doJSON(ctx, http.MethodGet, "/status", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *GemOpsClient) GetInfo(ctx context.Context) (*dto.GemOpsInfoResponse, error) {
	var out dto.GemOpsInfoResponse
	if err := c.doJSON(ctx, http.MethodGet, "/agy/info", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *GemOpsClient) GetUsage(ctx context.Context) (map[string]interface{}, error) {
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodGet, "/agy/usage", nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) ListHarnesses(ctx context.Context) (*dto.GemOpsHarnessesResponse, error) {
	var out dto.GemOpsHarnessesResponse
	if err := c.doJSON(ctx, http.MethodGet, "/harnesses", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *GemOpsClient) GetHarness(ctx context.Context, id string) (map[string]interface{}, error) {
	path := "/harnesses/" + url.PathEscape(strings.TrimSpace(id))
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) GetResolvedHarness(ctx context.Context, id string) (map[string]interface{}, error) {
	path := "/harnesses/" + url.PathEscape(strings.TrimSpace(id)) + "/resolved"
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) GetSessionConfig(ctx context.Context) (*dto.GemOpsSessionConfig, error) {
	var out dto.GemOpsSessionConfig
	if err := c.doJSON(ctx, http.MethodGet, "/session/config", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *GemOpsClient) UpdateSessionConfig(ctx context.Context, cfg dto.GemOpsSessionConfig, actor string) (map[string]interface{}, error) {
	var out map[string]interface{}
	headers := actorHeaders(actor)
	if err := c.doJSON(ctx, http.MethodPost, "/session/config", headers, cfg, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) StartPrompt(ctx context.Context, req dto.GemOpsPromptRequest, actor string) (*dto.GemOpsPromptResponse, error) {
	var out dto.GemOpsPromptResponse
	headers := actorHeaders(actor)
	if hid := strings.TrimSpace(req.HarnessID); hid != "" {
		if headers == nil {
			headers = map[string]string{}
		}
		headers["X-Harness-Id"] = hid
	}
	if cid := strings.TrimSpace(req.ConversationID); cid != "" {
		if headers == nil {
			headers = map[string]string{}
		}
		headers["X-Conversation-Id"] = cid
	}
	if err := c.doJSON(ctx, http.MethodPost, "/prompt", headers, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *GemOpsClient) ResolvePermission(ctx context.Context, permID, decision, actor string) (map[string]interface{}, error) {
	path := "/permissions/" + url.PathEscape(strings.TrimSpace(permID))
	body := map[string]string{
		"decision": decision,
		"actor":    actor,
	}
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodPost, path, actorHeaders(actor), body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) Cancel(ctx context.Context) (map[string]interface{}, error) {
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodPost, "/cancel", nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) Reset(ctx context.Context, compact, hard bool, harnessID, conversationID string) (map[string]interface{}, error) {
	q := url.Values{}
	if compact {
		q.Set("compact", "1")
	}
	if hard {
		q.Set("hard", "1")
	}
	trimmedHarness := strings.TrimSpace(harnessID)
	if trimmedHarness != "" {
		q.Set("harnessId", trimmedHarness)
	}
	trimmedConv := strings.TrimSpace(conversationID)
	if trimmedConv != "" {
		q.Set("conversationId", trimmedConv)
	}
	path := "/reset"
	if encoded := q.Encode(); encoded != "" {
		path += "?" + encoded
	}
	var headers map[string]string
	if trimmedHarness != "" || trimmedConv != "" {
		headers = map[string]string{}
		if trimmedHarness != "" {
			headers["X-Harness-Id"] = trimmedHarness
		}
		if trimmedConv != "" {
			headers["X-Conversation-Id"] = trimmedConv
		}
	}
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodPost, path, headers, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) ListSessions(ctx context.Context) (map[string]interface{}, error) {
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodGet, "/sessions", nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *GemOpsClient) DeleteSession(ctx context.Context, conversationID, harnessID string) (map[string]interface{}, error) {
	path := "/sessions/" + url.PathEscape(strings.TrimSpace(conversationID))
	if trimmedHarness := strings.TrimSpace(harnessID); trimmedHarness != "" {
		path += "?harnessId=" + url.QueryEscape(trimmedHarness)
	}
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodDelete, path, nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// StreamRawEvents opens the raw SSE response at GET /events for unbuffered proxying.
// Callers are responsible for closing resp.Body when finished.
func (c *GemOpsClient) StreamRawEvents(ctx context.Context, lastEventID, rawQuery string) (*http.Response, error) {
	ep := c.resolveEndpoint()
	cleanLastID := strings.TrimSpace(lastEventID)

	buildStreamReq := func(targetEP resolvedEndpoint, pathPrefix string) (*http.Request, error) {
		targetURL := targetEP.baseURL + pathPrefix + "/events"
		if strings.TrimSpace(rawQuery) != "" {
			targetURL += "?" + rawQuery
		} else if cleanLastID != "" {
			targetURL += "?lastEventId=" + url.QueryEscape(cleanLastID)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "text/event-stream")
		if cleanLastID != "" {
			req.Header.Set("Last-Event-ID", cleanLastID)
		}
		c.applyAuthHeaders(req)
		return req, nil
	}

	req, err := buildStreamReq(ep, "")
	if err != nil {
		return nil, err
	}

	resp, err := ep.streamClient.Do(req)
	if err != nil && ep.info.Mode == "unix" && c.tcpURL != "" && c.tcpStreamClient != nil && ctx.Err() == nil {
		ep = c.tcpEndpoint(fmt.Sprintf("unix socket %s failed (%v); tcp fallback failed", c.socketPath, err))
		if tcpReq, reqErr := buildStreamReq(ep, ""); reqErr == nil {
			resp, err = ep.streamClient.Do(tcpReq)
		}
	}
	if err != nil {
		if ctx.Err() != nil {
			return nil, err
		}
		return nil, c.wrapTransportError(ep, err)
	}

	if (resp.StatusCode == http.StatusNotFound || isHTMLContentType(resp.Header.Get("Content-Type"))) && c.canTryAgentPrefix(ep) {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()

		prefReq, reqErr := buildStreamReq(ep, "/api/agent")
		if reqErr != nil {
			return nil, reqErr
		}
		prefResp, prefErr := ep.streamClient.Do(prefReq)
		if prefErr != nil {
			if ctx.Err() != nil {
				return nil, prefErr
			}
			return nil, c.wrapTransportError(ep, prefErr)
		}
		resp = prefResp
		if resp.StatusCode >= 200 && resp.StatusCode < 300 && !isHTMLContentType(resp.Header.Get("Content-Type")) {
			c.setTCPPathPrefix("/api/agent")
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := readErrorBody(resp.Body)
		_ = resp.Body.Close()
		return nil, &UpstreamError{StatusCode: resp.StatusCode, Message: msg}
	}
	if isHTMLContentType(resp.Header.Get("Content-Type")) {
		_ = resp.Body.Close()
		return nil, &UpstreamError{
			StatusCode: http.StatusBadGateway,
			Message:    "upstream returned HTML instead of SSE stream; verify GEMOPS_BASE_URL points to gemops-agent or gemops-web /api/agent",
		}
	}
	return resp, nil
}

// SubscribeEvents opens the SSE stream at GET /events.
func (c *GemOpsClient) SubscribeEvents(ctx context.Context, lastEventID string) (*EventStream, error) {
	resp, err := c.StreamRawEvents(ctx, lastEventID, "")
	if err != nil {
		return nil, err
	}

	return &EventStream{
		body:   resp.Body,
		reader: bufio.NewReaderSize(resp.Body, 64*1024),
	}, nil
}

// EventStream reads parsed SSE frames from gemops /events.
type EventStream struct {
	body   io.ReadCloser
	reader *bufio.Reader
}

func (s *EventStream) Close() error {
	if s == nil || s.body == nil {
		return nil
	}
	return s.body.Close()
}

// Next blocks until the next valid GemOpsEvent frame is received or an error/EOF occurs.
func (s *EventStream) Next() (*dto.GemOpsEvent, error) {
	var eventName string
	var eventID string
	var dataLines []string

	for {
		line, err := s.reader.ReadString('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, err
		}

		trimmedLine := strings.TrimRight(line, "\r\n")
		if trimmedLine == "" {
			if len(dataLines) > 0 {
				rawPayload := strings.Join(dataLines, "\n")
				ev, parseErr := parseEventFrame(eventID, eventName, rawPayload)
				eventName = ""
				eventID = ""
				dataLines = nil
				if parseErr == nil {
					return ev, nil
				}
			} else {
				eventName = ""
				eventID = ""
			}
			if errors.Is(err, io.EOF) {
				return nil, io.EOF
			}
			continue
		}

		if strings.HasPrefix(trimmedLine, ":") {
			if errors.Is(err, io.EOF) {
				return nil, io.EOF
			}
			continue
		}

		field, value, hasColon := strings.Cut(trimmedLine, ":")
		if !hasColon {
			field = trimmedLine
			value = ""
		} else {
			value = strings.TrimPrefix(value, " ")
		}

		switch field {
		case "id":
			eventID = value
		case "event":
			eventName = value
		case "data":
			dataLines = append(dataLines, value)
		}

		if errors.Is(err, io.EOF) {
			if len(dataLines) > 0 {
				rawPayload := strings.Join(dataLines, "\n")
				if ev, parseErr := parseEventFrame(eventID, eventName, rawPayload); parseErr == nil {
					return ev, nil
				}
			}
			return nil, io.EOF
		}
	}
}

func parseEventFrame(id, eventName, rawPayload string) (*dto.GemOpsEvent, error) {
	var ev dto.GemOpsEvent
	if err := json.Unmarshal([]byte(rawPayload), &ev); err != nil {
		return nil, err
	}
	if ev.Type == "" {
		ev.Type = eventName
	}
	if ev.ID == "" {
		ev.ID = id
	}
	return &ev, nil
}

func (c *GemOpsClient) doJSON(ctx context.Context, method, path string, headers map[string]string, body interface{}, out interface{}) error {
	ep := c.resolveEndpoint()
	var encoded []byte
	if body != nil {
		var err error
		encoded, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}

	buildReq := func(targetEP resolvedEndpoint, pathPrefix string) (*http.Request, error) {
		var reqBody io.Reader
		if encoded != nil {
			reqBody = bytes.NewReader(encoded)
		}
		req, err := http.NewRequestWithContext(ctx, method, targetEP.baseURL+pathPrefix+path, reqBody)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/json")
		if encoded != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		c.applyAuthHeaders(req)
		for k, v := range headers {
			if strings.TrimSpace(v) != "" {
				req.Header.Set(k, v)
			}
		}
		return req, nil
	}

	req, err := buildReq(ep, "")
	if err != nil {
		return err
	}

	resp, err := ep.httpClient.Do(req)
	if err != nil && ep.info.Mode == "unix" && c.tcpURL != "" && c.tcpHTTPClient != nil && ctx.Err() == nil {
		ep = c.tcpEndpoint(fmt.Sprintf("unix socket %s failed (%v); tcp fallback failed", c.socketPath, err))
		if tcpReq, reqErr := buildReq(ep, ""); reqErr == nil {
			resp, err = ep.httpClient.Do(tcpReq)
		}
	}
	if err != nil {
		if ctx.Err() != nil {
			return err
		}
		return c.wrapTransportError(ep, err)
	}

	if (resp.StatusCode == http.StatusNotFound || isHTMLContentType(resp.Header.Get("Content-Type"))) && c.canTryAgentPrefix(ep) {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()

		prefReq, reqErr := buildReq(ep, "/api/agent")
		if reqErr != nil {
			return reqErr
		}
		prefResp, prefErr := ep.httpClient.Do(prefReq)
		if prefErr != nil {
			if ctx.Err() != nil {
				return prefErr
			}
			return c.wrapTransportError(ep, prefErr)
		}
		resp = prefResp
		if !isHTMLContentType(resp.Header.Get("Content-Type")) && resp.StatusCode != http.StatusNotFound {
			c.setTCPPathPrefix("/api/agent")
		}
	}

	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &UpstreamError{
			StatusCode: resp.StatusCode,
			Message:    readErrorBody(resp.Body),
		}
	}

	if isHTMLContentType(resp.Header.Get("Content-Type")) {
		return &UpstreamError{
			StatusCode: http.StatusBadGateway,
			Message:    "upstream returned HTML instead of JSON; verify GEMOPS_BASE_URL points to gemops-agent or gemops-web /api/agent",
		}
	}

	if out == nil {
		return nil
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(out)
}

func actorHeaders(actor string) map[string]string {
	trimmed := strings.TrimSpace(actor)
	if trimmed == "" {
		return nil
	}
	return map[string]string{
		"X-Forwarded-User": trimmed,
	}
}

func readErrorBody(r io.Reader) string {
	raw, err := io.ReadAll(io.LimitReader(r, 64*1024))
	if err != nil {
		return err.Error()
	}
	var errPayload map[string]interface{}
	if json.Unmarshal(raw, &errPayload) == nil {
		if msg, ok := errPayload["error"].(string); ok && strings.TrimSpace(msg) != "" {
			return msg
		}
		if msg, ok := errPayload["message"].(string); ok && strings.TrimSpace(msg) != "" {
			return msg
		}
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return "unknown upstream error"
	}
	return trimmed
}
