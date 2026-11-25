package domain

import "time"

type APIKey struct {
	ID         string     `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Name       string     `gorm:"not null;type:varchar(255)" json:"name"`
	KeyPrefix  string     `gorm:"index;not null;type:varchar(32)" json:"key_prefix"`
	KeyHash    string     `gorm:"uniqueIndex;not null;type:varchar(64)" json:"-"`
	UserID     string     `gorm:"index;not null;type:varchar(36)" json:"user_id"`
	Role       Role       `gorm:"type:varchar(50);default:'ADMIN'" json:"role"`
	Scopes     string     `gorm:"type:varchar(255);default:'mcp,api'" json:"scopes"`
	Revoked    bool       `gorm:"default:false" json:"revoked"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedBy  string     `gorm:"type:varchar(36)" json:"created_by"`
	CreatedAt  time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt  time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}
