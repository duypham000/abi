package main_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"tomo-backend/config"
	"tomo-backend/internal/infrastructure/database"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth"
	"tomo-backend/internal/modules/auth/domain"
	"tomo-backend/internal/modules/docs"
	"tomo-backend/internal/modules/github"

	"github.com/gin-gonic/gin"
)

func setupTestServer(t *testing.T) *gin.Engine {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		ServerPort:       "8080",
		DBDriver:         "sqlite",
		DBDsn:            "file::memory:?cache=shared",
		JWTSecret:        "integration-test-secret-2026",
		JWTAccessTTL:     1 * time.Hour,
		JWTRefreshTTL:    24 * time.Hour,
		YjsSecret:        "integration-yjs-secret-2026",
		Environment:      "test",
		GitHubAPIBaseURL: "https://api.github.com",
		WorkspaceRoot:    t.TempDir(),
		CacheTTLHours:    24,
	}

	db, err := database.InitDB(cfg)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}

	jwtManager := security.NewJWTManager(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	authModule := auth.InitModule(db, jwtManager)
	docsModule := docs.InitModule(db, cfg.YjsSecret)
	githubModule := github.InitModule(db, cfg.GitHubAPIBaseURL, cfg.WorkspaceRoot, cfg.CacheTTLHours)

	router := gin.Default()
	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "UP"})
	})

	v1 := router.Group("/api/v1")
	{
		authModule.RegisterRoutes(v1, jwtManager)
		docsModule.RegisterRoutes(v1, jwtManager)
		githubModule.RegisterRoutes(v1, jwtManager)
	}

	return router
}

func TestE2E_HealthCheck(t *testing.T) {
	router := setupTestServer(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/healthz", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected HTTP 200 on /healthz, got %d", w.Code)
	}
}

func TestE2E_FullAuthAndDocsWorkflow(t *testing.T) {
	router := setupTestServer(t)

	// 1. Register User
	regPayload := map[string]interface{}{
		"email":     "e2e@tomo.com",
		"password":  "Password123!",
		"full_name": "E2E Tester",
		"role":      "ADMIN",
	}
	body, _ := json.Marshal(regPayload)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Register failed with status %d: %s", w.Code, w.Body.String())
	}

	var regResp struct {
		Success bool `json:"success"`
		Data    struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			User         struct {
				ID    string      `json:"id"`
				Email string      `json:"email"`
				Role  domain.Role `json:"role"`
			} `json:"user"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &regResp)

	accessToken := regResp.Data.AccessToken
	if accessToken == "" {
		t.Fatalf("AccessToken is empty in registration response")
	}

	// 2. Fetch Profile (/api/v1/auth/me)
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Get Profile failed with status %d: %s", w.Code, w.Body.String())
	}

	// 3. Create Document (/api/v1/docs)
	docPayload := map[string]interface{}{
		"title":   "E2E Test Document",
		"content": "# E2E Content Header",
		"status":  "PUBLISHED",
	}
	docBody, _ := json.Marshal(docPayload)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodPost, "/api/v1/docs", bytes.NewBuffer(docBody))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Create Doc failed with status %d: %s", w.Code, w.Body.String())
	}

	var docResp struct {
		Data struct {
			ID   string `json:"id"`
			Slug string `json:"slug"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &docResp)
	docID := docResp.Data.ID

	// 4. Fetch Doc Tree (/api/v1/docs/tree)
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/v1/docs/tree", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Get Doc Tree failed with status %d: %s", w.Code, w.Body.String())
	}

	// 5. Generate Yjs Token (/api/v1/yjs/auth/token)
	yjsTokenPayload := map[string]interface{}{
		"doc_id":      docID,
		"access_mode": "write",
	}
	yjsBody, _ := json.Marshal(yjsTokenPayload)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodPost, "/api/v1/yjs/auth/token", bytes.NewBuffer(yjsBody))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Generate Yjs token failed with status %d: %s", w.Code, w.Body.String())
	}

	// 6. Save Yjs Snapshot (/api/v1/yjs/storage/doc/:docId/snapshot)
	snapPayload := map[string]interface{}{
		"state_vector_base64": "SGVsbG9Xb3JsZFlqcw==",
	}
	snapBody, _ := json.Marshal(snapPayload)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodPost, "/api/v1/yjs/storage/doc/"+docID+"/snapshot", bytes.NewBuffer(snapBody))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Save Yjs snapshot failed with status %d: %s", w.Code, w.Body.String())
	}
}
