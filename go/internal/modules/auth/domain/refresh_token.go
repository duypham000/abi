package domain

import (
	"time"
)

type RefreshToken struct {
	ID        string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	UserID    string    `gorm:"index;not null;type:varchar(36)" json:"user_id"`
	Token     string    `gorm:"uniqueIndex;not null;type:varchar(255)" json:"token"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
