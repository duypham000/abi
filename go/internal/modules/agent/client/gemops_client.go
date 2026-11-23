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
	"strings"
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

// GemOpsClient communicates with gemops-agent over HTTP (TCP or Unix Domain Socket).
type GemOpsClient struct {
	baseURL      string
	httpClient   *http.Client
	streamClient *http.Client
}

// NewGemOpsClient creates a GemOpsClient. When socketPath is non-empty, requests dial that Unix socket;
// otherwise requests go to baseURL (defaulting to http://127.0.0.1:9090).
func NewGemOpsClient(baseURL, socketPath string) *GemOpsClient {
	trimmedBase := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	trimmedSock := strings.TrimSpace(socketPath)

	var transport *http.Transport
	if trimmedSock != "" {
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		transport = &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return dialer.DialContext(ctx, "unix", trimmedSock)
			},
		}
		trimmedBase = "http://unix"
	} else {
		if trimmedBase == "" {
			trimmedBase = "http://127.0.0.1:9090"
		}
		transport = &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:        16,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 5 * time.Second,
		}
	}

	return &GemOpsClient{
		baseURL: trimmedBase,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		},
		streamClient: &http.Client{
			Transport: transport,
		},
	}
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

func (c *GemOpsClient) ListHarnesses(ctx context.Context) (*dto.GemOpsHarnessesResponse, error) {
	var out dto.GemOpsHarnessesResponse
	if err := c.doJSON(ctx, http.MethodGet, "/harnesses", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
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

func (c *GemOpsClient) Reset(ctx context.Context, compact bool, harnessID string) (map[string]interface{}, error) {
	q := url.Values{}
	if compact {
		q.Set("compact", "1")
	}
	if strings.TrimSpace(harnessID) != "" {
		q.Set("harnessId", strings.TrimSpace(harnessID))
	}
	path := "/reset"
	if encoded := q.Encode(); encoded != "" {
		path += "?" + encoded
	}
	var out map[string]interface{}
	if err := c.doJSON(ctx, http.MethodPost, path, nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// SubscribeEvents opens the SSE stream at GET /events.
func (c *GemOpsClient) SubscribeEvents(ctx context.Context, lastEventID string) (*EventStream, error) {
	targetURL := c.baseURL + "/events"
	if strings.TrimSpace(lastEventID) != "" {
		targetURL += "?lastEventId=" + url.QueryEscape(strings.TrimSpace(lastEventID))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	if strings.TrimSpace(lastEventID) != "" {
		req.Header.Set("Last-Event-ID", strings.TrimSpace(lastEventID))
	}

	resp, err := c.streamClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := readErrorBody(resp.Body)
		_ = resp.Body.Close()
		return nil, &UpstreamError{StatusCode: resp.StatusCode, Message: msg}
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
	var reqBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		if strings.TrimSpace(v) != "" {
			req.Header.Set(k, v)
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &UpstreamError{
			StatusCode: resp.StatusCode,
			Message:    readErrorBody(resp.Body),
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
