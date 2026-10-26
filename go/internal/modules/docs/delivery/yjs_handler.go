package delivery

import (
	"io"
	"net/http"
	"strconv"

	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/service"

	"github.com/gin-gonic/gin"
)

type YjsHandler struct {
	yjsService service.YjsService
}

func NewYjsHandler(yjsService service.YjsService) *YjsHandler {
	return &YjsHandler{yjsService: yjsService}
}

func (h *YjsHandler) GenerateToken(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID, _ := userIDVal.(string)

	var req dto.YjsTokenRequest
	_ = c.ShouldBindJSON(&req)

	if req.DocID == "" {
		req.DocID = c.Query("docId")
		if req.DocID == "" {
			req.DocID = c.Query("doc_id")
		}
	}
	if req.DocID == "" && req.DocIDCamel != "" {
		req.DocID = req.DocIDCamel
	}
	if req.CanvasID == "" {
		req.CanvasID = c.Query("canvasId")
		if req.CanvasID == "" {
			req.CanvasID = c.Query("canvas_id")
		}
	}
	if req.CanvasID == "" && req.CanvasIDCamel != "" {
		req.CanvasID = req.CanvasIDCamel
	}

	res, err := h.yjsService.GenerateYjsToken(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to generate Yjs token", err)
		return
	}

	response.OK(c, "Yjs token generated", res)
}

func (h *YjsHandler) CheckPermission(c *gin.Context) {
	tokenStr := c.Query("token")
	if tokenStr == "" {
		tokenStr = c.GetHeader("X-Yjs-Token")
	}

	res, err := h.yjsService.CheckPermission(c.Request.Context(), tokenStr)
	if err != nil || !res.Allowed {
		response.Forbidden(c, "Yjs permission denied")
		return
	}

	response.OK(c, "Yjs permission verified", res)
}

func (h *YjsHandler) CheckPermCallback(c *gin.Context) {
	room := c.Param("room")
	userID := c.Param("userid")
	c.JSON(http.StatusOK, gin.H{
		"yaccess": "rw",
		"yuserid": userID,
		"room":    room,
	})
}

func (h *YjsHandler) SaveUpdate(c *gin.Context) {
	docID := c.Param("docId")
	var req dto.YjsUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid Yjs update payload", err)
		return
	}

	if err := h.yjsService.SaveUpdate(c.Request.Context(), docID, req); err != nil {
		response.InternalServerError(c, "Failed to persist Yjs update", err)
		return
	}

	response.OK(c, "Yjs binary update persisted", nil)
}

func (h *YjsHandler) SaveSnapshot(c *gin.Context) {
	docID := c.Param("docId")
	var req dto.YjsSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid Yjs snapshot payload", err)
		return
	}

	res, err := h.yjsService.SaveSnapshot(c.Request.Context(), docID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to save Yjs state vector snapshot", err)
		return
	}

	response.OK(c, "Yjs snapshot persisted", res)
}

func (h *YjsHandler) GetSnapshot(c *gin.Context) {
	docID := c.Param("docId")
	res, err := h.yjsService.GetSnapshot(c.Request.Context(), docID)
	if err != nil {
		response.NotFound(c, "Yjs state vector snapshot not found")
		return
	}

	response.OK(c, "Yjs snapshot retrieved", res)
}

func (h *YjsHandler) ReconstructDocument(c *gin.Context) {
	docID := c.Param("docId")
	versionStr := c.Query("version")
	version, err := strconv.Atoi(versionStr)
	if err != nil {
		response.BadRequest(c, "Invalid version parameter", err)
		return
	}

	res, err := h.yjsService.ReconstructDocument(c.Request.Context(), docID, version)
	if err != nil {
		response.NotFound(c, "Revision not found for reconstruction")
		return
	}

	response.OK(c, "Document state vector reconstructed", res)
}

// tomo-node internal integration handlers
func (h *YjsHandler) GetRevisionHead(c *gin.Context) {
	docID := c.Param("docId")
	head, err := h.yjsService.GetRevisionHead(c.Request.Context(), docID)
	if err != nil || head == nil {
		c.Status(http.StatusNoContent)
		return
	}
	c.JSON(http.StatusOK, head)
}

func (h *YjsHandler) AppendInternalRevision(c *gin.Context) {
	docID := c.Param("docId")
	stateVectorB64 := c.GetHeader("X-Yjs-State-Vector")
	isKeyframe := c.GetHeader("X-Yjs-Is-Keyframe") == "true"
	
	var baseVer *int
	if bvStr := c.GetHeader("X-Yjs-Base-Version"); bvStr != "" {
		if val, err := strconv.Atoi(bvStr); err == nil {
			baseVer = &val
		}
	}

	blob, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if err := h.yjsService.AppendInternalRevision(c.Request.Context(), docID, stateVectorB64, isKeyframe, baseVer, blob); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Status(http.StatusCreated)
}

func (h *YjsHandler) GetRevisionChain(c *gin.Context) {
	docID := c.Param("docId")
	revisionID, _ := strconv.Atoi(c.Param("revisionId"))

	chain, err := h.yjsService.GetRevisionChain(c.Request.Context(), docID, revisionID)
	if err != nil || chain == nil {
		c.Status(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, chain)
}

func (h *YjsHandler) UpdateDocMeta(c *gin.Context) {
	docID := c.Param("docId")
	var req dto.YjsMetaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if err := h.yjsService.UpdateDocMeta(c.Request.Context(), docID, req.PlainText); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Status(http.StatusOK)
}
