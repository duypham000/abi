package delivery

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

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
	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = strings.TrimSpace(c.Query("harnessId"))
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(req.SessionID)
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(req.ID)
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(c.GetHeader("X-Conversation-Id"))
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(c.GetHeader("X-Session-Id"))
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(c.Query("conversationId"))
	}
	if strings.TrimSpace(req.ID) == "" {
		req.ID = req.ConversationID
	}

	actor := h.resolveActor(c)
	var writeMu sync.Mutex
	headersWritten := false

	writeSSEHeadersLocked := func() {
		if headersWritten {
			return
		}
		headersWritten = true
		c.Header("Content-Type", "text/event-stream; charset=utf-8")
		c.Header("Cache-Control", "no-cache, no-transform")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")
		c.Header("x-vercel-ai-ui-message-stream", "v1")
		c.Status(http.StatusOK)
	}

	emit := func(chunk map[string]interface{}) error {
		encoded, err := json.Marshal(chunk)
		if err != nil {
			return err
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		writeSSEHeadersLocked()
		if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", encoded); err != nil {
			return err
		}
		c.Writer.Flush()
		return nil
	}

	heartbeatDone := make(chan struct{})
	defer close(heartbeatDone)
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatDone:
				return
			case <-c.Request.Context().Done():
				return
			case <-ticker.C:
				writeMu.Lock()
				if headersWritten {
					_, _ = fmt.Fprintf(c.Writer, ": ping %d\n\n", time.Now().Unix())
					c.Writer.Flush()
				}
				writeMu.Unlock()
			}
		}
	}()

	err := h.svc.StreamChat(c.Request.Context(), req, actor, emit)
	if err != nil {
		writeMu.Lock()
		started := headersWritten
		writeMu.Unlock()
		if !started {
			h.writeUpstreamError(c, err)
			return
		}
		// Stream already started; emit an error chunk if client is still connected
		if c.Request.Context().Err() == nil {
			_ = emit(map[string]interface{}{
				"type":      "error",
				"errorText": err.Error(),
			})
			writeMu.Lock()
			_, _ = fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			c.Writer.Flush()
			writeMu.Unlock()
		}
		return
	}

	writeMu.Lock()
	if headersWritten {
		_, _ = fmt.Fprint(c.Writer, "data: [DONE]\n\n")
		c.Writer.Flush()
	}
	writeMu.Unlock()
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
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(req.SessionID)
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(c.GetHeader("X-Conversation-Id"))
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(c.GetHeader("X-Session-Id"))
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = strings.TrimSpace(c.Query("conversationId"))
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
	hardQ := strings.ToLower(strings.TrimSpace(c.Query("hard")))
	hard := hardQ == "1" || hardQ == "true" || hardQ == "yes"
	harnessID := strings.TrimSpace(c.Query("harnessId"))
	if harnessID == "" {
		harnessID = strings.TrimSpace(c.GetHeader("X-Harness-Id"))
	}
	conversationID := strings.TrimSpace(c.Query("conversationId"))
	if conversationID == "" {
		conversationID = strings.TrimSpace(c.GetHeader("X-Conversation-Id"))
	}
	res, err := h.svc.Reset(c.Request.Context(), compact, hard, harnessID, conversationID)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent session reset", res)
}

func (h *AgentHandler) ListSessions(c *gin.Context) {
	res, err := h.svc.ListSessions(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent sessions fetched", res)
}

func (h *AgentHandler) DeleteSession(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing session id", nil)
		return
	}
	harnessID := strings.TrimSpace(c.Query("harnessId"))
	if harnessID == "" {
		harnessID = strings.TrimSpace(c.GetHeader("X-Harness-Id"))
	}
	res, err := h.svc.DeleteSession(c.Request.Context(), id, harnessID)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent session deleted", res)
}

func (h *AgentHandler) GetAgyConfig(c *gin.Context) {
	res, err := h.svc.GetAgyConfig(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent CLI config fetched", res)
}

func (h *AgentHandler) UpdateAgyConfig(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "Invalid CLI config body", err)
		return
	}
	res, err := h.svc.UpdateAgyConfig(c.Request.Context(), body, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent CLI config updated", res)
}

func (h *AgentHandler) ListAgyPrompts(c *gin.Context) {
	res, err := h.svc.ListAgyPrompts(c.Request.Context())
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent system prompts fetched", res)
}

func (h *AgentHandler) SaveAgyPrompt(c *gin.Context) {
	var req dto.GemOpsSavePromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid system prompt body", err)
		return
	}
	res, err := h.svc.SaveAgyPrompt(c.Request.Context(), req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent system prompt saved", res)
}

func (h *AgentHandler) DeleteAgyPrompt(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing prompt id", nil)
		return
	}
	res, err := h.svc.DeleteAgyPrompt(c.Request.Context(), id, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent system prompt deleted", res)
}

func (h *AgentHandler) RunAgyCommand(c *gin.Context) {
	var req dto.GemOpsCustomCommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid command request body", err)
		return
	}
	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = strings.TrimSpace(c.GetHeader("X-Harness-Id"))
	}
	if strings.TrimSpace(req.HarnessID) == "" {
		req.HarnessID = strings.TrimSpace(c.Query("harnessId"))
	}
	res, err := h.svc.RunAgyCommand(c.Request.Context(), req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent command executed", res)
}

func (h *AgentHandler) TriggerUpdate(c *gin.Context) {
	var req dto.GemOpsUpdateRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			response.BadRequest(c, "Invalid update request body", err)
			return
		}
	}
	res, err := h.svc.TriggerUpdate(c.Request.Context(), req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.Success(c, http.StatusAccepted, "Agent update started", res)
}

func (h *AgentHandler) CreateHarness(c *gin.Context) {
	var spec map[string]interface{}
	if err := c.ShouldBindJSON(&spec); err != nil {
		response.BadRequest(c, "Invalid harness specification body", err)
		return
	}
	res, err := h.svc.CreateHarness(c.Request.Context(), spec, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.Created(c, "Agent harness created", res)
}

func (h *AgentHandler) UpdateHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing harness id", nil)
		return
	}
	var spec map[string]interface{}
	if err := c.ShouldBindJSON(&spec); err != nil {
		response.BadRequest(c, "Invalid harness specification body", err)
		return
	}
	res, err := h.svc.UpdateHarness(c.Request.Context(), id, spec, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness updated", res)
}

func (h *AgentHandler) DeleteHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing harness id", nil)
		return
	}
	res, err := h.svc.DeleteHarness(c.Request.Context(), id, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness deleted", res)
}

func (h *AgentHandler) ValidateHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing harness id", nil)
		return
	}
	var spec map[string]interface{}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&spec); err != nil {
			response.BadRequest(c, "Invalid harness specification body", err)
			return
		}
	}
	res, err := h.svc.ValidateHarness(c.Request.Context(), id, spec)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness validated", res)
}

func (h *AgentHandler) EvaluateHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing harness id", nil)
		return
	}
	var req map[string]interface{}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			response.BadRequest(c, "Invalid harness evaluate body", err)
			return
		}
	}
	res, err := h.svc.EvaluateHarness(c.Request.Context(), id, req)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness evaluated", res)
}

func (h *AgentHandler) CloneHarness(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		response.BadRequest(c, "Missing source harness id", nil)
		return
	}
	var req dto.GemOpsCloneHarnessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid clone harness body", err)
		return
	}
	res, err := h.svc.CloneHarness(c.Request.Context(), id, req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.Created(c, "Agent harness cloned", res)
}

func (h *AgentHandler) GetHarnessSkill(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	name := strings.TrimSpace(c.Param("name"))
	if id == "" || name == "" {
		response.BadRequest(c, "Missing harness id or skill name", nil)
		return
	}
	res, err := h.svc.GetHarnessSkill(c.Request.Context(), id, name)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness skill fetched", res)
}

func (h *AgentHandler) SaveHarnessSkill(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	name := strings.TrimSpace(c.Param("name"))
	if id == "" || name == "" {
		response.BadRequest(c, "Missing harness id or skill name", nil)
		return
	}
	var req dto.GemOpsSaveSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid harness skill body", err)
		return
	}
	res, err := h.svc.SaveHarnessSkill(c.Request.Context(), id, name, req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness skill saved", res)
}

func (h *AgentHandler) DeleteHarnessSkill(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	name := strings.TrimSpace(c.Param("name"))
	if id == "" || name == "" {
		response.BadRequest(c, "Missing harness id or skill name", nil)
		return
	}
	res, err := h.svc.DeleteHarnessSkill(c.Request.Context(), id, name, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent harness skill deleted", res)
}

func (h *AgentHandler) ListSecrets(c *gin.Context) {
	scope := strings.TrimSpace(c.Query("scope"))
	if scope == "" {
		scope = strings.TrimSpace(c.Query("harnessId"))
	}
	res, err := h.svc.ListSecrets(c.Request.Context(), scope)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent secrets fetched", res)
}

func (h *AgentHandler) SaveSecret(c *gin.Context) {
	var req dto.GemOpsSetSecretRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid secret body", err)
		return
	}
	res, err := h.svc.SaveSecret(c.Request.Context(), req, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent secret saved", res)
}

func (h *AgentHandler) DeleteSecret(c *gin.Context) {
	scope := strings.TrimSpace(c.Param("scope"))
	key := strings.TrimSpace(c.Param("key"))
	if scope == "" || key == "" {
		response.BadRequest(c, "Missing secret scope or key", nil)
		return
	}
	res, err := h.svc.DeleteSecret(c.Request.Context(), scope, key, h.resolveActor(c))
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}
	response.OK(c, "Agent secret deleted", res)
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
