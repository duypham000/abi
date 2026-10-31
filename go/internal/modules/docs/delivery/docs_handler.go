package delivery

import (
	"strconv"

	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/service"

	"github.com/gin-gonic/gin"
)

type DocsHandler struct {
	docsService service.DocsService
}

func NewDocsHandler(docsService service.DocsService) *DocsHandler {
	return &DocsHandler{docsService: docsService}
}

func (h *DocsHandler) CreateDoc(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	var req dto.CreateDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body", err)
		return
	}

	res, err := h.docsService.CreateDoc(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to create document", err)
		return
	}

	response.Created(c, "Document created successfully", res)
}

func (h *DocsHandler) SyncFromGit(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	var req dto.CreateDocFromGitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body", err)
		return
	}
	if req.Title == "" {
		req.Title = req.GitSlug
	}

	doc, created, err := h.docsService.SyncFromGit(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to sync doc from git", err)
		return
	}

	if created {
		response.Created(c, "Document registered from GitHub", doc)
	} else {
		response.OK(c, "Document already exists", doc)
	}
}

func (h *DocsHandler) GetDocByID(c *gin.Context) {
	id := c.Param("id")
	res, err := h.docsService.GetDocByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "Document not found")
		return
	}

	response.OK(c, "Document fetched successfully", res)
}

func (h *DocsHandler) GetDocBySlug(c *gin.Context) {
	slug := c.Param("slug")
	res, err := h.docsService.GetDocBySlug(c.Request.Context(), slug)
	if err != nil {
		response.NotFound(c, "Document not found by slug")
		return
	}

	response.OK(c, "Document fetched successfully", res)
}

func (h *DocsHandler) UpdateDoc(c *gin.Context) {
	id := c.Param("id")
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	var req dto.UpdateDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid update request body", err)
		return
	}

	res, err := h.docsService.UpdateDoc(c.Request.Context(), id, userID, req)
	if err != nil {
		response.InternalServerError(c, "Failed to update document", err)
		return
	}

	response.OK(c, "Document updated successfully", res)
}

func (h *DocsHandler) DeleteDoc(c *gin.Context) {
	id := c.Param("id")
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	if err := h.docsService.DeleteDoc(c.Request.Context(), id, userID); err != nil {
		response.InternalServerError(c, "Failed to delete document", err)
		return
	}

	response.OK(c, "Document deleted successfully", nil)
}

func (h *DocsHandler) ListDocs(c *gin.Context) {
	userIDVal, exists := c.Get(security.CtxUserID)
	userID := ""
	if exists {
		userID = userIDVal.(string)
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	search := c.Query("search")

	var parentID *string
	if p, ok := c.GetQuery("parent_id"); ok {
		parentID = &p
	}

	res, err := h.docsService.ListDocs(c.Request.Context(), userID, parentID, page, pageSize, search)
	if err != nil {
		response.InternalServerError(c, "Failed to list documents", err)
		return
	}

	response.OK(c, "Documents list retrieved", res)
}

func (h *DocsHandler) GetDocTree(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID := userIDVal.(string)

	tree, err := h.docsService.GetDocTree(c.Request.Context(), userID)
	if err != nil {
		response.InternalServerError(c, "Failed to fetch document tree", err)
		return
	}

	response.OK(c, "Document tree structure retrieved", tree)
}

func (h *DocsHandler) GetRevisions(c *gin.Context) {
	id := c.Param("id")
	revs, err := h.docsService.GetRevisions(c.Request.Context(), id)
	if err != nil {
		response.InternalServerError(c, "Failed to fetch document revisions", err)
		return
	}

	response.OK(c, "Document revisions retrieved", revs)
}
