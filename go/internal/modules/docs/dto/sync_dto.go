package dto

import "time"

// SyncItem đại diện cho một file/entity (doc, note, canvas) được đẩy lên từ local.
type SyncItem struct {
	LocalID     string `json:"local_id"`     // e.g., "doc-12345", "note-12345", "canvas-12345"
	Title       string `json:"title"`
	Content     string `json:"content"`
	Metadata    string `json:"metadata"`
	Status      string `json:"status"`
	EntityType  string `json:"entity_type"`  // "doc", "note", "canvas"
	UpdatedAt   string `json:"updated_at"`   // ISO 8601 string từ local
	ContentHash string `json:"content_hash"` // SHA-256 tính từ client
}

type SyncPushRequest struct {
	Items []SyncItem `json:"items"`
}

type LocalToBackendIDMapping struct {
	LocalID   string `json:"local_id"`
	BackendID string `json:"backend_id"`
}

type SyncConflictItem struct {
	LocalID          string    `json:"local_id"`
	BackendID        string    `json:"backend_id"`
	BaseContent      string    `json:"base_content"`
	OursContent      string    `json:"ours_content"`
	TheirsContent    string    `json:"theirs_content"`
	BackendUpdatedAt time.Time `json:"backend_updated_at"`
}

type SyncPushResult struct {
	Created   int                       `json:"created"`
	Updated   int                       `json:"updated"`
	Skipped   int                       `json:"skipped"`
	Conflicts []SyncConflictItem        `json:"conflicts"`
	Mapping   []LocalToBackendIDMapping `json:"mapping"`
}

type SyncPullResult struct {
	Items []DocDto `json:"items"`
	Total int      `json:"total"`
}

