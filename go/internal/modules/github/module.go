package github

import (
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/github/delivery"
	"tomo-backend/internal/modules/github/domain"
	"tomo-backend/internal/modules/github/repository"
	"tomo-backend/internal/modules/github/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Module struct {
	AccountRepo   repository.GithubAccountRepository
	GithubService service.GitHubService
	GithubHandler *delivery.GithubHandler
}

func InitModule(db *gorm.DB, apiBaseURL string, workspaceRoot string, cacheTTLHours int) *Module {
	// Auto migrate entities
	_ = db.AutoMigrate(&domain.GithubAccount{})

	// Ensure columns are TEXT in PostgreSQL if migrating from earlier varchar
	_ = db.Exec("ALTER TABLE github_accounts ALTER COLUMN scopes TYPE text").Error
	_ = db.Exec("ALTER TABLE github_accounts ALTER COLUMN avatar_url TYPE text").Error
	_ = db.Exec("ALTER TABLE github_accounts ALTER COLUMN active_repo_url TYPE text").Error
	_ = db.Exec("ALTER TABLE github_accounts ALTER COLUMN workspace_path TYPE text").Error

	accountRepo := repository.NewGithubAccountRepository(db)
	githubService := service.NewGitHubService(accountRepo, apiBaseURL, workspaceRoot, cacheTTLHours)
	githubHandler := delivery.NewGithubHandler(githubService)

	return &Module{
		AccountRepo:   accountRepo,
		GithubService: githubService,
		GithubHandler: githubHandler,
	}
}

func (m *Module) RegisterRoutes(router *gin.RouterGroup, jwtManager *security.JWTManager) {
	ghGroup := router.Group("/github")
	ghGroup.Use(security.AuthMiddleware(jwtManager))
	{
		// Account
		ghGroup.POST("/connect", m.GithubHandler.Connect)
		ghGroup.GET("/user", m.GithubHandler.GetProfile)
		ghGroup.POST("/disconnect", m.GithubHandler.Disconnect)

		// Repositories
		ghGroup.GET("/repos", m.GithubHandler.ListRepositories)
		ghGroup.POST("/repos/create", m.GithubHandler.CreateRepository)
		ghGroup.POST("/repo/select", m.GithubHandler.SelectRepository)
		ghGroup.GET("/repo/active", m.GithubHandler.GetActiveRepository)

		// Files & Lazy Cache
		ghGroup.POST("/files/save", m.GithubHandler.SaveFile)
		ghGroup.GET("/files/get", m.GithubHandler.GetFile)
		ghGroup.GET("/files/list", m.GithubHandler.ListFiles)
		ghGroup.DELETE("/files/delete", m.GithubHandler.DeleteFile)
		ghGroup.POST("/cache/prune", m.GithubHandler.PruneCache)

		// Workspace Manifest & Status
		ghGroup.GET("/workspace/manifest", m.GithubHandler.GetManifest)
		ghGroup.POST("/workspace/manifest/rebuild", m.GithubHandler.RebuildManifest)
		ghGroup.GET("/workspace/status", m.GithubHandler.GetWorkspaceStatus)

		// Git Operations
		ghGroup.POST("/repo/init", m.GithubHandler.InitRepo)
		ghGroup.POST("/repo/commit-and-push", m.GithubHandler.CommitAndPush)
		ghGroup.POST("/repo/pull", m.GithubHandler.Pull)
		ghGroup.POST("/repo/diff", m.GithubHandler.CompareDiff)
		ghGroup.GET("/repo/file-history", m.GithubHandler.GetFileHistory)
		ghGroup.GET("/repo/file-at-commit", m.GithubHandler.GetFileAtCommit)
		ghGroup.POST("/repo/file-at-commit", m.GithubHandler.GetFileAtCommit)
		ghGroup.GET("/repo/file-diff", m.GithubHandler.GetFileDiff)
		ghGroup.POST("/repo/file-diff", m.GithubHandler.GetFileDiff)
		ghGroup.GET("/repo/conflicts", m.GithubHandler.CheckConflicts)
		ghGroup.POST("/repo/conflicts", m.GithubHandler.CheckConflicts)
		ghGroup.POST("/repo/check-conflicts", m.GithubHandler.CheckConflicts)
		ghGroup.POST("/repo/resolve-conflict", m.GithubHandler.ResolveConflict)
		ghGroup.POST("/repo/check-file", m.GithubHandler.CheckFileStatus)
	}
}
