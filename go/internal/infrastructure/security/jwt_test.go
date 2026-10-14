package security_test

import (
	"testing"
	"time"

	"tomo-backend/internal/infrastructure/security"
)

func TestJWTManager_GenerateAndValidateToken(t *testing.T) {
	secret := "test-jwt-secret-key-12345"
	accessTTL := 15 * time.Minute
	refreshTTL := 24 * time.Hour

	jwtManager := security.NewJWTManager(secret, accessTTL, refreshTTL)

	userID := "user-uuid-123"
	email := "user@tomo.com"
	role := "ADMIN"

	// 1. Generate Access Token
	tokenStr, expiresAt, err := jwtManager.GenerateAccessToken(userID, email, role)
	if err != nil {
		t.Fatalf("Failed to generate access token: %v", err)
	}

	if tokenStr == "" {
		t.Fatalf("Generated token string should not be empty")
	}

	if expiresAt.Before(time.Now()) {
		t.Fatalf("ExpiresAt should be in the future")
	}

	// 2. Validate Token
	claims, err := jwtManager.ValidateToken(tokenStr)
	if err != nil {
		t.Fatalf("Failed to validate valid token: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("Expected UserID %s, got %s", userID, claims.UserID)
	}
	if claims.Email != email {
		t.Errorf("Expected Email %s, got %s", email, claims.Email)
	}
	if claims.Role != role {
		t.Errorf("Expected Role %s, got %s", role, claims.Role)
	}

	// 3. Validate Token with wrong secret
	wrongManager := security.NewJWTManager("wrong-secret-key", accessTTL, refreshTTL)
	_, err = wrongManager.ValidateToken(tokenStr)
	if err == nil {
		t.Errorf("Expected error when validating token with wrong secret key")
	}
}

func TestJWTManager_ExpiredToken(t *testing.T) {
	secret := "test-jwt-secret-key-12345"
	// Expired immediately TTL
	jwtManager := security.NewJWTManager(secret, -1*time.Minute, 24*time.Hour)

	tokenStr, _, err := jwtManager.GenerateAccessToken("user-1", "user@test.com", "USER")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	_, err = jwtManager.ValidateToken(tokenStr)
	if err == nil {
		t.Errorf("Expected error when validating expired token")
	}
}

func TestJWTManager_GenerateRefreshToken(t *testing.T) {
	jwtManager := security.NewJWTManager("secret", 15*time.Minute, 24*time.Hour)
	tokenStr, expiresAt := jwtManager.GenerateRefreshToken()

	if tokenStr == "" {
		t.Fatalf("Refresh token string should not be empty")
	}
	if expiresAt.Before(time.Now()) {
		t.Fatalf("Refresh token expiresAt should be in the future")
	}
}
