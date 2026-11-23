package domain

import (
	"time"
)

type Canvas struct {
	ID             string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Title          string    `gorm:"type:varchar(255);not null" json:"title"`
	Slug           string    `gorm:"uniqueIndex;type:varchar(255);not null" json:"slug"`
	Scene          string    `gorm:"type:text" json:"scene"`
	Metadata       string    `gorm:"type:text" json:"metadata"`
	Status         int       `gorm:"default:1" json:"status"` // 0 = draft, 1 = active
	OwnerID        string    `gorm:"type:varchar(36);not null;index" json:"owner_id"`
	YjsStateVector []byte    `gorm:"type:bytes" json:"-"` // Compatible with Postgres (bytea) and SQLite (blob)
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
