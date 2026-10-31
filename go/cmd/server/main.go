package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tomo-backend/config"
	"tomo-backend/internal/infrastructure/database"
	"tomo-backend/internal/infrastructure/logger"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth"
	"tomo-backend/internal/modules/docs"
	"tomo-backend/internal/modules/github"

	"github.com/gin-gonic/gin"
)

func main() {
	// 1. Load configuration
	cfg := config.LoadConfig()

	// 2. Initialize logger
	logger.InitLogger(cfg.Environment)
	logger.Log.Info("Starting Tomo Modular Monolith Server", "port", cfg.ServerPort, "env", cfg.Environment)

	// 3. Initialize database connection
	db, err := database.InitDB(cfg)
	if err != nil {
		log.Fatalf("Could not connect to database: %v", err)
	}

	// 4. Initialize JWT Security Manager
	jwtManager := security.NewJWTManager(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)

	// 5. Initialize Modular Monolith Modules
	authModule := auth.InitModule(db, jwtManager)
	docsModule := docs.InitModule(db, cfg.YjsSecret, cfg.NodeWsURL)
	githubModule := github.InitModule(db, cfg.GitHubAPIBaseURL, cfg.WorkspaceRoot, cfg.CacheTTLHours)

	// 6. Setup Gin HTTP Router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.Default()

	// CORS Middleware
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Yjs-Token")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Health check endpoints (support /healthz, /health, /actuator/health for frontend compatibility)
	healthHandler := func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "UP",
			"success": true,
			"message": "Tomo Modular Monolith API is healthy",
			"data": gin.H{
				"status": "UP",
				"time":   time.Now(),
			},
		})
	}
	router.GET("/healthz", healthHandler)
	router.GET("/health", healthHandler)
	router.GET("/actuator/health", healthHandler)

	// Health check endpoints with /go prefix
	goGroup := router.Group("/go")
	{
		goGroup.GET("/healthz", healthHandler)
		goGroup.GET("/health", healthHandler)
		goGroup.GET("/actuator/health", healthHandler)
	}

	// Register API v1 routes helper
	registerApiRoutes := func(rg *gin.RouterGroup) {
		authModule.RegisterRoutes(rg, jwtManager)
		docsModule.RegisterRoutes(rg, jwtManager)
		githubModule.RegisterRoutes(rg, jwtManager)
	}

	// API v1 Routing Groups (standard, /go/api/v1, and /go/v1)
	v1 := router.Group("/api/v1")
	registerApiRoutes(v1)

	goApiV1 := router.Group("/go/api/v1")
	registerApiRoutes(goApiV1)

	goV1 := router.Group("/go/v1")
	registerApiRoutes(goV1)

	// Legacy endpoint compatibility (/api/v1/base/docs... and /go/api/v1/base/docs...)
	baseV1 := router.Group("/api/v1/base")
	docsModule.RegisterRoutes(baseV1, jwtManager)

	goBaseV1 := router.Group("/go/api/v1/base")
	docsModule.RegisterRoutes(goBaseV1, jwtManager)

	// 7. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    ":" + cfg.ServerPort,
		Handler: router,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server ListenAndServe error: %v", err)
		}
	}()

	logger.Log.Info("Server is listening and serving HTTP", "addr", srv.Addr)

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Log.Info("Shutting down server gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	logger.Log.Info("Server exited cleanly")
}
