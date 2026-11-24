package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"tomo-backend/internal/modules/agent/client"
	"tomo-backend/internal/modules/agent/dto"
)

// ChunkEmitter sends one AI SDK v6 UIMessageChunk object over SSE.
type ChunkEmitter func(chunk map[string]interface{}) error

// AgentBackend defines the upstream GemOps client contract used by AgentService.
type AgentBackend interface {
	Info() dto.GemOpsTransportInfo
	CheckStatus(ctx context.Context) (bool, int, string)
	GetStatus(ctx context.Context) (*dto.GemOpsStatusResponse, error)
	GetInfo(ctx context.Context) (*dto.GemOpsInfoResponse, error)
	GetUsage(ctx context.Context) (map[string]interface{}, error)
	ListHarnesses(ctx context.Context) (*dto.GemOpsHarnessesResponse, error)
	GetHarness(ctx context.Context, id string) (map[string]interface{}, error)
	GetResolvedHarness(ctx context.Context, id string) (map[string]interface{}, error)
	GetSessionConfig(ctx context.Context) (*dto.GemOpsSessionConfig, error)
	UpdateSessionConfig(ctx context.Context, cfg dto.GemOpsSessionConfig, actor string) (map[string]interface{}, error)
	StartPrompt(ctx context.Context, req dto.GemOpsPromptRequest, actor string) (*dto.GemOpsPromptResponse, error)
	ResolvePermission(ctx context.Context, permID, decision, actor string) (map[string]interface{}, error)
	Cancel(ctx context.Context) (map[string]interface{}, error)
	Reset(ctx context.Context, compact bool, harnessID string) (map[string]interface{}, error)
	SubscribeEvents(ctx context.Context, lastEventID string) (*client.EventStream, error)
	StreamRawEvents(ctx context.Context, lastEventID, rawQuery string) (*http.Response, error)
}

// AgentService bridges Tomo HTTP API requests to gemops-agent.
type AgentService struct {
	backend        AgentBackend
	defaultHarness string
	turnTimeout    time.Duration
}

func NewAgentService(backend AgentBackend, defaultHarness string, turnTimeout time.Duration) *AgentService {
	if turnTimeout <= 0 {
		turnTimeout = 300 * time.Second
	}
	return &AgentService{
		backend:        backend,
		defaultHarness: strings.TrimSpace(defaultHarness),
		turnTimeout:    turnTimeout,
	}
}

func (s *AgentService) TransportInfo() dto.GemOpsTransportInfo {
	return s.backend.Info()
}

func (s *AgentService) CheckHealth(ctx context.Context) dto.GemOpsHealthResponse {
	reachable, statusCode, probeErr := s.backend.CheckStatus(ctx)
	return dto.GemOpsHealthResponse{
		Status:         "ok",
		Service:        "tomo-backend",
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Transport:      s.backend.Info(),
		AgentReachable: reachable,
		AgentStatus:    statusCode,
		AgentError:     probeErr,
	}
}

func (s *AgentService) GetStatus(ctx context.Context) (*dto.GemOpsStatusResponse, error) {
	return s.backend.GetStatus(ctx)
}

func (s *AgentService) GetInfo(ctx context.Context) (*dto.GemOpsInfoResponse, error) {
	return s.backend.GetInfo(ctx)
}

func (s *AgentService) GetUsage(ctx context.Context) (map[string]interface{}, error) {
	return s.backend.GetUsage(ctx)
}

func (s *AgentService) ListHarnesses(ctx context.Context) (*dto.GemOpsHarnessesResponse, error) {
	return s.backend.ListHarnesses(ctx)
}

func (s *AgentService) GetHarness(ctx context.Context, id string) (map[string]interface{}, error) {
	return s.backend.GetHarness(ctx, id)
}

func (s *AgentService) GetResolvedHarness(ctx context.Context, id string) (map[string]interface{}, error) {
	return s.backend.GetResolvedHarness(ctx, id)
}

func (s *AgentService) GetSessionConfig(ctx context.Context) (*dto.GemOpsSessionConfig, error) {
	return s.backend.GetSessionConfig(ctx)
}

func (s *AgentService) UpdateSessionConfig(ctx context.Context, cfg dto.GemOpsSessionConfig, actor string) (map[string]interface{}, error) {
	cfg.Mode = normalizeGemOpsMode(cfg.Mode)
	cfg.Effort = normalizeGemOpsEffort(cfg.Effort)
	return s.backend.UpdateSessionConfig(ctx, cfg, actor)
}

func (s *AgentService) StartPrompt(ctx context.Context, req dto.GemOpsPromptRequest, actor string) (*dto.GemOpsPromptResponse, error) {
	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = s.defaultHarness
	}
	return s.backend.StartPrompt(ctx, req, actor)
}

func (s *AgentService) StreamRawEvents(ctx context.Context, lastEventID, rawQuery string) (*http.Response, error) {
	return s.backend.StreamRawEvents(ctx, lastEventID, rawQuery)
}

func (s *AgentService) ResolvePermission(ctx context.Context, permID, decision, actor string) (map[string]interface{}, error) {
	norm := strings.ToLower(strings.TrimSpace(decision))
	switch norm {
	case "allow", "approve", "allow_once":
		norm = "allow"
	case "deny", "reject", "reject_once":
		norm = "deny"
	default:
		return nil, errors.New("decision must be 'allow' or 'deny'")
	}
	return s.backend.ResolvePermission(ctx, permID, norm, actor)
}

func (s *AgentService) Cancel(ctx context.Context) (map[string]interface{}, error) {
	return s.backend.Cancel(ctx)
}

func (s *AgentService) Reset(ctx context.Context, compact bool, harnessID string) (map[string]interface{}, error) {
	return s.backend.Reset(ctx, compact, harnessID)
}

// StreamChat starts a turn on gemops-agent and translates its SSE stream into AI SDK v6 UIMessageChunk frames.
func (s *AgentService) StreamChat(ctx context.Context, req dto.ChatRequest, actor string, emit ChunkEmitter) error {
	promptText := buildPromptText(req)
	if promptText == "" {
		return errors.New("prompt cannot be empty")
	}

	harnessID := strings.TrimSpace(req.HarnessID)
	if harnessID == "" && req.AgentConfig != nil {
		harnessID = strings.TrimSpace(req.AgentConfig.HarnessID)
	}
	if harnessID == "" {
		harnessID = s.defaultHarness
	}

	var sessionCfg *dto.GemOpsSessionConfig
	var requestedModelID string
	if req.AgentConfig != nil {
		requestedModelID = strings.TrimSpace(req.AgentConfig.ModelID)
		mapped := dto.GemOpsSessionConfig{
			Model:              requestedModelID,
			Effort:             normalizeGemOpsEffort(req.AgentConfig.ReasoningEffort),
			Mode:               normalizeGemOpsMode(req.AgentConfig.Mode),
			SystemPromptAppend: strings.TrimSpace(req.AgentConfig.SystemPromptAppend),
		}
		if mapped.Model != "" || mapped.Effort != "" || mapped.Mode != "" || mapped.SystemPromptAppend != "" {
			sessionCfg = &mapped
		}
	}

	streamCtx, cancelStream := context.WithCancel(ctx)
	defer cancelStream()

	// Subscribe to SSE before POST /prompt so no early turn events are missed.
	stream, err := s.backend.SubscribeEvents(streamCtx, "")
	if err != nil {
		return err
	}
	defer stream.Close()

	// Close the SSE response body promptly on context cancellation so blocked reads unblock immediately.
	stopWatch := context.AfterFunc(streamCtx, func() {
		_ = stream.Close()
	})
	defer stopWatch()

	inactivityLimit := s.turnTimeout + 30*time.Second
	activityCh := make(chan struct{}, 1)
	watchdogDone := make(chan struct{})
	defer close(watchdogDone)
	var pendingApprovals atomic.Int64
	var timedOut atomic.Bool

	go func() {
		timer := time.NewTimer(inactivityLimit)
		defer timer.Stop()
		for {
			select {
			case <-watchdogDone:
				return
			case <-ctx.Done():
				return
			case <-activityCh:
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(inactivityLimit)
			case <-timer.C:
				if pendingApprovals.Load() > 0 {
					timer.Reset(inactivityLimit)
					continue
				}
				timedOut.Store(true)
				cancelStream()
				return
			}
		}
	}()

	promptResp, err := s.backend.StartPrompt(streamCtx, dto.GemOpsPromptRequest{
		Prompt:        promptText,
		HarnessID:     harnessID,
		SessionConfig: sessionCfg,
	}, actor)
	if err != nil {
		return err
	}

	acceptedTurnID := promptResp.TurnID
	startTime := time.Now()
	if requestedModelID == "" && harnessID != "" {
		requestedModelID = harnessID
	}

	if err := emit(map[string]interface{}{
		"type":      "start",
		"messageId": "msg-" + acceptedTurnID,
		"messageMetadata": map[string]interface{}{
			"createdAt": startTime.UTC().Format(time.RFC3339),
			"modelId":   requestedModelID,
		},
	}); err != nil {
		return err
	}
	if err := emit(map[string]interface{}{"type": "start-step"}); err != nil {
		return err
	}

	state := &streamTranslator{
		acceptedTurnID:  acceptedTurnID,
		modelID:         requestedModelID,
		startTime:       startTime,
		emit:            emit,
		emittedTools:    make(map[string]bool),
		terminalTools:   make(map[string]bool),
		permToToolCall:  make(map[string]string),
		toolNamesByCall: make(map[string]string),
	}

	for {
		ev, err := stream.Next()
		if err != nil {
			if ctx.Err() != nil {
				cancelCtx, cancelTimeout := context.WithTimeout(context.Background(), 5*time.Second)
				_, _ = s.backend.Cancel(cancelCtx)
				cancelTimeout()
				return ctx.Err()
			}
			if timedOut.Load() && streamCtx.Err() != nil {
				cancelCtx, cancelTimeout := context.WithTimeout(context.Background(), 5*time.Second)
				_, _ = s.backend.Cancel(cancelCtx)
				cancelTimeout()
				_ = state.finishWithError("gemops turn timed out due to inactivity")
				return nil
			}
			if errors.Is(err, io.EOF) {
				_ = state.finishWithError("gemops event stream closed unexpectedly")
				return nil
			}
			_ = state.finishWithError("gemops event stream error: " + err.Error())
			return nil
		}

		select {
		case activityCh <- struct{}{}:
		default:
		}
		switch ev.Type {
		case "permission_request":
			pendingApprovals.Add(1)
		case "permission_resolved":
			if pendingApprovals.Load() > 0 {
				pendingApprovals.Add(-1)
			}
		}

		done, handleErr := state.handleEvent(ev)
		if handleErr != nil {
			return handleErr
		}
		if done {
			return nil
		}
	}
}

type streamTranslator struct {
	acceptedTurnID string
	modelID        string
	startTime      time.Time
	emit           ChunkEmitter

	partSeq         int
	openReasoningID string
	openTextID      string
	emittedTools    map[string]bool
	terminalTools   map[string]bool
	permToToolCall  map[string]string
	toolNamesByCall map[string]string
	lastUsage       map[string]interface{}
}

func (t *streamTranslator) nextPartID(prefix string) string {
	t.partSeq++
	return fmt.Sprintf("%s-%s-%d", prefix, t.acceptedTurnID, t.partSeq)
}

func (t *streamTranslator) closeReasoning() error {
	if t.openReasoningID == "" {
		return nil
	}
	id := t.openReasoningID
	t.openReasoningID = ""
	return t.emit(map[string]interface{}{
		"type": "reasoning-end",
		"id":   id,
	})
}

func (t *streamTranslator) closeText() error {
	if t.openTextID == "" {
		return nil
	}
	id := t.openTextID
	t.openTextID = ""
	return t.emit(map[string]interface{}{
		"type": "text-end",
		"id":   id,
	})
}

func (t *streamTranslator) closeOpenTextAndReasoning() error {
	if err := t.closeReasoning(); err != nil {
		return err
	}
	return t.closeText()
}

func (t *streamTranslator) finishWithError(errText string) error {
	if err := t.closeOpenTextAndReasoning(); err != nil {
		return err
	}
	if err := t.emit(map[string]interface{}{
		"type":      "error",
		"errorText": errText,
	}); err != nil {
		return err
	}
	if err := t.emit(map[string]interface{}{"type": "finish-step"}); err != nil {
		return err
	}
	return t.emit(t.buildFinishChunk("error", errText))
}

func (t *streamTranslator) buildFinishChunk(finishReason, finishDetail string) map[string]interface{} {
	meta := map[string]interface{}{
		"durationMs":   time.Since(t.startTime).Milliseconds(),
		"finishReason": finishReason,
	}
	if t.modelID != "" {
		meta["modelId"] = t.modelID
	}
	if finishDetail != "" {
		meta["stopReason"] = finishDetail
	}
	if t.lastUsage != nil {
		meta["usage"] = t.lastUsage
	}
	return map[string]interface{}{
		"type":            "finish",
		"finishReason":    finishReason,
		"messageMetadata": meta,
	}
}

func (t *streamTranslator) handleEvent(ev *dto.GemOpsEvent) (bool, error) {
	if ev == nil {
		return false, nil
	}

	var payload map[string]interface{}
	if len(ev.Data) > 0 {
		_ = json.Unmarshal(ev.Data, &payload)
	}

	if turnID, ok := payload["turnId"].(string); ok && turnID != "" && turnID != t.acceptedTurnID {
		return false, nil
	}

	switch ev.Type {
	case "thought_chunk":
		txt, _ := payload["text"].(string)
		if txt == "" {
			return false, nil
		}
		if err := t.closeText(); err != nil {
			return false, err
		}
		if t.openReasoningID == "" {
			t.openReasoningID = t.nextPartID("reason")
			if err := t.emit(map[string]interface{}{
				"type": "reasoning-start",
				"id":   t.openReasoningID,
			}); err != nil {
				return false, err
			}
		}
		return false, t.emit(map[string]interface{}{
			"type":  "reasoning-delta",
			"id":    t.openReasoningID,
			"delta": txt,
		})

	case "message_chunk":
		txt, _ := payload["text"].(string)
		if txt == "" {
			return false, nil
		}
		if err := t.closeReasoning(); err != nil {
			return false, err
		}
		if t.openTextID == "" {
			t.openTextID = t.nextPartID("text")
			if err := t.emit(map[string]interface{}{
				"type": "text-start",
				"id":   t.openTextID,
			}); err != nil {
				return false, err
			}
		}
		return false, t.emit(map[string]interface{}{
			"type":  "text-delta",
			"id":    t.openTextID,
			"delta": txt,
		})

	case "tool_update":
		if err := t.closeOpenTextAndReasoning(); err != nil {
			return false, err
		}
		return false, t.handleToolUpdate(payload)

	case "permission_request":
		if err := t.closeOpenTextAndReasoning(); err != nil {
			return false, err
		}
		return false, t.handlePermissionRequest(ev.Data)

	case "permission_resolved":
		permID, _ := payload["id"].(string)
		decision, _ := payload["decision"].(string)
		if toolCallID, ok := t.permToToolCall[permID]; ok && strings.EqualFold(decision, "deny") {
			if !t.terminalTools[toolCallID] {
				t.terminalTools[toolCallID] = true
				return false, t.emit(map[string]interface{}{
					"type":       "tool-output-denied",
					"toolCallId": toolCallID,
				})
			}
		}
		return false, nil

	case "usage_update":
		if rawUsage, ok := payload["usage"].(map[string]interface{}); ok {
			t.lastUsage = normalizeUsage(rawUsage)
		}
		return false, nil

	case "error":
		errText, _ := payload["error"].(string)
		if errText == "" {
			errText = "gemops reported an error"
		}
		return true, t.finishWithError(errText)

	case "turn_cancelled":
		if err := t.closeOpenTextAndReasoning(); err != nil {
			return true, err
		}
		if err := t.emit(map[string]interface{}{"type": "finish-step"}); err != nil {
			return true, err
		}
		return true, t.emit(t.buildFinishChunk("other", "cancelled"))

	case "watchdog_alert":
		action, _ := payload["action"].(string)
		if action == "hard_kill" {
			reason, _ := payload["reason"].(string)
			if reason == "" {
				reason = "gemops watchdog terminated the session"
			}
			return true, t.finishWithError(reason)
		}
		return false, nil

	case "session_reset":
		return true, t.finishWithError("gemops session was reset")

	case "turn_complete":
		if err := t.closeOpenTextAndReasoning(); err != nil {
			return true, err
		}
		if err := t.emit(map[string]interface{}{"type": "finish-step"}); err != nil {
			return true, err
		}
		stopReason, _ := payload["stopReason"].(string)
		return true, t.emit(t.buildFinishChunk("stop", stopReason))
	}

	return false, nil
}

func (t *streamTranslator) handleToolUpdate(payload map[string]interface{}) error {
	toolCallID, _ := payload["toolCallId"].(string)
	if strings.TrimSpace(toolCallID) == "" {
		return nil
	}
	title, _ := payload["toolTitle"].(string)
	kind, _ := payload["toolKind"].(string)
	status, _ := payload["status"].(string)

	rawMap := extractRawUpdateMap(payload["raw"])
	toolName := firstNonEmptyString(
		stringFromMap(rawMap, "name", "toolName", "tool"),
		t.toolNamesByCall[toolCallID],
		kind,
		title,
		"acp_tool",
	)
	if title == "" {
		title = stringFromMap(rawMap, "title", "label")
	}
	if title == "" {
		title = toolName
	}
	t.toolNamesByCall[toolCallID] = toolName

	if !t.emittedTools[toolCallID] {
		t.emittedTools[toolCallID] = true
		startChunk := map[string]interface{}{
			"type":       "tool-input-start",
			"toolCallId": toolCallID,
			"toolName":   toolName,
			"dynamic":    true,
		}
		if title != "" {
			startChunk["title"] = title
		}
		if err := t.emit(startChunk); err != nil {
			return err
		}

		inputVal := extractToolInput(rawMap, kind, title)
		availChunk := map[string]interface{}{
			"type":       "tool-input-available",
			"toolCallId": toolCallID,
			"toolName":   toolName,
			"input":      inputVal,
			"dynamic":    true,
		}
		if title != "" {
			availChunk["title"] = title
		}
		if err := t.emit(availChunk); err != nil {
			return err
		}
	}

	if t.terminalTools[toolCallID] {
		return nil
	}

	normStatus := strings.ToLower(strings.TrimSpace(status))
	switch normStatus {
	case "completed", "complete", "done", "succeeded", "success", "finished":
		t.terminalTools[toolCallID] = true
		outputVal := extractToolOutput(rawMap, payload)
		return t.emit(map[string]interface{}{
			"type":       "tool-output-available",
			"toolCallId": toolCallID,
			"output":     outputVal,
			"dynamic":    true,
		})
	case "failed", "error", "cancelled", "canceled", "rejected", "denied", "aborted":
		t.terminalTools[toolCallID] = true
		errText := firstNonEmptyString(
			stringFromMap(rawMap, "error", "errorText", "message"),
			fmt.Sprintf("Tool %s ended with status: %s", toolName, normStatus),
		)
		return t.emit(map[string]interface{}{
			"type":       "tool-output-error",
			"toolCallId": toolCallID,
			"errorText":  errText,
			"dynamic":    true,
		})
	}
	return nil
}

func (t *streamTranslator) handlePermissionRequest(rawData json.RawMessage) error {
	var pa dto.GemOpsPendingApproval
	if err := json.Unmarshal(rawData, &pa); err != nil || pa.ID == "" {
		return nil
	}
	toolCallID := strings.TrimSpace(pa.ToolCallID)
	if toolCallID == "" {
		toolCallID = "tc-" + pa.ID
	}
	toolName := firstNonEmptyString(pa.Name, pa.Kind, pa.Title, "permission")
	title := firstNonEmptyString(pa.Title, pa.Name, toolName)

	t.permToToolCall[pa.ID] = toolCallID
	t.toolNamesByCall[toolCallID] = toolName

	if !t.emittedTools[toolCallID] {
		t.emittedTools[toolCallID] = true
		inputObj := map[string]interface{}{}
		if pa.Kind != "" {
			inputObj["kind"] = pa.Kind
		}
		if pa.Title != "" {
			inputObj["title"] = pa.Title
		}
		if pa.Command != "" {
			inputObj["command"] = pa.Command
		}
		if len(pa.Paths) > 0 {
			inputObj["paths"] = pa.Paths
		}
		availChunk := map[string]interface{}{
			"type":       "tool-input-available",
			"toolCallId": toolCallID,
			"toolName":   toolName,
			"input":      inputObj,
			"dynamic":    true,
		}
		if title != "" {
			availChunk["title"] = title
		}
		if err := t.emit(availChunk); err != nil {
			return err
		}
	}

	return t.emit(map[string]interface{}{
		"type":       "tool-approval-request",
		"approvalId": pa.ID,
		"toolCallId": toolCallID,
	})
}

func buildPromptText(req dto.ChatRequest) string {
	var userText string
	for i := len(req.Messages) - 1; i >= 0; i-- {
		msg := req.Messages[i]
		if !strings.EqualFold(msg.Role, "user") {
			continue
		}
		var sb strings.Builder
		for _, part := range msg.Parts {
			if part.Type == "text" && strings.TrimSpace(part.Text) != "" {
				if sb.Len() > 0 {
					sb.WriteString("\n")
				}
				sb.WriteString(part.Text)
			}
		}
		userText = strings.TrimSpace(sb.String())
		if userText != "" {
			break
		}
	}
	if userText == "" {
		return ""
	}
	if len(req.ContextItems) == 0 {
		return userText
	}

	var ctxBuf strings.Builder
	ctxBuf.WriteString("[Workspace Context]\n")
	for _, item := range req.ContextItems {
		line := fmt.Sprintf("- [%s] %s", item.Kind, item.Title)
		if item.Path != "" {
			line += fmt.Sprintf(" (%s)", item.Path)
		}
		if item.Excerpt != "" {
			line += fmt.Sprintf(": %s", item.Excerpt)
		}
		ctxBuf.WriteString(line)
		ctxBuf.WriteString("\n")
	}
	ctxBuf.WriteString("\n[User Request]\n")
	ctxBuf.WriteString(userText)
	return ctxBuf.String()
}

func normalizeGemOpsMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "":
		return ""
	case "agent", "ask", "debug", "default":
		return "default"
	case "accept-edits", "auto", "plan":
		return strings.ToLower(strings.TrimSpace(mode))
	default:
		return strings.ToLower(strings.TrimSpace(mode))
	}
}

func normalizeGemOpsEffort(effort string) string {
	switch strings.ToLower(strings.TrimSpace(effort)) {
	case "", "off":
		return ""
	case "low", "medium", "high", "xhigh", "max":
		return strings.ToLower(strings.TrimSpace(effort))
	default:
		return ""
	}
}

func normalizeUsage(raw map[string]interface{}) map[string]interface{} {
	inTokens := numberFromMap(raw, "inputTokens", "input_tokens", "used")
	outTokens := numberFromMap(raw, "outputTokens", "output_tokens")
	reasoningTokens := numberFromMap(raw, "thinkingTokens", "thinking_tokens", "reasoningTokens", "reasoning_tokens")
	cacheReadTokens := numberFromMap(raw, "cacheReadTokens", "cache_read_tokens", "cachedInputTokens")
	totalTokens := numberFromMap(raw, "totalTokens", "total_tokens")
	if totalTokens == 0 && (inTokens > 0 || outTokens > 0) {
		totalTokens = inTokens + outTokens
	}
	noCache := inTokens - cacheReadTokens
	if noCache < 0 {
		noCache = 0
	}
	textTokens := outTokens - reasoningTokens
	if textTokens < 0 {
		textTokens = 0
	}
	return map[string]interface{}{
		"inputTokens": inTokens,
		"inputTokenDetails": map[string]interface{}{
			"noCacheTokens":    noCache,
			"cacheReadTokens":  cacheReadTokens,
			"cacheWriteTokens": 0,
		},
		"outputTokens": outTokens,
		"outputTokenDetails": map[string]interface{}{
			"textTokens":      textTokens,
			"reasoningTokens": reasoningTokens,
		},
		"totalTokens":       totalTokens,
		"cachedInputTokens": cacheReadTokens,
		"reasoningTokens":   reasoningTokens,
	}
}

func numberFromMap(m map[string]interface{}, keys ...string) int64 {
	for _, k := range keys {
		v, ok := m[k]
		if !ok || v == nil {
			continue
		}
		switch n := v.(type) {
		case float64:
			return int64(n)
		case int64:
			return n
		case int:
			return int64(n)
		}
	}
	return 0
}

func extractRawUpdateMap(rawVal interface{}) map[string]interface{} {
	var top map[string]interface{}
	switch v := rawVal.(type) {
	case map[string]interface{}:
		top = v
	case string:
		_ = json.Unmarshal([]byte(v), &top)
	case []byte:
		_ = json.Unmarshal(v, &top)
	}
	if top == nil {
		return nil
	}
	if u, ok := top["update"].(map[string]interface{}); ok {
		return u
	}
	return top
}

func extractToolInput(rawMap map[string]interface{}, kind, title string) interface{} {
	if rawMap != nil {
		for _, k := range []string{"rawInput", "input", "arguments", "args"} {
			if val, ok := rawMap[k]; ok && val != nil {
				return val
			}
		}
	}
	fallback := map[string]interface{}{}
	if kind != "" {
		fallback["kind"] = kind
	}
	if title != "" {
		fallback["title"] = title
	}
	return fallback
}

func extractToolOutput(rawMap map[string]interface{}, payload map[string]interface{}) interface{} {
	if rawMap != nil {
		for _, k := range []string{"rawOutput", "output", "result", "content"} {
			if val, ok := rawMap[k]; ok && val != nil {
				return val
			}
		}
	}
	if txt, ok := payload["text"].(string); ok && strings.TrimSpace(txt) != "" {
		return txt
	}
	return map[string]interface{}{
		"status": firstNonEmptyString(stringFromMap(payload, "status"), "completed"),
	}
}

func stringFromMap(m map[string]interface{}, keys ...string) string {
	if m == nil {
		return ""
	}
	for _, k := range keys {
		if s, ok := m[k].(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func firstNonEmptyString(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
