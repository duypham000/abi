package repository

import (
	"context"
	"errors"
	"strings"

	"tomo-backend/internal/modules/docs/domain"

	"gorm.io/gorm"
)

type CanvasRepository interface {
	CreateCanvas(ctx context.Context, canvas *domain.Canvas) error
	FindByID(ctx context.Context, id string) (*domain.Canvas, error)
	UpdateCanvas(ctx context.Context, canvas *domain.Canvas) error
	DeleteCanvas(ctx context.Context, id string) error
	ListCanvases(ctx context.Context, ownerID string, page, pageSize int, search string) ([]domain.Canvas, int64, error)
}

type canvasRepositoryImpl struct {
	db *gorm.DB
}

func NewCanvasRepository(db *gorm.DB) CanvasRepository {
	return &canvasRepositoryImpl{db: db}
}

func (r *canvasRepositoryImpl) CreateCanvas(ctx context.Context, canvas *domain.Canvas) error {
	return r.db.WithContext(ctx).Create(canvas).Error
}

func (r *canvasRepositoryImpl) FindByID(ctx context.Context, id string) (*domain.Canvas, error) {
	var canvas domain.Canvas
	trimmed := strings.TrimPrefix(id, "canvas-")
	withPrefix := "canvas-" + trimmed
	err := r.db.WithContext(ctx).
		Where("id = ? OR id = ? OR id = ? OR slug = ? OR slug = ? OR slug = ?",
			id, trimmed, withPrefix, id, trimmed, withPrefix).
		First(&canvas).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &canvas, err
}

func (r *canvasRepositoryImpl) UpdateCanvas(ctx context.Context, canvas *domain.Canvas) error {
	return r.db.WithContext(ctx).Save(canvas).Error
}

func (r *canvasRepositoryImpl) DeleteCanvas(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&domain.Canvas{}).Error
}

func (r *canvasRepositoryImpl) ListCanvases(ctx context.Context, ownerID string, page, pageSize int, search string) ([]domain.Canvas, int64, error) {
	var canvases []domain.Canvas
	var total int64

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	query := r.db.WithContext(ctx).Model(&domain.Canvas{})
	if ownerID != "" {
		query = query.Where("owner_id = ?", ownerID)
	}
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("title LIKE ? OR metadata LIKE ?", like, like)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Offset(offset).Limit(pageSize).Order("updated_at desc").Find(&canvases).Error
	return canvases, total, err
}
