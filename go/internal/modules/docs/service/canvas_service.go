package service

import (
	"context"
	"errors"
	"time"

	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/repository"

	"github.com/google/uuid"
)

const (
	defaultCanvasScene    = `{"elements":[],"appState":{},"files":{}}`
	defaultCanvasMetadata = `{"starred":false,"tags":[],"thumbnail":null}`
)

var (
	ErrCanvasNotFound = errors.New("canvas not found")
)

type CanvasService interface {
	CreateCanvas(ctx context.Context, ownerID string, req dto.CreateCanvasRequest) (*dto.CanvasDto, error)
	GetCanvasByID(ctx context.Context, id string) (*dto.CanvasDto, error)
	UpdateCanvas(ctx context.Context, id, userID string, req dto.UpdateCanvasRequest) (*dto.CanvasDto, error)
	DeleteCanvas(ctx context.Context, id, userID string) error
	ListCanvases(ctx context.Context, ownerID string, page, pageSize int, search string) (*response.PageResponse, error)
	GetSnapshotBinary(ctx context.Context, id string) ([]byte, error)
	SaveSnapshotBinary(ctx context.Context, id string, updateBlob []byte, stateVectorB64 string) error
	GetStateVectorBinary(ctx context.Context, id string) ([]byte, error)
}

type canvasServiceImpl struct {
	canvasRepo repository.CanvasRepository
}

func NewCanvasService(canvasRepo repository.CanvasRepository) CanvasService {
	return &canvasServiceImpl{canvasRepo: canvasRepo}
}

func (s *canvasServiceImpl) CreateCanvas(ctx context.Context, ownerID string, req dto.CreateCanvasRequest) (*dto.CanvasDto, error) {
	canvasID := uuid.New().String()
	slug := generateSlug(req.Title) + "-" + canvasID[:8]

	scene := req.Scene
	if scene == "" {
		scene = defaultCanvasScene
	}
	metadata := req.Metadata
	if metadata == "" {
		metadata = defaultCanvasMetadata
	}
	status := 1
	if req.Status != nil {
		status = *req.Status
	}

	canvas := &domain.Canvas{
		ID:       canvasID,
		Title:    req.Title,
		Slug:     slug,
		Scene:    scene,
		Metadata: metadata,
		Status:   status,
		OwnerID:  ownerID,
	}

	if err := s.canvasRepo.CreateCanvas(ctx, canvas); err != nil {
		return nil, err
	}

	result := dto.ToCanvasDto(canvas)
	return &result, nil
}

func (s *canvasServiceImpl) GetCanvasByID(ctx context.Context, id string) (*dto.CanvasDto, error) {
	canvas, err := s.canvasRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if canvas == nil {
		return nil, ErrCanvasNotFound
	}
	result := dto.ToCanvasDto(canvas)
	return &result, nil
}

func (s *canvasServiceImpl) UpdateCanvas(ctx context.Context, id, _ string, req dto.UpdateCanvasRequest) (*dto.CanvasDto, error) {
	canvas, err := s.canvasRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if canvas == nil {
		return nil, ErrCanvasNotFound
	}

	if req.Title != nil {
		canvas.Title = *req.Title
		canvas.Slug = generateSlug(canvas.Title) + "-" + canvas.ID[:8]
	}
	if req.Scene != nil {
		canvas.Scene = *req.Scene
	}
	if req.Metadata != nil {
		canvas.Metadata = *req.Metadata
	}
	if req.Status != nil {
		canvas.Status = *req.Status
	}

	canvas.UpdatedAt = time.Now()
	if err := s.canvasRepo.UpdateCanvas(ctx, canvas); err != nil {
		return nil, err
	}

	result := dto.ToCanvasDto(canvas)
	return &result, nil
}

func (s *canvasServiceImpl) DeleteCanvas(ctx context.Context, id, _ string) error {
	canvas, err := s.canvasRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if canvas == nil {
		return ErrCanvasNotFound
	}
	return s.canvasRepo.DeleteCanvas(ctx, canvas.ID)
}

func (s *canvasServiceImpl) ListCanvases(ctx context.Context, ownerID string, page, pageSize int, search string) (*response.PageResponse, error) {
	canvases, total, err := s.canvasRepo.ListCanvases(ctx, ownerID, page, pageSize, search)
	if err != nil {
		return nil, err
	}

	items := make([]dto.CanvasDto, 0, len(canvases))
	for i := range canvases {
		items = append(items, dto.ToCanvasDto(&canvases[i]))
	}

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	totalPages := int((total + int64(pageSize) - 1) / int64(pageSize))

	return &response.PageResponse{
		Items:      items,
		TotalItems: total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

func (s *canvasServiceImpl) GetSnapshotBinary(ctx context.Context, id string) ([]byte, error) {
	canvas, err := s.canvasRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if canvas == nil {
		return nil, ErrCanvasNotFound
	}
	return canvas.YjsStateVector, nil
}

func (s *canvasServiceImpl) SaveSnapshotBinary(ctx context.Context, id string, updateBlob []byte, _ string) error {
	canvas, err := s.canvasRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if canvas == nil {
		return ErrCanvasNotFound
	}
	canvas.YjsStateVector = updateBlob
	canvas.UpdatedAt = time.Now()
	return s.canvasRepo.UpdateCanvas(ctx, canvas)
}

func (s *canvasServiceImpl) GetStateVectorBinary(ctx context.Context, id string) ([]byte, error) {
	canvas, err := s.canvasRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if canvas == nil {
		return nil, ErrCanvasNotFound
	}
	return canvas.YjsStateVector, nil
}
