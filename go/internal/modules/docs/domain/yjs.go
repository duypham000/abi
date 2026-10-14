package domain

import (
	"time"
)

type YjsUpdate struct {
	ID         string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	DocID      string    `gorm:"type:varchar(36);not null;index" json:"doc_id"`
	UpdateData []byte    `gorm:"type:bytes;not null" json:"-"` // Compatible with Postgres (bytea) and SQLite (blob)
	ClientID   int64     `gorm:"not null;default:0" json:"client_id"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}

type YjsAccessMode string

const (
	YjsAccessRead  YjsAccessMode = "read"
	YjsAccessWrite YjsAccessMode = "write"
	YjsAccessAdmin YjsAccessMode = "admin"
)
