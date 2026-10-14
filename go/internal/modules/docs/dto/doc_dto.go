package dto

import (
	"time"

	"tomo-backend/internal/modules/docs/domain"
)

type CreateDocRequest struct {
	Title    string           `json:"title" binding:"required"`
	Content  string           `json:"content"`
	Status   domain.DocStatus `json:"status"`
	ParentID *string          `json:"parent_id"`
}

type UpdateDocRequest struct {
	Title    *string           `json:"title"`
	Content  *string           `json:"content"`
	Status   *domain.DocStatus `json:"status"`
	ParentID *string           `json:"parent_id"`
	IsPinned *bool             `json:"is_pinned"`
	IsStarred *bool            `json:"is_starred"`
}

type DocDto struct {
	ID        string           `json:"id"`
	Title     string           `json:"title"`
	Slug      string           `json:"slug"`
	Content   string           `json:"content"`
	Status    domain.DocStatus `json:"status"`
	ParentID  *string          `json:"parent_id"`
	OwnerID   string           `json:"owner_id"`
	IsPinned  bool             `json:"is_pinned"`
	IsStarred bool             `json:"is_starred"`
	CreatedAt time.Time        `json:"created_at"`
	UpdatedAt time.Time        `json:"updated_at"`
}

type DocTreeNode struct {
	DocDto
	Children []DocTreeNode `json:"children,omitempty"`
}

type DocRevisionDto struct {
	ID             string    `json:"id"`
	DocID          string    `json:"doc_id"`
	Version        int       `json:"version"`
	ChangesSummary string    `json:"changes_summary"`
	AuthorID       string    `json:"author_id"`
	CreatedAt      time.Time `json:"created_at"`
}

func ToDocDto(doc *domain.Doc) DocDto {
	return DocDto{
		ID:        doc.ID,
		Title:     doc.Title,
		Slug:      doc.Slug,
		Content:   doc.Content,
		Status:    doc.Status,
		ParentID:  doc.ParentID,
		OwnerID:   doc.OwnerID,
		IsPinned:  doc.IsPinned,
		IsStarred: doc.IsStarred,
		CreatedAt: doc.CreatedAt,
		UpdatedAt: doc.UpdatedAt,
	}
}

func ToDocRevisionDto(rev *domain.DocRevision) DocRevisionDto {
	return DocRevisionDto{
		ID:             rev.ID,
		DocID:          rev.DocID,
		Version:        rev.Version,
		ChangesSummary: rev.ChangesSummary,
		AuthorID:       rev.AuthorID,
		CreatedAt:      rev.CreatedAt,
	}
}
