package delivery

import (
	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/dto"

	"github.com/gin-gonic/gin"
)

// SyncPushLocal nhận danh sách file từ local và đẩy lên backend database
func (h *DocsHandler) SyncPushLocal(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	var req dto.SyncPushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid sync push body", err)
		return
	}

	result, err := h.docsService.SyncPushLocal(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to sync push files", err)
		return
	}

	response.OK(c, "Sync push completed successfully", result)
}

// SyncPullRemote lấy toàn bộ file từ backend database về local
func (h *DocsHandler) SyncPullRemote(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	since := c.Query("since")
	result, err := h.docsService.SyncPullRemote(c.Request.Context(), userID, since)
	if err != nil {
		response.InternalServerError(c, "Failed to sync pull files", err)
		return
	}

	response.OK(c, "Sync pull completed successfully", result)
}

