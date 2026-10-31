package repository

import (
	"context"
	"errors"
	"strings"

	"tomo-backend/internal/modules/docs/domain"

	"gorm.io/gorm"
)

type DocRepository interface {
	CreateDoc(ctx context.Context, doc *domain.Doc) error
	FindByID(ctx context.Context, id string) (*domain.Doc, error)
	FindBySlug(ctx context.Context, slug string) (*domain.Doc, error)
	UpdateDoc(ctx context.Context, doc *domain.Doc) error
	DeleteDoc(ctx context.Context, id string) error
	ListDocs(ctx context.Context, ownerID string, parentID *string, page, pageSize int, search string) ([]domain.Doc, int64, error)
	FindChildren(ctx context.Context, parentID string) ([]domain.Doc, error)
}

type docRepositoryImpl struct {
	db *gorm.DB
}

func NewDocRepository(db *gorm.DB) DocRepository {
	return &docRepositoryImpl{db: db}
}

func (r *docRepositoryImpl) CreateDoc(ctx context.Context, doc *domain.Doc) error {
	return r.db.WithContext(ctx).Create(doc).Error
}

func (r *docRepositoryImpl) FindByID(ctx context.Context, id string) (*domain.Doc, error) {
	var doc domain.Doc
	trimmed := strings.TrimPrefix(id, "doc-")
	withDoc := "doc-" + trimmed
	err := r.db.WithContext(ctx).Where("id = ? OR id = ? OR id = ? OR slug = ? OR slug = ? OR slug = ?", id, trimmed, withDoc, id, trimmed, withDoc).First(&doc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &doc, err
}

func (r *docRepositoryImpl) FindBySlug(ctx context.Context, slug string) (*domain.Doc, error) {
	var doc domain.Doc
	err := r.db.WithContext(ctx).Where("slug = ?", slug).First(&doc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &doc, err
}

func (r *docRepositoryImpl) UpdateDoc(ctx context.Context, doc *domain.Doc) error {
	return r.db.WithContext(ctx).Save(doc).Error
}

func (r *docRepositoryImpl) DeleteDoc(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&domain.Doc{}).Error
}

func (r *docRepositoryImpl) ListDocs(ctx context.Context, ownerID string, parentID *string, page, pageSize int, search string) ([]domain.Doc, int64, error) {
	var docs []domain.Doc
	var total int64

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	offset := (page - 1) * pageSize

	query := r.db.WithContext(ctx).Model(&domain.Doc{})
	if ownerID != "" {
		query = query.Where("owner_id = ?", ownerID)
	}

	if parentID != nil {
		if *parentID == "" {
			query = query.Where("parent_id IS NULL OR parent_id = ''")
		} else {
			query = query.Where("parent_id = ?", *parentID)
		}
	}

	if search != "" {
		query = query.Where("title LIKE ? OR content LIKE ?", "%"+search+"%", "%"+search+"%")
	}

	err := query.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	err = query.Offset(offset).Limit(pageSize).Order("is_pinned desc, is_starred desc, updated_at desc").Find(&docs).Error
	return docs, total, err
}

func (r *docRepositoryImpl) FindChildren(ctx context.Context, parentID string) ([]domain.Doc, error) {
	var docs []domain.Doc
	err := r.db.WithContext(ctx).Where("parent_id = ?", parentID).Order("title asc").Find(&docs).Error
	return docs, err
}
