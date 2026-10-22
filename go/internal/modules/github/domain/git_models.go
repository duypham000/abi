package domain

import (
	"time"
)

type FileChangeStatus string

const (
	StatusClean      FileChangeStatus = "CLEAN"
	StatusModified   FileChangeStatus = "MODIFIED"
	StatusAdded      FileChangeStatus = "ADDED"
	StatusDeleted    FileChangeStatus = "DELETED"
	StatusUntracked  FileChangeStatus = "UNTRACKED"
	StatusConflicted FileChangeStatus = "CONFLICTED"
)

type ResolutionStrategy string

const (
	ResolutionOurs   ResolutionStrategy = "ours"
	ResolutionTheirs ResolutionStrategy = "theirs"
	ResolutionManual ResolutionStrategy = "manual"
)

type RepositoryItem struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	FullName      string    `json:"full_name"`
	Owner         string    `json:"owner"`
	Description   string    `json:"description"`
	Private       bool      `json:"private"`
	DefaultBranch string    `json:"default_branch"`
	HTMLURL       string    `json:"html_url"`
	CloneURL      string    `json:"clone_url"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type FileItem struct {
	Path    string           `json:"path"`
	Name    string           `json:"name"`
	IsDir   bool             `json:"is_dir"`
	Size    int64            `json:"size"`
	ModTime time.Time        `json:"mod_time"`
	Status  FileChangeStatus `json:"status"`
}

type CommitRecord struct {
	Hash        string    `json:"hash"`
	ShortHash   string    `json:"short_hash"`
	AuthorName  string    `json:"author_name"`
	AuthorEmail string    `json:"author_email"`
	When        time.Time `json:"when"`
	Message     string    `json:"message"`
}

type FileDiff struct {
	Path       string           `json:"path"`
	Status     FileChangeStatus `json:"status"`
	Patch      string           `json:"patch"`
	OldContent string           `json:"old_content,omitempty"`
	NewContent string           `json:"new_content,omitempty"`
}

type DiffSummary struct {
	TotalChangedFiles int  `json:"total_changed_files"`
	AheadCount        int  `json:"ahead_count"`
	BehindCount       int  `json:"behind_count"`
	IsClean           bool `json:"is_clean"`
}

type DiffResult struct {
	UncommittedFiles []FileDiff     `json:"uncommitted_files"`
	AheadCommits     []CommitRecord `json:"ahead_commits"`
	BehindCommits    []CommitRecord `json:"behind_commits"`
	Summary          DiffSummary    `json:"summary"`
	OriginBranch     string         `json:"origin_branch"`
}

type CacheEntry struct {
	FilePath     string    `json:"file_path"`
	CommitSHA    string    `json:"commit_sha"`
	LastAccessed time.Time `json:"last_accessed"`
	ExpiresAt    time.Time `json:"expires_at"`
	IsDirty      bool      `json:"is_dirty"`
}

type ConflictFileDetail struct {
	FilePath      string `json:"file_path"`
	OursContent   string `json:"ours_content"`
	TheirsContent string `json:"theirs_content"`
	BaseContent   string `json:"base_content"`
	HasConflict   bool   `json:"has_conflict"`
}

type ConflictCheckResult struct {
	HasConflict     bool                 `json:"has_conflict"`
	ConflictedFiles []ConflictFileDetail `json:"conflicted_files"`
	AheadCount      int                  `json:"ahead_count"`
	BehindCount     int                  `json:"behind_count"`
}

type ManifestItem struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"` // "doc", "canvas", "asset"
	Path      string    `json:"path"`
	Title     string    `json:"title"`
	Slug      string    `json:"slug,omitempty"`
	Size      int64     `json:"size"`
	UpdatedAt time.Time `json:"updated_at"`
}

type WorkspaceManifest struct {
	Version       string         `json:"version"`
	UpdatedAt     time.Time      `json:"updated_at"`
	TotalDocs     int            `json:"total_docs"`
	TotalCanvases int            `json:"total_canvases"`
	Items         []ManifestItem `json:"items"`
}
