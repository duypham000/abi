package dto

import (
	"time"

	"tomo-backend/internal/modules/docs/domain"
)

type CreateCanvasRequest struct {
	Title    string `json:"title" binding:"required"`
	Scene    string `json:"scene"`
	Metadata string `json:"metadata"`
	Status   *int   `json:"status"`
}

type UpdateCanvasRequest struct {
	Title    *string `json:"title"`
	Scene    *string `json:"scene"`
	Metadata *string `json:"metadata"`
	Status   *int    `json:"status"`
}

type CanvasDto struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Slug      string    `json:"slug"`
	Scene     string    `json:"scene"`
	Metadata  string    `json:"metadata"`
	Status    int       `json:"status"`
	OwnerID   string    `json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func ToCanvasDto(c *domain.Canvas) CanvasDto {
	return CanvasDto{
		ID:        c.ID,
		Title:     c.Title,
		Slug:      c.Slug,
		Scene:     c.Scene,
		Metadata:  c.Metadata,
		Status:    c.Status,
		OwnerID:   c.OwnerID,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
	}
}
