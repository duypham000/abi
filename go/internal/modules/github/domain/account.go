package domain

import (
	"time"
)

type GithubAccount struct {
	ID               string    `gorm:"primaryKey;type:varchar(36)" json:"id"`
	UserID           string    `gorm:"uniqueIndex;type:varchar(36);not null" json:"user_id"`
	Username         string    `gorm:"type:varchar(255);not null" json:"username"`
	Email            string    `gorm:"type:varchar(255)" json:"email"`
	Name             string    `gorm:"type:varchar(255)" json:"name"`
	AvatarURL        string    `gorm:"type:text" json:"avatar_url"`
	Token            string    `gorm:"type:text;not null" json:"-"`
	TokenPreview     string    `gorm:"type:varchar(30)" json:"token_preview"`
	Scopes           string    `gorm:"type:text" json:"scopes"`
	ActiveRepoOwner  string    `gorm:"type:varchar(255)" json:"active_repo_owner"`
	ActiveRepoName   string    `gorm:"type:varchar(255)" json:"active_repo_name"`
	ActiveRepoBranch string    `gorm:"type:varchar(255);default:'main'" json:"active_repo_branch"`
	ActiveRepoURL    string    `gorm:"type:text" json:"active_repo_url"`
	WorkspacePath    string    `gorm:"type:text" json:"workspace_path"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
