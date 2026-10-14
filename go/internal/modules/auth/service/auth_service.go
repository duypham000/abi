package service

import (
	"context"
	"errors"

	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth/domain"
	"tomo-backend/internal/modules/auth/dto"
	"tomo-backend/internal/modules/auth/repository"

	"github.com/google/uuid"
)

var (
	ErrUserExists        = errors.New("user with this email already exists")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserDisabled      = errors.New("user account is disabled")
	ErrInvalidToken      = errors.New("invalid or expired refresh token")
)

type AuthService interface {
	Register(ctx context.Context, req dto.RegisterRequest) (*dto.TokenResponse, error)
	Login(ctx context.Context, req dto.LoginRequest) (*dto.TokenResponse, error)
	RefreshToken(ctx context.Context, req dto.RefreshTokenRequest) (*dto.TokenResponse, error)
	Logout(ctx context.Context, refreshTokenStr string) error
	GetProfile(ctx context.Context, userID string) (*dto.UserDto, error)
}

type authServiceImpl struct {
	userRepo   repository.UserRepository
	jwtManager *security.JWTManager
}

func NewAuthService(userRepo repository.UserRepository, jwtManager *security.JWTManager) AuthService {
	return &authServiceImpl{
		userRepo:   userRepo,
		jwtManager: jwtManager,
	}
}

func (s *authServiceImpl) Register(ctx context.Context, req dto.RegisterRequest) (*dto.TokenResponse, error) {
	existing, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserExists
	}

	hashedPassword, err := security.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	role := req.Role
	if role == "" {
		role = domain.RoleUser
	}

	user := &domain.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		PasswordHash: hashedPassword,
		FullName:     req.FullName,
		Role:         role,
		Enabled:      true,
	}

	if err := s.userRepo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	return s.generateTokenPair(ctx, user)
}

func (s *authServiceImpl) Login(ctx context.Context, req dto.LoginRequest) (*dto.TokenResponse, error) {
	identifier := req.GetIdentifier()
	if identifier == "" {
		return nil, ErrInvalidCredentials
	}

	user, err := s.userRepo.FindByIdentifier(ctx, identifier)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	if !user.Enabled {
		return nil, ErrUserDisabled
	}

	if !security.CheckPassword(req.Password, user.PasswordHash) {
		return nil, ErrInvalidCredentials
	}

	return s.generateTokenPair(ctx, user)
}

func (s *authServiceImpl) RefreshToken(ctx context.Context, req dto.RefreshTokenRequest) (*dto.TokenResponse, error) {
	token, err := s.userRepo.FindRefreshToken(ctx, req.RefreshToken)
	if err != nil || token == nil {
		return nil, ErrInvalidToken
	}

	user, err := s.userRepo.FindByID(ctx, token.UserID)
	if err != nil || user == nil || !user.Enabled {
		return nil, ErrInvalidToken
	}

	// Revoke old token for security (Token Rotation)
	_ = s.userRepo.RevokeRefreshToken(ctx, req.RefreshToken)

	return s.generateTokenPair(ctx, user)
}

func (s *authServiceImpl) Logout(ctx context.Context, refreshTokenStr string) error {
	return s.userRepo.RevokeRefreshToken(ctx, refreshTokenStr)
}

func (s *authServiceImpl) GetProfile(ctx context.Context, userID string) (*dto.UserDto, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil || user == nil {
		return nil, errors.New("user not found")
	}
	userDto := dto.ToUserDto(user)
	return &userDto, nil
}

func (s *authServiceImpl) generateTokenPair(ctx context.Context, user *domain.User) (*dto.TokenResponse, error) {
	accessToken, expiresAt, err := s.jwtManager.GenerateAccessToken(user.ID, user.Email, string(user.Role))
	if err != nil {
		return nil, err
	}

	refreshTokenStr, refreshExpiresAt := s.jwtManager.GenerateRefreshToken()

	refreshToken := &domain.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Token:     refreshTokenStr,
		ExpiresAt: refreshExpiresAt,
		Revoked:   false,
	}

	if err := s.userRepo.SaveRefreshToken(ctx, refreshToken); err != nil {
		return nil, err
	}

	return &dto.TokenResponse{
		AccessToken:       accessToken,
		AccessTokenCamel:  accessToken,
		RefreshToken:      refreshTokenStr,
		RefreshTokenCamel: refreshTokenStr,
		TokenType:         "Bearer",
		ExpiresAt:         expiresAt,
		ExpiresIn:         7200,
		User:              dto.ToUserDto(user),
	}, nil
}
