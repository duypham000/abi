package agent

import (
	"tomo-backend/config"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/agent/client"
	"tomo-backend/internal/modules/agent/delivery"
	"tomo-backend/internal/modules/agent/service"

	"github.com/gin-gonic/gin"
)

type Module struct {
	Client  *client.GemOpsClient
	Service *service.AgentService
	Handler *delivery.AgentHandler
}

func InitModule(cfg *config.Config, jwtManager *security.JWTManager) *Module {
	gemClient := client.NewGemOpsClient(cfg.GemOpsBaseURL, cfg.GemOpsSocketPath)
	svc := service.NewAgentService(gemClient, cfg.GemOpsDefaultHarness, cfg.GemOpsTurnTimeout)
	handler := delivery.NewAgentHandler(svc, jwtManager)
	return &Module{
		Client:  gemClient,
		Service: svc,
		Handler: handler,
	}
}

func (m *Module) RegisterRoutes(rg *gin.RouterGroup) {
	agentGroup := rg.Group("/agent")
	{
		agentGroup.POST("/chat", m.Handler.Chat)
		agentGroup.GET("/status", m.Handler.GetStatus)
		agentGroup.GET("/info", m.Handler.GetInfo)
		agentGroup.GET("/harnesses", m.Handler.ListHarnesses)
		agentGroup.GET("/session/config", m.Handler.GetSessionConfig)
		agentGroup.POST("/session/config", m.Handler.UpdateSessionConfig)
		agentGroup.POST("/permissions/:id", m.Handler.ResolvePermission)
		agentGroup.POST("/cancel", m.Handler.Cancel)
		agentGroup.POST("/reset", m.Handler.Reset)
	}
}
