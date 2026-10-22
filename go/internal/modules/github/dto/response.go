package dto

import "tomo-backend/internal/modules/github/domain"

type GithubProfileResponse struct {
	Connected        bool     `json:"connected"`
	Username         string   `json:"username"`
	Name             string   `json:"name"`
	Email            string   `json:"email"`
	AvatarURL        string   `json:"avatar_url"`
	TokenPreview     string   `json:"token_preview"`
	Scopes           []string `json:"scopes"`
	ActiveRepoOwner  string   `json:"active_repo_owner"`
	ActiveRepoName   string   `json:"active_repo_name"`
	ActiveRepoBranch string   `json:"active_repo_branch"`
	ActiveRepoURL    string   `json:"active_repo_url"`
	WorkspacePath    string   `json:"workspace_path"`

	// CamelCase aliases
	AvatarURLCamel        string `json:"avatarUrl,omitempty"`
	TokenPreviewCamel     string `json:"tokenPreview,omitempty"`
	ActiveRepoOwnerCamel  string `json:"activeRepoOwner,omitempty"`
	ActiveRepoNameCamel   string `json:"activeRepoName,omitempty"`
	ActiveRepoBranchCamel string `json:"activeRepoBranch,omitempty"`
	ActiveRepoURLCamel    string `json:"activeRepoUrl,omitempty"`
	WorkspacePathCamel    string `json:"workspacePath,omitempty"`
}

type CommitPushResponse struct {
	CommitHash     string   `json:"commit_hash"`
	ShortHash      string   `json:"short_hash"`
	Branch         string   `json:"branch"`
	FilesCommitted int      `json:"files_committed"`
	Pushed         bool     `json:"pushed"`
	Message        string   `json:"message"`
	CommittedFiles []string `json:"committed_files"`
}

type PullResponse struct {
	Status          string                      `json:"status"` // "up_to_date", "updated", "conflict"
	HasConflict     bool                        `json:"has_conflict"`
	ConflictedFiles []domain.ConflictFileDetail `json:"conflicted_files,omitempty"`
	UpdatedCommits  int                         `json:"updated_commits"`
	CurrentCommit   string                      `json:"current_commit"`
}

type FileResponse struct {
	Path         string      `json:"path"`
	Content      interface{} `json:"content"`
	RawJSON      string      `json:"raw_json"`
	LastModified string      `json:"last_modified"`
	Cached       bool        `json:"cached"`
	ExpiresAt    string      `json:"expires_at"`
	IsDirty      bool        `json:"is_dirty"`
	Committed    bool        `json:"committed,omitempty"`
	Pushed       bool        `json:"pushed,omitempty"`
	CommitHash   string      `json:"commit_hash,omitempty"`
}

type ConflictResolutionResponse struct {
	FilePath string                    `json:"file_path"`
	Resolved bool                      `json:"resolved"`
	Strategy domain.ResolutionStrategy `json:"strategy"`
	Message  string                    `json:"message"`
}

type CheckFileStatusResponse struct {
	FilePath       string `json:"file_path"`
	IsOnGit        bool   `json:"is_on_git"`
	HasChanges     bool   `json:"has_changes"`
	HasConflict    bool   `json:"has_conflict"`
	ConflictDetail string `json:"conflict_detail,omitempty"`
	RemoteUpdated  bool   `json:"remote_updated"`
	AheadCommits   int    `json:"ahead_commits"`
	BehindCommits  int    `json:"behind_commits"`
	Status         string `json:"status"` // "clean", "modified", "untracked", "conflict", "behind"
}

type WorkspaceItemStatus struct {
	ID           string `json:"id"`
	Type         string `json:"type"` // "doc", "canvas", "file"
	Path         string `json:"path"`
	Title        string `json:"title"`
	Slug         string `json:"slug,omitempty"`
	Size         int64  `json:"size"`
	UpdatedAt    string `json:"updated_at"`
	Status       string `json:"status"` // "uptodate", "modified", "conflict", "behind", "untracked", "deleted"
	StatusDetail string `json:"status_detail,omitempty"`
}

type WorkspaceStatusResponse struct {
	Items          []WorkspaceItemStatus `json:"items"`
	TotalItems     int                   `json:"total_items"`
	TotalUptodate  int                   `json:"total_uptodate"`
	TotalModified  int                   `json:"total_modified"`
	TotalConflict  int                   `json:"total_conflict"`
	TotalBehind    int                   `json:"total_behind"`
	TotalUntracked int                   `json:"total_untracked"`
	AheadCommits   int                   `json:"ahead_commits"`
	BehindCommits  int                   `json:"behind_commits"`
	ActiveBranch   string                `json:"active_branch"`
	IsClean        bool                  `json:"is_clean"`
}
