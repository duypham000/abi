package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth/domain"
	"tomo-backend/internal/modules/auth/dto"
	"tomo-backend/internal/modules/auth/repository"

	"github.com/google/uuid"
)

var (
	ErrUserExists         = errors.New("user with this email already exists")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserDisabled       = errors.New("user account is disabled")
	ErrInvalidToken       = errors.New("invalid or expired refresh token")
	ErrInvalidAPIKey      = errors.New("invalid or expired api key")
	ErrAPIKeyNotFound     = errors.New("api key not found")
)

type AuthService interface {
	Register(ctx context.Context, req dto.RegisterRequest) (*dto.TokenResponse, error)
	Login(ctx context.Context, req dto.LoginRequest) (*dto.TokenResponse, error)
	RefreshToken(ctx context.Context, req dto.RefreshTokenRequest) (*dto.TokenResponse, error)
	Logout(ctx context.Context, refreshTokenStr string) error
	GetProfile(ctx context.Context, userID string) (*dto.UserDto, error)

	// Admin-managed API keys
	CreateAPIKey(ctx context.Context, adminUserID string, req dto.CreateAPIKeyRequest) (*dto.APIKeyDto, error)
	ListAPIKeys(ctx context.Context) ([]dto.APIKeyDto, error)
	RevokeAPIKey(ctx context.Context, id string) error
	DeleteAPIKey(ctx context.Context, id string) error
	ValidateAPIKey(ctx context.Context, rawKey string) (*security.APIKeyClaims, error)
	EnsureBootstrapAPIKey(ctx context.Context, rawKey string) error
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

func (s *authServiceImpl) CreateAPIKey(ctx context.Context, adminUserID string, req dto.CreateAPIKeyRequest) (*dto.APIKeyDto, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("api key name is required")
	}

	targetUserID := strings.TrimSpace(req.UserID)
	if targetUserID == "" {
		targetUserID = strings.TrimSpace(adminUserID)
	}
	if targetUserID == "" {
		targetUserID = "00000000-0000-0000-0000-000000000001"
	}

	role := req.Role
	if role == "" {
		role = domain.RoleAdmin
	}

	scopes := strings.TrimSpace(req.Scopes)
	if scopes == "" {
		scopes = "mcp,api"
	}

	var rawKey, keyPrefix, keyHash string
	var err error
	if trimmedRaw := strings.TrimSpace(req.RawKey); trimmedRaw != "" {
		rawKey = trimmedRaw
		if len(rawKey) > 16 {
			keyPrefix = rawKey[:16]
		} else {
			keyPrefix = rawKey
		}
		keyHash = security.HashAPIKey(rawKey)
	} else {
		rawKey, keyPrefix, keyHash, err = security.GenerateRawAPIKey()
		if err != nil {
			return nil, err
		}
	}

	var expiresAt *time.Time
	if req.ExpiresInDays > 0 {
		t := time.Now().UTC().Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}

	entity := &domain.APIKey{
		ID:        uuid.New().String(),
		Name:      name,
		KeyPrefix: keyPrefix,
		KeyHash:   keyHash,
		UserID:    targetUserID,
		Role:      role,
		Scopes:    scopes,
		Revoked:   false,
		ExpiresAt: expiresAt,
		CreatedBy: adminUserID,
	}

	if err := s.userRepo.CreateAPIKey(ctx, entity); err != nil {
		return nil, err
	}

	out := dto.ToAPIKeyDto(entity, rawKey)
	return &out, nil
}

func (s *authServiceImpl) ListAPIKeys(ctx context.Context) ([]dto.APIKeyDto, error) {
	keys, err := s.userRepo.ListAPIKeys(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]dto.APIKeyDto, 0, len(keys))
	for i := range keys {
		out = append(out, dto.ToAPIKeyDto(&keys[i], ""))
	}
	return out, nil
}

func (s *authServiceImpl) RevokeAPIKey(ctx context.Context, id string) error {
	existing, err := s.userRepo.FindAPIKeyByID(ctx, id)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrAPIKeyNotFound
	}
	return s.userRepo.RevokeAPIKey(ctx, id)
}

func (s *authServiceImpl) DeleteAPIKey(ctx context.Context, id string) error {
	existing, err := s.userRepo.FindAPIKeyByID(ctx, id)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrAPIKeyNotFound
	}
	return s.userRepo.DeleteAPIKey(ctx, id)
}

func (s *authServiceImpl) ValidateAPIKey(ctx context.Context, rawKey string) (*security.APIKeyClaims, error) {
	trimmed := strings.TrimSpace(rawKey)
	if trimmed == "" {
		return nil, ErrInvalidAPIKey
	}

	keyHash := security.HashAPIKey(trimmed)
	key, err := s.userRepo.FindAPIKeyByHash(ctx, keyHash)
	if err != nil || key == nil {
		return nil, ErrInvalidAPIKey
	}
	if key.Revoked {
		return nil, ErrInvalidAPIKey
	}
	if key.ExpiresAt != nil && !key.ExpiresAt.After(time.Now()) {
		return nil, ErrInvalidAPIKey
	}

	userID := key.UserID
	email := "apikey@tomo.app"
	role := key.Role
	if user, uErr := s.userRepo.FindByID(ctx, key.UserID); uErr == nil && user != nil {
		if !user.Enabled {
			return nil, ErrUserDisabled
		}
		if user.Email != "" {
			email = user.Email
		}
		if role == "" {
			role = user.Role
		}
	}
	if role == "" {
		role = domain.RoleAdmin
	}

	_ = s.userRepo.TouchAPIKeyLastUsed(ctx, key.ID, time.Now().UTC())

	return &security.APIKeyClaims{
		KeyID:  key.ID,
		UserID: userID,
		Email:  email,
		Role:   string(role),
	}, nil
}

func (s *authServiceImpl) EnsureBootstrapAPIKey(ctx context.Context, rawKey string) error {
	trimmed := strings.TrimSpace(rawKey)
	if trimmed == "" {
		return nil
	}
	keyHash := security.HashAPIKey(trimmed)
	existing, err := s.userRepo.FindAPIKeyByHash(ctx, keyHash)
	if err != nil {
		return err
	}
	if existing != nil {
		return nil
	}

	keyPrefix := trimmed
	if len(keyPrefix) > 16 {
		keyPrefix = keyPrefix[:16]
	}

	adminID := "00000000-0000-0000-0000-000000000001"
	entity := &domain.APIKey{
		ID:        uuid.New().String(),
		Name:      "Bootstrap Admin API Key",
		KeyPrefix: keyPrefix,
		KeyHash:   keyHash,
		UserID:    adminID,
		Role:      domain.RoleAdmin,
		Scopes:    "mcp,api",
		Revoked:   false,
		CreatedBy: adminID,
	}
	return s.userRepo.CreateAPIKey(ctx, entity)
}
