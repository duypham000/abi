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
	"tomo-backend/internal/modules/auth"
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
	if len(listRes.Tools) != 27 {
		t.Fatalf("expected 27 tools, got %d", len(listRes.Tools))
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

	docOutline := callTool(t, router, token, "docs_get", map[string]interface{}{
		"id":           parentID,
		"outline_only": true,
	})
	headings := docOutline["headings"].([]interface{})
	if len(headings) != 1 || headings[0].(map[string]interface{})["text"] != "Section Two" {
		t.Fatalf("unexpected docs_get outline_only: %+v", docOutline)
	}

	docChunk := callTool(t, router, token, "docs_get", map[string]interface{}{
		"id":     parentID,
		"offset": 0,
		"limit":  7,
	})
	if docChunk["content"] != "Updated" || docChunk["truncated"] != true || docChunk["has_more"] != true || int(docChunk["next_offset"].(float64)) != 7 {
		t.Fatalf("unexpected docs_get chunked result: %+v", docChunk)
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

	canvasSummary := callTool(t, router, token, "canvas_get", map[string]interface{}{
		"id":           canvasID,
		"summary_only": true,
		"types":        []string{"rectangle", "text"},
		"offset":       0,
		"limit":        2,
	})
	if int(canvasSummary["matched_count"].(float64)) != 3 || int(canvasSummary["returned_count"].(float64)) != 2 || canvasSummary["has_more"] != true {
		t.Fatalf("unexpected canvas_get paginated summary: %+v", canvasSummary)
	}
	canvasObj := canvasSummary["canvas"].(map[string]interface{})
	if sceneStr, _ := canvasObj["scene"].(string); sceneStr != "" {
		t.Fatalf("expected raw scene to be omitted in summary_only mode, got %d bytes", len(sceneStr))
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

func TestMCP_AdminAPIKeyAuthAndManagement(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open("file:mcp_apikey_test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	jwtMgr := security.NewJWTManager("test-jwt-secret", 30*time.Minute, 24*time.Hour)
	authModule := auth.InitModule(db, jwtMgr)
	docsModule := docs.InitModule(db, "test-yjs-secret", "ws://127.0.0.1:1234/ws/yjs")
	mcpModule := mcp.InitModule(db, docsModule.DocsService, docsModule.CanvasService, docsModule.YjsService)

	router := gin.New()
	mcpModule.RegisterRoutes(router.Group(""), jwtMgr)
	v1 := router.Group("/api/v1")
	authModule.RegisterRoutes(v1, jwtMgr)
	docsModule.RegisterRoutes(v1, jwtMgr)
	mcpModule.RegisterRoutes(v1, jwtMgr)

	adminToken, _, err := jwtMgr.GenerateAccessToken("00000000-0000-0000-0000-000000000001", "admin@tomo.app", "ADMIN")
	if err != nil {
		t.Fatalf("generate admin jwt: %v", err)
	}
	userToken, _, err := jwtMgr.GenerateAccessToken("user-regular-1", "user@tomo.app", "USER")
	if err != nil {
		t.Fatalf("generate user jwt: %v", err)
	}

	// 1. Non-admin cannot create or list API keys
	reqForbidden := httptest.NewRequest(http.MethodPost, "/api/v1/admin/api-keys", strings.NewReader(`{"name":"denied"}`))
	reqForbidden.Header.Set("Content-Type", "application/json")
	reqForbidden.Header.Set("Authorization", "Bearer "+userToken)
	wForbidden := httptest.NewRecorder()
	router.ServeHTTP(wForbidden, reqForbidden)
	if wForbidden.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin POST /admin/api-keys, got %d (%s)", wForbidden.Code, wForbidden.Body.String())
	}

	// 2. Admin creates an API key via /api/v1/admin/api-keys
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/admin/api-keys", strings.NewReader(`{"name":"gemops-abi"}`))
	reqCreate.Header.Set("Content-Type", "application/json")
	reqCreate.Header.Set("Authorization", "Bearer "+adminToken)
	wCreate := httptest.NewRecorder()
	router.ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating api key, got %d (%s)", wCreate.Code, wCreate.Body.String())
	}
	var createEnv struct {
		Success bool `json:"success"`
		Data    struct {
			ID     string `json:"id"`
			APIKey string `json:"api_key"`
		} `json:"data"`
	}
	if err := json.Unmarshal(wCreate.Body.Bytes(), &createEnv); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	apiKey := createEnv.Data.APIKey
	keyID := createEnv.Data.ID
	if !strings.HasPrefix(apiKey, "tomo_ak_") || keyID == "" {
		t.Fatalf("unexpected api key payload: %+v", createEnv)
	}

	// 3. Call /mcp using X-Api-Key header (no JWT)
	initBody, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params":  map[string]interface{}{"protocolVersion": "2025-03-26"},
	})
	reqMCP := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewReader(initBody))
	reqMCP.Header.Set("Content-Type", "application/json")
	reqMCP.Header.Set("X-Api-Key", apiKey)
	wMCP := httptest.NewRecorder()
	router.ServeHTTP(wMCP, reqMCP)
	if wMCP.Code != http.StatusOK {
		t.Fatalf("expected 200 on /mcp with X-Api-Key, got %d (%s)", wMCP.Code, wMCP.Body.String())
	}

	// 4. Call /api/v1/docs using Authorization: Bearer <apiKey> (Node GoClient compat)
	reqDocs := httptest.NewRequest(http.MethodGet, "/api/v1/docs", nil)
	reqDocs.Header.Set("Authorization", "Bearer "+apiKey)
	wDocs := httptest.NewRecorder()
	router.ServeHTTP(wDocs, reqDocs)
	if wDocs.Code != http.StatusOK {
		t.Fatalf("expected 200 on /api/v1/docs with Bearer apiKey, got %d (%s)", wDocs.Code, wDocs.Body.String())
	}

	// 5. Admin lists keys under /api/v1/auth/api-keys (plaintext must not be exposed)
	reqList := httptest.NewRequest(http.MethodGet, "/api/v1/auth/api-keys", nil)
	reqList.Header.Set("Authorization", "Bearer "+adminToken)
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, reqList)
	if wList.Code != http.StatusOK || strings.Contains(wList.Body.String(), apiKey) {
		t.Fatalf("unexpected list response or leaked plaintext key: code=%d body=%s", wList.Code, wList.Body.String())
	}

	// 6. Admin revokes the API key -> subsequent /mcp call must return 401
	reqRevoke := httptest.NewRequest(http.MethodPost, "/api/v1/admin/api-keys/"+keyID+"/revoke", nil)
	reqRevoke.Header.Set("Authorization", "Bearer "+adminToken)
	wRevoke := httptest.NewRecorder()
	router.ServeHTTP(wRevoke, reqRevoke)
	if wRevoke.Code != http.StatusOK {
		t.Fatalf("expected 200 revoking api key, got %d (%s)", wRevoke.Code, wRevoke.Body.String())
	}

	reqRevokedMCP := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewReader(initBody))
	reqRevokedMCP.Header.Set("Content-Type", "application/json")
	reqRevokedMCP.Header.Set("X-Api-Key", apiKey)
	wRevokedMCP := httptest.NewRecorder()
	router.ServeHTTP(wRevokedMCP, reqRevokedMCP)
	if wRevokedMCP.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after revoking api key, got %d", wRevokedMCP.Code)
	}

	// 7. Admin deletes the API key
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/api-keys/"+keyID, nil)
	reqDel.Header.Set("Authorization", "Bearer "+adminToken)
	wDel := httptest.NewRecorder()
	router.ServeHTTP(wDel, reqDel)
	if wDel.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting api key, got %d (%s)", wDel.Code, wDel.Body.String())
	}
}

func TestMCP_FeSyncFromBackend(t *testing.T) {
	router, token := setupMCPTestRouter(t)

	res := callTool(t, router, token, "fe_sync_from_backend", map[string]interface{}{
		"scope":              "docs",
		"doc_ids":            []string{"doc-42"},
		"reload_open_editor": true,
		"reason":             "Direct Go fallback save",
	})
	if res["action"] != "fe_sync_from_backend" {
		t.Fatalf("expected action fe_sync_from_backend, got %v", res["action"])
	}
	if res["scope"] != "docs" {
		t.Fatalf("expected scope docs, got %v", res["scope"])
	}
	if res["reload_open_editor"] != true {
		t.Fatalf("expected reload_open_editor true, got %v", res["reload_open_editor"])
	}
}
