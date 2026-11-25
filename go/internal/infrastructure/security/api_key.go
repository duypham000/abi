package security

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

const (
	ApiKeyHeader      = "X-Api-Key"
	AgentApiKeyHeader = "X-Agent-Api-Key"
	ApiKeyPrefix      = "tomo_ak_"
	CtxAuthMethod     = "auth_method"
	CtxApiKeyID       = "api_key_id"
)

type APIKeyClaims struct {
	KeyID  string
	UserID string
	Email  string
	Role   string
}

type APIKeyValidator interface {
	ValidateAPIKey(ctx context.Context, rawKey string) (*APIKeyClaims, error)
}

// GenerateRawAPIKey creates a new random API key with prefix "tomo_ak_",
// returning the plaintext key, its display prefix, and its SHA-256 hex digest.
func GenerateRawAPIKey() (rawKey string, keyPrefix string, keyHash string, err error) {
	buf := make([]byte, 24)
	if _, err = rand.Read(buf); err != nil {
		return "", "", "", fmt.Errorf("generate random api key: %w", err)
	}
	rawKey = ApiKeyPrefix + hex.EncodeToString(buf)
	keyPrefix = rawKey[:16]
	keyHash = HashAPIKey(rawKey)
	return rawKey, keyPrefix, keyHash, nil
}

// HashAPIKey computes the lowercase hex SHA-256 hash of a raw API key.
func HashAPIKey(rawKey string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(rawKey)))
	return hex.EncodeToString(sum[:])
}

// IsAPIKeyFormat reports whether token uses the Tomo API key prefix.
func IsAPIKeyFormat(token string) bool {
	return strings.HasPrefix(strings.TrimSpace(token), ApiKeyPrefix)
}
