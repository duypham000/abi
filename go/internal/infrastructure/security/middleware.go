package security

import (
	"strings"

	"tomo-backend/internal/infrastructure/response"

	"github.com/gin-gonic/gin"
)

const (
	AuthorizationHeader = "Authorization"
	BearerPrefix        = "Bearer "
	CtxUserID           = "user_id"
	CtxUserEmail        = "user_email"
	CtxUserRole         = "user_role"
)

func AuthMiddleware(jwtManager *JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader(AuthorizationHeader)
		if authHeader == "" {
			// Also check query param or header for Yjs WebSocket/HTTP auth if needed
			authHeader = c.Query("token")
			if authHeader != "" && !strings.HasPrefix(authHeader, BearerPrefix) {
				authHeader = BearerPrefix + authHeader
			}
		}

		if authHeader == "" {
			response.Unauthorized(c, "Authorization header or token query parameter is missing")
			c.Abort()
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, BearerPrefix)
		claims, err := jwtManager.ValidateToken(tokenStr)
		if err != nil {
			response.Unauthorized(c, "Invalid or expired authentication token")
			c.Abort()
			return
		}

		// Inject into Gin context
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUserEmail, claims.Email)
		c.Set(CtxUserRole, claims.Role)

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
