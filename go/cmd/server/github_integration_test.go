package main_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"tomo-backend/config"
	"tomo-backend/internal/infrastructure/database"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth"
	"tomo-backend/internal/modules/docs"
	"tomo-backend/internal/modules/github"

	"github.com/gin-gonic/gin"
)

func setupGitHubIntegrationServer(t *testing.T, githubAPIBaseURL string) (*gin.Engine, string) {
	gin.SetMode(gin.TestMode)

	wsRoot := t.TempDir()
	cfg := &config.Config{
		ServerPort:       "8080",
		DBDriver:         "sqlite",
		DBDsn:            "file::memory:?cache=shared",
		JWTSecret:        "integration-test-secret-2026",
		JWTAccessTTL:     1 * time.Hour,
		JWTRefreshTTL:    24 * time.Hour,
		YjsSecret:        "integration-yjs-secret-2026",
		Environment:      "test",
		GitHubAPIBaseURL: githubAPIBaseURL,
		WorkspaceRoot:    wsRoot,
		CacheTTLHours:    24,
	}

	db, err := database.InitDB(cfg)
	if err != nil {
		t.Fatalf("Failed to init DB: %v", err)
	}

	jwtManager := security.NewJWTManager(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	authModule := auth.InitModule(db, jwtManager)
	docsModule := docs.InitModule(db, cfg.YjsSecret)
	githubModule := github.InitModule(db, cfg.GitHubAPIBaseURL, cfg.WorkspaceRoot, cfg.CacheTTLHours)

	router := gin.Default()
	v1 := router.Group("/api/v1")
	{
		authModule.RegisterRoutes(v1, jwtManager)
		docsModule.RegisterRoutes(v1, jwtManager)
		githubModule.RegisterRoutes(v1, jwtManager)
	}

	// Helper to login and get JWT token
	loginPayload := map[string]string{
		"email":    "admin@tomo.app",
		"password": "admin123",
	}
	body, _ := json.Marshal(loginPayload)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Login failed: %d %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	return router, resp.Data.AccessToken
}

func TestGitHubHTTP_FullWorkflow(t *testing.T) {
	// Setup Mock GitHub API
	mockGH := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user":
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-OAuth-Scopes", "repo, user")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{
				"id": 1,
				"login": "tester",
				"name": "Integration Tester",
				"email": "test@tomo.app",
				"avatar_url": "https://avatar.url"
			}`))
		case "/user/repos":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`[{"id": 1, "name": "workspace-repo", "full_name": "tester/workspace-repo", "owner": {"login": "tester"}, "default_branch": "main", "clone_url": "https://github.com/tester/workspace-repo.git"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockGH.Close()

	router, token := setupGitHubIntegrationServer(t, mockGH.URL)
	authHeader := "Bearer " + token

	// 1. Get Profile before connect
	{
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/github/user", nil)
		req.Header.Set("Authorization", authHeader)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}
	}

	// 2. Connect Account
	{
		w := httptest.NewRecorder()
		payload := map[string]string{"token": "ghp_test_token_123456"}
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/github/connect", bytes.NewBuffer(body))
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Connect failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 3. List Repos
	{
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/github/repos", nil)
		req.Header.Set("Authorization", authHeader)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("List repos failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 4. Init Repo locally
	repoDir := filepath.Join(t.TempDir(), "local-git-repo")
	_ = os.MkdirAll(repoDir, 0755)
	{
		w := httptest.NewRecorder()
		payload := map[string]string{"repo_path": repoDir}
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/github/repo/init", bytes.NewBuffer(body))
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Init repo failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 5. Select active repo
	{
		w := httptest.NewRecorder()
		payload := map[string]interface{}{
			"repo_owner":       "tester",
			"repo_name":        "local-git-repo",
			"branch":           "main",
			"clone_if_missing": true,
		}
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/github/repo/select", bytes.NewBuffer(body))
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Select repo failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 6. Save File JSON
	{
		w := httptest.NewRecorder()
		payload := map[string]interface{}{
			"path": "docs/my-doc.json",
			"content": map[string]interface{}{
				"title":   "Hello Tomo",
				"content": "This is a test doc content",
			},
		}
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/github/files/save", bytes.NewBuffer(body))
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Save file failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 7. Get File JSON
	{
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/github/files/get?path=docs/my-doc.json", nil)
		req.Header.Set("Authorization", authHeader)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Get file failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 8. Compare Diff
	{
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/github/repo/diff", nil)
		req.Header.Set("Authorization", authHeader)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Diff failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 9. Commit Changes
	{
		w := httptest.NewRecorder()
		payload := map[string]interface{}{
			"message": "feat: test commit from http",
		}
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/github/repo/commit-and-push", bytes.NewBuffer(body))
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Commit failed: %d %s", w.Code, w.Body.String())
		}
	}

	// 10. File History
	{
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/github/repo/file-history?file_path=docs/my-doc.json", nil)
		req.Header.Set("Authorization", authHeader)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("File history failed: %d %s", w.Code, w.Body.String())
		}
	}
}
