package domain

import (
	"time"
)

type DocRevision struct {
	ID             string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	DocID          string    `gorm:"type:varchar(36);not null;index" json:"doc_id"`
	Version        int       `gorm:"not null" json:"version"`
	SnapshotBlob   []byte    `gorm:"type:bytes" json:"-"` // Compatible with Postgres (bytea) and SQLite (blob)
	ChangesSummary string    `gorm:"type:varchar(255)" json:"changes_summary"`
	AuthorID       string    `gorm:"type:varchar(36);not null" json:"author_id"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}
