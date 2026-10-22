package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"tomo-backend/internal/modules/github/domain"
	"tomo-backend/internal/modules/github/dto"
	"tomo-backend/internal/modules/github/repository"
	"tomo-backend/internal/modules/github/service"

	"github.com/go-git/go-git/v5"
	gitConfig "github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing/object"
	"gorm.io/gorm"
)

// In-memory mock account repository for testing
type mockAccountRepo struct {
	accounts map[string]*domain.GithubAccount
	mu       sync.Mutex
}

func newMockAccountRepo() repository.GithubAccountRepository {
	return &mockAccountRepo{
		accounts: make(map[string]*domain.GithubAccount),
	}
}

func (m *mockAccountRepo) Save(account *domain.GithubAccount) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.accounts[account.UserID] = account
	return nil
}

func (m *mockAccountRepo) FindByUserID(userID string) (*domain.GithubAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	acc, exists := m.accounts[userID]
	if !exists {
		return nil, gorm.ErrRecordNotFound
	}
	return acc, nil
}

func (m *mockAccountRepo) DeleteByUserID(userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.accounts, userID)
	return nil
}

func (m *mockAccountRepo) UpdateActiveRepo(userID, owner, name, branch, url, workspacePath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	acc, exists := m.accounts[userID]
	if !exists {
		return gorm.ErrRecordNotFound
	}
	acc.ActiveRepoOwner = owner
	acc.ActiveRepoName = name
	acc.ActiveRepoBranch = branch
	acc.ActiveRepoURL = url
	acc.WorkspacePath = workspacePath
	return nil
}

func setupMockGitHubAPIServer(t *testing.T) *httptest.Server {
	mux := http.NewServeMux()

	// GET /user
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "token valid_token_123" {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Bad credentials"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-OAuth-Scopes", "repo, user, read:org")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
			"id": 12345,
			"login": "octocat",
			"name": "Monalisa Octocat",
			"email": "octocat@github.com",
			"avatar_url": "https://github.com/images/error/octocat_happy.gif"
		}`))
	})

	// GET /user/repos
	mux.HandleFunc("/user/repos", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "token valid_token_123" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		if r.Method == http.MethodPost {
			var body map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&body)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(fmt.Sprintf(`{
				"id": 99999,
				"name": "%s",
				"full_name": "octocat/%s",
				"description": "Test Repo",
				"private": true,
				"default_branch": "main",
				"html_url": "https://github.com/octocat/%s",
				"clone_url": "https://github.com/octocat/%s.git",
				"updated_at": "2026-10-15T12:00:00Z",
				"owner": {"login": "octocat"}
			}`, body["name"], body["name"], body["name"], body["name"])))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[
			{
				"id": 1001,
				"name": "my-docs",
				"full_name": "octocat/my-docs",
				"description": "My documentation notes",
				"private": false,
				"default_branch": "main",
				"html_url": "https://github.com/octocat/my-docs",
				"clone_url": "https://github.com/octocat/my-docs.git",
				"updated_at": "2026-10-15T10:00:00Z",
				"owner": {"login": "octocat"}
			}
		]`))
	})

	return httptest.NewServer(mux)
}

func TestConnectAccount_SuccessAndFailure(t *testing.T) {
	ts := setupMockGitHubAPIServer(t)
	defer ts.Close()

	repo := newMockAccountRepo()
	svc := service.NewGitHubService(repo, ts.URL, t.TempDir(), 24)
	ctx := context.Background()

	// 1. Success with valid token
	profile, err := svc.ConnectAccount(ctx, "user-1", "valid_token_123")
	if err != nil {
		t.Fatalf("ConnectAccount failed: %v", err)
	}
	if !profile.Connected || profile.Username != "octocat" {
		t.Errorf("Expected username octocat, got %s", profile.Username)
	}
	if len(profile.Scopes) == 0 {
		t.Errorf("Expected scopes to be populated")
	}

	// 2. Query profile
	queried, err := svc.GetAccountProfile(ctx, "user-1")
	if err != nil || !queried.Connected {
		t.Fatalf("GetAccountProfile failed: %v", err)
	}
	if queried.Username != "octocat" {
		t.Errorf("Expected octocat, got %s", queried.Username)
	}

	// 3. Failure with invalid token
	_, err = svc.ConnectAccount(ctx, "user-2", "invalid_token_xyz")
	if err == nil {
		t.Fatalf("Expected error for invalid token, got nil")
	}

	// 4. Disconnect
	err = svc.DisconnectAccount(ctx, "user-1")
	if err != nil {
		t.Fatalf("DisconnectAccount failed: %v", err)
	}
	discProfile, _ := svc.GetAccountProfile(ctx, "user-1")
	if discProfile.Connected {
		t.Errorf("Expected connected=false after disconnect")
	}
}

func TestListAndCreateRepositories(t *testing.T) {
	ts := setupMockGitHubAPIServer(t)
	defer ts.Close()

	repo := newMockAccountRepo()
	svc := service.NewGitHubService(repo, ts.URL, t.TempDir(), 24)
	ctx := context.Background()

	_, err := svc.ConnectAccount(ctx, "user-1", "valid_token_123")
	if err != nil {
		t.Fatalf("ConnectAccount failed: %v", err)
	}

	// List repos
	repos, err := svc.ListRepositories(ctx, "user-1")
	if err != nil {
		t.Fatalf("ListRepositories failed: %v", err)
	}
	if len(repos) != 1 || repos[0].Name != "my-docs" {
		t.Fatalf("Unexpected repos: %+v", repos)
	}

	// Create repo
	created, err := svc.CreateRepository(ctx, "user-1", dto.CreateRepoRequest{
		Name:        "new-notes",
		Description: "New notes repo",
		Private:     true,
	})
	if err != nil {
		t.Fatalf("CreateRepository failed: %v", err)
	}
	if created.Name != "new-notes" {
		t.Errorf("Expected created name new-notes, got %s", created.Name)
	}
}

func TestFileStorageAndLazyCache(t *testing.T) {
	ts := setupMockGitHubAPIServer(t)
	defer ts.Close()

	wsRoot := t.TempDir()
	accountRepo := newMockAccountRepo()
	svc := service.NewGitHubService(accountRepo, ts.URL, wsRoot, 24)
	ctx := context.Background()

	// Connect user and select active repo (local dir)
	_, _ = svc.ConnectAccount(ctx, "user-1", "valid_token_123")
	repoWorkspaceDir := filepath.Join(wsRoot, "user-1", "octocat_notes")
	_ = svc.InitLocalRepo(ctx, repoWorkspaceDir)

	_, err := svc.SelectRepository(ctx, "user-1", dto.SelectRepoRequest{
		RepoOwner:      "octocat",
		RepoName:       "notes",
		Branch:         "main",
		CloneIfMissing: false,
	})
	if err != nil {
		t.Fatalf("SelectRepository failed: %v", err)
	}

	// 1. Save Doc JSON file
	docContent := map[string]interface{}{
		"id":    "doc-101",
		"title": "Getting Started with Tomo",
		"blocks": []map[string]interface{}{
			{"type": "header", "text": "Welcome to Modular Monolith"},
		},
	}
	savedDoc, err := svc.SaveFile(ctx, "user-1", dto.SaveFileRequest{
		Path:    "docs/doc-101.json",
		Content: docContent,
	})
	if err != nil {
		t.Fatalf("SaveFile (doc) failed: %v", err)
	}
	if savedDoc.Path != "docs/doc-101.json" || !savedDoc.Cached {
		t.Errorf("Unexpected doc response: %+v", savedDoc)
	}

	// 2. Save Excalidraw JSON file
	canvasContent := map[string]interface{}{
		"id":    "canvas-202",
		"title": "Architecture Diagram",
		"elements": []map[string]interface{}{
			{"type": "rectangle", "x": 10, "y": 20, "width": 100, "height": 50},
		},
	}
	savedCanvas, err := svc.SaveFile(ctx, "user-1", dto.SaveFileRequest{
		Path:    "canvases/canvas-202.excalidraw.json",
		Content: canvasContent,
	})
	if err != nil {
		t.Fatalf("SaveFile (canvas) failed: %v", err)
	}
	if savedCanvas.Path != "canvases/canvas-202.excalidraw.json" {
		t.Errorf("Unexpected canvas path: %s", savedCanvas.Path)
	}

	// 3. Get File from Cache
	getFile, err := svc.GetFile(ctx, "user-1", "docs/doc-101.json", false)
	if err != nil {
		t.Fatalf("GetFile failed: %v", err)
	}
	if getFile.Path != "docs/doc-101.json" {
		t.Errorf("Expected path docs/doc-101.json, got %s", getFile.Path)
	}

	// 4. List Files
	files, err := svc.ListFiles(ctx, "user-1", "")
	if err != nil {
		t.Fatalf("ListFiles failed: %v", err)
	}
	foundDoc, foundCanvas := false, false
	for _, f := range files {
		if f.Path == "docs/doc-101.json" {
			foundDoc = true
		}
		if f.Path == "canvases/canvas-202.excalidraw.json" {
			foundCanvas = true
		}
	}
	if !foundDoc || !foundCanvas {
		t.Errorf("Expected to find both doc and canvas, got: %+v", files)
	}

	// 5. Prune Cache: Dirty/uncommitted files must NOT be deleted
	pruned, err := svc.PruneCache(ctx, "user-1")
	if err != nil {
		t.Fatalf("PruneCache failed: %v", err)
	}
	if len(pruned) > 0 {
		t.Errorf("Dirty files should never be pruned, but pruned: %v", pruned)
	}
}

func TestGitOperations_Hermetic(t *testing.T) {
	// Setup a local bare git repo as the origin remote!
	bareOriginDir := t.TempDir()
	_, err := git.PlainInit(bareOriginDir, true)
	if err != nil {
		t.Fatalf("Failed to init bare origin: %v", err)
	}

	wsRoot := t.TempDir()
	accountRepo := newMockAccountRepo()
	svc := service.NewGitHubService(accountRepo, "https://api.github.com", wsRoot, 24)
	ctx := context.Background()

	// Setup account with active repo pointing to bareOriginDir as remote origin
	repoWorkspaceDir := filepath.Join(wsRoot, "user-1", "test_notes")
	_ = os.MkdirAll(repoWorkspaceDir, 0755)

	// Init local repo
	err = svc.InitLocalRepo(ctx, repoWorkspaceDir)
	if err != nil {
		t.Fatalf("InitLocalRepo failed: %v", err)
	}

	// Set remote origin to bareOriginDir
	localRepo, err := git.PlainOpen(repoWorkspaceDir)
	if err != nil {
		t.Fatalf("PlainOpen failed: %v", err)
	}
	_, err = localRepo.CreateRemote(&gitConfig.RemoteConfig{
		Name: "origin",
		URLs: []string{bareOriginDir},
	})
	if err != nil {
		t.Fatalf("CreateRemote failed: %v", err)
	}

	// Push initial commit to bare origin
	_ = localRepo.Push(&git.PushOptions{RemoteName: "origin"})

	// Save account
	_ = accountRepo.Save(&domain.GithubAccount{
		ID:               "acc-1",
		UserID:           "user-1",
		Username:         "octocat",
		Name:             "Monalisa Octocat",
		Email:            "octocat@github.com",
		WorkspacePath:    repoWorkspaceDir,
		ActiveRepoOwner:  "octocat",
		ActiveRepoName:   "test_notes",
		ActiveRepoBranch: "master",
		ActiveRepoURL:    bareOriginDir,
		Token:            "mock-token",
	})

	// 1. Save file in workspace
	_, err = svc.SaveFile(ctx, "user-1", dto.SaveFileRequest{
		Path: "docs/architecture.json",
		Content: map[string]interface{}{
			"version": 1,
			"title":   "System Architecture",
		},
	})
	if err != nil {
		t.Fatalf("SaveFile failed: %v", err)
	}

	// 2. Compare Diff: Uncommitted file should be detected
	diffRes, err := svc.CompareDiff(ctx, "user-1", dto.DiffRequest{})
	if err != nil {
		t.Fatalf("CompareDiff failed: %v", err)
	}
	if len(diffRes.UncommittedFiles) == 0 {
		t.Fatalf("Expected uncommitted files in diff, got 0")
	}
	if diffRes.UncommittedFiles[0].Path != "docs/architecture.json" {
		t.Errorf("Expected docs/architecture.json in diff, got %s", diffRes.UncommittedFiles[0].Path)
	}

	// 3. Commit and Push
	commitRes, err := svc.CommitAndPush(ctx, "user-1", dto.CommitAndPushRequest{
		Message: "feat: add architecture doc",
	})
	if err != nil {
		t.Fatalf("CommitAndPush failed: %v", err)
	}
	if commitRes.FilesCommitted == 0 {
		t.Fatalf("Expected committed files > 0")
	}

	// 4. Update file and commit a second version
	_, _ = svc.SaveFile(ctx, "user-1", dto.SaveFileRequest{
		Path: "docs/architecture.json",
		Content: map[string]interface{}{
			"version": 2,
			"title":   "System Architecture Updated",
		},
	})
	commitRes2, err := svc.CommitAndPush(ctx, "user-1", dto.CommitAndPushRequest{
		Message: "feat: update architecture doc to v2",
	})
	if err != nil {
		t.Fatalf("Second CommitAndPush failed: %v", err)
	}

	// 5. File History
	history, err := svc.GetFileHistory(ctx, "user-1", "docs/architecture.json", 10)
	if err != nil {
		t.Fatalf("GetFileHistory failed: %v", err)
	}
	if len(history) < 2 {
		t.Fatalf("Expected at least 2 commits in history, got %d", len(history))
	}
	if history[0].Message != "feat: update architecture doc to v2" {
		t.Errorf("Expected latest commit message, got: %s", history[0].Message)
	}

	// 6. Get File At Commit
	contentAtV1, err := svc.GetFileAtCommit(ctx, "user-1", "docs/architecture.json", commitRes.CommitHash)
	if err != nil {
		t.Fatalf("GetFileAtCommit (v1) failed: %v", err)
	}
	if !containsString(contentAtV1, `"version": 1`) {
		t.Errorf("Expected version 1 in historical content, got: %s", contentAtV1)
	}

	contentAtV2, err := svc.GetFileAtCommit(ctx, "user-1", "docs/architecture.json", commitRes2.CommitHash)
	if err != nil {
		t.Fatalf("GetFileAtCommit (v2) failed: %v", err)
	}
	if !containsString(contentAtV2, `"version": 2`) {
		t.Errorf("Expected version 2 in historical content, got: %s", contentAtV2)
	}

	// 6.1 Get Commit File Diff (comparing commitRes2 with commitRes)
	commitDiffRes, err := svc.GetCommitFileDiff(ctx, "user-1", "docs/architecture.json", commitRes2.CommitHash, commitRes.CommitHash)
	if err != nil {
		t.Fatalf("GetCommitFileDiff failed: %v", err)
	}
	if commitDiffRes.Status != domain.StatusModified {
		t.Errorf("Expected StatusModified, got: %s", commitDiffRes.Status)
	}
	if !containsString(commitDiffRes.Patch, `"version": 2`) {
		t.Errorf("Expected patch to contain version 2, got: %s", commitDiffRes.Patch)
	}

	// 6.2 Get Commit File Diff with default parent
	diffParent, err := svc.GetCommitFileDiff(ctx, "user-1", "docs/architecture.json", commitRes2.CommitHash, "parent")
	if err != nil {
		t.Fatalf("GetCommitFileDiff with parent failed: %v", err)
	}
	if diffParent.Status != domain.StatusModified {
		t.Errorf("Expected StatusModified, got: %s", diffParent.Status)
	}

	// 7. Pull (should be already up to date)
	pullRes, err := svc.Pull(ctx, "user-1", dto.PullRequest{Branch: "master"})
	if err != nil {
		t.Fatalf("Pull failed: %v", err)
	}
	if pullRes.Status != "up_to_date" {
		t.Errorf("Expected up_to_date, got: %s", pullRes.Status)
	}
}

func TestConflictResolution(t *testing.T) {
	tempDir := t.TempDir()
	r, err := git.PlainInit(tempDir, false)
	if err != nil {
		t.Fatalf("PlainInit failed: %v", err)
	}

	testFilePath := filepath.Join(tempDir, "docs", "sample.json")
	_ = os.MkdirAll(filepath.Dir(testFilePath), 0755)
	_ = os.WriteFile(testFilePath, []byte("{\"version\": 1}\n"), 0644)

	wt, _ := r.Worktree()
	_, _ = wt.Add("docs/sample.json")
	_, _ = wt.Commit("initial commit", &git.CommitOptions{
		Author: &object.Signature{Name: "tester", Email: "test@tomo.app", When: time.Now()},
	})

	cs := service.NewConflictService()

	// 1. Resolve with 'theirs'
	theirsContent := "{\"version\": 2, \"source\": \"remote\"}\n"
	err = cs.ResolveConflict(r, tempDir, "docs/sample.json", domain.ResolutionTheirs, "", theirsContent)
	if err != nil {
		t.Fatalf("ResolveConflict (theirs) failed: %v", err)
	}
	data, _ := os.ReadFile(testFilePath)
	if string(data) != theirsContent {
		t.Errorf("Expected theirs content, got: %s", string(data))
	}

	// 2. Resolve with 'manual'
	manualContent := "{\"version\": 3, \"merged\": true}\n"
	err = cs.ResolveConflict(r, tempDir, "docs/sample.json", domain.ResolutionManual, manualContent, "")
	if err != nil {
		t.Fatalf("ResolveConflict (manual) failed: %v", err)
	}
	data2, _ := os.ReadFile(testFilePath)
	if string(data2) != manualContent {
		t.Errorf("Expected manual content, got: %s", string(data2))
	}
}

func TestRepoLockManager_Concurrency(t *testing.T) {
	lockMgr := service.NewRepoLockManager()
	repoPath := "/tmp/test-repo"

	var wg sync.WaitGroup
	count := 50
	wg.Add(count)

	for i := 0; i < count; i++ {
		go func(idx int) {
			defer wg.Done()
			if idx%2 == 0 {
				unlock := lockMgr.Lock(repoPath)
				time.Sleep(1 * time.Millisecond)
				unlock()
			} else {
				unlock := lockMgr.RLock(repoPath)
				time.Sleep(1 * time.Millisecond)
				unlock()
			}
		}(i)
	}

	wg.Wait()
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
