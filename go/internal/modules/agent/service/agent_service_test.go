package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"tomo-backend/internal/modules/agent/client"
	"tomo-backend/internal/modules/agent/dto"
	"tomo-backend/internal/modules/agent/service"
)

type fakeGemOpsServer struct {
	server *httptest.Server

	mu             sync.Mutex
	eventsCh       chan string
	lastPromptReq  dto.GemOpsPromptRequest
	lastPermID     string
	lastPermDec    string
	cancelCalled   bool
	resetCompact   bool
	resetHarnessID string
	promptStatus   int
	promptErrMsg   string
}

func newFakeGemOpsServer(onPrompt func(s *fakeGemOpsServer, turnID string)) *fakeGemOpsServer {
	f := &fakeGemOpsServer{
		eventsCh:     make(chan string, 64),
		promptStatus: http.StatusAccepted,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /events", func(w http.ResponseWriter, r *http.Request) {
		flusher, _ := w.(http.Flusher)
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprint(w, ": connected\n\n")
		if flusher != nil {
			flusher.Flush()
		}
		for {
			select {
			case <-r.Context().Done():
				return
			case frame, ok := <-f.eventsCh:
				if !ok {
					return
				}
				_, _ = fmt.Fprint(w, frame)
				if flusher != nil {
					flusher.Flush()
				}
			}
		}
	})
	mux.HandleFunc("POST /prompt", func(w http.ResponseWriter, r *http.Request) {
		var req dto.GemOpsPromptRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		f.mu.Lock()
		f.lastPromptReq = req
		status := f.promptStatus
		errMsg := f.promptErrMsg
		f.mu.Unlock()

		if status != http.StatusAccepted {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
			return
		}
		turnID := "turn_test_1"
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(dto.GemOpsPromptResponse{
			Status:    "accepted",
			TurnID:    turnID,
			HarnessID: "common",
		})
		if onPrompt != nil {
			go onPrompt(f, turnID)
		}
	})
	mux.HandleFunc("POST /permissions/{id}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Decision string `json:"decision"`
			Actor    string `json:"actor"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.mu.Lock()
		f.lastPermID = r.PathValue("id")
		f.lastPermDec = body.Decision
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "resolved", "decision": body.Decision})
	})
	mux.HandleFunc("POST /cancel", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.cancelCalled = true
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "cancelled"})
	})
	mux.HandleFunc("POST /reset", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.resetCompact = r.URL.Query().Get("compact") == "1"
		f.resetHarnessID = r.URL.Query().Get("harnessId")
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "reset", "compact": f.resetCompact})
	})
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
			State:           "IDLE",
			ActiveHarnessID: "abi",
			GeminiPID:       1234,
			GeminiRSSMB:     95,
		})
	})
	mux.HandleFunc("GET /agy/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(dto.GemOpsInfoResponse{
			Binary:  "agy",
			Version: "1.5.13",
			Models:  []dto.GemOpsModelOption{{ID: "gemini-4-neon-medium", Label: "Gemini 4 Neon (Medium)"}},
			Efforts: []string{"low", "medium", "high"},
			Modes:   []string{"default", "accept-edits", "auto", "plan"},
		})
	})
	mux.HandleFunc("GET /harnesses", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(dto.GemOpsHarnessesResponse{
			DefaultHarnessID: "common",
			ActiveHarnessID:  "abi",
			Items: []dto.GemOpsHarnessSummary{
				{ID: "common", Name: "Common", IsCommon: true, Enabled: true},
				{ID: "abi", Name: "ABI", Enabled: true, IsActive: true},
			},
		})
	})
	f.server = httptest.NewServer(mux)
	return f
}

func (f *fakeGemOpsServer) publish(id, evType string, data interface{}) {
	rawEv, _ := json.Marshal(map[string]interface{}{
		"id":   id,
		"type": evType,
		"ts":   time.Now().Format(time.RFC3339),
		"data": data,
	})
	f.eventsCh <- fmt.Sprintf("id: %s\nevent: %s\ndata: %s\n\n", id, evType, rawEv)
}

func (f *fakeGemOpsServer) close() {
	f.server.Close()
}

func TestStreamChat_TextReasoningToolUsage(t *testing.T) {
	fake := newFakeGemOpsServer(func(s *fakeGemOpsServer, turnID string) {
		s.publish("1", "turn_start", map[string]interface{}{"turnId": turnID})
		s.publish("2", "thought_chunk", map[string]interface{}{"text": "Analyzing workspace..."})
		s.publish("3", "tool_update", map[string]interface{}{
			"toolCallId": "tc-1",
			"toolTitle":  "Read Spec",
			"toolKind":   "read",
			"status":     "running",
			"raw": map[string]interface{}{
				"update": map[string]interface{}{
					"name":  "read_file",
					"input": map[string]interface{}{"path": "README.md"},
				},
			},
		})
		s.publish("4", "tool_update", map[string]interface{}{
			"toolCallId": "tc-1",
			"toolTitle":  "Read Spec",
			"toolKind":   "read",
			"status":     "completed",
			"raw": map[string]interface{}{
				"update": map[string]interface{}{
					"name":   "read_file",
					"output": map[string]interface{}{"lines": 42},
				},
			},
		})
		s.publish("5", "message_chunk", map[string]interface{}{"text": "Hello "})
		s.publish("6", "message_chunk", map[string]interface{}{"text": "world!"})
		s.publish("7", "usage_update", map[string]interface{}{
			"usage": map[string]interface{}{
				"input_tokens":  120,
				"output_tokens": 30,
				"total_tokens":  150,
			},
		})
		s.publish("8", "turn_complete", map[string]interface{}{
			"turnId":     turnID,
			"stopReason": "end_turn",
		})
	})
	defer fake.close()

	gemClient := client.NewGemOpsClient(fake.server.URL, "")
	svc := service.NewAgentService(gemClient, "abi", 10*time.Second)

	var chunks []map[string]interface{}
	err := svc.StreamChat(context.Background(), dto.ChatRequest{
		ID: "session-1",
		Messages: []dto.UIMessage{
			{ID: "u1", Role: "user", Parts: []dto.UIMessagePart{{Type: "text", Text: "Explain README"}}},
		},
		ContextItems: []dto.WorkspaceContextItem{
			{ID: "doc-1", Kind: "doc", Title: "Architecture", Path: "docs/arch.md", Excerpt: "CRDT design"},
		},
		AgentConfig: &dto.ClientAgentConfig{
			ModelID:            "gemini-4-neon-medium",
			Mode:               "agent",
			ReasoningEffort:    "medium",
			SystemPromptAppend: "Be concise",
		},
	}, "alice@tomo.app", func(chunk map[string]interface{}) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}

	fake.mu.Lock()
	promptSent := fake.lastPromptReq
	fake.mu.Unlock()

	if promptSent.HarnessID != "abi" {
		t.Fatalf("expected default harnessId 'abi', got %q", promptSent.HarnessID)
	}
	if !strings.Contains(promptSent.Prompt, "[Workspace Context]") || !strings.Contains(promptSent.Prompt, "Explain README") {
		t.Fatalf("unexpected prompt sent to gemops: %q", promptSent.Prompt)
	}
	if promptSent.SessionConfig == nil || promptSent.SessionConfig.Mode != "default" || promptSent.SessionConfig.Effort != "medium" {
		t.Fatalf("unexpected sessionConfig sent: %+v", promptSent.SessionConfig)
	}

	var types []string
	var finishChunk map[string]interface{}
	for _, ch := range chunks {
		typ, _ := ch["type"].(string)
		types = append(types, typ)
		if typ == "finish" {
			finishChunk = ch
		}
	}

	wantOrder := []string{
		"start",
		"start-step",
		"reasoning-start",
		"reasoning-delta",
		"reasoning-end",
		"tool-input-start",
		"tool-input-available",
		"tool-output-available",
		"text-start",
		"text-delta",
		"text-delta",
		"text-end",
		"finish-step",
		"finish",
	}
	if strings.Join(types, ",") != strings.Join(wantOrder, ",") {
		t.Fatalf("chunk sequence mismatch:\n got: %v\nwant: %v", types, wantOrder)
	}

	meta, _ := finishChunk["messageMetadata"].(map[string]interface{})
	usage, _ := meta["usage"].(map[string]interface{})
	if usage["totalTokens"] != int64(150) {
		t.Fatalf("expected totalTokens=150, got %#v", usage["totalTokens"])
	}
}

func TestStreamChat_PermissionApprovalAndDeny(t *testing.T) {
	fake := newFakeGemOpsServer(func(s *fakeGemOpsServer, turnID string) {
		s.publish("1", "turn_start", map[string]interface{}{"turnId": turnID})
		s.publish("2", "permission_request", map[string]interface{}{
			"id":         "perm_123",
			"harnessId":  "common",
			"sessionId":  "sess_1",
			"toolCallId": "call_99",
			"kind":       "execute",
			"name":       "run_shell_command",
			"title":      "Restart nginx",
			"command":    "sudo systemctl restart nginx",
			"paths":      []string{"/etc/nginx/nginx.conf"},
		})
		s.publish("3", "permission_resolved", map[string]interface{}{
			"id":       "perm_123",
			"decision": "deny",
			"actor":    "alice",
		})
		s.publish("4", "message_chunk", map[string]interface{}{"text": "Action denied."})
		s.publish("5", "turn_complete", map[string]interface{}{"turnId": turnID, "stopReason": "end_turn"})
	})
	defer fake.close()

	gemClient := client.NewGemOpsClient(fake.server.URL, "")
	svc := service.NewAgentService(gemClient, "", 10*time.Second)

	var chunks []map[string]interface{}
	err := svc.StreamChat(context.Background(), dto.ChatRequest{
		ID:       "s2",
		Messages: []dto.UIMessage{{ID: "u1", Role: "user", Parts: []dto.UIMessagePart{{Type: "text", Text: "restart nginx"}}}},
	}, "alice", func(chunk map[string]interface{}) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat error: %v", err)
	}

	var seenApproval, seenDenied bool
	for _, ch := range chunks {
		switch ch["type"] {
		case "tool-approval-request":
			if ch["approvalId"] == "perm_123" && ch["toolCallId"] == "call_99" {
				seenApproval = true
			}
		case "tool-output-denied":
			if ch["toolCallId"] == "call_99" {
				seenDenied = true
			}
		}
	}
	if !seenApproval || !seenDenied {
		t.Fatalf("expected approval request and denied output chunks, got: %+v", chunks)
	}
}

func TestStreamChat_CancelOnContextDone(t *testing.T) {
	started := make(chan struct{})
	fake := newFakeGemOpsServer(func(s *fakeGemOpsServer, turnID string) {
		s.publish("1", "turn_start", map[string]interface{}{"turnId": turnID})
		s.publish("2", "message_chunk", map[string]interface{}{"text": "Partial..."})
		close(started)
	})
	defer fake.close()

	gemClient := client.NewGemOpsClient(fake.server.URL, "")
	svc := service.NewAgentService(gemClient, "", 10*time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-started
		time.Sleep(30 * time.Millisecond)
		cancel()
	}()

	err := svc.StreamChat(ctx, dto.ChatRequest{
		ID:       "s3",
		Messages: []dto.UIMessage{{ID: "u1", Role: "user", Parts: []dto.UIMessagePart{{Type: "text", Text: "long task"}}}},
	}, "alice", func(chunk map[string]interface{}) error {
		return nil
	})
	if err == nil {
		t.Fatal("expected context error on abort")
	}

	fake.mu.Lock()
	cancelCalled := fake.cancelCalled
	fake.mu.Unlock()
	if !cancelCalled {
		t.Fatal("expected POST /cancel to be sent to gemops when client context cancelled")
	}
}

func TestStreamChat_UpstreamConflictReturnsError(t *testing.T) {
	fake := newFakeGemOpsServer(nil)
	fake.promptStatus = http.StatusConflict
	fake.promptErrMsg = "session is currently busy"
	defer fake.close()

	gemClient := client.NewGemOpsClient(fake.server.URL, "")
	svc := service.NewAgentService(gemClient, "", 10*time.Second)

	emitCalled := false
	err := svc.StreamChat(context.Background(), dto.ChatRequest{
		ID:       "s4",
		Messages: []dto.UIMessage{{ID: "u1", Role: "user", Parts: []dto.UIMessagePart{{Type: "text", Text: "hello"}}}},
	}, "alice", func(chunk map[string]interface{}) error {
		emitCalled = true
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "409") {
		t.Fatalf("expected 409 upstream error, got %v", err)
	}
	if emitCalled {
		t.Fatal("expected emit not to be called when POST /prompt failed")
	}
}
