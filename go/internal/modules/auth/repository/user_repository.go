package repository

import (
	"context"
	"errors"
	"time"

	"tomo-backend/internal/modules/auth/domain"

	"gorm.io/gorm"
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) error
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	FindByIdentifier(ctx context.Context, identifier string) (*domain.User, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
	UpdateUser(ctx context.Context, user *domain.User) error
	ListUsers(ctx context.Context, page, pageSize int) ([]domain.User, int64, error)
	
	// Refresh token methods
	SaveRefreshToken(ctx context.Context, token *domain.RefreshToken) error
	FindRefreshToken(ctx context.Context, tokenStr string) (*domain.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenStr string) error
	RevokeUserRefreshTokens(ctx context.Context, userID string) error
}

type userRepositoryImpl struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepositoryImpl{db: db}
}

func (r *userRepositoryImpl) CreateUser(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *userRepositoryImpl) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &user, err
}

func (r *userRepositoryImpl) FindByIdentifier(ctx context.Context, identifier string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Where("username = ? OR email = ?", identifier, identifier).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &user, err
}

func (r *userRepositoryImpl) FindByID(ctx context.Context, id string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &user, err
}

func (r *userRepositoryImpl) UpdateUser(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

func (r *userRepositoryImpl) ListUsers(ctx context.Context, page, pageSize int) ([]domain.User, int64, error) {
	var users []domain.User
	var total int64

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	offset := (page - 1) * pageSize

	err := r.db.WithContext(ctx).Model(&domain.User{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	err = r.db.WithContext(ctx).Offset(offset).Limit(pageSize).Order("created_at desc").Find(&users).Error
	return users, total, err
}

func (r *userRepositoryImpl) SaveRefreshToken(ctx context.Context, token *domain.RefreshToken) error {
	return r.db.WithContext(ctx).Create(token).Error
}

func (r *userRepositoryImpl) FindRefreshToken(ctx context.Context, tokenStr string) (*domain.RefreshToken, error) {
	var token domain.RefreshToken
	err := r.db.WithContext(ctx).Where("token = ? AND revoked = ? AND expires_at > ?", tokenStr, false, time.Now()).First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &token, err
}

func (r *userRepositoryImpl) RevokeRefreshToken(ctx context.Context, tokenStr string) error {
	return r.db.WithContext(ctx).Model(&domain.RefreshToken{}).Where("token = ?", tokenStr).Update("revoked", true).Error
}

func (r *userRepositoryImpl) RevokeUserRefreshTokens(ctx context.Context, userID string) error {
	return r.db.WithContext(ctx).Model(&domain.RefreshToken{}).Where("user_id = ?", userID).Update("revoked", true).Error
}
