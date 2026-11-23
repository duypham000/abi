package mcp_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs"
	"tomo-backend/internal/modules/mcp"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type rpcEnvelope struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *mcp.RPCError   `json:"error"`
}

func setupMCPTestRouter(t *testing.T) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open("file:mcp_module_test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	// Clean tables across runs if shared cache persists in same process
	docsModule := docs.InitModule(db, "test-yjs-secret", "ws://127.0.0.1:1234/ws/yjs")
	mcpModule := mcp.InitModule(db, docsModule.DocsService, docsModule.CanvasService, docsModule.YjsService)

	jwtMgr := security.NewJWTManager("test-jwt-secret", 30*time.Minute, 24*time.Hour)
	token, _, err := jwtMgr.GenerateAccessToken("user-mcp-1", "mcp@tomo.app", "USER")
	if err != nil {
		t.Fatalf("generate jwt: %v", err)
	}

	router := gin.New()
	mcpModule.RegisterRoutes(router.Group(""), jwtMgr)
	return router, token
}

func callMCP(t *testing.T, router *gin.Engine, token string, body interface{}) (*httptest.ResponseRecorder, rpcEnvelope) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var env rpcEnvelope
	if w.Body.Len() > 0 && w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response (%s): %v", w.Body.String(), err)
		}
	}
	return w, env
}

func callTool(t *testing.T, router *gin.Engine, token, name string, args map[string]interface{}) map[string]interface{} {
	t.Helper()
	w, env := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/call",
		"params": map[string]interface{}{
			"name":      name,
			"arguments": args,
		},
	})
	if w.Code != http.StatusOK || env.Error != nil {
		t.Fatalf("tool %s failed: http=%d err=%+v body=%s", name, w.Code, env.Error, w.Body.String())
	}

	var res mcp.CallToolResult
	if err := json.Unmarshal(env.Result, &res); err != nil {
		t.Fatalf("unmarshal CallToolResult: %v", err)
	}
	if res.IsError {
		t.Fatalf("tool %s returned isError=true: %+v", name, res.Content)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(res.Content[0].Text), &payload); err != nil {
		t.Fatalf("unmarshal tool JSON (%s): %v", res.Content[0].Text, err)
	}
	return payload
}

func TestMCP_AuthAndLifecycle(t *testing.T) {
	router, token := setupMCPTestRouter(t)

	// 1. Unauthorized
	wUnauth, _ := callMCP(t, router, "", map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
	})
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", wUnauth.Code)
	}

	// 2. GET /mcp -> 405, DELETE /mcp -> 204
	reqGet := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	reqGet.Header.Set("Authorization", "Bearer "+token)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for GET /mcp, got %d", wGet.Code)
	}

	reqDel := httptest.NewRequest(http.MethodDelete, "/mcp", nil)
	reqDel.Header.Set("Authorization", "Bearer "+token)
	wDel := httptest.NewRecorder()
	router.ServeHTTP(wDel, reqDel)
	if wDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for DELETE /mcp, got %d", wDel.Code)
	}

	// 3. Initialize + notifications/initialized
	wInit, envInit := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"protocolVersion": "2025-03-26",
			"clientInfo":      map[string]string{"name": "test-client", "version": "1.0"},
		},
	})
	if wInit.Code != http.StatusOK || envInit.Error != nil {
		t.Fatalf("initialize failed: %d %+v", wInit.Code, envInit.Error)
	}
	if wInit.Header().Get("Mcp-Session-Id") == "" {
		t.Fatalf("expected Mcp-Session-Id header")
	}
	var initRes mcp.InitializeResult
	_ = json.Unmarshal(envInit.Result, &initRes)
	if initRes.ServerInfo.Name != "tomo-go-mcp" || initRes.Capabilities.Tools == nil {
		t.Fatalf("unexpected initialize result: %+v", initRes)
	}

	wNotif, _ := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	})
	if wNotif.Code != http.StatusAccepted {
		t.Fatalf("expected 202 for notification, got %d", wNotif.Code)
	}

	// 4. tools/list
	_, envList := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/list",
	})
	var listRes mcp.ListToolsResult
	_ = json.Unmarshal(envList.Result, &listRes)
	if len(listRes.Tools) != 26 {
		t.Fatalf("expected 26 tools, got %d", len(listRes.Tools))
	}
}

func TestMCP_DocsSeriesCanvasResourcesAndPrompts(t *testing.T) {
	router, token := setupMCPTestRouter(t)

	// --- Docs lifecycle ---
	parent := callTool(t, router, token, "docs_create", map[string]interface{}{
		"title":   "Parent Spec",
		"content": "Initial intro.",
		"status":  "DRAFT",
	})
	parentID := parent["id"].(string)

	child := callTool(t, router, token, "docs_create", map[string]interface{}{
		"title":   "Child Guide",
		"content": "Step 1: install",
	})
	childID := child["id"].(string)

	appended := callTool(t, router, token, "docs_append_content", map[string]interface{}{
		"id":      parentID,
		"content": "## Section Two",
	})
	if !strings.Contains(appended["content"].(string), "## Section Two") {
		t.Fatalf("append failed: %v", appended["content"])
	}

	patched := callTool(t, router, token, "docs_patch_content", map[string]interface{}{
		"id":       parentID,
		"old_text": "Initial intro.",
		"new_text": "Updated intro.",
	})
	if !strings.Contains(patched["content"].(string), "Updated intro.") {
		t.Fatalf("patch failed: %v", patched["content"])
	}

	moved := callTool(t, router, token, "docs_move", map[string]interface{}{
		"id":        childID,
		"parent_id": parentID,
	})
	if moved["parent_id"] != parentID {
		t.Fatalf("move failed: %+v", moved)
	}

	flagged := callTool(t, router, token, "docs_set_flags", map[string]interface{}{
		"id":         parentID,
		"is_pinned":  true,
		"is_starred": true,
		"status":     "PUBLISHED",
	})
	if flagged["is_pinned"] != true || flagged["status"] != "PUBLISHED" {
		t.Fatalf("set_flags failed: %+v", flagged)
	}

	tree := callTool(t, router, token, "docs_tree", map[string]interface{}{})
	if len(tree["tree"].([]interface{})) == 0 {
		t.Fatalf("expected non-empty tree")
	}

	revs := callTool(t, router, token, "docs_list_revisions", map[string]interface{}{"id": parentID})
	if len(revs["revisions"].([]interface{})) < 2 {
		t.Fatalf("expected >= 2 revisions, got %+v", revs)
	}
	rev1 := callTool(t, router, token, "docs_get_revision", map[string]interface{}{
		"id":      parentID,
		"version": 1,
	})
	if rev1["state_vector_base64"] == "" {
		t.Fatalf("expected non-empty revision snapshot")
	}

	// --- Series lifecycle ---
	sCreated := callTool(t, router, token, "series_create", map[string]interface{}{
		"name":        "Engineering RFCs",
		"description": "Design docs",
	})
	sID := int(sCreated["id"].(float64))
	sUpdated := callTool(t, router, token, "series_update", map[string]interface{}{
		"id":   sID,
		"name": "Architecture RFCs",
	})
	if sUpdated["name"] != "Architecture RFCs" {
		t.Fatalf("series_update failed: %+v", sUpdated)
	}

	// --- Canvas lifecycle ---
	cCreated := callTool(t, router, token, "canvas_create", map[string]interface{}{
		"title": "System Diagram",
		"elements": []map[string]interface{}{
			{"id": "box-1", "type": "rectangle", "x": 100, "y": 100, "label": "API Gateway"},
		},
	})
	canvasID := cCreated["id"].(string)

	added := callTool(t, router, token, "canvas_add_elements", map[string]interface{}{
		"id": canvasID,
		"elements": []map[string]interface{}{
			{"id": "box-2", "type": "ellipse", "x": 400, "y": 100, "label": "Database"},
			{"id": "arr-1", "type": "arrow", "x": 280, "y": 140, "width": 120, "height": 0},
		},
	})
	// box-1 (+bound text) + box-2 (+bound text) + arr-1 = 5 elements
	if int(added["total_elements"].(float64)) != 5 {
		t.Fatalf("expected 5 total elements (including bound text), got %+v", added)
	}

	updEls := callTool(t, router, token, "canvas_update_elements", map[string]interface{}{
		"id": canvasID,
		"updates": []map[string]interface{}{
			{"id": "box-1", "backgroundColor": "#d0ebff"},
		},
	})
	if len(updEls["updated_ids"].([]interface{})) != 1 {
		t.Fatalf("expected 1 updated element, got %+v", updEls)
	}

	delEls := callTool(t, router, token, "canvas_delete_elements", map[string]interface{}{
		"id":          canvasID,
		"element_ids": []string{"arr-1"},
	})
	if int(delEls["deleted_count"].(float64)) != 1 {
		t.Fatalf("expected 1 soft-deleted element, got %+v", delEls)
	}

	yjsTok := callTool(t, router, token, "yjs_mint_token", map[string]interface{}{
		"canvas_id": canvasID,
	})
	if yjsTok["token"] == "" || !strings.HasPrefix(yjsTok["doc_id"].(string), "canvas-") {
		t.Fatalf("unexpected yjs_mint_token result: %+v", yjsTok)
	}

	// --- Resources & Prompts ---
	_, envResList := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      10,
		"method":  "resources/list",
	})
	var resList mcp.ListResourcesResult
	_ = json.Unmarshal(envResList.Result, &resList)
	if len(resList.Resources) < 2 {
		t.Fatalf("expected docs and canvas resources, got %+v", resList)
	}

	_, envResRead := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      11,
		"method":  "resources/read",
		"params":  map[string]string{"uri": "tomo://canvases/" + canvasID},
	})
	var resRead mcp.ReadResourceResult
	_ = json.Unmarshal(envResRead.Result, &resRead)
	if len(resRead.Contents) != 1 || !strings.Contains(resRead.Contents[0].Text, "System Diagram") {
		t.Fatalf("unexpected resource read: %+v", resRead)
	}

	_, envPrompt := callMCP(t, router, token, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      12,
		"method":  "prompts/get",
		"params": map[string]interface{}{
			"name":      "diagram_from_doc",
			"arguments": map[string]string{"doc_id": parentID},
		},
	})
	var promptRes mcp.GetPromptResult
	_ = json.Unmarshal(envPrompt.Result, &promptRes)
	if len(promptRes.Messages) != 1 || !strings.Contains(promptRes.Messages[0].Content.Text, parentID) {
		t.Fatalf("unexpected prompt result: %+v", promptRes)
	}

	// Cleanup
	callTool(t, router, token, "canvas_delete", map[string]interface{}{"id": canvasID})
	callTool(t, router, token, "series_delete", map[string]interface{}{"id": sID})
	callTool(t, router, token, "docs_delete", map[string]interface{}{"id": childID})
	callTool(t, router, token, "docs_delete", map[string]interface{}{"id": parentID})
}
