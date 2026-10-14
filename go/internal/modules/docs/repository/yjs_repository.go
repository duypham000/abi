package repository

import (
	"context"

	"tomo-backend/internal/modules/docs/domain"

	"gorm.io/gorm"
)

type YjsRepository interface {
	SaveUpdate(ctx context.Context, update *domain.YjsUpdate) error
	GetUpdatesByDocID(ctx context.Context, docID string) ([]domain.YjsUpdate, error)
	DeleteUpdatesForDoc(ctx context.Context, docID string) error
}

type yjsRepositoryImpl struct {
	db *gorm.DB
}

func NewYjsRepository(db *gorm.DB) YjsRepository {
	return &yjsRepositoryImpl{db: db}
}

func (r *yjsRepositoryImpl) SaveUpdate(ctx context.Context, update *domain.YjsUpdate) error {
	return r.db.WithContext(ctx).Create(update).Error
}

func (r *yjsRepositoryImpl) GetUpdatesByDocID(ctx context.Context, docID string) ([]domain.YjsUpdate, error) {
	var updates []domain.YjsUpdate
	err := r.db.WithContext(ctx).Where("doc_id = ?", docID).Order("created_at asc").Find(&updates).Error
	return updates, err
}

func (r *yjsRepositoryImpl) DeleteUpdatesForDoc(ctx context.Context, docID string) error {
	return r.db.WithContext(ctx).Where("doc_id = ?", docID).Delete(&domain.YjsUpdate{}).Error
}
