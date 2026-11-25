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
	ErrDocNotFound     = errors.New("document not found")
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

	// SyncFromGit creates a backend doc from a GitHub workspace file (idempotent by git_slug + owner).
	// Returns (doc, wasCreated, error). wasCreated=false when an existing doc was returned.
	SyncFromGit(ctx context.Context, ownerID string, req dto.CreateDocFromGitRequest) (*dto.DocDto, bool, error)

	// Sync local <-> backend
	SyncPushLocal(ctx context.Context, ownerID string, req dto.SyncPushRequest) (*dto.SyncPushResult, error)
	SyncPullRemote(ctx context.Context, ownerID string, sinceStr string) (*dto.SyncPullResult, error)
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
	if req.Slug != "" {
		if existing, err := s.docRepo.FindBySlug(ctx, req.Slug); err == nil && existing != nil {
			existing.Title = req.Title
			existing.Content = req.Content
			if req.Status != "" {
				existing.Status = req.Status
			}
			existing.UpdatedAt = time.Now()
			if err := s.docRepo.UpdateDoc(ctx, existing); err != nil {
				return nil, err
			}
			result := dto.ToDocDto(existing)
			return &result, nil
		}
	}

	docID := uuid.New().String()
	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = generateSlug(req.Title) + "-" + docID[:8]
	}

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
		// Keep existing slug stable (e.g. "doc-180015" or Git-linked slug) so Git/SQLite links never drift on rename.
		if doc.Slug == "" {
			doc.Slug = generateSlug(doc.Title) + "-" + doc.ID[:8]
		}
	}
	if req.Slug != nil {
		newSlug := strings.TrimSpace(*req.Slug)
		if newSlug != "" && newSlug != doc.Slug {
			if conflict, err := s.docRepo.FindBySlug(ctx, newSlug); err == nil && conflict == nil {
				doc.Slug = newSlug
			}
		}
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

func (s *docsServiceImpl) SyncFromGit(ctx context.Context, ownerID string, req dto.CreateDocFromGitRequest) (*dto.DocDto, bool, error) {
	var bySlug *domain.Doc
	var byID *domain.Doc

	if req.GitSlug != "" {
		if found, err := s.docRepo.FindBySlug(ctx, req.GitSlug); err == nil && found != nil {
			bySlug = found
		} else if found, err := s.docRepo.FindByID(ctx, req.GitSlug); err == nil && found != nil {
			bySlug = found
		}
	}
	if req.BackendID != "" {
		if found, err := s.docRepo.FindByID(ctx, req.BackendID); err == nil && found != nil {
			byID = found
		}
	}

	// If duplicate records exist (one by GitSlug and one by BackendID), merge and delete the extra one.
	if bySlug != nil && byID != nil && bySlug.ID != byID.ID {
		_ = s.docRepo.DeleteDoc(ctx, byID.ID)
		byID = nil
	}

	existing := bySlug
	if existing == nil {
		existing = byID
	}

	// Fallback: match an orphaned auto-slugged doc with the same owner + title + content
	// created before slug unification so Pull never inserts a duplicate.
	if existing == nil && ownerID != "" && req.Title != "" {
		if allDocs, err := s.docRepo.ListAllDocs(ctx, ownerID, nil); err == nil {
			for i := range allDocs {
				cand := &allDocs[i]
				if len(cand.ID) >= 8 && cand.Title == req.Title && cand.Content == req.Content &&
					strings.HasSuffix(cand.Slug, "-"+cand.ID[:8]) {
					existing = cand
					break
				}
			}
		}
	}

	if existing != nil {
		hasChanges := false
		if req.GitSlug != "" && existing.Slug != req.GitSlug {
			if conflict, err := s.docRepo.FindBySlug(ctx, req.GitSlug); err == nil && conflict == nil {
				existing.Slug = req.GitSlug
				hasChanges = true
			}
		}
		if req.Title != "" && existing.Title != req.Title {
			existing.Title = req.Title
			hasChanges = true
		}
		if req.Content != existing.Content && (req.Content != "" || existing.Content == "") {
			existing.Content = req.Content
			hasChanges = true
		}
		if sStr, ok := req.Status.(string); ok && sStr != "" && string(existing.Status) != sStr {
			existing.Status = domain.DocStatus(sStr)
			hasChanges = true
		}
		if hasChanges {
			existing.UpdatedAt = time.Now()
			if err := s.docRepo.UpdateDoc(ctx, existing); err != nil {
				return nil, false, err
			}
			_, _ = s.CreateRevision(ctx, existing.ID, ownerID, "Synchronized from GitHub workspace", []byte(req.Content))
			result := dto.ToDocDto(existing)
			return &result, true, nil
		}
		result := dto.ToDocDto(existing)
		return &result, false, nil
	}

	docID := uuid.New().String()
	slug := req.GitSlug
	if slug == "" {
		slug = generateSlug(req.Title) + "-" + docID[:8]
	}

	status := domain.DocStatusPublished
	if sStr, ok := req.Status.(string); ok && sStr != "" {
		status = domain.DocStatus(sStr)
	}

	doc := &domain.Doc{
		ID:      docID,
		Title:   req.Title,
		Slug:    slug,
		Content: req.Content,
		Status:  status,
		OwnerID: ownerID,
	}

	if err := s.docRepo.CreateDoc(ctx, doc); err != nil {
		return nil, false, err
	}

	_, _ = s.CreateRevision(ctx, doc.ID, ownerID, "Imported from GitHub workspace", []byte(req.Content))

	result := dto.ToDocDto(doc)
	return &result, true, nil
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

func (s *docsServiceImpl) SyncPushLocal(ctx context.Context, ownerID string, req dto.SyncPushRequest) (*dto.SyncPushResult, error) {
	result := &dto.SyncPushResult{
		Created:   0,
		Updated:   0,
		Skipped:   0,
		Conflicts: []dto.SyncConflictItem{},
		Mapping:   []dto.LocalToBackendIDMapping{},
	}

	for _, item := range req.Items {
		slug := item.LocalID
		if slug == "" {
			continue
		}

		existing, err := s.docRepo.FindBySlug(ctx, slug)
		if err != nil {
			return nil, err
		}

		localTime, _ := time.Parse(time.RFC3339, item.UpdatedAt)

		if existing == nil {
			docID := uuid.New().String()
			status := domain.DocStatusPublished
			if item.Status != "" {
				status = domain.DocStatus(item.Status)
			}
			newDoc := &domain.Doc{
				ID:        docID,
				Title:     item.Title,
				Slug:      slug,
				Content:   item.Content,
				Status:    status,
				OwnerID:   ownerID,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			if err := s.docRepo.CreateDoc(ctx, newDoc); err != nil {
				return nil, err
			}
			_, _ = s.CreateRevision(ctx, newDoc.ID, ownerID, "Synced from local", []byte(item.Content))
			result.Created++
			result.Mapping = append(result.Mapping, dto.LocalToBackendIDMapping{
				LocalID:   item.LocalID,
				BackendID: newDoc.ID,
			})
		} else {
			// So sánh thời gian sửa đổi
			if localTime.After(existing.UpdatedAt) || localTime.Equal(existing.UpdatedAt) {
				existing.Title = item.Title
				existing.Content = item.Content
				if item.Status != "" {
					existing.Status = domain.DocStatus(item.Status)
				}
				existing.UpdatedAt = time.Now()
				if err := s.docRepo.UpdateDoc(ctx, existing); err != nil {
					return nil, err
				}
				_, _ = s.CreateRevision(ctx, existing.ID, ownerID, "Updated from local sync", []byte(item.Content))
				result.Updated++
			} else {
				// Backend có bản mới hơn bản local
				if existing.Content == item.Content {
					result.Skipped++
				} else {
					// Có xung đột (Conflict) -> Cần 3-way merge
					baseContent := ""
					revs, revErr := s.revRepo.GetRevisionsByDocID(ctx, existing.ID)
					if revErr == nil && len(revs) > 0 {
						baseContent = string(revs[len(revs)-1].SnapshotBlob)
					}
					result.Conflicts = append(result.Conflicts, dto.SyncConflictItem{
						LocalID:          item.LocalID,
						BackendID:        existing.ID,
						BaseContent:      baseContent,
						OursContent:      item.Content,
						TheirsContent:    existing.Content,
						BackendUpdatedAt: existing.UpdatedAt,
					})
				}
			}
		}
	}

	return result, nil
}

func (s *docsServiceImpl) SyncPullRemote(ctx context.Context, ownerID string, sinceStr string) (*dto.SyncPullResult, error) {
	var since *time.Time
	if sinceStr != "" {
		if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			since = &t
		}
	}

	docs, err := s.docRepo.ListAllDocs(ctx, ownerID, since)
	if err != nil {
		return nil, err
	}

	// Deduplicate legacy duplicate pairs (one with "doc-<num>" slug, one auto-slugged "<title>-<uuid8>")
	canonicalByKey := make(map[string]domain.Doc)
	for _, d := range docs {
		if strings.HasPrefix(d.Slug, "doc-") {
			canonicalByKey[d.Title+"\x00"+d.Content] = d
		}
	}

	var items []dto.DocDto
	for _, doc := range docs {
		isAutoSlugged := len(doc.ID) >= 8 && strings.HasSuffix(doc.Slug, "-"+doc.ID[:8])
		if isAutoSlugged {
			if canonical, exists := canonicalByKey[doc.Title+"\x00"+doc.Content]; exists && canonical.ID != doc.ID {
				_ = s.docRepo.DeleteDoc(ctx, doc.ID)
				continue
			}
		}
		items = append(items, dto.ToDocDto(&doc))
	}

	return &dto.SyncPullResult{
		Items: items,
		Total: len(items),
	}, nil
}
