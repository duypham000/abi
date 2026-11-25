package delivery_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"tomo-backend/config"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/agent"
	"tomo-backend/internal/modules/agent/dto"

	"github.com/gin-gonic/gin"
)

func setupTestRouter(gemOpsURL string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	cfg := &config.Config{
		GemOpsBaseURL:        gemOpsURL,
		GemOpsDefaultHarness: "common",
		GemOpsTurnTimeout:    10 * time.Second,
	}
	jwtMgr := security.NewJWTManager("test-secret", time.Hour, 24*time.Hour)
	mod := agent.InitModule(cfg, jwtMgr)
	mod.RegisterRoutes(r.Group("/api/v1"))
	return r
}

func TestAgentHandler_RestEndpointsAndChatStream(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/status":
			_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
				State:           "IDLE",
				ActiveHarnessID: "abi",
				GeminiPID:       42,
				GeminiRSSMB:     88,
			})
		case r.Method == http.MethodGet && r.URL.Path == "/agy/info":
			_ = json.NewEncoder(w).Encode(dto.GemOpsInfoResponse{
				Binary:  "agy",
				Version: "1.5.13",
				Models:  []dto.GemOpsModelOption{{ID: "gemini-4-neon-medium", Label: "Gemini 4 Neon (Medium)"}},
				Efforts: []string{"low", "medium", "high"},
				Modes:   []string{"default", "plan"},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/agy/usage":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"binary":  "agy",
				"version": "1.5.13",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/harnesses":
			_ = json.NewEncoder(w).Encode(dto.GemOpsHarnessesResponse{
				DefaultHarnessID: "common",
				ActiveHarnessID:  "abi",
				Items:            []dto.GemOpsHarnessSummary{{ID: "common", Name: "Common", Enabled: true}},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/harnesses/common":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": "common", "name": "Common"})
		case r.Method == http.MethodGet && r.URL.Path == "/harnesses/common/resolved":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": "common", "resolved": true})
		case r.Method == http.MethodGet && r.URL.Path == "/sessions":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"items": []map[string]interface{}{{"conversationId": "c1", "turns": 1}},
				"count": 1,
			})
		case r.Method == http.MethodDelete && r.URL.Path == "/sessions/c1":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "deleted", "conversationId": "c1"})
		case r.Method == http.MethodGet && r.URL.Path == "/agy/config":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"settings": map[string]interface{}{"model": "default"}})
		case r.Method == http.MethodPut && r.URL.Path == "/agy/config":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "updated"})
		case r.Method == http.MethodGet && r.URL.Path == "/agy/prompts":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"items": []string{"default"}})
		case r.Method == http.MethodPost && r.URL.Path == "/agy/prompts":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": "p1"})
		case r.Method == http.MethodDelete && r.URL.Path == "/agy/prompts/p1":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "deleted", "id": "p1"})
		case r.Method == http.MethodPost && r.URL.Path == "/agy/command":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"stdout": "ok"})
		case r.Method == http.MethodPost && r.URL.Path == "/harnesses":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": "h2"})
		case r.Method == http.MethodPut && r.URL.Path == "/harnesses/h2":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": "h2"})
		case r.Method == http.MethodDelete && r.URL.Path == "/harnesses/h2":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "deleted", "id": "h2"})
		case r.Method == http.MethodPost && r.URL.Path == "/harnesses/common/validate":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"valid": true})
		case r.Method == http.MethodPost && r.URL.Path == "/harnesses/common/evaluate":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"passed": true})
		case r.Method == http.MethodPost && r.URL.Path == "/harnesses/common/clone":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": "h3"})
		case r.Method == http.MethodGet && r.URL.Path == "/harnesses/common/skills/sk1":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"name": "sk1", "content": "# skill"})
		case r.Method == http.MethodPut && r.URL.Path == "/harnesses/common/skills/sk1":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"name": "sk1"})
		case r.Method == http.MethodDelete && r.URL.Path == "/harnesses/common/skills/sk1":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "deleted"})
		case r.Method == http.MethodGet && r.URL.Path == "/secrets":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"items": []string{}})
		case r.Method == http.MethodPut && r.URL.Path == "/secrets":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "saved"})
		case r.Method == http.MethodDelete && r.URL.Path == "/secrets/common/API_KEY":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"deleted": true})
		case r.Method == http.MethodPost && r.URL.Path == "/permissions/perm_1":
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "resolved", "id": "perm_1", "decision": "allow"})
		case r.Method == http.MethodPost && r.URL.Path == "/reset":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "reset", "compact": r.URL.Query().Get("compact") == "1"})
		case r.Method == http.MethodGet && r.URL.Path == "/events":
			flusher, _ := w.(http.Flusher)
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
			_, _ = fmt.Fprint(w, ": connected\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			time.Sleep(25 * time.Millisecond)
			ev1, _ := json.Marshal(map[string]interface{}{"id": "1", "type": "turn_start", "data": map[string]string{"turnId": "t1"}})
			ev2, _ := json.Marshal(map[string]interface{}{"id": "2", "type": "message_chunk", "data": map[string]string{"text": "Pong from GemOps"}})
			ev3, _ := json.Marshal(map[string]interface{}{"id": "3", "type": "turn_complete", "data": map[string]string{"turnId": "t1", "stopReason": "end_turn"}})
			_, _ = fmt.Fprintf(w, "id: 1\nevent: turn_start\ndata: %s\n\n", ev1)
			_, _ = fmt.Fprintf(w, "id: 2\nevent: message_chunk\ndata: %s\n\n", ev2)
			_, _ = fmt.Fprintf(w, "id: 3\nevent: turn_complete\ndata: %s\n\n", ev3)
			if flusher != nil {
				flusher.Flush()
			}
		case r.Method == http.MethodPost && r.URL.Path == "/prompt":
			w.WriteHeader(http.StatusAccepted)
			_ = json.NewEncoder(w).Encode(dto.GemOpsPromptResponse{
				Status:    "accepted",
				TurnID:    "t1",
				HarnessID: "common",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	router := setupTestRouter(upstream.URL)

	// 1. GET /api/v1/agent/status
	req := httptest.NewRequest(http.MethodGet, "/api/v1/agent/status", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"activeHarnessId":"abi"`) {
		t.Fatalf("unexpected /status response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 2. GET /api/v1/agent/info
	req = httptest.NewRequest(http.MethodGet, "/api/v1/agent/info", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"gemini-4-neon-medium"`) {
		t.Fatalf("unexpected /info response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 3. GET /api/v1/agent/harnesses
	req = httptest.NewRequest(http.MethodGet, "/api/v1/agent/harnesses", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"defaultHarnessId":"common"`) {
		t.Fatalf("unexpected /harnesses response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 4. POST /api/v1/agent/permissions/perm_1
	req = httptest.NewRequest(http.MethodPost, "/api/v1/agent/permissions/perm_1", bytes.NewBufferString(`{"decision":"allow"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"decision":"allow"`) {
		t.Fatalf("unexpected /permissions response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 5. POST /api/v1/agent/reset?compact=1
	req = httptest.NewRequest(http.MethodPost, "/api/v1/agent/reset?compact=1", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"compact":true`) {
		t.Fatalf("unexpected /reset response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 6. POST /api/v1/agent/chat SSE stream
	chatBody := `{"id":"sess-1","messages":[{"id":"m1","role":"user","parts":[{"type":"text","text":"ping"}]}]}`
	req = httptest.NewRequest(http.MethodPost, "/api/v1/agent/chat", bytes.NewBufferString(chatBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on /chat, got %d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("x-vercel-ai-ui-message-stream") != "v1" {
		t.Fatalf("missing x-vercel-ai-ui-message-stream header, got %q", rec.Header().Get("x-vercel-ai-ui-message-stream"))
	}
	bodyStr := rec.Body.String()
	if !strings.Contains(bodyStr, `"type":"text-delta"`) || !strings.Contains(bodyStr, "Pong from GemOps") || !strings.Contains(bodyStr, "data: [DONE]") {
		t.Fatalf("unexpected SSE chat stream output:\n%s", bodyStr)
	}

	// 7. GET /api/v1/agent/healthz
	req = httptest.NewRequest(http.MethodGet, "/api/v1/agent/healthz", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"agentReachable":true`) {
		t.Fatalf("unexpected /healthz response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 8. POST /api/v1/agent/prompt
	req = httptest.NewRequest(http.MethodPost, "/api/v1/agent/prompt", bytes.NewBufferString(`{"prompt":"hello"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted || !strings.Contains(rec.Body.String(), `"turnId":"t1"`) {
		t.Fatalf("unexpected /prompt response: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// 9. GET /api/v1/agent/events (raw SSE proxy)
	req = httptest.NewRequest(http.MethodGet, "/api/v1/agent/events", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Content-Type"), "text/event-stream") || !strings.Contains(rec.Body.String(), "Pong from GemOps") {
		t.Fatalf("unexpected /events response: code=%d ct=%q body=%s", rec.Code, rec.Header().Get("Content-Type"), rec.Body.String())
	}

	// 10. GET /api/v1/agent/agy/usage & /harnesses/common & /harnesses/common/resolved & new endpoints
	for _, ep := range []string{
		"/api/v1/agent/agy/usage",
		"/api/v1/agent/usage",
		"/api/v1/agent/meta",
		"/api/v1/agent/sessions",
		"/api/v1/agent/agy/config",
		"/api/v1/agent/agy/prompts",
		"/api/v1/agent/harnesses/common",
		"/api/v1/agent/harnesses/common/resolved",
		"/api/v1/agent/harnesses/common/skills/sk1",
		"/api/v1/agent/secrets",
	} {
		req = httptest.NewRequest(http.MethodGet, ep, nil)
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected %s response: code=%d body=%s", ep, rec.Code, rec.Body.String())
		}
	}

	// Verify /sessions normalized both items and sessions
	req = httptest.NewRequest(http.MethodGet, "/api/v1/agent/sessions", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"items"`) || !strings.Contains(rec.Body.String(), `"sessions"`) {
		t.Fatalf("expected /sessions to contain both items and sessions, got %s", rec.Body.String())
	}
}

func TestAgentHandler_UnreachableReturns502WithTransportTarget(t *testing.T) {
	closedSrv := httptest.NewServer(http.NewServeMux())
	closedURL := closedSrv.URL
	closedSrv.Close()

	router := setupTestRouter(closedURL)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/agent/status", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 on unreachable upstream, got %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "tcp") || !strings.Contains(rec.Body.String(), closedURL) {
		t.Fatalf("expected 502 error body to include transport target %q, got %s", closedURL, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/agent/healthz", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on /healthz, got %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"agentReachable":false`) || !strings.Contains(rec.Body.String(), closedURL) {
		t.Fatalf("expected /healthz to report unreachable target %q, got %s", closedURL, rec.Body.String())
	}
}
