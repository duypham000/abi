package service_test

import (
	"context"
	"testing"
	"time"

	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth/domain"
	"tomo-backend/internal/modules/auth/dto"
	"tomo-backend/internal/modules/auth/repository"
	"tomo-backend/internal/modules/auth/service"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestAuthService(t *testing.T) (service.AuthService, *gorm.DB) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open memory db: %v", err)
	}

	_ = db.AutoMigrate(&domain.User{}, &domain.RefreshToken{}, &domain.APIKey{})

	userRepo := repository.NewUserRepository(db)
	jwtManager := security.NewJWTManager("test-secret", 15*time.Minute, 24*time.Hour)
	authService := service.NewAuthService(userRepo, jwtManager)
	jwtManager.SetAPIKeyValidator(authService)

	return authService, db
}

func TestAuthService_RegisterAndLogin(t *testing.T) {
	authService, _ := setupTestAuthService(t)
	ctx := context.Background()

	// 1. Register User
	regReq := dto.RegisterRequest{
		Email:    "testuser@tomo.com",
		Password: "Password123!",
		FullName: "Test User",
		Role:     domain.RoleUser,
	}

	regRes, err := authService.Register(ctx, regReq)
	if err != nil {
		t.Fatalf("Expected no error on Register, got: %v", err)
	}

	if regRes.AccessToken == "" || regRes.RefreshToken == "" {
		t.Fatalf("Expected access token and refresh token to be non-empty")
	}

	if regRes.User.Email != regReq.Email {
		t.Errorf("Expected user email %s, got %s", regReq.Email, regRes.User.Email)
	}

	// 2. Duplicate Registration Error
	_, err = authService.Register(ctx, regReq)
	if err == nil || err != service.ErrUserExists {
		t.Errorf("Expected ErrUserExists on duplicate email, got: %v", err)
	}

	// 3. Login User Valid Credentials
	loginReq := dto.LoginRequest{
		Email:    "testuser@tomo.com",
		Password: "Password123!",
	}

	loginRes, err := authService.Login(ctx, loginReq)
	if err != nil {
		t.Fatalf("Expected no error on Login, got: %v", err)
	}

	if loginRes.AccessToken == "" {
		t.Errorf("Expected valid AccessToken on Login")
	}

	// 4. Login User Invalid Password
	invalidLoginReq := dto.LoginRequest{
		Email:    "testuser@tomo.com",
		Password: "WrongPassword",
	}

	_, err = authService.Login(ctx, invalidLoginReq)
	if err == nil || err != service.ErrInvalidCredentials {
		t.Errorf("Expected ErrInvalidCredentials on wrong password, got: %v", err)
	}
}

func TestAuthService_RefreshTokenAndLogout(t *testing.T) {
	authService, _ := setupTestAuthService(t)
	ctx := context.Background()

	// 1. Register User
	regRes, err := authService.Register(ctx, dto.RegisterRequest{
		Email:    "refresh@tomo.com",
		Password: "password123",
		FullName: "Refresh Tester",
		Role:     domain.RoleUser,
	})
	if err != nil {
		t.Fatalf("Failed to register: %v", err)
	}

	// 2. Refresh Token
	refreshReq := dto.RefreshTokenRequest{
		RefreshToken: regRes.RefreshToken,
	}

	refreshedRes, err := authService.RefreshToken(ctx, refreshReq)
	if err != nil {
		t.Fatalf("Expected no error on RefreshToken, got: %v", err)
	}

	if refreshedRes.AccessToken == "" || refreshedRes.RefreshToken == "" {
		t.Fatalf("Expected new token pair after refresh")
	}

	// 3. Old Refresh Token should be revoked (Token Rotation)
	_, err = authService.RefreshToken(ctx, refreshReq)
	if err == nil || err != service.ErrInvalidToken {
		t.Errorf("Expected old refresh token to fail after rotation, got: %v", err)
	}

	// 4. Logout with new refresh token
	err = authService.Logout(ctx, refreshedRes.RefreshToken)
	if err != nil {
		t.Fatalf("Expected no error on Logout, got: %v", err)
	}

	// 5. Revoked token cannot be refreshed
	_, err = authService.RefreshToken(ctx, dto.RefreshTokenRequest{RefreshToken: refreshedRes.RefreshToken})
	if err == nil || err != service.ErrInvalidToken {
		t.Errorf("Expected revoked refresh token to fail, got: %v", err)
	}
}

func TestAuthService_GetProfile(t *testing.T) {
	authService, _ := setupTestAuthService(t)
	ctx := context.Background()

	regRes, _ := authService.Register(ctx, dto.RegisterRequest{
		Email:    "profile@tomo.com",
		Password: "password123",
		FullName: "Profile Tester",
		Role:     domain.RoleAdmin,
	})

	profile, err := authService.GetProfile(ctx, regRes.User.ID)
	if err != nil {
		t.Fatalf("Expected no error on GetProfile, got: %v", err)
	}

	if profile.Email != "profile@tomo.com" {
		t.Errorf("Expected email profile@tomo.com, got %s", profile.Email)
	}
	if profile.Role != domain.RoleAdmin {
		t.Errorf("Expected role ADMIN, got %s", profile.Role)
	}
}

func TestAuthService_APIKeyLifecycle(t *testing.T) {
	authService, _ := setupTestAuthService(t)
	ctx := context.Background()

	adminReg, err := authService.Register(ctx, dto.RegisterRequest{
		Email:    "admin-ak@tomo.com",
		Password: "password123",
		FullName: "Admin AK",
		Role:     domain.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("Register admin failed: %v", err)
	}

	created, err := authService.CreateAPIKey(ctx, adminReg.User.ID, dto.CreateAPIKeyRequest{
		Name:   "GemOps ABI MCP",
		Scopes: "mcp",
	})
	if err != nil {
		t.Fatalf("CreateAPIKey failed: %v", err)
	}
	if created.APIKey == "" || !security.IsAPIKeyFormat(created.APIKey) {
		t.Fatalf("expected generated tomo_ak_ key, got %q", created.APIKey)
	}

	claims, err := authService.ValidateAPIKey(ctx, created.APIKey)
	if err != nil {
		t.Fatalf("ValidateAPIKey failed: %v", err)
	}
	if claims.UserID != adminReg.User.ID || claims.Role != string(domain.RoleAdmin) {
		t.Fatalf("unexpected APIKeyClaims: %+v", claims)
	}

	list, err := authService.ListAPIKeys(ctx)
	if err != nil || len(list) == 0 {
		t.Fatalf("ListAPIKeys failed: err=%v len=%d", err, len(list))
	}
	for _, item := range list {
		if item.APIKey != "" || item.Key != "" {
			t.Fatalf("ListAPIKeys must not leak plaintext api_key")
		}
	}

	if err := authService.RevokeAPIKey(ctx, created.ID); err != nil {
		t.Fatalf("RevokeAPIKey failed: %v", err)
	}
	if _, err := authService.ValidateAPIKey(ctx, created.APIKey); err == nil {
		t.Fatalf("expected revoked API key to fail validation")
	}

	if err := authService.DeleteAPIKey(ctx, created.ID); err != nil {
		t.Fatalf("DeleteAPIKey failed: %v", err)
	}
	if err := authService.EnsureBootstrapAPIKey(ctx, "tomo_ak_bootstrap_test_key_123"); err != nil {
		t.Fatalf("EnsureBootstrapAPIKey failed: %v", err)
	}
	if _, err := authService.ValidateAPIKey(ctx, "tomo_ak_bootstrap_test_key_123"); err != nil {
		t.Fatalf("expected bootstrap API key to validate: %v", err)
	}
}
