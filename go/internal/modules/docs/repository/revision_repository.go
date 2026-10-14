package repository

import (
	"context"

	"tomo-backend/internal/modules/docs/domain"

	"gorm.io/gorm"
)

type RevisionRepository interface {
	SaveRevision(ctx context.Context, rev *domain.DocRevision) error
	GetRevisionsByDocID(ctx context.Context, docID string) ([]domain.DocRevision, error)
	GetLatestVersion(ctx context.Context, docID string) (int, error)
	GetRevisionByVersion(ctx context.Context, docID string, version int) (*domain.DocRevision, error)
}

type revisionRepositoryImpl struct {
	db *gorm.DB
}

func NewRevisionRepository(db *gorm.DB) RevisionRepository {
	return &revisionRepositoryImpl{db: db}
}

func (r *revisionRepositoryImpl) SaveRevision(ctx context.Context, rev *domain.DocRevision) error {
	return r.db.WithContext(ctx).Create(rev).Error
}

func (r *revisionRepositoryImpl) GetRevisionsByDocID(ctx context.Context, docID string) ([]domain.DocRevision, error) {
	var revs []domain.DocRevision
	err := r.db.WithContext(ctx).Where("doc_id = ?", docID).Order("version desc").Find(&revs).Error
	return revs, err
}

func (r *revisionRepositoryImpl) GetLatestVersion(ctx context.Context, docID string) (int, error) {
	var maxVer struct {
		MaxVersion int
	}
	err := r.db.WithContext(ctx).Model(&domain.DocRevision{}).
		Select("COALESCE(MAX(version), 0) as max_version").
		Where("doc_id = ?", docID).
		Scan(&maxVer).Error
	return maxVer.MaxVersion, err
}

func (r *revisionRepositoryImpl) GetRevisionByVersion(ctx context.Context, docID string, version int) (*domain.DocRevision, error) {
	var rev domain.DocRevision
	err := r.db.WithContext(ctx).Where("doc_id = ? AND version = ?", docID, version).First(&rev).Error
	if err != nil {
		return nil, err
	}
	return &rev, nil
}
