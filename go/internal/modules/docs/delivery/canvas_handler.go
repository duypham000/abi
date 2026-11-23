package delivery

import (
	"errors"
	"strconv"

	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/service"

	"github.com/gin-gonic/gin"
)

type CanvasHandler struct {
	canvasService service.CanvasService
}

func NewCanvasHandler(canvasService service.CanvasService) *CanvasHandler {
	return &CanvasHandler{canvasService: canvasService}
}

func (h *CanvasHandler) CreateCanvas(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID, _ := userIDVal.(string)

	var req dto.CreateCanvasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body", err)
		return
	}

	res, err := h.canvasService.CreateCanvas(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to create canvas", err)
		return
	}

	response.Created(c, "Canvas created successfully", res)
}

func (h *CanvasHandler) GetCanvasByID(c *gin.Context) {
	id := c.Param("id")
	res, err := h.canvasService.GetCanvasByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrCanvasNotFound) {
			response.NotFound(c, "Canvas not found")
			return
		}
		response.InternalServerError(c, "Failed to fetch canvas", err)
		return
	}

	response.OK(c, "Canvas fetched successfully", res)
}

func (h *CanvasHandler) UpdateCanvas(c *gin.Context) {
	id := c.Param("id")
	userIDVal, _ := c.Get(security.CtxUserID)
	userID, _ := userIDVal.(string)

	var req dto.UpdateCanvasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid update request body", err)
		return
	}

	res, err := h.canvasService.UpdateCanvas(c.Request.Context(), id, userID, req)
	if err != nil {
		if errors.Is(err, service.ErrCanvasNotFound) {
			response.NotFound(c, "Canvas not found")
			return
		}
		response.InternalServerError(c, "Failed to update canvas", err)
		return
	}

	response.OK(c, "Canvas updated successfully", res)
}

func (h *CanvasHandler) DeleteCanvas(c *gin.Context) {
	id := c.Param("id")
	userIDVal, _ := c.Get(security.CtxUserID)
	userID, _ := userIDVal.(string)

	if err := h.canvasService.DeleteCanvas(c.Request.Context(), id, userID); err != nil {
		if errors.Is(err, service.ErrCanvasNotFound) {
			response.NotFound(c, "Canvas not found")
			return
		}
		response.InternalServerError(c, "Failed to delete canvas", err)
		return
	}

	response.OK(c, "Canvas deleted successfully", nil)
}

func (h *CanvasHandler) ListCanvases(c *gin.Context) {
	userIDVal, exists := c.Get(security.CtxUserID)
	userID := ""
	if exists {
		userID, _ = userIDVal.(string)
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSizeStr := c.Query("page_size")
	if pageSizeStr == "" {
		pageSizeStr = c.DefaultQuery("size", "20")
	}
	pageSize, _ := strconv.Atoi(pageSizeStr)

	search := c.Query("search")
	if search == "" {
		search = c.Query("q")
	}

	res, err := h.canvasService.ListCanvases(c.Request.Context(), userID, page, pageSize, search)
	if err != nil {
		response.InternalServerError(c, "Failed to list canvases", err)
		return
	}

	response.OK(c, "Canvases list retrieved", res)
}
