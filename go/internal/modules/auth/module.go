package auth

import (
	"context"
	"os"
	"strings"

	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth/delivery"
	"tomo-backend/internal/modules/auth/domain"
	"tomo-backend/internal/modules/auth/repository"
	"tomo-backend/internal/modules/auth/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Module struct {
	UserRepo    repository.UserRepository
	AuthService service.AuthService
	AuthHandler *delivery.AuthHandler
}

func InitModule(db *gorm.DB, jwtManager *security.JWTManager) *Module {
	// Auto migrate entities
	_ = db.AutoMigrate(&domain.User{}, &domain.RefreshToken{}, &domain.APIKey{})

	userRepo := repository.NewUserRepository(db)
	authService := service.NewAuthService(userRepo, jwtManager)
	authHandler := delivery.NewAuthHandler(authService)

	if jwtManager != nil {
		jwtManager.SetAPIKeyValidator(authService)
	}

	// Seed default admin if no users exist
	seedDefaultAdmin(db)

	// Optional deterministic bootstrap API key for admin/MCP automation
	if bootstrapKey := firstNonEmptyEnv("TOMO_ADMIN_API_KEY", "TOMO_API_KEY"); bootstrapKey != "" {
		_ = authService.EnsureBootstrapAPIKey(context.Background(), bootstrapKey)
	}

	return &Module{
		UserRepo:    userRepo,
		AuthService: authService,
		AuthHandler: authHandler,
	}
}

func firstNonEmptyEnv(keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

func seedDefaultAdmin(db *gorm.DB) {
	var count int64
	if err := db.Model(&domain.User{}).Count(&count).Error; err != nil {
		return
	}
	if count == 0 {
		hashedPassword, err := security.HashPassword("admin123")
		if err != nil {
			return
		}
		adminUser := &domain.User{
			ID:           "00000000-0000-0000-0000-000000000001",
			Username:     "admin",
			Email:        "admin@tomo.app",
			FullName:     "System Administrator",
			PasswordHash: hashedPassword,
			Role:         domain.RoleAdmin,
			Enabled:      true,
		}
		_ = db.Create(adminUser).Error
	}
}

func (m *Module) RegisterRoutes(router *gin.RouterGroup, jwtManager *security.JWTManager) {
	authGroup := router.Group("/auth")
	{
		authGroup.POST("/register", m.AuthHandler.Register)
		authGroup.POST("/login", m.AuthHandler.Login)
		authGroup.POST("/refresh", m.AuthHandler.RefreshToken)
		authGroup.POST("/logout", m.AuthHandler.Logout)

		// Protected endpoints
		protected := authGroup.Group("")
		protected.Use(security.AuthMiddleware(jwtManager))
		{
			protected.GET("/me", m.AuthHandler.GetMe)
		}

		// Admin API Key management under /auth/api-keys
		adminAuthKeys := authGroup.Group("/api-keys")
		adminAuthKeys.Use(security.AuthMiddleware(jwtManager), security.RequireRoles(string(domain.RoleAdmin)))
		{
			adminAuthKeys.GET("", m.AuthHandler.ListAPIKeys)
			adminAuthKeys.POST("", m.AuthHandler.CreateAPIKey)
			adminAuthKeys.POST("/:id/revoke", m.AuthHandler.RevokeAPIKey)
			adminAuthKeys.PATCH("/:id/revoke", m.AuthHandler.RevokeAPIKey)
			adminAuthKeys.DELETE("/:id", m.AuthHandler.DeleteAPIKey)
		}
	}

	// Admin API Key management under /admin/api-keys
	adminGroup := router.Group("/admin/api-keys")
	adminGroup.Use(security.AuthMiddleware(jwtManager), security.RequireRoles(string(domain.RoleAdmin)))
	{
		adminGroup.GET("", m.AuthHandler.ListAPIKeys)
		adminGroup.POST("", m.AuthHandler.CreateAPIKey)
		adminGroup.POST("/:id/revoke", m.AuthHandler.RevokeAPIKey)
		adminGroup.PATCH("/:id/revoke", m.AuthHandler.RevokeAPIKey)
		adminGroup.DELETE("/:id", m.AuthHandler.DeleteAPIKey)
	}
}
