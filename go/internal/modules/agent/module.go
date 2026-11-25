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
	gemClient := client.NewGemOpsClientWithOptions(client.ClientOptions{
		BaseURL:    cfg.GemOpsBaseURL,
		SocketPath: cfg.GemOpsSocketPath,
		AuthToken:  cfg.GemOpsAuthToken,
		BasicUser:  cfg.GemOpsBasicUser,
		BasicPass:  cfg.GemOpsBasicPass,
	})
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
		agentGroup.GET("/healthz", m.Handler.GetHealth)
		agentGroup.POST("/chat", m.Handler.Chat)
		agentGroup.POST("/prompt", m.Handler.Prompt)
		agentGroup.GET("/events", m.Handler.Events)
		agentGroup.GET("/status", m.Handler.GetStatus)
		agentGroup.GET("/sessions", m.Handler.ListSessions)
		agentGroup.DELETE("/sessions/:id", m.Handler.DeleteSession)
		agentGroup.GET("/info", m.Handler.GetInfo)
		agentGroup.GET("/agy/info", m.Handler.GetInfo)
		agentGroup.GET("/agy/usage", m.Handler.GetUsage)
		agentGroup.GET("/harnesses", m.Handler.ListHarnesses)
		agentGroup.GET("/harnesses/:id", m.Handler.GetHarness)
		agentGroup.GET("/harnesses/:id/resolved", m.Handler.GetResolvedHarness)
		agentGroup.GET("/session/config", m.Handler.GetSessionConfig)
		agentGroup.POST("/session/config", m.Handler.UpdateSessionConfig)
		agentGroup.POST("/permissions/:id", m.Handler.ResolvePermission)
		agentGroup.POST("/cancel", m.Handler.Cancel)
		agentGroup.POST("/reset", m.Handler.Reset)
	}
}
