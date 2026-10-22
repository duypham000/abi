package dto

import "tomo-backend/internal/modules/github/domain"

type ConnectRequest struct {
	Token string `json:"token" binding:"required"`
}

type SelectRepoRequest struct {
	RepoOwner      string `json:"repo_owner"`
	RepoOwnerCamel string `json:"repoOwner"`
	RepoName       string `json:"repo_name"`
	RepoNameCamel  string `json:"repoName"`
	Branch         string `json:"branch"`
	CloneIfMissing bool   `json:"clone_if_missing"`
	CloneIfMissAlt bool   `json:"cloneIfMissing"`
	CloneURL       string `json:"clone_url"`
	CloneURLCamel  string `json:"cloneUrl"`
}

func (r *SelectRepoRequest) Normalize() {
	if r.RepoOwner == "" && r.RepoOwnerCamel != "" {
		r.RepoOwner = r.RepoOwnerCamel
	}
	if r.RepoName == "" && r.RepoNameCamel != "" {
		r.RepoName = r.RepoNameCamel
	}
	if !r.CloneIfMissing && r.CloneIfMissAlt {
		r.CloneIfMissing = r.CloneIfMissAlt
	}
	if r.CloneURL == "" && r.CloneURLCamel != "" {
		r.CloneURL = r.CloneURLCamel
	}
}

type CreateRepoRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Private     bool   `json:"private"`
	AutoInit    bool   `json:"auto_init"`
}

type SaveFileRequest struct {
	Path       string      `json:"path" binding:"required"` // e.g. "docs/doc-01.json" or "canvases/canvas-01.excalidraw.json"
	Content    interface{} `json:"content" binding:"required"` // JSON object or string
	AutoCommit bool        `json:"auto_commit"`
	AutoPush   bool        `json:"auto_push"`
	Message    string      `json:"message"`
}

type CommitAndPushRequest struct {
	Message string   `json:"message"` // optional, auto-generated if empty
	Files   []string `json:"files"`   // optional list of files to stage, empty means all
	Branch  string   `json:"branch"`  // optional, default active branch
	Remote  string   `json:"remote"`  // optional, default "origin"
}

type PullRequest struct {
	Remote string `json:"remote"` // optional, default "origin"
	Branch string `json:"branch"` // optional, default active branch
}

type DiffRequest struct {
	Remote string `json:"remote"` // optional, default "origin"
	Branch string `json:"branch"` // optional, default active branch
}

type FileHistoryRequest struct {
	FilePath string `json:"file_path" form:"file_path" binding:"required"`
	Limit    int    `json:"limit" form:"limit"`
}

type FileAtCommitRequest struct {
	FilePath   string `json:"file_path" form:"file_path" binding:"required"`
	CommitHash string `json:"commit_hash" form:"commit_hash" binding:"required"`
}

type CommitFileDiffRequest struct {
	FilePath   string `json:"file_path" form:"file_path" binding:"required"`
	CommitHash string `json:"commit_hash" form:"commit_hash" binding:"required"`
	BaseCommit string `json:"base_commit" form:"base_commit"` // optional: "worktree", specific commit hash, or empty for parent commit
}

type CheckConflictsRequest struct {
	Remote string `json:"remote"`
	Branch string `json:"branch"`
}

type ResolveConflictRequest struct {
	FilePath        string                    `json:"file_path" binding:"required"`
	Strategy        domain.ResolutionStrategy `json:"strategy" binding:"required"` // "ours", "theirs", "manual"
	ResolvedContent string                    `json:"resolved_content"`           // required if strategy == "manual"
}

type CheckFileStatusRequest struct {
	FilePath string `json:"file_path" binding:"required"`
	Content  string `json:"content"`
	Remote   string `json:"remote"`
	Branch   string `json:"branch"`
}
