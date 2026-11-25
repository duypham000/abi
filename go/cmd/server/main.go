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
	"tomo-backend/internal/modules/agent"
	"tomo-backend/internal/modules/auth"
	"tomo-backend/internal/modules/docs"
	"tomo-backend/internal/modules/github"
	"tomo-backend/internal/modules/mcp"

	"github.com/gin-gonic/gin"
)

// BuildTime is injected at compile time via -ldflags "-X main.BuildTime=...".
var BuildTime = "dev"

func main() {
	startedAt := time.Now().UTC().Format(time.RFC3339)

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

	// Wire DocsService into GithubModule (post-construction to avoid circular deps)
	githubModule.WireDocsService(docsModule.DocsService)

	// Initialize MCP Server module
	mcpModule := mcp.InitModule(db, docsModule.DocsService, docsModule.CanvasService, docsModule.YjsService)

	// Initialize GemOps Agent bridge module
	agentModule := agent.InitModule(cfg, jwtManager)
	gemOpsInfo := agentModule.Client.Info()
	logger.Log.Info("Initialized GemOps Agent bridge",
		"mode", gemOpsInfo.Mode,
		"target", gemOpsInfo.Target,
		"socketPath", gemOpsInfo.SocketPath,
		"tcpUrl", gemOpsInfo.TCPURL,
	)

	// 6. Setup Gin HTTP Router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.Default()

	// CORS Middleware
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Yjs-Token, Mcp-Session-Id, MCP-Protocol-Version, X-Agent-Api-Key, X-Harness-Id, X-Conversation-Id, X-Session-Id, X-Actor, Last-Event-ID")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Mcp-Session-Id, x-vercel-ai-ui-message-stream")
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

	cicdTestHandler := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"status":    "ok",
			"cicd":      "verified",
			"service":   "tomo-backend",
			"version":   "cicd-test-v1",
			"buildTime": BuildTime,
			"startedAt": startedAt,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}
	router.GET("/cicd-test", cicdTestHandler)
	goGroup.GET("/cicd-test", cicdTestHandler)

	// Register API v1 routes helper
	registerApiRoutes := func(rg *gin.RouterGroup) {
		rg.GET("/cicd-test", cicdTestHandler)
		authModule.RegisterRoutes(rg, jwtManager)
		docsModule.RegisterRoutes(rg, jwtManager)
		githubModule.RegisterRoutes(rg, jwtManager)
		mcpModule.RegisterRoutes(rg, jwtManager)
		agentModule.RegisterRoutes(rg)
	}

	// Root /mcp endpoint (Streamable HTTP)
	mcpModule.RegisterRoutes(router.Group(""), jwtManager)

	// Unified API v1 Routing Groups (/api/v1 for direct/stripped proxy, /go/api/v1 for subpath proxy)
	v1 := router.Group("/api/v1")
	registerApiRoutes(v1)

	goApiV1 := router.Group("/go/api/v1")
	registerApiRoutes(goApiV1)

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

	// 8. Background: periodic cache prune every 6 hours
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			logger.Log.Info("[CachePruner] Running scheduled workspace cache prune")
			// Prune all active workspaces by scanning workspace root
			if cfg.WorkspaceRoot != "" {
				entries, err := os.ReadDir(cfg.WorkspaceRoot)
				if err != nil {
					logger.Log.Warn("[CachePruner] Cannot read workspace root", "err", err)
					continue
				}
				for _, entry := range entries {
					if !entry.IsDir() {
						continue
					}
					// Each dir is a userID
					userDir := cfg.WorkspaceRoot + "/" + entry.Name()
					subEntries, err := os.ReadDir(userDir)
					if err != nil {
						continue
					}
					for _, sub := range subEntries {
						if !sub.IsDir() {
							continue
						}
						// Each sub-dir is a workspace (owner_repo)
						wsPath := userDir + "/" + sub.Name()
						logger.Log.Debug("[CachePruner] Pruning workspace", "path", wsPath)
						// Use the github service — we need a userID; skip if we can't infer
						_ = wsPath // cache prune per workspace would require userID lookup; log only for now
					}
				}
			}
		}
	}()

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
