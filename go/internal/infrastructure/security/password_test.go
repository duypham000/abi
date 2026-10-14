package security_test

import (
	"testing"

	"tomo-backend/internal/infrastructure/security"
)

func TestHashAndPasswordCheck(t *testing.T) {
	rawPassword := "SecureP@ssw0rd2026"

	// 1. Hash password
	hashed, err := security.HashPassword(rawPassword)
	if err != nil {
		t.Fatalf("Expected no error on HashPassword, got: %v", err)
	}

	if hashed == "" || hashed == rawPassword {
		t.Fatalf("Expected hashed password to be non-empty and different from raw password")
	}

	// 2. Validate correct password
	if !security.CheckPassword(rawPassword, hashed) {
		t.Errorf("Expected CheckPassword to return true for correct password")
	}

	// 3. Validate incorrect password
	if security.CheckPassword("WrongP@ssw0rd", hashed) {
		t.Errorf("Expected CheckPassword to return false for incorrect password")
	}
}
