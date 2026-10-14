package domain

import (
	"time"
)

type DocStatus string

const (
	DocStatusDraft     DocStatus = "DRAFT"
	DocStatusPublished DocStatus = "PUBLISHED"
	DocStatusArchived  DocStatus = "ARCHIVED"
)

type Doc struct {
	ID             string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Title          string    `gorm:"type:varchar(255);not null" json:"title"`
	Slug           string    `gorm:"uniqueIndex;type:varchar(255);not null" json:"slug"`
	Content        string    `gorm:"type:text" json:"content"`
	Status         DocStatus `gorm:"type:varchar(50);default:'DRAFT'" json:"status"`
	ParentID       *string   `gorm:"type:varchar(36);index" json:"parent_id"`
	OwnerID        string    `gorm:"type:varchar(36);not null;index" json:"owner_id"`
	IsPinned       bool      `gorm:"default:false" json:"is_pinned"`
	IsStarred      bool      `gorm:"default:false" json:"is_starred"`
	YjsStateVector []byte    `gorm:"type:bytes" json:"-"` // Compatible with Postgres (bytea) and SQLite (blob)
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
