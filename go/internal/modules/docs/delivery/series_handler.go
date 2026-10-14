package delivery

import (
	"strconv"
	"time"

	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/domain"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SeriesHandler struct {
	db *gorm.DB
}

func NewSeriesHandler(db *gorm.DB) *SeriesHandler {
	return &SeriesHandler{db: db}
}

type SeriesResponse struct {
	ID               uint      `json:"id"`
	Name             string    `json:"name"`
	Description      *string   `json:"description"`
	CreatedBy        interface{} `json:"createdBy"`
	CreatedDate      string    `json:"createdDate"`
	LastModifiedDate string    `json:"lastModifiedDate"`
}

func toSeriesResponse(s *domain.Series) SeriesResponse {
	var desc *string
	if s.Description != "" {
		desc = &s.Description
	}
	return SeriesResponse{
		ID:               s.ID,
		Name:             s.Name,
		Description:      desc,
		CreatedBy:        nil,
		CreatedDate:      s.CreatedAt.Format(time.RFC3339),
		LastModifiedDate: s.UpdatedAt.Format(time.RFC3339),
	}
}

func (h *SeriesHandler) ListSeries(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if size <= 0 {
		size = 20
	}

	var seriesList []domain.Series
	var total int64

	h.db.Model(&domain.Series{}).Count(&total)
	h.db.Offset(page * size).Limit(size).Order("id asc").Find(&seriesList)

	items := make([]SeriesResponse, 0, len(seriesList))
	for _, s := range seriesList {
		items = append(items, toSeriesResponse(&s))
	}

	c.JSON(200, gin.H{
		"success":   true,
		"message":   "Series list retrieved successfully",
		"data":      items,
		"total":     total,
		"page":      page,
		"pageSize":  size,
	})
}

func (h *SeriesHandler) GetSeriesByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid series ID"})
		return
	}

	var s domain.Series
	if err := h.db.First(&s, uint(id)).Error; err != nil {
		c.JSON(404, gin.H{"success": false, "message": "Series not found"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Series retrieved successfully",
		"data":    toSeriesResponse(&s),
	})
}

func (h *SeriesHandler) CreateSeries(c *gin.Context) {
	userIDVal, _ := c.Get(security.CtxUserID)
	userID, _ := userIDVal.(string)

	var req struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}

	desc := ""
	if req.Description != nil {
		desc = *req.Description
	}

	s := domain.Series{
		Name:        req.Name,
		Description: desc,
		CreatedByID: userID,
	}

	if err := h.db.Create(&s).Error; err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Failed to create series", "error": err.Error()})
		return
	}

	c.JSON(201, gin.H{
		"success": true,
		"message": "Series created successfully",
		"data":    toSeriesResponse(&s),
	})
}

func (h *SeriesHandler) UpdateSeries(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid series ID"})
		return
	}

	var s domain.Series
	if err := h.db.First(&s, uint(id)).Error; err != nil {
		c.JSON(404, gin.H{"success": false, "message": "Series not found"})
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request body"})
		return
	}

	if req.Name != "" {
		s.Name = req.Name
	}
	if req.Description != nil {
		s.Description = *req.Description
	}

	if err := h.db.Save(&s).Error; err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Failed to update series"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Series updated successfully",
		"data":    toSeriesResponse(&s),
	})
}

func (h *SeriesHandler) DeleteSeries(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid series ID"})
		return
	}

	if err := h.db.Delete(&domain.Series{}, uint(id)).Error; err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Failed to delete series"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Series deleted successfully",
	})
}

func (h *SeriesHandler) SearchSeries(c *gin.Context) {
	q := c.Query("q")
	var seriesList []domain.Series
	if q != "" {
		h.db.Where("name LIKE ? OR description LIKE ?", "%"+q+"%", "%"+q+"%").Find(&seriesList)
	} else {
		h.db.Find(&seriesList)
	}

	items := make([]SeriesResponse, 0, len(seriesList))
	for _, s := range seriesList {
		items = append(items, toSeriesResponse(&s))
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Series search results",
		"data":    items,
	})
}
