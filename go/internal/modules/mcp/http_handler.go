package mcp

import (
	"io"
	"net/http"

	"tomo-backend/internal/infrastructure/security"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type HTTPHandler struct {
	server *Server
}

func NewHTTPHandler(server *Server) *HTTPHandler {
	return &HTTPHandler{server: server}
}

// HandlePost implements MCP Streamable HTTP POST requests (JSON-RPC 2.0).
func (h *HTTPHandler) HandlePost(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID, _ := userIDVal.(string)

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 10<<20)) // 10 MiB limit
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	sessionID := c.GetHeader("Mcp-Session-Id")
	if sessionID == "" {
		sessionID = uuid.New().String()
	}
	c.Header("Mcp-Session-Id", sessionID)

	respBytes, isNotification, err := h.server.HandleMessage(c.Request.Context(), userID, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if isNotification {
		c.Status(http.StatusAccepted)
		return
	}

	c.Data(http.StatusOK, "application/json; charset=utf-8", respBytes)
}

// HandleGet returns 405 Method Not Allowed because this stateless Streamable HTTP endpoint
// does not open standalone server-initiated SSE streams.
func (h *HTTPHandler) HandleGet(c *gin.Context) {
	c.Header("Allow", "POST, DELETE")
	c.JSON(http.StatusMethodNotAllowed, gin.H{
		"error": "Standalone SSE GET stream is not supported on this stateless MCP endpoint; send JSON-RPC requests via POST.",
	})
}

// HandleDelete cleanly terminates a stateless MCP session hint.
func (h *HTTPHandler) HandleDelete(c *gin.Context) {
	c.Status(http.StatusNoContent)
}
