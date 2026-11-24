package delivery

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"tomo-backend/internal/infrastructure/logger"
	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/agent/client"
	"tomo-backend/internal/modules/agent/dto"
	"tomo-backend/internal/modules/agent/service"

	"github.com/gin-gonic/gin"
)

// AgentHandler exposes REST and AI SDK v6 streaming endpoints backed by gemops-agent.
type AgentHandler struct {
	svc        *service.AgentService
	jwtManager *security.JWTManager
}

func NewAgentHandler(svc *service.AgentService, jwtManager *security.JWTManager) *AgentHandler {
	return &AgentHandler{
		svc:        svc,
		jwtManager: jwtManager,
	}
}

func (h *AgentHandler) resolveActor(c *gin.Context) string {
	if emailVal, ok := c.Get(security.CtxUserEmail); ok {
		if email, ok := emailVal.(string); ok && strings.TrimSpace(email) != "" {
			return strings.TrimSpace(email)
		}
	}
	if h.jwtManager != nil {
		authHeader := strings.TrimSpace(c.GetHeader(security.AuthorizationHeader))
		if strings.HasPrefix(authHeader, security.BearerPrefix) {
			tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, security.BearerPrefix))
			if claims, err := h.jwtManager.ValidateToken(tokenStr); err == nil && strings.TrimSpace(claims.Email) != "" {
				return strings.TrimSpace(claims.Email)
			}
		}
	}
	if xActor := strings.TrimSpace(c.GetHeader("X-Actor")); xActor != "" {
		return xActor
	}
	if fwdUser := strings.TrimSpace(c.GetHeader("X-Forwarded-User")); fwdUser != "" {
		return fwdUser
	}
	return "local-user"
}

// GetHealth handles GET /agent/healthz and reports upstream transport + reachability diagnostics.
func (h *AgentHandler) GetHealth(c *gin.Context) {
	response.OK(c, "Agent gateway health", h.svc.CheckHealth(c.Request.Context()))
}

// Chat handles POST /agent/chat and streams AI SDK v6 UIMessageChunk SSE events.
func (h *AgentHandler) Chat(c *gin.Context) {
	var req dto.ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid chat request body", err)
		return
	}

	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = strings.TrimSpace(c.GetHeader("X-Harness-Id"))
	}

	actor := h.resolveActor(c)
	headersWritten := false

	emit := func(chunk map[string]interface{}) error {
		if !headersWritten {
			headersWritten = true
			c.Header("Content-Type", "text/event-stream; charset=utf-8")
			c.Header("Cache-Control", "no-cache, no-transform")
			c.Header("Connection", "keep-alive")
			c.Header("X-Accel-Buffering", "no")
			c.Header("x-vercel-ai-ui-message-stream", "v1")
			c.Status(http.StatusOK)
		}

		encoded, err := json.Marshal(chunk)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", encoded); err != nil {
			return err
		}
		c.Writer.Flush()
		return nil
	}

	err := h.svc.StreamChat(c.Request.Context(), req, actor, emit)
	if err != nil {
		if !headersWritten {
			h.writeUpstreamError(c, err)
			return
		}
		// Stream already started; emit an error chunk if client is still connected
		if c.Request.Context().Err() == nil {
			_ = emit(map[string]interface{}{
				"type":      "error",
				"errorText": err.Error(),
			})
			_, _ = fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			c.Writer.Flush()
		}
		return
	}

	if headersWritten {
		_, _ = fmt.Fprint(c.Writer, "data: [DONE]\n\n")
		c.Writer.Flush()
	}
}

func (h *AgentHandler) GetStatus(c *gin.Context) {
	status, err := h.svc.GetStatus(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent status fetched", status)
}

func (h *AgentHandler) Prompt(c *gin.Context) {
	var req dto.GemOpsPromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid prompt request body", err)
		return
	}
	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = strings.TrimSpace(c.GetHeader("X-Harness-Id"))
	}
	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = strings.TrimSpace(c.Query("harnessId"))
	}
	res, err := h.svc.StartPrompt(c.Request.Context(), req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.Success(c, http.StatusAccepted, "Prompt accepted", res)
}

func (h *AgentHandler) Events(c *gin.Context) {
	resp, err := h.svc.StreamRawEvents(c.Request.Context(), c.GetHeader("Last-Event-ID"), c.Request.URL.RawQuery)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	defer resp.Body.Close()

	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache, no-transform")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Writer.Flush()

	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				return
			}
			c.Writer.Flush()
		}
		if readErr != nil {
			return
		}
	}
}

func (h *AgentHandler) GetInfo(c *gin.Context) {
	info, err := h.svc.GetInfo(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent runtime info fetched", info)
}

func (h *AgentHandler) GetUsage(c *gin.Context) {
	usage, err := h.svc.GetUsage(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent usage fetched", usage)
}

func (h *AgentHandler) ListHarnesses(c *gin.Context) {
	harnesses, err := h.svc.ListHarnesses(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harnesses fetched", harnesses)
}

func (h *AgentHandler) GetHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing harness id", nil)
		return
	}
	res, err := h.svc.GetHarness(c.Request.Context(), id)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness fetched", res)
}

func (h *AgentHandler) GetResolvedHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing harness id", nil)
		return
	}
	res, err := h.svc.GetResolvedHarness(c.Request.Context(), id)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent resolved harness fetched", res)
}

func (h *AgentHandler) GetSessionConfig(c *gin.Context) {
	cfg, err := h.svc.GetSessionConfig(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent session config fetched", cfg)
}

func (h *AgentHandler) UpdateSessionConfig(c *gin.Context) {
	var cfg dto.GemOpsSessionConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.BadRequest(c, "Invalid session config body", err)
		return
	}
	res, err := h.svc.UpdateSessionConfig(c.Request.Context(), cfg, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent session config updated", res)
}

func (h *AgentHandler) ResolvePermission(c *gin.Context) {
	permID := strings.TrimSpace(c.Param("id"))
	if permID == "" {
		response.BadRequest(c, "Missing permission id", nil)
		return
	}
	var req dto.PermissionDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid permission decision body", err)
		return
	}
	actor := strings.TrimSpace(req.Actor)
	if actor == "" {
		actor = h.resolveActor(c)
	}
	res, err := h.svc.ResolvePermission(c.Request.Context(), permID, req.Decision, actor)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Permission decision recorded", res)
}

func (h *AgentHandler) Cancel(c *gin.Context) {
	res, err := h.svc.Cancel(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent turn cancelled", res)
}

func (h *AgentHandler) Reset(c *gin.Context) {
	compactQ := strings.ToLower(strings.TrimSpace(c.Query("compact")))
	compact := compactQ == "1" || compactQ == "true" || compactQ == "yes"
	harnessID := strings.TrimSpace(c.Query("harnessId"))
	if harnessID == "" {
		harnessID = strings.TrimSpace(c.GetHeader("X-Harness-Id"))
	}
	res, err := h.svc.Reset(c.Request.Context(), compact, harnessID)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent session reset", res)
}

func (h *AgentHandler) writeUpstreamError(c *gin.Context, err error) {
	var connErr *client.ConnectionError
	if errors.As(err, &connErr) {
		if logger.Log != nil {
			logger.Log.Error("GemOps agent upstream unreachable",
				"method", c.Request.Method,
				"path", c.Request.URL.Path,
				"mode", connErr.Transport.Mode,
				"target", connErr.Transport.Target,
				"error", connErr.Error(),
			)
		}
		response.Error(
			c,
			http.StatusBadGateway,
			fmt.Sprintf("GemOps agent unreachable (%s: %s)", connErr.Transport.Mode, connErr.Transport.Target),
			connErr.Error(),
		)
		return
	}
	var upstreamErr *client.UpstreamError
	if errors.As(err, &upstreamErr) {
		code := upstreamErr.StatusCode
		if code < 400 || code >= 600 {
			code = http.StatusBadGateway
		}
		if logger.Log != nil {
			logger.Log.Warn("GemOps agent upstream HTTP error",
				"method", c.Request.Method,
				"path", c.Request.URL.Path,
				"status", code,
				"message", upstreamErr.Message,
			)
		}
		response.Error(c, code, upstreamErr.Message, upstreamErr.Error())
		return
	}
	if strings.Contains(strings.ToLower(err.Error()), "prompt cannot be empty") ||
		strings.Contains(strings.ToLower(err.Error()), "decision must be") {
		response.BadRequest(c, err.Error(), err)
		return
	}
	if logger.Log != nil {
		logger.Log.Error("GemOps agent service unavailable",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"error", err.Error(),
		)
	}
	response.Error(c, http.StatusBadGateway, "GemOps agent service unavailable", err.Error())
}
