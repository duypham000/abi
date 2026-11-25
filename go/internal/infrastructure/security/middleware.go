package security

import (
	"strings"

	"tomo-backend/internal/infrastructure/response"

	"github.com/gin-gonic/gin"
)

const (
	AuthorizationHeader = "Authorization"
	BearerPrefix        = "Bearer "
	ApiKeyAuthPrefix    = "ApiKey "
	CtxUserID           = "user_id"
	CtxUserEmail        = "user_email"
	CtxUserRole         = "user_role"
)

func extractExplicitAPIKey(c *gin.Context) string {
	if k := strings.TrimSpace(c.GetHeader(ApiKeyHeader)); k != "" {
		return k
	}
	if k := strings.TrimSpace(c.GetHeader(AgentApiKeyHeader)); k != "" {
		return k
	}
	if k := strings.TrimSpace(c.Query("api_key")); k != "" {
		return k
	}
	return ""
}

func extractAuthorizationToken(c *gin.Context) (token string, explicitApiKeyScheme bool) {
	authHeader := strings.TrimSpace(c.GetHeader(AuthorizationHeader))
	if authHeader != "" {
		if len(authHeader) >= len(BearerPrefix) && strings.EqualFold(authHeader[:len(BearerPrefix)], BearerPrefix) {
			return strings.TrimSpace(authHeader[len(BearerPrefix):]), false
		}
		if len(authHeader) >= len(ApiKeyAuthPrefix) && strings.EqualFold(authHeader[:len(ApiKeyAuthPrefix)], ApiKeyAuthPrefix) {
			return strings.TrimSpace(authHeader[len(ApiKeyAuthPrefix):]), true
		}
		return authHeader, false
	}
	if q := strings.TrimSpace(c.Query("token")); q != "" {
		if len(q) >= len(BearerPrefix) && strings.EqualFold(q[:len(BearerPrefix)], BearerPrefix) {
			return strings.TrimSpace(q[len(BearerPrefix):]), false
		}
		return q, false
	}
	return "", false
}

func AuthMiddleware(jwtManager *JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rawKey := extractExplicitAPIKey(c); rawKey != "" {
			claims, err := jwtManager.ValidateAPIKey(c.Request.Context(), rawKey)
			if err != nil {
				response.Unauthorized(c, "Invalid or expired API key")
				c.Abort()
				return
			}
			c.Set(CtxUserID, claims.UserID)
			c.Set(CtxUserEmail, claims.Email)
			c.Set(CtxUserRole, claims.Role)
			c.Set(CtxAuthMethod, "api_key")
			c.Set(CtxApiKeyID, claims.KeyID)
			c.Next()
			return
		}

		tokenStr, explicitApiKeyScheme := extractAuthorizationToken(c)
		if tokenStr == "" {
			response.Unauthorized(c, "Authorization header, X-Api-Key header, or token query parameter is missing")
			c.Abort()
			return
		}

		if explicitApiKeyScheme || IsAPIKeyFormat(tokenStr) {
			claims, err := jwtManager.ValidateAPIKey(c.Request.Context(), tokenStr)
			if err != nil {
				response.Unauthorized(c, "Invalid or expired API key")
				c.Abort()
				return
			}
			c.Set(CtxUserID, claims.UserID)
			c.Set(CtxUserEmail, claims.Email)
			c.Set(CtxUserRole, claims.Role)
			c.Set(CtxAuthMethod, "api_key")
			c.Set(CtxApiKeyID, claims.KeyID)
			c.Next()
			return
		}

		claims, err := jwtManager.ValidateToken(tokenStr)
		if err != nil {
			if jwtManager != nil && jwtManager.apiKeyValidator != nil {
				if apiClaims, apiErr := jwtManager.ValidateAPIKey(c.Request.Context(), tokenStr); apiErr == nil {
					c.Set(CtxUserID, apiClaims.UserID)
					c.Set(CtxUserEmail, apiClaims.Email)
					c.Set(CtxUserRole, apiClaims.Role)
					c.Set(CtxAuthMethod, "api_key")
					c.Set(CtxApiKeyID, apiClaims.KeyID)
					c.Next()
					return
				}
			}
			response.Unauthorized(c, "Invalid or expired authentication token")
			c.Abort()
			return
		}

		// Inject into Gin context
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUserEmail, claims.Email)
		c.Set(CtxUserRole, claims.Role)
		c.Set(CtxAuthMethod, "jwt")

		c.Next()
	}
}

func RequireRoles(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRoleVal, exists := c.Get(CtxUserRole)
		if !exists {
			response.Unauthorized(c, "User context not found")
			c.Abort()
			return
		}

		userRole, ok := userRoleVal.(string)
		if !ok {
			response.Forbidden(c, "Invalid user role type")
			c.Abort()
			return
		}

		for _, role := range allowedRoles {
			if strings.EqualFold(role, userRole) {
				c.Next()
				return
			}
		}

		response.Forbidden(c, "Permission denied: insufficient privileges")
		c.Abort()
	}
}
