package dto

import (
	"time"

	"tomo-backend/internal/modules/auth/domain"
)

type RegisterRequest struct {
	Email    string      `json:"email" binding:"required,email"`
	Password string      `json:"password" binding:"required,min=6"`
	FullName string      `json:"full_name"`
	Role     domain.Role `json:"role"`
}

type LoginRequest struct {
	Email      string `json:"email"`
	Username   string `json:"username"`
	Identifier string `json:"identifier"`
	Password   string `json:"password" binding:"required"`
}

func (r *LoginRequest) GetIdentifier() string {
	if r.Identifier != "" {
		return r.Identifier
	}
	if r.Username != "" {
		return r.Username
	}
	return r.Email
}

type RefreshTokenRequest struct {
	RefreshToken      string `json:"refresh_token"`
	RefreshTokenCamel string `json:"refreshToken"`
}

type TokenResponse struct {
	AccessToken       string    `json:"access_token"`
	AccessTokenCamel  string    `json:"accessToken"`
	RefreshToken      string    `json:"refresh_token"`
	RefreshTokenCamel string    `json:"refreshToken"`
	TokenType         string    `json:"token_type"`
	ExpiresAt         time.Time `json:"expires_at"`
	ExpiresIn         int64     `json:"expiresIn"`
	User              UserDto   `json:"user"`
}

type UserDto struct {
	ID          string      `json:"id"`
	Email       string      `json:"email"`
	FullName    string      `json:"full_name"`
	Username    string      `json:"username"`
	Role        domain.Role `json:"role"`
	Enabled     bool        `json:"enabled"`
	Active      bool        `json:"active"`
	CreatedAt   time.Time   `json:"created_at"`
	CreatedDate string      `json:"createdDate,omitempty"`
}

func ToUserDto(u *domain.User) UserDto {
	username := u.Username
	if username == "" {
		username = u.FullName
	}
	if username == "" {
		username = u.Email
	}
	return UserDto{
		ID:          u.ID,
		Email:       u.Email,
		FullName:    u.FullName,
		Username:    username,
		Role:        u.Role,
		Enabled:     u.Enabled,
		Active:      u.Enabled,
		CreatedAt:   u.CreatedAt,
		CreatedDate: u.CreatedAt.Format(time.RFC3339),
	}
}

type CreateAPIKeyRequest struct {
	Name          string      `json:"name" binding:"required"`
	UserID        string      `json:"user_id"`
	Role          domain.Role `json:"role"`
	Scopes        string      `json:"scopes"`
	ExpiresInDays int         `json:"expires_in_days"`
	RawKey        string      `json:"raw_key,omitempty"`
}

type APIKeyDto struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	KeyPrefix  string      `json:"key_prefix"`
	UserID     string      `json:"user_id"`
	Role       domain.Role `json:"role"`
	Scopes     string      `json:"scopes"`
	Revoked    bool        `json:"revoked"`
	ExpiresAt  *time.Time  `json:"expires_at,omitempty"`
	LastUsedAt *time.Time  `json:"last_used_at,omitempty"`
	CreatedBy  string      `json:"created_by"`
	CreatedAt  time.Time   `json:"created_at"`
	APIKey     string      `json:"api_key,omitempty"`
	Key        string      `json:"key,omitempty"`
}

func ToAPIKeyDto(k *domain.APIKey, rawKey string) APIKeyDto {
	return APIKeyDto{
		ID:         k.ID,
		Name:       k.Name,
		KeyPrefix:  k.KeyPrefix,
		UserID:     k.UserID,
		Role:       k.Role,
		Scopes:     k.Scopes,
		Revoked:    k.Revoked,
		ExpiresAt:  k.ExpiresAt,
		LastUsedAt: k.LastUsedAt,
		CreatedBy:  k.CreatedBy,
		CreatedAt:  k.CreatedAt,
		APIKey:     rawKey,
		Key:        rawKey,
	}
}
