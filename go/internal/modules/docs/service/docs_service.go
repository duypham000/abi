package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/repository"

	"github.com/google/uuid"
)

var (
	ErrDocNotFound = errors.New("document not found")
	ErrUnauthorizedDoc = errors.New("unauthorized access to document")
)

type DocsService interface {
	CreateDoc(ctx context.Context, ownerID string, req dto.CreateDocRequest) (*dto.DocDto, error)
	GetDocByID(ctx context.Context, id string) (*dto.DocDto, error)
	GetDocBySlug(ctx context.Context, slug string) (*dto.DocDto, error)
	UpdateDoc(ctx context.Context, id, userID string, req dto.UpdateDocRequest) (*dto.DocDto, error)
	DeleteDoc(ctx context.Context, id, userID string) error
	ListDocs(ctx context.Context, ownerID string, parentID *string, page, pageSize int, search string) (*response.PageResponse, error)
	GetDocTree(ctx context.Context, ownerID string) ([]dto.DocTreeNode, error)
	
	// Revision history
	GetRevisions(ctx context.Context, docID string) ([]dto.DocRevisionDto, error)
	CreateRevision(ctx context.Context, docID, authorID, summary string, snapshot []byte) (*dto.DocRevisionDto, error)
}

type docsServiceImpl struct {
	docRepo repository.DocRepository
	revRepo repository.RevisionRepository
}

func NewDocsService(docRepo repository.DocRepository, revRepo repository.RevisionRepository) DocsService {
	return &docsServiceImpl{
		docRepo: docRepo,
		revRepo: revRepo,
	}
}

func (s *docsServiceImpl) CreateDoc(ctx context.Context, ownerID string, req dto.CreateDocRequest) (*dto.DocDto, error) {
	docID := uuid.New().String()
	slug := generateSlug(req.Title) + "-" + docID[:8]

	status := req.Status
	if status == "" {
		status = domain.DocStatusDraft
	}

	doc := &domain.Doc{
		ID:        docID,
		Title:     req.Title,
		Slug:      slug,
		Content:   req.Content,
		Status:    status,
		ParentID:  req.ParentID,
		OwnerID:   ownerID,
		IsPinned:  false,
		IsStarred: false,
	}

	if err := s.docRepo.CreateDoc(ctx, doc); err != nil {
		return nil, err
	}

	// Initial revision
	_, _ = s.CreateRevision(ctx, doc.ID, ownerID, "Initial document creation", []byte(req.Content))

	result := dto.ToDocDto(doc)
	return &result, nil
}

func (s *docsServiceImpl) GetDocByID(ctx context.Context, id string) (*dto.DocDto, error) {
	doc, err := s.docRepo.FindByID(ctx, id)
	if err != nil || doc == nil {
		return nil, ErrDocNotFound
	}
	result := dto.ToDocDto(doc)
	return &result, nil
}

func (s *docsServiceImpl) GetDocBySlug(ctx context.Context, slug string) (*dto.DocDto, error) {
	doc, err := s.docRepo.FindBySlug(ctx, slug)
	if err != nil || doc == nil {
		return nil, ErrDocNotFound
	}
	result := dto.ToDocDto(doc)
	return &result, nil
}

func (s *docsServiceImpl) UpdateDoc(ctx context.Context, id, userID string, req dto.UpdateDocRequest) (*dto.DocDto, error) {
	doc, err := s.docRepo.FindByID(ctx, id)
	if err != nil || doc == nil {
		return nil, ErrDocNotFound
	}

	if req.Title != nil {
		doc.Title = *req.Title
		doc.Slug = generateSlug(doc.Title) + "-" + doc.ID[:8]
	}
	if req.Content != nil {
		doc.Content = *req.Content
	}
	if req.Status != nil {
		doc.Status = *req.Status
	}
	if req.ParentID != nil {
		doc.ParentID = req.ParentID
	}
	if req.IsPinned != nil {
		doc.IsPinned = *req.IsPinned
	}
	if req.IsStarred != nil {
		doc.IsStarred = *req.IsStarred
	}

	doc.UpdatedAt = time.Now()
	if err := s.docRepo.UpdateDoc(ctx, doc); err != nil {
		return nil, err
	}

	// Auto-create snapshot revision when content changes meaningfully
	if req.Content != nil {
		_, _ = s.CreateRevision(ctx, doc.ID, userID, "Document content updated", []byte(*req.Content))
	}

	result := dto.ToDocDto(doc)
	return &result, nil
}

func (s *docsServiceImpl) DeleteDoc(ctx context.Context, id, userID string) error {
	doc, err := s.docRepo.FindByID(ctx, id)
	if err != nil || doc == nil {
		return ErrDocNotFound
	}

	return s.docRepo.DeleteDoc(ctx, id)
}

func (s *docsServiceImpl) ListDocs(ctx context.Context, ownerID string, parentID *string, page, pageSize int, search string) (*response.PageResponse, error) {
	docs, total, err := s.docRepo.ListDocs(ctx, ownerID, parentID, page, pageSize, search)
	if err != nil {
		return nil, err
	}

	var items []dto.DocDto
	for _, doc := range docs {
		items = append(items, dto.ToDocDto(&doc))
	}

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
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

func (s *docsServiceImpl) GetDocTree(ctx context.Context, ownerID string) ([]dto.DocTreeNode, error) {
	emptyParent := ""
	rootDocs, _, err := s.docRepo.ListDocs(ctx, ownerID, &emptyParent, 1, 1000, "")
	if err != nil {
		return nil, err
	}

	var tree []dto.DocTreeNode
	for _, rootDoc := range rootDocs {
		node := s.buildTreeNode(ctx, rootDoc)
		tree = append(tree, node)
	}

	return tree, nil
}

func (s *docsServiceImpl) buildTreeNode(ctx context.Context, doc domain.Doc) dto.DocTreeNode {
	node := dto.DocTreeNode{
		DocDto: dto.ToDocDto(&doc),
	}

	children, err := s.docRepo.FindChildren(ctx, doc.ID)
	if err == nil {
		for _, child := range children {
			node.Children = append(node.Children, s.buildTreeNode(ctx, child))
		}
	}

	return node
}

func (s *docsServiceImpl) GetRevisions(ctx context.Context, docID string) ([]dto.DocRevisionDto, error) {
	revs, err := s.revRepo.GetRevisionsByDocID(ctx, docID)
	if err != nil {
		return nil, err
	}

	var dtos []dto.DocRevisionDto
	for _, rev := range revs {
		dtos = append(dtos, dto.ToDocRevisionDto(&rev))
	}
	return dtos, nil
}

func (s *docsServiceImpl) CreateRevision(ctx context.Context, docID, authorID, summary string, snapshot []byte) (*dto.DocRevisionDto, error) {
	latestVer, err := s.revRepo.GetLatestVersion(ctx, docID)
	if err != nil {
		latestVer = 0
	}

	rev := &domain.DocRevision{
		ID:             uuid.New().String(),
		DocID:          docID,
		Version:        latestVer + 1,
		SnapshotBlob:   snapshot,
		ChangesSummary: summary,
		AuthorID:       authorID,
	}

	if err := s.revRepo.SaveRevision(ctx, rev); err != nil {
		return nil, err
	}

	res := dto.ToDocRevisionDto(rev)
	return &res, nil
}

func generateSlug(title string) string {
	slug := strings.ToLower(title)
	reg := regexp.MustCompile("[^a-z0-9]+")
	slug = reg.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "doc"
	}
	return fmt.Sprintf("%s", slug)
}
