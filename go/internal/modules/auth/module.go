package auth

import (
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
	_ = db.AutoMigrate(&domain.User{}, &domain.RefreshToken{})

	userRepo := repository.NewUserRepository(db)
	authService := service.NewAuthService(userRepo, jwtManager)
	authHandler := delivery.NewAuthHandler(authService)

	// Seed default admin if no users exist
	seedDefaultAdmin(db)

	return &Module{
		UserRepo:    userRepo,
		AuthService: authService,
		AuthHandler: authHandler,
	}
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
	}
}
