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
		agentGroup.GET("/meta", m.Handler.GetHealth)
		agentGroup.POST("/chat", m.Handler.Chat)
		agentGroup.POST("/prompt", m.Handler.Prompt)
		agentGroup.GET("/events", m.Handler.Events)
		agentGroup.GET("/status", m.Handler.GetStatus)
		agentGroup.GET("/sessions", m.Handler.ListSessions)
		agentGroup.DELETE("/sessions/:id", m.Handler.DeleteSession)
		agentGroup.GET("/info", m.Handler.GetInfo)
		agentGroup.GET("/agy/info", m.Handler.GetInfo)
		agentGroup.GET("/usage", m.Handler.GetUsage)
		agentGroup.GET("/agy/usage", m.Handler.GetUsage)
		agentGroup.GET("/agy/config", m.Handler.GetAgyConfig)
		agentGroup.PUT("/agy/config", m.Handler.UpdateAgyConfig)
		agentGroup.POST("/agy/config", m.Handler.UpdateAgyConfig)
		agentGroup.GET("/agy/prompts", m.Handler.ListAgyPrompts)
		agentGroup.POST("/agy/prompts", m.Handler.SaveAgyPrompt)
		agentGroup.PUT("/agy/prompts", m.Handler.SaveAgyPrompt)
		agentGroup.DELETE("/agy/prompts/:id", m.Handler.DeleteAgyPrompt)
		agentGroup.POST("/agy/command", m.Handler.RunAgyCommand)
		agentGroup.POST("/update", m.Handler.TriggerUpdate)

		agentGroup.GET("/harnesses", m.Handler.ListHarnesses)
		agentGroup.POST("/harnesses", m.Handler.CreateHarness)
		agentGroup.GET("/harnesses/:id", m.Handler.GetHarness)
		agentGroup.PUT("/harnesses/:id", m.Handler.UpdateHarness)
		agentGroup.DELETE("/harnesses/:id", m.Handler.DeleteHarness)
		agentGroup.GET("/harnesses/:id/resolved", m.Handler.GetResolvedHarness)
		agentGroup.POST("/harnesses/:id/validate", m.Handler.ValidateHarness)
		agentGroup.POST("/harnesses/:id/evaluate", m.Handler.EvaluateHarness)
		agentGroup.POST("/harnesses/:id/clone", m.Handler.CloneHarness)
		agentGroup.GET("/harnesses/:id/skills/:name", m.Handler.GetHarnessSkill)
		agentGroup.PUT("/harnesses/:id/skills/:name", m.Handler.SaveHarnessSkill)
		agentGroup.DELETE("/harnesses/:id/skills/:name", m.Handler.DeleteHarnessSkill)

		agentGroup.GET("/secrets", m.Handler.ListSecrets)
		agentGroup.PUT("/secrets", m.Handler.SaveSecret)
		agentGroup.POST("/secrets", m.Handler.SaveSecret)
		agentGroup.DELETE("/secrets/:scope/:key", m.Handler.DeleteSecret)

		agentGroup.GET("/session/config", m.Handler.GetSessionConfig)
		agentGroup.POST("/session/config", m.Handler.UpdateSessionConfig)
		agentGroup.PUT("/session/config", m.Handler.UpdateSessionConfig)
		agentGroup.POST("/permissions/:id", m.Handler.ResolvePermission)
		agentGroup.POST("/cancel", m.Handler.Cancel)
		agentGroup.POST("/reset", m.Handler.Reset)
	}
}
