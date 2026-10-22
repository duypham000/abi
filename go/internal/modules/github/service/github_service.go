package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"tomo-backend/internal/modules/github/domain"
	"tomo-backend/internal/modules/github/dto"
	"tomo-backend/internal/modules/github/repository"

	"github.com/go-git/go-git/v5"
	gitConfig "github.com/go-git/go-git/v5/config"
	gitHttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/google/uuid"
)

type GitHubService interface {
	ConnectAccount(ctx context.Context, userID, token string) (*dto.GithubProfileResponse, error)
	GetAccountProfile(ctx context.Context, userID string) (*dto.GithubProfileResponse, error)
	DisconnectAccount(ctx context.Context, userID string) error

	ListRepositories(ctx context.Context, userID string) ([]domain.RepositoryItem, error)
	CreateRepository(ctx context.Context, userID string, req dto.CreateRepoRequest) (*domain.RepositoryItem, error)
	SelectRepository(ctx context.Context, userID string, req dto.SelectRepoRequest) (*dto.GithubProfileResponse, error)
	GetActiveRepository(ctx context.Context, userID string) (*domain.RepositoryItem, string, error)

	SaveFile(ctx context.Context, userID string, req dto.SaveFileRequest) (*dto.FileResponse, error)
	GetFile(ctx context.Context, userID, relPath string, forceRefresh bool) (*dto.FileResponse, error)
	ListFiles(ctx context.Context, userID, subDir string) ([]domain.FileItem, error)
	DeleteFile(ctx context.Context, userID, relPath string) error
	PruneCache(ctx context.Context, userID string) ([]string, error)

	CommitAndPush(ctx context.Context, userID string, req dto.CommitAndPushRequest) (*dto.CommitPushResponse, error)
	Pull(ctx context.Context, userID string, req dto.PullRequest) (*dto.PullResponse, error)
	CompareDiff(ctx context.Context, userID string, req dto.DiffRequest) (*domain.DiffResult, error)
	GetFileHistory(ctx context.Context, userID, filePath string, limit int) ([]domain.CommitRecord, error)
	GetFileAtCommit(ctx context.Context, userID, filePath, commitHash string) (string, error)
	GetCommitFileDiff(ctx context.Context, userID, filePath, commitHash, baseCommit string) (*domain.FileDiff, error)
	CheckConflicts(ctx context.Context, userID string, req dto.CheckConflictsRequest) (*domain.ConflictCheckResult, error)
	ResolveConflict(ctx context.Context, userID string, req dto.ResolveConflictRequest) (*dto.ConflictResolutionResponse, error)
	CheckFileStatus(ctx context.Context, userID string, req dto.CheckFileStatusRequest) (*dto.CheckFileStatusResponse, error)

	InitLocalRepo(ctx context.Context, repoPath string) error

	// Manifest & Fast Workspace Indexing
	GetManifest(ctx context.Context, userID string) (*domain.WorkspaceManifest, error)
	RebuildManifest(ctx context.Context, userID string) (*domain.WorkspaceManifest, error)
	GetWorkspaceStatus(ctx context.Context, userID string) (*dto.WorkspaceStatusResponse, error)
}

type gitHubService struct {
	accountRepo   repository.GithubAccountRepository
	cacheMgr      *CacheManager
	manifestMgr   *ManifestManager
	conflictSvc   *ConflictService
	lockMgr       *RepoLockManager
	apiBaseURL    string
	workspaceRoot string
	httpClient    *http.Client
}

func NewGitHubService(
	accountRepo repository.GithubAccountRepository,
	apiBaseURL string,
	workspaceRoot string,
	cacheTTLHours int,
) GitHubService {
	if apiBaseURL == "" {
		apiBaseURL = "https://api.github.com"
	}
	if workspaceRoot == "" {
		workspaceRoot = "./data/workspaces"
	}
	return &gitHubService{
		accountRepo:   accountRepo,
		cacheMgr:      NewCacheManager(cacheTTLHours),
		manifestMgr:   NewManifestManager(),
		conflictSvc:   NewConflictService(),
		lockMgr:       NewRepoLockManager(),
		apiBaseURL:    strings.TrimRight(apiBaseURL, "/"),
		workspaceRoot: workspaceRoot,
		httpClient:    &http.Client{Timeout: 15 * time.Second},
	}
}

// ── 1. ACCOUNT MANAGEMENT ──────────────────────────────────────────────────

type gitHubUserAPIResponse struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

func (s *gitHubService) ConnectAccount(ctx context.Context, userID, token string) (*dto.GithubProfileResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.apiBaseURL+"/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Tomo-Modular-Monolith")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach GitHub API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, errors.New("invalid GitHub Personal Access Token")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API error (%d): %s", resp.StatusCode, string(body))
	}

	scopesHeader := resp.Header.Get("X-OAuth-Scopes")
	var ghUser gitHubUserAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&ghUser); err != nil {
		return nil, fmt.Errorf("failed to decode GitHub user: %w", err)
	}

	tokenPreview := ""
	if len(token) > 8 {
		tokenPreview = token[:4] + "****" + token[len(token)-4:]
	} else {
		tokenPreview = "****"
	}

	account := &domain.GithubAccount{
		ID:           uuid.New().String(),
		UserID:       userID,
		Username:     ghUser.Login,
		Name:         ghUser.Name,
		Email:        ghUser.Email,
		AvatarURL:    ghUser.AvatarURL,
		Token:        token,
		TokenPreview: tokenPreview,
		Scopes:       scopesHeader,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Preserve active repo settings if account already existed
	if existing, err := s.accountRepo.FindByUserID(userID); err == nil && existing != nil {
		account.ID = existing.ID
		account.ActiveRepoOwner = existing.ActiveRepoOwner
		account.ActiveRepoName = existing.ActiveRepoName
		account.ActiveRepoBranch = existing.ActiveRepoBranch
		account.ActiveRepoURL = existing.ActiveRepoURL
		account.WorkspacePath = existing.WorkspacePath
	}

	if err := s.accountRepo.Save(account); err != nil {
		return nil, fmt.Errorf("failed to save account: %w", err)
	}

	return s.accountToProfileResponse(account), nil
}

func (s *gitHubService) GetAccountProfile(ctx context.Context, userID string) (*dto.GithubProfileResponse, error) {
	account, err := s.accountRepo.FindByUserID(userID)
	if err != nil {
		return &dto.GithubProfileResponse{Connected: false}, nil
	}
	return s.accountToProfileResponse(account), nil
}

func (s *gitHubService) DisconnectAccount(ctx context.Context, userID string) error {
	return s.accountRepo.DeleteByUserID(userID)
}

func (s *gitHubService) accountToProfileResponse(account *domain.GithubAccount) *dto.GithubProfileResponse {
	scopes := []string{}
	if account.Scopes != "" {
		for _, s := range strings.Split(account.Scopes, ",") {
			if trimmed := strings.TrimSpace(s); trimmed != "" {
				scopes = append(scopes, trimmed)
			}
		}
	}

	return &dto.GithubProfileResponse{
		Connected:        true,
		Username:         account.Username,
		Name:             account.Name,
		Email:            account.Email,
		AvatarURL:        account.AvatarURL,
		TokenPreview:     account.TokenPreview,
		Scopes:           scopes,
		ActiveRepoOwner:  account.ActiveRepoOwner,
		ActiveRepoName:   account.ActiveRepoName,
		ActiveRepoBranch: account.ActiveRepoBranch,
		ActiveRepoURL:    account.ActiveRepoURL,
		WorkspacePath:    account.WorkspacePath,

		AvatarURLCamel:        account.AvatarURL,
		TokenPreviewCamel:     account.TokenPreview,
		ActiveRepoOwnerCamel:  account.ActiveRepoOwner,
		ActiveRepoNameCamel:   account.ActiveRepoName,
		ActiveRepoBranchCamel: account.ActiveRepoBranch,
		ActiveRepoURLCamel:    account.ActiveRepoURL,
		WorkspacePathCamel:    account.WorkspacePath,
	}
}

// ── 2. REPOSITORY MANAGEMENT ───────────────────────────────────────────────

type gitHubRepoAPIResponse struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Description   string `json:"description"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	HTMLURL       string `json:"html_url"`
	CloneURL      string `json:"clone_url"`
	UpdatedAt     string `json:"updated_at"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
}

func (s *gitHubService) ListRepositories(ctx context.Context, userID string) ([]domain.RepositoryItem, error) {
	account, err := s.accountRepo.FindByUserID(userID)
	if err != nil {
		return nil, errors.New("GitHub account is not connected")
	}

	reqURL := s.apiBaseURL + "/user/repos?per_page=100&sort=updated"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+account.Token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Tomo-Modular-Monolith")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API error (%d): %s", resp.StatusCode, string(body))
	}

	var ghRepos []gitHubRepoAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&ghRepos); err != nil {
		return nil, err
	}

	items := make([]domain.RepositoryItem, 0, len(ghRepos))
	for _, r := range ghRepos {
		t, _ := time.Parse(time.RFC3339, r.UpdatedAt)
		items = append(items, domain.RepositoryItem{
			ID:            r.ID,
			Name:          r.Name,
			FullName:      r.FullName,
			Owner:         r.Owner.Login,
			Description:   r.Description,
			Private:       r.Private,
			DefaultBranch: r.DefaultBranch,
			HTMLURL:       r.HTMLURL,
			CloneURL:      r.CloneURL,
			UpdatedAt:     t,
		})
	}
	return items, nil
}

func (s *gitHubService) CreateRepository(ctx context.Context, userID string, req dto.CreateRepoRequest) (*domain.RepositoryItem, error) {
	account, err := s.accountRepo.FindByUserID(userID)
	if err != nil {
		return nil, errors.New("GitHub account is not connected")
	}

	payload := map[string]interface{}{
		"name":        req.Name,
		"description": req.Description,
		"private":     req.Private,
		"auto_init":   req.AutoInit,
	}
	bodyBytes, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.apiBaseURL+"/user/repos", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "token "+account.Token)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/vnd.github.v3+json")
	httpReq.Header.Set("User-Agent", "Tomo-Modular-Monolith")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to create repo (%d): %s", resp.StatusCode, string(body))
	}

	var r gitHubRepoAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}

	t, _ := time.Parse(time.RFC3339, r.UpdatedAt)
	return &domain.RepositoryItem{
		ID:            r.ID,
		Name:          r.Name,
		FullName:      r.FullName,
		Owner:         r.Owner.Login,
		Description:   r.Description,
		Private:       r.Private,
		DefaultBranch: r.DefaultBranch,
		HTMLURL:       r.HTMLURL,
		CloneURL:      r.CloneURL,
		UpdatedAt:     t,
	}, nil
}

func (s *gitHubService) SelectRepository(ctx context.Context, userID string, req dto.SelectRepoRequest) (*dto.GithubProfileResponse, error) {
	account, err := s.accountRepo.FindByUserID(userID)
	if err != nil {
		return nil, errors.New("GitHub account is not connected")
	}

	branch := req.Branch
	if branch == "" {
		branch = "main"
	}

	// Workspace path on disk
	workspaceDir := filepath.Join(s.workspaceRoot, userID, fmt.Sprintf("%s_%s", req.RepoOwner, req.RepoName))
	cloneURL := req.CloneURL
	if cloneURL == "" {
		cloneURL = fmt.Sprintf("https://github.com/%s/%s.git", req.RepoOwner, req.RepoName)
	}

	unlock := s.lockMgr.Lock(workspaceDir)
	defer unlock()

	gitDir := filepath.Join(workspaceDir, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) && req.CloneIfMissing {
		_ = os.MkdirAll(workspaceDir, 0755)

		var auth *gitHttp.BasicAuth
		if account.Token != "" {
			auth = &gitHttp.BasicAuth{
				Username: account.Username,
				Password: account.Token,
			}
		}

		// 1. Try cloning specific branch
		_, cloneErr := git.PlainClone(workspaceDir, false, &git.CloneOptions{
			URL:           cloneURL,
			Auth:          auth,
			ReferenceName: plumbing.NewBranchReferenceName(branch),
			SingleBranch:  true,
		})

		// 2. If specific branch failed, try cloning default branch
		if cloneErr != nil && cloneErr != git.ErrRepositoryAlreadyExists {
			_ = os.RemoveAll(workspaceDir)
			_ = os.MkdirAll(workspaceDir, 0755)

			_, cloneErr = git.PlainClone(workspaceDir, false, &git.CloneOptions{
				URL:  cloneURL,
				Auth: auth,
			})
		}

		// 3. If clone still failed (empty remote repository or network/auth), clean up
		if cloneErr != nil {
			_ = os.RemoveAll(workspaceDir)
			_ = os.MkdirAll(workspaceDir, 0755)
		}
	}

	// Always ensure workspace structure, standard directories, manifest, and initial git setup
	_ = s.ensureWorkspaceStructureNoLock(ctx, workspaceDir, branch, account, cloneURL)

	// Update active repo in DB
	err = s.accountRepo.UpdateActiveRepo(userID, req.RepoOwner, req.RepoName, branch, cloneURL, workspaceDir)
	if err != nil {
		return nil, fmt.Errorf("failed to update active repository: %w", err)
	}

	account.ActiveRepoOwner = req.RepoOwner
	account.ActiveRepoName = req.RepoName
	account.ActiveRepoBranch = branch
	account.ActiveRepoURL = cloneURL
	account.WorkspacePath = workspaceDir

	return s.accountToProfileResponse(account), nil
}

func (s *gitHubService) GetActiveRepository(ctx context.Context, userID string) (*domain.RepositoryItem, string, error) {
	account, err := s.accountRepo.FindByUserID(userID)
	if err != nil {
		return nil, "", errors.New("GitHub account is not connected")
	}
	if account.ActiveRepoName == "" {
		return nil, "", errors.New("no active repository selected")
	}

	item := &domain.RepositoryItem{
		Name:          account.ActiveRepoName,
		FullName:      fmt.Sprintf("%s/%s", account.ActiveRepoOwner, account.ActiveRepoName),
		Owner:         account.ActiveRepoOwner,
		DefaultBranch: account.ActiveRepoBranch,
		CloneURL:      account.ActiveRepoURL,
	}
	return item, account.WorkspacePath, nil
}

func (s *gitHubService) getRepoPathOrActive(userID string, requestedPath string) (string, *domain.GithubAccount, error) {
	account, err := s.accountRepo.FindByUserID(userID)
	if err != nil {
		return "", nil, errors.New("GitHub account is not connected")
	}

	if requestedPath != "" {
		return filepath.Clean(requestedPath), account, nil
	}

	if account.WorkspacePath == "" {
		return "", account, errors.New("no active repository selected and repo_path not provided")
	}
	return account.WorkspacePath, account, nil
}

// ── 3. FILE-BASED JSON STORAGE & LAZY CACHE ────────────────────────────────

func (s *gitHubService) SaveFile(ctx context.Context, userID string, req dto.SaveFileRequest) (*dto.FileResponse, error) {
	repoPath, account, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()

	relPath := filepath.ToSlash(filepath.Clean(req.Path))
	fullPath := filepath.Join(repoPath, filepath.FromSlash(relPath))

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	// Standardize JSON: format with 2 spaces indent and trailing newline
	var formattedBytes []byte
	switch v := req.Content.(type) {
	case string:
		var raw interface{}
		if err := json.Unmarshal([]byte(v), &raw); err == nil {
			formattedBytes, _ = json.MarshalIndent(raw, "", "  ")
		} else {
			formattedBytes = []byte(v)
		}
	default:
		formattedBytes, err = json.MarshalIndent(v, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("invalid json content: %w", err)
		}
	}
	formattedBytes = append(formattedBytes, '\n')

	if err := os.WriteFile(fullPath, formattedBytes, 0644); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	// Update lazy cache TTL and mark dirty
	_ = s.cacheMgr.RecordAccess(repoPath, relPath, "", true)

	// Update workspace fast-lookup manifest
	itemType := "doc"
	if strings.HasPrefix(relPath, "canvases/") {
		itemType = "canvas"
	}
	id := strings.TrimSuffix(filepath.Base(relPath), ".json")
	title := id
	slug := id
	var parsedContent interface{}
	if err := json.Unmarshal(formattedBytes, &parsedContent); err == nil {
		if m, ok := parsedContent.(map[string]interface{}); ok {
			if t, ok := m["title"].(string); ok && t != "" {
				title = t
			}
			if s, ok := m["slug"].(string); ok && s != "" {
				slug = s
			}
		}
	}
	_ = s.manifestMgr.UpdateItem(repoPath, domain.ManifestItem{
		ID:        id,
		Type:      itemType,
		Path:      relPath,
		Title:     title,
		Slug:      slug,
		Size:      int64(len(formattedBytes)),
		UpdatedAt: time.Now(),
	})

	var committed, pushed bool
	var commitHashStr string

	if req.AutoCommit || req.AutoPush {
		r, err := git.PlainOpen(repoPath)
		if err != nil {
			return nil, fmt.Errorf("failed to open git repo: %w", err)
		}
		wt, err := r.Worktree()
		if err != nil {
			return nil, fmt.Errorf("failed to get git worktree: %w", err)
		}

		// Stage file and manifest
		_, _ = wt.Add(relPath)
		_, _ = wt.Add(".tomo/manifest.json")

		// If README.md or .gitignore exist, stage them too (for initial repo commit)
		if _, statErr := os.Stat(filepath.Join(repoPath, "README.md")); statErr == nil {
			_, _ = wt.Add("README.md")
		}
		if _, statErr := os.Stat(filepath.Join(repoPath, ".gitignore")); statErr == nil {
			_, _ = wt.Add(".gitignore")
		}

		branchName := account.ActiveRepoBranch
		if branchName == "" {
			branchName = "main"
		}

		// Ensure symbolic ref for unborn HEAD
		if _, headErr := r.Head(); headErr != nil {
			branchRef := plumbing.NewBranchReferenceName(branchName)
			_ = r.Storer.SetReference(plumbing.NewSymbolicReference(plumbing.HEAD, branchRef))
		} else if head, err := r.Head(); err == nil {
			branchName = head.Name().Short()
		}

		commitMsg := strings.TrimSpace(req.Message)
		if commitMsg == "" {
			commitMsg = fmt.Sprintf("Save %s (%s)", filepath.Base(relPath), time.Now().Format("2006-01-02 15:04:05"))
		}

		authorName := account.Name
		if authorName == "" {
			authorName = account.Username
		}
		if authorName == "" {
			authorName = "Tomo User"
		}
		authorEmail := account.Email
		if authorEmail == "" {
			authorEmail = account.Username + "@users.noreply.github.com"
		}

		hash, cErr := wt.Commit(commitMsg, &git.CommitOptions{
			Author: &object.Signature{
				Name:  authorName,
				Email: authorEmail,
				When:  time.Now(),
			},
		})
		if cErr != nil && cErr != git.ErrEmptyCommit {
			return nil, fmt.Errorf("failed to commit: %w", cErr)
		}
		committed = true
		commitHashStr = hash.String()

		// If AutoPush is requested, push to remote origin
		if req.AutoPush {
			if account.Token == "" {
				return nil, errors.New("cannot push to GitHub: token is missing")
			}

			// Ensure origin remote exists
			if remote, _ := r.Remote("origin"); remote == nil && account.ActiveRepoURL != "" {
				_, _ = r.CreateRemote(&gitConfig.RemoteConfig{
					Name: "origin",
					URLs: []string{account.ActiveRepoURL},
				})
			}

			refSpec := gitConfig.RefSpec(fmt.Sprintf("+refs/heads/%s:refs/heads/%s", branchName, branchName))
			pushErr := r.Push(&git.PushOptions{
				RemoteName: "origin",
				Auth: &gitHttp.BasicAuth{
					Username: account.Username,
					Password: account.Token,
				},
				RefSpecs: []gitConfig.RefSpec{refSpec},
			})
			if pushErr != nil && pushErr != git.NoErrAlreadyUpToDate {
				shortHash := commitHashStr
				if len(shortHash) > 7 {
					shortHash = shortHash[:7]
				}
				return nil, fmt.Errorf("file committed locally (%s), but push to GitHub failed: %w", shortHash, pushErr)
			}
			pushed = true
		}
	}

	entry, _ := s.cacheMgr.GetEntry(repoPath, relPath)
	expiresAt := ""
	if entry != nil {
		expiresAt = entry.ExpiresAt.Format(time.RFC3339)
	}

	return &dto.FileResponse{
		Path:         relPath,
		Content:      parsedContent,
		RawJSON:      string(formattedBytes),
		LastModified: time.Now().Format(time.RFC3339),
		Cached:       true,
		ExpiresAt:    expiresAt,
		IsDirty:      !committed,
		Committed:    committed,
		Pushed:       pushed,
		CommitHash:   commitHashStr,
	}, nil
}

func (s *gitHubService) GetFile(ctx context.Context, userID, relPath string, forceRefresh bool) (*dto.FileResponse, error) {
	repoPath, account, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	normalized := filepath.ToSlash(filepath.Clean(relPath))
	fullPath := filepath.Join(repoPath, filepath.FromSlash(normalized))

	// Check if fresh in cache
	isFresh := s.cacheMgr.IsFresh(repoPath, normalized)

	// If missing, expired (> 24h) or forced refresh: pull/refresh from remote
	if forceRefresh || !isFresh {
		unlock := s.lockMgr.Lock(repoPath)
		// Attempt to pull latest changes from remote
		if r, err := git.PlainOpen(repoPath); err == nil {
			if wt, err := r.Worktree(); err == nil && account.Token != "" {
				_ = wt.Pull(&git.PullOptions{
					RemoteName: "origin",
					Auth: &gitHttp.BasicAuth{
						Username: account.Username,
						Password: account.Token,
					},
				})
			}
		}
		unlock()
	}

	unlockRead := s.lockMgr.RLock(repoPath)
	defer unlockRead()

	data, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("file not found: %s", normalized)
		}
		return nil, err
	}

	// Update cache access time
	_ = s.cacheMgr.RecordAccess(repoPath, normalized, "", false)

	var parsedContent interface{}
	_ = json.Unmarshal(data, &parsedContent)

	info, _ := os.Stat(fullPath)
	modTime := time.Now().Format(time.RFC3339)
	if info != nil {
		modTime = info.ModTime().Format(time.RFC3339)
	}

	entry, _ := s.cacheMgr.GetEntry(repoPath, normalized)
	expiresAt := ""
	if entry != nil {
		expiresAt = entry.ExpiresAt.Format(time.RFC3339)
	}

	return &dto.FileResponse{
		Path:         normalized,
		Content:      parsedContent,
		RawJSON:      string(data),
		LastModified: modTime,
		Cached:       true,
		ExpiresAt:    expiresAt,
		IsDirty:      entry != nil && entry.IsDirty,
	}, nil
}

func (s *gitHubService) ListFiles(ctx context.Context, userID, subDir string) ([]domain.FileItem, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	targetDir := repoPath
	if subDir != "" {
		targetDir = filepath.Join(repoPath, filepath.FromSlash(subDir))
	}

	if _, err := os.Stat(targetDir); os.IsNotExist(err) {
		_ = os.MkdirAll(targetDir, 0755)
		return []domain.FileItem{}, nil
	}

	var fileStatusMap = make(map[string]domain.FileChangeStatus)
	if repo, err := git.PlainOpen(repoPath); err == nil {
		if wt, err := repo.Worktree(); err == nil {
			if st, err := wt.Status(); err == nil {
				for path, fileStatus := range st {
					normalized := filepath.ToSlash(path)
					switch {
					case fileStatus.Staging == git.Added || fileStatus.Worktree == git.Untracked:
						fileStatusMap[normalized] = domain.StatusAdded
					case fileStatus.Staging == git.Deleted || fileStatus.Worktree == git.Deleted:
						fileStatusMap[normalized] = domain.StatusDeleted
					case fileStatus.Staging == git.Modified || fileStatus.Worktree == git.Modified:
						fileStatusMap[normalized] = domain.StatusModified
					default:
						fileStatusMap[normalized] = domain.StatusClean
					}
				}
			}
		}
	}

	var items []domain.FileItem
	err = filepath.Walk(targetDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(repoPath, path)
		if err != nil {
			return nil
		}
		relNormalized := filepath.ToSlash(rel)

		// Skip .git folder, .tomo system folder and metadata file
		if strings.HasPrefix(relNormalized, ".git") || strings.HasPrefix(relNormalized, ".tomo") || relNormalized == CacheMetadataFileName || relNormalized == "." {
			if info.IsDir() && (strings.HasPrefix(relNormalized, ".git") || strings.HasPrefix(relNormalized, ".tomo")) {
				return filepath.SkipDir
			}
			return nil
		}

		st := domain.StatusClean
		if customSt, exists := fileStatusMap[relNormalized]; exists {
			st = customSt
		}

		items = append(items, domain.FileItem{
			Path:    relNormalized,
			Name:    info.Name(),
			IsDir:   info.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
			Status:  st,
		})
		return nil
	})

	return items, err
}

func (s *gitHubService) DeleteFile(ctx context.Context, userID, relPath string) error {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return err
	}

	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()

	normalized := filepath.ToSlash(filepath.Clean(relPath))
	fullPath := filepath.Join(repoPath, filepath.FromSlash(normalized))

	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		return err
	}

	// Remove from manifest index
	_ = s.manifestMgr.RemoveItem(repoPath, normalized)

	// If git repo, also stage the deletion
	if r, err := git.PlainOpen(repoPath); err == nil {
		if wt, err := r.Worktree(); err == nil {
			_, _ = wt.Remove(normalized)
		}
	}
	return nil
}

func (s *gitHubService) PruneCache(ctx context.Context, userID string) ([]string, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()

	// Checker to prevent deleting dirty files
	dirtyChecker := func(relPath string) bool {
		r, err := git.PlainOpen(repoPath)
		if err != nil {
			return true // err on side of caution
		}
		wt, err := r.Worktree()
		if err != nil {
			return true
		}
		st, err := wt.Status()
		if err != nil {
			return true
		}
		fileStatus := st.File(filepath.FromSlash(relPath))
		return fileStatus.Staging != git.Unmodified || fileStatus.Worktree != git.Unmodified
	}

	return s.cacheMgr.PruneExpired(repoPath, dirtyChecker)
}

// ── 4. GIT OPERATIONS (COMMIT, PUSH, PULL, DIFF, HISTORY) ──────────────────

func (s *gitHubService) InitLocalRepo(ctx context.Context, repoPath string) error {
	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()
	return s.ensureWorkspaceStructureNoLock(ctx, repoPath, "main", nil, "")
}

func (s *gitHubService) initLocalRepoNoLock(ctx context.Context, repoPath string) error {
	return s.ensureWorkspaceStructureNoLock(ctx, repoPath, "main", nil, "")
}

func (s *gitHubService) ensureWorkspaceStructureNoLock(ctx context.Context, repoPath string, targetBranch string, account *domain.GithubAccount, cloneURL string) error {
	_ = os.MkdirAll(repoPath, 0755)

	// 1. Directory Structure Planning for fastest lookup:
	dirs := []string{
		filepath.Join(repoPath, "docs"),
		filepath.Join(repoPath, "canvases"),
		filepath.Join(repoPath, "assets"),
		filepath.Join(repoPath, ".tomo"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return err
		}
	}

	// 2. Standard Workspace Files:
	// README.md
	readmePath := filepath.Join(repoPath, "README.md")
	if _, err := os.Stat(readmePath); os.IsNotExist(err) {
		readmeContent := "# Tomo Workspace\n\nAutomatically synchronized with GitHub via Tomo Git Engine.\n\n## Structure\n- `docs/`: Documents & notes in JSON format\n- `canvases/`: Whiteboards & Excalidraw diagrams\n- `assets/`: Media attachments\n- `.tomo/`: Workspace manifest index & metadata\n"
		_ = os.WriteFile(readmePath, []byte(readmeContent), 0644)
	}

	// .gitignore
	gitignorePath := filepath.Join(repoPath, ".gitignore")
	if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
		gitignoreContent := ".DS_Store\nThumbs.db\n.tomo/cache/\n.cache_metadata.json\n*.tmp\n"
		_ = os.WriteFile(gitignorePath, []byte(gitignoreContent), 0644)
	}

	// .tomo/manifest.json (Fast Lookup Index for O(1) file retrieval)
	manifestPath := filepath.Join(repoPath, ".tomo", "manifest.json")
	if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
		_, _ = s.manifestMgr.RebuildManifest(repoPath)
	}

	// 3. Git Repo Initialization / Verification:
	r, err := git.PlainInit(repoPath, false)
	if err == git.ErrRepositoryAlreadyExists {
		r, err = git.PlainOpen(repoPath)
	}
	if err != nil {
		return err
	}

	// Ensure remote origin exists if cloneURL provided
	if cloneURL != "" {
		if remote, _ := r.Remote("origin"); remote == nil {
			_, _ = r.CreateRemote(&gitConfig.RemoteConfig{
				Name: "origin",
				URLs: []string{cloneURL},
			})
		}
	}

	wt, err := r.Worktree()
	if err != nil {
		return nil
	}

	if targetBranch == "" {
		targetBranch = "main"
	}

	// If repository has no commits (unborn HEAD), create initial commit
	if _, err := r.Head(); err != nil {
		// Set HEAD symbolic ref to targetBranch
		branchRef := plumbing.NewBranchReferenceName(targetBranch)
		_ = r.Storer.SetReference(plumbing.NewSymbolicReference(plumbing.HEAD, branchRef))

		_, _ = wt.Add("README.md")
		_, _ = wt.Add(".gitignore")
		_, _ = wt.Add(".tomo/manifest.json")

		authorName := "Tomo System"
		authorEmail := "system@tomo.app"
		if account != nil {
			if account.Name != "" {
				authorName = account.Name
			} else if account.Username != "" {
				authorName = account.Username
			}
			if account.Email != "" {
				authorEmail = account.Email
			} else if account.Username != "" {
				authorEmail = account.Username + "@users.noreply.github.com"
			}
		}

		_, commitErr := wt.Commit("Initial commit: initialize Tomo workspace", &git.CommitOptions{
			Author: &object.Signature{
				Name:  authorName,
				Email: authorEmail,
				When:  time.Now(),
			},
		})

		// Try pushing initial commit to remote origin so GitHub branch is created
		if commitErr == nil && account != nil && account.Token != "" {
			if cloneURL == "" {
				if remote, err := r.Remote("origin"); err == nil && remote != nil && len(remote.Config().URLs) > 0 {
					cloneURL = remote.Config().URLs[0]
				}
			}
			if cloneURL != "" {
				_ = r.Push(&git.PushOptions{
					RemoteName: "origin",
					Auth: &gitHttp.BasicAuth{
						Username: account.Username,
						Password: account.Token,
					},
					RefSpecs: []gitConfig.RefSpec{
						gitConfig.RefSpec(fmt.Sprintf("+refs/heads/%s:refs/heads/%s", targetBranch, targetBranch)),
					},
				})
			}
		}
	}

	return nil
}

func (s *gitHubService) CommitAndPush(ctx context.Context, userID string, req dto.CommitAndPushRequest) (*dto.CommitPushResponse, error) {
	repoPath, account, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository: %w", err)
	}

	wt, err := r.Worktree()
	if err != nil {
		return nil, err
	}

	var committedFiles []string
	if len(req.Files) > 0 {
		for _, f := range req.Files {
			normalized := filepath.ToSlash(filepath.Clean(f))
			if _, err := wt.Add(normalized); err == nil {
				committedFiles = append(committedFiles, normalized)
			}
		}
	} else {
		// Stage all changes
		st, err := wt.Status()
		if err != nil {
			return nil, err
		}
		for f := range st {
			normalized := filepath.ToSlash(f)
			if normalized == CacheMetadataFileName {
				continue
			}
			_, _ = wt.Add(normalized)
			committedFiles = append(committedFiles, normalized)
		}
	}

	if len(committedFiles) == 0 {
		return nil, errors.New("no changes to commit")
	}

	commitMsg := strings.TrimSpace(req.Message)
	if commitMsg == "" {
		if len(committedFiles) == 1 {
			commitMsg = fmt.Sprintf("update %s (%s)", filepath.Base(committedFiles[0]), time.Now().Format("2006-01-02 15:04:05"))
		} else {
			commitMsg = fmt.Sprintf("sync %d files (%s)", len(committedFiles), time.Now().Format("2006-01-02 15:04:05"))
		}
	}

	authorName := account.Name
	if authorName == "" {
		authorName = account.Username
	}
	authorEmail := account.Email
	if authorEmail == "" {
		authorEmail = account.Username + "@users.noreply.github.com"
	}

	commitHash, err := wt.Commit(commitMsg, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to commit: %w", err)
	}

	shortHash := commitHash.String()
	if len(shortHash) > 7 {
		shortHash = shortHash[:7]
	}

	branchName := req.Branch
	if branchName == "" {
		if head, err := r.Head(); err == nil {
			branchName = head.Name().Short()
		}
	}
	if branchName == "" {
		branchName = account.ActiveRepoBranch
	}
	if branchName == "" {
		branchName = "main"
	}

	// Push to remote
	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}

	// Ensure remote origin exists
	if remote, _ := r.Remote(remoteName); remote == nil && account.ActiveRepoURL != "" {
		_, _ = r.CreateRemote(&gitConfig.RemoteConfig{
			Name: remoteName,
			URLs: []string{account.ActiveRepoURL},
		})
	}

	pushed := false
	if account.Token != "" {
		refSpec := gitConfig.RefSpec(fmt.Sprintf("+refs/heads/%s:refs/heads/%s", branchName, branchName))
		pushErr := r.Push(&git.PushOptions{
			RemoteName: remoteName,
			Auth: &gitHttp.BasicAuth{
				Username: account.Username,
				Password: account.Token,
			},
			RefSpecs: []gitConfig.RefSpec{refSpec},
		})
		if pushErr == nil || pushErr == git.NoErrAlreadyUpToDate {
			pushed = true
		} else {
			return nil, fmt.Errorf("committed locally (%s), but push to GitHub failed: %w", shortHash, pushErr)
		}
	} else {
		return nil, errors.New("cannot push: GitHub token is missing")
	}

	return &dto.CommitPushResponse{
		CommitHash:     commitHash.String(),
		ShortHash:      shortHash,
		Branch:         branchName,
		FilesCommitted: len(committedFiles),
		Pushed:         pushed,
		Message:        req.Message,
		CommittedFiles: committedFiles,
	}, nil
}

func (s *gitHubService) Pull(ctx context.Context, userID string, req dto.PullRequest) (*dto.PullResponse, error) {
	repoPath, account, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository: %w", err)
	}

	wt, err := r.Worktree()
	if err != nil {
		return nil, err
	}

	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}

	var auth *gitHttp.BasicAuth
	if account.Token != "" {
		auth = &gitHttp.BasicAuth{
			Username: account.Username,
			Password: account.Token,
		}
	}

	pullOpts := &git.PullOptions{
		RemoteName: remoteName,
		Auth:       auth,
	}
	branchName := req.Branch
	if branchName == "" {
		branchName = account.ActiveRepoBranch
	}
	if branchName != "" {
		pullOpts.ReferenceName = plumbing.NewBranchReferenceName(branchName)
	}

	pullErr := wt.Pull(pullOpts)

	headRef, _ := r.Head()
	currentCommit := ""
	if headRef != nil {
		currentCommit = headRef.Hash().String()
	}

	if pullErr == git.NoErrAlreadyUpToDate || errors.Is(pullErr, plumbing.ErrReferenceNotFound) || (pullErr != nil && strings.Contains(pullErr.Error(), "reference not found")) {
		return &dto.PullResponse{
			Status:        "up_to_date",
			HasConflict:   false,
			CurrentCommit: currentCommit,
		}, nil
	}

	if pullErr != nil {
		// Check if it's a conflict or dirty worktree
		checkRes, _ := s.checkConflictsNoLock(r, repoPath, remoteName, req.Branch)

		if checkRes != nil && checkRes.HasConflict {
			return &dto.PullResponse{
				Status:          "conflict",
				HasConflict:     true,
				ConflictedFiles: checkRes.ConflictedFiles,
				CurrentCommit:   currentCommit,
			}, nil
		}
		return nil, fmt.Errorf("pull error: %w", pullErr)
	}

	return &dto.PullResponse{
		Status:        "updated",
		HasConflict:   false,
		CurrentCommit: currentCommit,
	}, nil
}

func (s *gitHubService) CompareDiff(ctx context.Context, userID string, req dto.DiffRequest) (*domain.DiffResult, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository: %w", err)
	}

	wt, err := r.Worktree()
	if err != nil {
		return nil, err
	}

	st, err := wt.Status()
	if err != nil {
		return nil, err
	}

	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}
	branch := req.Branch
	if branch == "" {
		branch = "main"
	}

	headRef, _ := r.Head()
	if headRef == nil {
		return &domain.DiffResult{
			UncommittedFiles: []domain.FileDiff{},
			AheadCommits:     []domain.CommitRecord{},
			BehindCommits:    []domain.CommitRecord{},
			Summary: domain.DiffSummary{
				TotalChangedFiles: 0,
				AheadCount:        0,
				BehindCount:       0,
				IsClean:           true,
			},
			OriginBranch: fmt.Sprintf("%s/%s", remoteName, branch),
		}, nil
	}

	var headCommit *object.Commit
	if headRef != nil {
		headCommit, _ = r.CommitObject(headRef.Hash())
	}

	var uncommitted []domain.FileDiff
	for path, fStatus := range st {
		normalized := filepath.ToSlash(path)
		if normalized == CacheMetadataFileName || strings.HasPrefix(normalized, ".tomo/") {
			continue
		}

		diffItem := domain.FileDiff{Path: normalized}
		var oldContent, newContent string

		// Read new content from disk
		fullDiskPath := filepath.Join(repoPath, filepath.FromSlash(normalized))
		if data, err := os.ReadFile(fullDiskPath); err == nil {
			newContent = string(data)
		}

		// Read old content from HEAD commit
		if headCommit != nil {
			if f, err := headCommit.File(normalized); err == nil {
				if reader, err := f.Reader(); err == nil {
					oldBytes, _ := io.ReadAll(reader)
					_ = reader.Close()
					oldContent = string(oldBytes)
				}
			}
		}

		switch {
		case fStatus.Staging == git.Added || fStatus.Worktree == git.Untracked:
			diffItem.Status = domain.StatusAdded
			diffItem.Patch = fmt.Sprintf("--- /dev/null\n+++ b/%s\n%s", normalized, newContent)
		case fStatus.Staging == git.Deleted || fStatus.Worktree == git.Deleted:
			diffItem.Status = domain.StatusDeleted
			diffItem.Patch = fmt.Sprintf("--- a/%s\n+++ /dev/null\n%s", normalized, oldContent)
		default:
			diffItem.Status = domain.StatusModified
			diffItem.Patch = generateSimpleUnifiedDiff(normalized, oldContent, newContent)
		}

		diffItem.OldContent = oldContent
		diffItem.NewContent = newContent
		uncommitted = append(uncommitted, diffItem)
	}

	// Ahead / Behind calculation vs origin
	if req.Remote != "" {
		remoteName = req.Remote
	}
	if req.Branch != "" {
		branch = req.Branch
	} else if headRef != nil {
		branch = headRef.Name().Short()
	}

	var aheadCommits []domain.CommitRecord
	var behindCommits []domain.CommitRecord

	remoteRefName := plumbing.ReferenceName(fmt.Sprintf("refs/remotes/%s/%s", remoteName, branch))
	if remoteRef, err := r.Reference(remoteRefName, true); err == nil && headCommit != nil {
		if remoteCommit, err := r.CommitObject(remoteRef.Hash()); err == nil {
			// Find merge base
			bases, _ := headCommit.MergeBase(remoteCommit)
			if len(bases) > 0 {
				baseCommit := bases[0]
				// Collect ahead commits (from HEAD back to base)
				iter, _ := r.Log(&git.LogOptions{From: headCommit.Hash})
				if iter != nil {
					_ = iter.ForEach(func(c *object.Commit) error {
						if c.Hash == baseCommit.Hash {
							return io.EOF
						}
						aheadCommits = append(aheadCommits, commitToRecord(c))
						return nil
					})
				}

				// Collect behind commits (from remote back to base)
				iterRemote, _ := r.Log(&git.LogOptions{From: remoteCommit.Hash})
				if iterRemote != nil {
					_ = iterRemote.ForEach(func(c *object.Commit) error {
						if c.Hash == baseCommit.Hash {
							return io.EOF
						}
						behindCommits = append(behindCommits, commitToRecord(c))
						return nil
					})
				}
			}
		}
	}

	summary := domain.DiffSummary{
		TotalChangedFiles: len(uncommitted),
		AheadCount:        len(aheadCommits),
		BehindCount:       len(behindCommits),
		IsClean:           len(uncommitted) == 0 && len(aheadCommits) == 0 && len(behindCommits) == 0,
	}

	return &domain.DiffResult{
		UncommittedFiles: uncommitted,
		AheadCommits:     aheadCommits,
		BehindCommits:    behindCommits,
		Summary:          summary,
		OriginBranch:     fmt.Sprintf("%s/%s", remoteName, branch),
	}, nil
}

func (s *gitHubService) GetFileHistory(ctx context.Context, userID, filePath string, limit int) ([]domain.CommitRecord, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository: %w", err)
	}

	if limit <= 0 {
		limit = 50
	}

	normalized := filepath.ToSlash(filepath.Clean(filePath))
	cIter, err := r.Log(&git.LogOptions{
		FileName: &normalized,
		Order:    git.LogOrderCommitterTime,
	})
	if err != nil {
		return []domain.CommitRecord{}, nil
	}

	var records []domain.CommitRecord
	err = cIter.ForEach(func(c *object.Commit) error {
		if len(records) >= limit {
			return io.EOF
		}
		records = append(records, commitToRecord(c))
		return nil
	})

	if err != nil && err != io.EOF {
		return nil, err
	}
	return records, nil
}

func (s *gitHubService) GetFileAtCommit(ctx context.Context, userID, filePath, commitHash string) (string, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return "", err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return "", err
	}

	hash := plumbing.NewHash(commitHash)
	commit, err := r.CommitObject(hash)
	if err != nil {
		return "", fmt.Errorf("commit not found: %w", err)
	}

	normalized := filepath.ToSlash(filepath.Clean(filePath))
	file, err := commit.File(normalized)
	if err != nil {
		return "", fmt.Errorf("file not found in commit: %w", err)
	}

	reader, err := file.Reader()
	if err != nil {
		return "", err
	}
	defer reader.Close()

	content, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func readFileFromCommit(commit *object.Commit, normalizedPath string) string {
	if commit == nil {
		return ""
	}
	f, err := commit.File(normalizedPath)
	if err != nil {
		return ""
	}
	reader, err := f.Reader()
	if err != nil {
		return ""
	}
	defer reader.Close()
	data, err := io.ReadAll(reader)
	if err != nil {
		return ""
	}
	return string(data)
}

func (s *gitHubService) GetCommitFileDiff(ctx context.Context, userID, filePath, commitHash, baseCommit string) (*domain.FileDiff, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository: %w", err)
	}

	normalized := filepath.ToSlash(filepath.Clean(filePath))
	targetHash := plumbing.NewHash(commitHash)
	targetCommit, err := r.CommitObject(targetHash)
	if err != nil {
		return nil, fmt.Errorf("target commit not found: %w", err)
	}

	var oldContent, newContent string

	if baseCommit == "worktree" {
		oldContent = readFileFromCommit(targetCommit, normalized)
		fullDiskPath := filepath.Join(repoPath, filepath.FromSlash(normalized))
		if data, err := os.ReadFile(fullDiskPath); err == nil {
			newContent = string(data)
		}
	} else if baseCommit != "" && baseCommit != "parent" {
		baseHash := plumbing.NewHash(baseCommit)
		if baseCommitObj, err := r.CommitObject(baseHash); err == nil {
			oldContent = readFileFromCommit(baseCommitObj, normalized)
		}
		newContent = readFileFromCommit(targetCommit, normalized)
	} else {
		if parents := targetCommit.Parents(); parents != nil {
			if parent, err := parents.Next(); err == nil && parent != nil {
				oldContent = readFileFromCommit(parent, normalized)
			}
		}
		newContent = readFileFromCommit(targetCommit, normalized)
	}

	diffItem := &domain.FileDiff{
		Path:       normalized,
		OldContent: oldContent,
		NewContent: newContent,
	}

	switch {
	case oldContent == "" && newContent != "":
		diffItem.Status = domain.StatusAdded
		diffItem.Patch = fmt.Sprintf("--- /dev/null\n+++ b/%s\n%s", normalized, newContent)
	case oldContent != "" && newContent == "":
		diffItem.Status = domain.StatusDeleted
		diffItem.Patch = fmt.Sprintf("--- a/%s\n+++ /dev/null\n%s", normalized, oldContent)
	default:
		diffItem.Status = domain.StatusModified
		diffItem.Patch = generateSimpleUnifiedDiff(normalized, oldContent, newContent)
	}

	return diffItem, nil
}

func (s *gitHubService) CheckConflicts(ctx context.Context, userID string, req dto.CheckConflictsRequest) (*domain.ConflictCheckResult, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, err
	}

	return s.checkConflictsNoLock(r, repoPath, req.Remote, req.Branch)
}

func (s *gitHubService) checkConflictsNoLock(r *git.Repository, repoPath, remoteName, branch string) (*domain.ConflictCheckResult, error) {
	if remoteName == "" {
		remoteName = "origin"
	}
	if branch == "" {
		if head, err := r.Head(); err == nil {
			branch = head.Name().Short()
		}
	}

	wt, err := r.Worktree()
	if err != nil {
		return nil, err
	}
	st, err := wt.Status()
	if err != nil {
		return nil, err
	}

	var conflicted []domain.ConflictFileDetail
	for path, fStatus := range st {
		normalized := filepath.ToSlash(path)
		if normalized == CacheMetadataFileName {
			continue
		}
		// If file is modified locally, check if remote also changed it
		if fStatus.Worktree != git.Unmodified || fStatus.Staging != git.Unmodified {
			detail, err := s.conflictSvc.Extract3WayContent(r, repoPath, normalized, remoteName, branch)
			if err == nil && detail.HasConflict {
				conflicted = append(conflicted, *detail)
			}
		}
	}

	return &domain.ConflictCheckResult{
		HasConflict:     len(conflicted) > 0,
		ConflictedFiles: conflicted,
	}, nil
}

func (s *gitHubService) ResolveConflict(ctx context.Context, userID string, req dto.ResolveConflictRequest) (*dto.ConflictResolutionResponse, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.Lock(repoPath)
	defer unlock()

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, err
	}

	normalized := filepath.ToSlash(filepath.Clean(req.FilePath))
	detail, _ := s.conflictSvc.Extract3WayContent(r, repoPath, normalized, "origin", "")

	theirs := ""
	if detail != nil {
		theirs = detail.TheirsContent
	}

	err = s.conflictSvc.ResolveConflict(r, repoPath, normalized, req.Strategy, req.ResolvedContent, theirs)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve conflict: %w", err)
	}

	return &dto.ConflictResolutionResponse{
		FilePath: normalized,
		Resolved: true,
		Strategy: req.Strategy,
		Message:  fmt.Sprintf("Conflict resolved using strategy '%s' and staged successfully", req.Strategy),
	}, nil
}

// ── UTILITIES ──────────────────────────────────────────────────────────────

func commitToRecord(c *object.Commit) domain.CommitRecord {
	shortHash := c.Hash.String()
	if len(shortHash) > 7 {
		shortHash = shortHash[:7]
	}
	return domain.CommitRecord{
		Hash:        c.Hash.String(),
		ShortHash:   shortHash,
		AuthorName:  c.Author.Name,
		AuthorEmail: c.Author.Email,
		When:        c.Author.When,
		Message:     strings.TrimSpace(c.Message),
	}
}

func generateSimpleUnifiedDiff(path, oldText, newText string) string {
	oldLines := strings.Split(oldText, "\n")
	newLines := strings.Split(newText, "\n")

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("--- a/%s\n", path))
	buf.WriteString(fmt.Sprintf("+++ b/%s\n", path))
	buf.WriteString("@@ -1 +1 @@\n")

	maxLines := len(oldLines)
	if len(newLines) > maxLines {
		maxLines = len(newLines)
	}

	for i := 0; i < maxLines; i++ {
		oldLine := ""
		if i < len(oldLines) {
			oldLine = oldLines[i]
		}
		newLine := ""
		if i < len(newLines) {
			newLine = newLines[i]
		}

		if oldLine != newLine {
			if oldLine != "" {
				buf.WriteString("-" + oldLine + "\n")
			}
			if newLine != "" {
				buf.WriteString("+" + newLine + "\n")
			}
		} else if oldLine != "" {
			buf.WriteString(" " + oldLine + "\n")
		}
	}
	return buf.String()
}

func (s *gitHubService) GetManifest(ctx context.Context, userID string) (*domain.WorkspaceManifest, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}
	return s.manifestMgr.ReadManifest(repoPath)
}

func (s *gitHubService) RebuildManifest(ctx context.Context, userID string) (*domain.WorkspaceManifest, error) {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}
	return s.manifestMgr.RebuildManifest(repoPath)
}

func (s *gitHubService) CheckFileStatus(ctx context.Context, userID string, req dto.CheckFileStatusRequest) (*dto.CheckFileStatusResponse, error) {
	repoPath, account, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	relPath := filepath.ToSlash(filepath.Clean(req.FilePath))
	res := &dto.CheckFileStatusResponse{
		FilePath: relPath,
		Status:   "clean",
	}

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return res, nil
	}

	branch := req.Branch
	if branch == "" && account != nil {
		branch = account.ActiveRepoBranch
	}
	if branch == "" {
		branch = "main"
	}
	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}

	headRef, _ := r.Head()
	if headRef == nil {
		// Unborn HEAD / empty repo
		res.IsOnGit = false
		res.HasChanges = true
		res.Status = "untracked"
		return res, nil
	}

	headCommit, err := r.CommitObject(headRef.Hash())
	if err != nil || headCommit == nil {
		res.IsOnGit = false
		res.HasChanges = true
		res.Status = "untracked"
		return res, nil
	}

	// 1. Check if file is tracked in HEAD commit
	var headContent string
	if gitFile, err := headCommit.File(relPath); err == nil {
		res.IsOnGit = true
		if reader, err := gitFile.Reader(); err == nil {
			bytes, _ := io.ReadAll(reader)
			_ = reader.Close()
			headContent = string(bytes)
		}
	} else {
		res.IsOnGit = false
		res.HasChanges = true
		res.Status = "untracked"
	}

	// 2. Check if content has changes vs HEAD
	if res.IsOnGit {
		var compareContent string
		if req.Content != "" {
			compareContent = req.Content
		} else {
			fullDiskPath := filepath.Join(repoPath, filepath.FromSlash(relPath))
			if data, err := os.ReadFile(fullDiskPath); err == nil {
				compareContent = string(data)
			}
		}

		normalizedCompare := normalizeJSONString(compareContent)
		normalizedHead := normalizeJSONString(headContent)

		if normalizedCompare != normalizedHead {
			res.HasChanges = true
			res.Status = "modified"
		} else {
			res.HasChanges = false
			res.Status = "clean"
		}
	}

	// 3. Check for merge conflicts on this file
	wt, _ := r.Worktree()
	if wt != nil {
		st, _ := wt.Status()
		fStatus := st.File(relPath)
		if fStatus.Worktree == git.UpdatedButUnmerged || fStatus.Staging == git.UpdatedButUnmerged {
			res.HasConflict = true
			res.Status = "conflict"
		}
	}

	// Also check conflict markers in content
	if strings.Contains(req.Content, "<<<<<<<") && strings.Contains(req.Content, "=======") && strings.Contains(req.Content, ">>>>>>>") {
		res.HasConflict = true
		res.Status = "conflict"
	}

	// 4. Check if remote Git has updated (behindCommits / remote file updated)
	remoteRefName := plumbing.ReferenceName(fmt.Sprintf("refs/remotes/%s/%s", remoteName, branch))
	if remoteRef, err := r.Reference(remoteRefName, true); err == nil && headCommit != nil {
		if remoteCommit, err := r.CommitObject(remoteRef.Hash()); err == nil && remoteCommit != nil {
			if remoteCommit.Hash != headCommit.Hash {
				bases, _ := headCommit.MergeBase(remoteCommit)
				if len(bases) > 0 {
					baseCommit := bases[0]
					if baseCommit.Hash != remoteCommit.Hash {
						res.BehindCommits++
						if rFile, err := remoteCommit.File(relPath); err == nil {
							if rReader, err := rFile.Reader(); err == nil {
								rBytes, _ := io.ReadAll(rReader)
								_ = rReader.Close()
								if string(rBytes) != headContent {
									res.RemoteUpdated = true
								}
							}
						}
					}
				}
			}
		}
	}

	if res.HasConflict {
		res.Status = "conflict"
	} else if res.RemoteUpdated {
		res.Status = "behind"
	} else if !res.IsOnGit {
		res.Status = "untracked"
	} else if res.HasChanges {
		res.Status = "modified"
	} else {
		res.Status = "clean"
	}

	return res, nil
}

func normalizeJSONString(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	var raw interface{}
	if err := json.Unmarshal([]byte(trimmed), &raw); err == nil {
		if m, ok := raw.(map[string]interface{}); ok {
			delete(m, "saved_at")
		}
		if b, err := json.Marshal(raw); err == nil {
			return string(b)
		}
	}
	return trimmed
}

func (s *gitHubService) GetWorkspaceStatus(ctx context.Context, userID string) (*dto.WorkspaceStatusResponse, error) {
	repoPath, account, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return nil, err
	}

	unlock := s.lockMgr.RLock(repoPath)
	defer unlock()

	res := &dto.WorkspaceStatusResponse{
		Items:        []dto.WorkspaceItemStatus{},
		ActiveBranch: "main",
		IsClean:      true,
	}
	if account != nil && account.ActiveRepoBranch != "" {
		res.ActiveBranch = account.ActiveRepoBranch
	}

	r, err := git.PlainOpen(repoPath)
	if err != nil {
		return res, nil
	}

	itemsMap := make(map[string]*dto.WorkspaceItemStatus)

	// 1. Load existing items from manifest
	manifest, err := s.manifestMgr.ReadManifest(repoPath)
	if err == nil && manifest != nil {
		for _, m := range manifest.Items {
			normPath := filepath.ToSlash(filepath.Clean(m.Path))
			itemsMap[normPath] = &dto.WorkspaceItemStatus{
				ID:        m.ID,
				Type:      m.Type,
				Path:      normPath,
				Title:     m.Title,
				Slug:      m.Slug,
				Size:      m.Size,
				UpdatedAt: m.UpdatedAt.Format(time.RFC3339),
				Status:    "uptodate",
			}
		}
	}

	// 2. Scan Git HEAD tree for any other tracked files
	headRef, _ := r.Head()
	var headCommit *object.Commit
	if headRef != nil {
		headCommit, _ = r.CommitObject(headRef.Hash())
	}

	if headCommit != nil {
		tree, err := headCommit.Tree()
		if err == nil {
			_ = tree.Files().ForEach(func(f *object.File) error {
				normPath := filepath.ToSlash(filepath.Clean(f.Name))
				if strings.HasPrefix(normPath, ".git") || strings.HasPrefix(normPath, ".tomo") || normPath == CacheMetadataFileName {
					return nil
				}
				if _, exists := itemsMap[normPath]; !exists {
					itemType := "file"
					title := f.Name
					id := f.Name
					if strings.HasPrefix(normPath, "docs/") {
						itemType = "doc"
						id = strings.TrimSuffix(filepath.Base(normPath), ".json")
						title = id
					} else if strings.HasPrefix(normPath, "canvases/") {
						itemType = "canvas"
						id = strings.TrimSuffix(filepath.Base(normPath), ".json")
						title = id
					}
					// try reading doc title from content
					if reader, err := f.Reader(); err == nil {
						b, _ := io.ReadAll(reader)
						_ = reader.Close()
						var meta struct {
							Title string `json:"title"`
							Slug  string `json:"slug"`
						}
						if json.Unmarshal(b, &meta) == nil && meta.Title != "" {
							title = meta.Title
						}
					}
					itemsMap[normPath] = &dto.WorkspaceItemStatus{
						ID:        id,
						Type:      itemType,
						Path:      normPath,
						Title:     title,
						Size:      f.Size,
						UpdatedAt: headCommit.Committer.When.Format(time.RFC3339),
						Status:    "uptodate",
					}
				}
				return nil
			})
		}
	}

	// 3. Scan Worktree status (modified, untracked, deleted, conflict)
	wt, err := r.Worktree()
	if err == nil && wt != nil {
		if st, err := wt.Status(); err == nil {
			for path, fStatus := range st {
				normPath := filepath.ToSlash(filepath.Clean(path))
				if strings.HasPrefix(normPath, ".git") || strings.HasPrefix(normPath, ".tomo") || normPath == CacheMetadataFileName {
					continue
				}

				status := "uptodate"
				statusDetail := ""

				switch {
				case fStatus.Worktree == git.UpdatedButUnmerged || fStatus.Staging == git.UpdatedButUnmerged:
					status = "conflict"
					statusDetail = "Conflict"
				case fStatus.Worktree == git.Untracked || fStatus.Staging == git.Added:
					status = "untracked"
					statusDetail = "Untracked"
				case fStatus.Worktree == git.Deleted || fStatus.Staging == git.Deleted:
					status = "deleted"
					statusDetail = "Deleted"
				case fStatus.Worktree == git.Modified || fStatus.Staging == git.Modified:
					status = "modified"
					statusDetail = "Modified"
				}

				if item, exists := itemsMap[normPath]; exists {
					item.Status = status
					item.StatusDetail = statusDetail
				} else {
					// New untracked file on disk
					fullDiskPath := filepath.Join(repoPath, filepath.FromSlash(normPath))
					info, statErr := os.Stat(fullDiskPath)
					size := int64(0)
					modTime := time.Now()
					if statErr == nil {
						size = info.Size()
						modTime = info.ModTime()
					}
					itemType := "file"
					title := filepath.Base(normPath)
					id := title
					if strings.HasPrefix(normPath, "docs/") {
						itemType = "doc"
						id = strings.TrimSuffix(filepath.Base(normPath), ".json")
						title = id
					} else if strings.HasPrefix(normPath, "canvases/") {
						itemType = "canvas"
						id = strings.TrimSuffix(filepath.Base(normPath), ".json")
						title = id
					}

					if data, err := os.ReadFile(fullDiskPath); err == nil {
						var meta struct {
							Title string `json:"title"`
							Slug  string `json:"slug"`
						}
						if json.Unmarshal(data, &meta) == nil && meta.Title != "" {
							title = meta.Title
						}
						if strings.Contains(string(data), "<<<<<<<") && strings.Contains(string(data), "=======") {
							status = "conflict"
							statusDetail = "Conflict markers in file"
						}
					}

					itemsMap[normPath] = &dto.WorkspaceItemStatus{
						ID:           id,
						Type:         itemType,
						Path:         normPath,
						Title:        title,
						Size:         size,
						UpdatedAt:    modTime.Format(time.RFC3339),
						Status:       status,
						StatusDetail: statusDetail,
					}
				}
			}
		}
	}

	// 4. Check remote origin for behind commits and remote updates
	remoteName := "origin"
	remoteRefName := plumbing.ReferenceName(fmt.Sprintf("refs/remotes/%s/%s", remoteName, res.ActiveBranch))
	if remoteRef, err := r.Reference(remoteRefName, true); err == nil && headCommit != nil {
		if remoteCommit, err := r.CommitObject(remoteRef.Hash()); err == nil && remoteCommit != nil {
			if remoteCommit.Hash != headCommit.Hash {
				bases, _ := headCommit.MergeBase(remoteCommit)
				if len(bases) > 0 {
					baseCommit := bases[0]
					if baseCommit.Hash != remoteCommit.Hash {
						aheadIter, _ := r.Log(&git.LogOptions{From: headCommit.Hash})
						if aheadIter != nil {
							_ = aheadIter.ForEach(func(c *object.Commit) error {
								if c.Hash == baseCommit.Hash {
									return io.EOF
								}
								res.AheadCommits++
								return nil
							})
						}

						behindIter, _ := r.Log(&git.LogOptions{From: remoteCommit.Hash})
						if behindIter != nil {
							_ = behindIter.ForEach(func(c *object.Commit) error {
								if c.Hash == baseCommit.Hash {
									return io.EOF
								}
								res.BehindCommits++
								return nil
							})
						}

						baseTree, _ := baseCommit.Tree()
						remoteTree, _ := remoteCommit.Tree()
						if baseTree != nil && remoteTree != nil {
							changes, err := baseTree.Diff(remoteTree)
							if err == nil {
								for _, ch := range changes {
									var chPath string
									if ch.To.Name != "" {
										chPath = filepath.ToSlash(filepath.Clean(ch.To.Name))
									} else if ch.From.Name != "" {
										chPath = filepath.ToSlash(filepath.Clean(ch.From.Name))
									}
									if chPath == "" || strings.HasPrefix(chPath, ".git") || strings.HasPrefix(chPath, ".tomo") {
										continue
									}

									if existingItem, exists := itemsMap[chPath]; exists {
										if existingItem.Status == "uptodate" {
											existingItem.Status = "behind"
											existingItem.StatusDetail = "Remote update available (needs pull)"
										} else if existingItem.Status == "modified" {
											existingItem.Status = "conflict"
											existingItem.StatusDetail = "Modified locally and on remote"
										}
									} else {
										itemType := "file"
										title := filepath.Base(chPath)
										id := title
										if strings.HasPrefix(chPath, "docs/") {
											itemType = "doc"
											id = strings.TrimSuffix(filepath.Base(chPath), ".json")
											title = id
										} else if strings.HasPrefix(chPath, "canvases/") {
											itemType = "canvas"
											id = strings.TrimSuffix(filepath.Base(chPath), ".json")
											title = id
										}

										if rFile, err := remoteCommit.File(chPath); err == nil {
											if rReader, err := rFile.Reader(); err == nil {
												b, _ := io.ReadAll(rReader)
												_ = rReader.Close()
												var meta struct {
													Title string `json:"title"`
												}
												if json.Unmarshal(b, &meta) == nil && meta.Title != "" {
													title = meta.Title
												}
											}
										}

										itemsMap[chPath] = &dto.WorkspaceItemStatus{
											ID:           id,
											Type:         itemType,
											Path:         chPath,
											Title:        title,
											UpdatedAt:    remoteCommit.Committer.When.Format(time.RFC3339),
											Status:       "behind",
											StatusDetail: "New on remote (needs pull)",
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	items := make([]dto.WorkspaceItemStatus, 0, len(itemsMap))
	for _, it := range itemsMap {
		items = append(items, *it)
		switch it.Status {
		case "uptodate":
			res.TotalUptodate++
		case "modified":
			res.TotalModified++
			res.IsClean = false
		case "conflict":
			res.TotalConflict++
			res.IsClean = false
		case "behind":
			res.TotalBehind++
			res.IsClean = false
		case "untracked":
			res.TotalUntracked++
			res.IsClean = false
		default:
			res.IsClean = false
		}
	}

	statusPriority := map[string]int{
		"conflict":  1,
		"modified":  2,
		"behind":    3,
		"untracked": 4,
		"deleted":   5,
		"uptodate":  6,
	}

	sort.Slice(items, func(i, j int) bool {
		pi := statusPriority[items[i].Status]
		pj := statusPriority[items[j].Status]
		if pi != pj {
			return pi < pj
		}
		return strings.ToLower(items[i].Title) < strings.ToLower(items[j].Title)
	})

	res.Items = items
	res.TotalItems = len(items)

	return res, nil
}
