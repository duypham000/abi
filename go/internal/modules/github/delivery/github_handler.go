package delivery

import (
	"net/http"
	"strconv"

	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/github/dto"
	"tomo-backend/internal/modules/github/service"

	"github.com/gin-gonic/gin"
)

type GithubHandler struct {
	githubService service.GitHubService
}

func NewGithubHandler(githubService service.GitHubService) *GithubHandler {
	return &GithubHandler{githubService: githubService}
}

func (h *GithubHandler) getUserID(c *gin.Context) string {
	userID, exists := c.Get(security.CtxUserID)
	if !exists {
		return ""
	}
	if s, ok := userID.(string); ok {
		return s
	}
	return ""
}

// ── ACCOUNT HANDLERS ────────────────────────────────────────────────────────

func (h *GithubHandler) Connect(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.ConnectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}

	profile, err := h.githubService.ConnectAccount(c.Request.Context(), userID, req.Token)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}

	response.OK(c, "Connected to GitHub successfully", profile)
}

func (h *GithubHandler) GetProfile(c *gin.Context) {
	userID := h.getUserID(c)
	profile, err := h.githubService.GetAccountProfile(c.Request.Context(), userID)
	if err != nil {
		response.InternalServerError(c, "Failed to retrieve GitHub profile", err)
		return
	}
	response.OK(c, "GitHub account profile retrieved", profile)
}

func (h *GithubHandler) Disconnect(c *gin.Context) {
	userID := h.getUserID(c)
	if err := h.githubService.DisconnectAccount(c.Request.Context(), userID); err != nil {
		response.InternalServerError(c, "Failed to disconnect GitHub account", err)
		return
	}
	response.OK(c, "GitHub account disconnected", nil)
}

// ── REPOSITORY HANDLERS ─────────────────────────────────────────────────────

func (h *GithubHandler) ListRepositories(c *gin.Context) {
	userID := h.getUserID(c)
	repos, err := h.githubService.ListRepositories(c.Request.Context(), userID)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Repositories retrieved", repos)
}

func (h *GithubHandler) CreateRepository(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.CreateRepoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}

	repo, err := h.githubService.CreateRepository(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.Created(c, "Repository created on GitHub", repo)
}

func (h *GithubHandler) SelectRepository(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.SelectRepoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}
	req.Normalize()
	if req.RepoOwner == "" || req.RepoName == "" {
		response.BadRequest(c, "repo_owner and repo_name are required", nil)
		return
	}

	profile, err := h.githubService.SelectRepository(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Repository selected and linked to workspace", profile)
}

func (h *GithubHandler) GetActiveRepository(c *gin.Context) {
	userID := h.getUserID(c)
	repo, wsPath, err := h.githubService.GetActiveRepository(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}
	response.OK(c, "Active repository retrieved", gin.H{
		"repository":     repo,
		"workspace_path": wsPath,
	})
}

// ── FILE & LAZY CACHE HANDLERS ──────────────────────────────────────────────

func (h *GithubHandler) SaveFile(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.SaveFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}

	res, err := h.githubService.SaveFile(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "File saved to workspace cache", res)
}

func (h *GithubHandler) GetFile(c *gin.Context) {
	userID := h.getUserID(c)
	path := c.Query("path")
	if path == "" {
		response.BadRequest(c, "Query parameter 'path' is required", nil)
		return
	}
	forceRefresh := c.Query("force_refresh") == "true"

	res, err := h.githubService.GetFile(c.Request.Context(), userID, path, forceRefresh)
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}
	response.OK(c, "File retrieved", res)
}

func (h *GithubHandler) ListFiles(c *gin.Context) {
	userID := h.getUserID(c)
	subDir := c.Query("dir")
	files, err := h.githubService.ListFiles(c.Request.Context(), userID, subDir)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Workspace files retrieved", files)
}

func (h *GithubHandler) DeleteFile(c *gin.Context) {
	userID := h.getUserID(c)
	path := c.Query("path")
	if path == "" {
		response.BadRequest(c, "Query parameter 'path' is required", nil)
		return
	}
	if err := h.githubService.DeleteFile(c.Request.Context(), userID, path); err != nil {
		response.InternalServerError(c, "Failed to delete file", err)
		return
	}
	response.OK(c, "File deleted", nil)
}

func (h *GithubHandler) PruneCache(c *gin.Context) {
	userID := h.getUserID(c)
	pruned, err := h.githubService.PruneCache(c.Request.Context(), userID)
	if err != nil {
		response.InternalServerError(c, "Failed to prune cache", err)
		return
	}
	response.OK(c, "Cache pruned successfully", gin.H{
		"pruned_files": pruned,
		"count":        len(pruned),
	})
}

// ── GIT OPERATIONS HANDLERS ────────────────────────────────────────────────

func (h *GithubHandler) InitRepo(c *gin.Context) {
	userID := h.getUserID(c)
	var body struct {
		RepoPath      string `json:"repo_path"`
		RepoPathCamel string `json:"repoPath"`
	}
	_ = c.ShouldBindJSON(&body)

	targetPath := body.RepoPath
	if targetPath == "" {
		targetPath = body.RepoPathCamel
	}
	if targetPath == "" {
		profile, err := h.githubService.GetAccountProfile(c.Request.Context(), userID)
		if err == nil && profile.WorkspacePath != "" {
			targetPath = profile.WorkspacePath
		}
	}
	if targetPath == "" {
		response.BadRequest(c, "repo_path is required or an active repository must be selected", nil)
		return
	}

	if err := h.githubService.InitLocalRepo(c.Request.Context(), targetPath); err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Repository initialized", gin.H{"repo_path": targetPath})
}

func (h *GithubHandler) CommitAndPush(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.CommitAndPushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}

	res, err := h.githubService.CommitAndPush(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Changes committed and pushed", res)
}

func (h *GithubHandler) Pull(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.PullRequest
	_ = c.ShouldBindJSON(&req) // Optional body

	res, err := h.githubService.Pull(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	if res.HasConflict {
		c.JSON(http.StatusConflict, response.APIResponse{
			Success: false,
			Message: "Merge conflict detected while pulling from remote",
			Data:    res,
		})
		return
	}
	response.OK(c, "Pull completed successfully", res)
}

func (h *GithubHandler) CompareDiff(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.DiffRequest
	_ = c.ShouldBindJSON(&req)

	diffResult, err := h.githubService.CompareDiff(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Diff comparison generated", diffResult)
}

func (h *GithubHandler) GetFileHistory(c *gin.Context) {
	userID := h.getUserID(c)
	path := c.Query("file_path")
	if path == "" {
		// Also support JSON body
		var body struct {
			FilePath string `json:"file_path"`
			Limit    int    `json:"limit"`
		}
		if err := c.ShouldBindJSON(&body); err == nil {
			path = body.FilePath
		}
	}
	if path == "" {
		response.BadRequest(c, "file_path is required", nil)
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	history, err := h.githubService.GetFileHistory(c.Request.Context(), userID, path, limit)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "File commit history retrieved", history)
}

func (h *GithubHandler) GetFileAtCommit(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.FileAtCommitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.FilePath = c.Query("file_path")
		req.CommitHash = c.Query("commit_hash")
	}
	if req.FilePath == "" || req.CommitHash == "" {
		response.BadRequest(c, "file_path and commit_hash are required", nil)
		return
	}

	content, err := h.githubService.GetFileAtCommit(c.Request.Context(), userID, req.FilePath, req.CommitHash)
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}
	response.OK(c, "File content at commit retrieved", gin.H{
		"file_path":   req.FilePath,
		"commit_hash": req.CommitHash,
		"content":     content,
	})
}

func (h *GithubHandler) GetFileDiff(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.CommitFileDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.FilePath = c.Query("file_path")
		req.CommitHash = c.Query("commit_hash")
		req.BaseCommit = c.Query("base_commit")
	}
	if req.FilePath == "" || req.CommitHash == "" {
		response.BadRequest(c, "file_path and commit_hash are required", nil)
		return
	}

	diffResult, err := h.githubService.GetCommitFileDiff(c.Request.Context(), userID, req.FilePath, req.CommitHash, req.BaseCommit)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "File diff retrieved", diffResult)
}

func (h *GithubHandler) CheckConflicts(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.CheckConflictsRequest
	_ = c.ShouldBindJSON(&req)

	result, err := h.githubService.CheckConflicts(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Conflict check completed", result)
}

func (h *GithubHandler) ResolveConflict(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.ResolveConflictRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}

	res, err := h.githubService.ResolveConflict(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Conflict resolved", res)
}

func (h *GithubHandler) GetManifest(c *gin.Context) {
	userID := h.getUserID(c)
	manifest, err := h.githubService.GetManifest(c.Request.Context(), userID)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Workspace manifest retrieved", manifest)
}

func (h *GithubHandler) RebuildManifest(c *gin.Context) {
	userID := h.getUserID(c)
	manifest, err := h.githubService.RebuildManifest(c.Request.Context(), userID)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Workspace manifest rebuilt", manifest)
}

func (h *GithubHandler) CheckFileStatus(c *gin.Context) {
	userID := h.getUserID(c)
	var req dto.CheckFileStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request payload", err)
		return
	}

	result, err := h.githubService.CheckFileStatus(c.Request.Context(), userID, req)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "File status checked", result)
}

func (h *GithubHandler) GetWorkspaceStatus(c *gin.Context) {
	userID := h.getUserID(c)
	status, err := h.githubService.GetWorkspaceStatus(c.Request.Context(), userID)
	if err != nil {
		response.BadRequest(c, err.Error(), err)
		return
	}
	response.OK(c, "Workspace status retrieved", status)
}
