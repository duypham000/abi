package domain

import (
	"time"
)

type Role string

const (
	RoleAdmin  Role = "ADMIN"
	RoleUser   Role = "USER"
	RoleEditor Role = "EDITOR"
)

type User struct {
	ID           string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Username     string    `gorm:"uniqueIndex;type:varchar(100)" json:"username"`
	Email        string    `gorm:"uniqueIndex;not null;type:varchar(255)" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	FullName     string    `gorm:"type:varchar(255)" json:"full_name"`
	Role         Role      `gorm:"type:varchar(50);default:'USER'" json:"role"`
	Enabled      bool      `gorm:"default:true" json:"enabled"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
