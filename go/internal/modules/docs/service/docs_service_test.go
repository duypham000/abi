package service_test

import (
	"context"
	"testing"

	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/repository"
	"tomo-backend/internal/modules/docs/service"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDocsService(t *testing.T) (service.DocsService, *gorm.DB) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open memory db: %v", err)
	}

	_ = db.AutoMigrate(&domain.Doc{}, &domain.DocRevision{}, &domain.YjsUpdate{})

	docRepo := repository.NewDocRepository(db)
	revRepo := repository.NewRevisionRepository(db)

	docsService := service.NewDocsService(docRepo, revRepo)
	return docsService, db
}

func TestDocsService_CRUD(t *testing.T) {
	docsService, _ := setupTestDocsService(t)
	ctx := context.Background()
	ownerID := "user-owner-1"

	// 1. Create Doc
	createReq := dto.CreateDocRequest{
		Title:   "Go Modular Monolith Architecture",
		Content: "# Overview of Modular Monolith",
		Status:  domain.DocStatusPublished,
	}

	doc, err := docsService.CreateDoc(ctx, ownerID, createReq)
	if err != nil {
		t.Fatalf("Expected no error on CreateDoc, got: %v", err)
	}

	if doc.ID == "" || doc.Slug == "" {
		t.Fatalf("Doc ID and Slug should be generated")
	}
	if doc.OwnerID != ownerID {
		t.Errorf("Expected ownerID %s, got %s", ownerID, doc.OwnerID)
	}

	// 2. Get Doc By ID
	fetched, err := docsService.GetDocByID(ctx, doc.ID)
	if err != nil {
		t.Fatalf("Expected no error on GetDocByID, got: %v", err)
	}
	if fetched.Title != createReq.Title {
		t.Errorf("Expected title %s, got %s", createReq.Title, fetched.Title)
	}

	// 3. Get Doc By Slug
	fetchedSlug, err := docsService.GetDocBySlug(ctx, doc.Slug)
	if err != nil {
		t.Fatalf("Expected no error on GetDocBySlug, got: %v", err)
	}
	if fetchedSlug.ID != doc.ID {
		t.Errorf("Expected ID %s, got %s", doc.ID, fetchedSlug.ID)
	}

	// 4. Update Doc
	newTitle := "Updated Architecture Title"
	newContent := "# Updated Content"
	isPinned := true

	updated, err := docsService.UpdateDoc(ctx, doc.ID, ownerID, dto.UpdateDocRequest{
		Title:    &newTitle,
		Content:  &newContent,
		IsPinned: &isPinned,
	})
	if err != nil {
		t.Fatalf("Expected no error on UpdateDoc, got: %v", err)
	}

	if updated.Title != newTitle || !updated.IsPinned {
		t.Errorf("Updated fields mismatch")
	}

	// 5. Revisions should contain auto snapshot
	revs, err := docsService.GetRevisions(ctx, doc.ID)
	if err != nil {
		t.Fatalf("Failed to fetch revisions: %v", err)
	}
	if len(revs) < 2 {
		t.Errorf("Expected at least 2 revisions (initial + update), got %d", len(revs))
	}

	// 6. Delete Doc
	err = docsService.DeleteDoc(ctx, doc.ID, ownerID)
	if err != nil {
		t.Fatalf("Expected no error on DeleteDoc, got: %v", err)
	}

	_, err = docsService.GetDocByID(ctx, doc.ID)
	if err == nil || err != service.ErrDocNotFound {
		t.Errorf("Expected ErrDocNotFound after deletion, got: %v", err)
	}
}

func TestDocsService_DocTreeHierarchy(t *testing.T) {
	docsService, _ := setupTestDocsService(t)
	ctx := context.Background()
	ownerID := "user-tree-owner"

	// Parent Doc
	parent, err := docsService.CreateDoc(ctx, ownerID, dto.CreateDocRequest{
		Title:   "Root Folder",
		Content: "Root folder doc",
		Status:  domain.DocStatusPublished,
	})
	if err != nil {
		t.Fatalf("Failed to create parent: %v", err)
	}

	// Child Doc 1
	child1, err := docsService.CreateDoc(ctx, ownerID, dto.CreateDocRequest{
		Title:    "Child Doc 1",
		Content:  "Child 1 content",
		ParentID: &parent.ID,
		Status:   domain.DocStatusPublished,
	})
	if err != nil {
		t.Fatalf("Failed to create child 1: %v", err)
	}

	// Child Doc 2
	_, err = docsService.CreateDoc(ctx, ownerID, dto.CreateDocRequest{
		Title:    "Child Doc 2",
		Content:  "Child 2 content",
		ParentID: &parent.ID,
		Status:   domain.DocStatusPublished,
	})
	if err != nil {
		t.Fatalf("Failed to create child 2: %v", err)
	}

	// Fetch Tree
	tree, err := docsService.GetDocTree(ctx, ownerID)
	if err != nil {
		t.Fatalf("Failed to get doc tree: %v", err)
	}

	if len(tree) != 1 {
		t.Fatalf("Expected 1 root node in tree, got %d", len(tree))
	}

	if tree[0].ID != parent.ID {
		t.Errorf("Expected root node ID %s, got %s", parent.ID, tree[0].ID)
	}

	if len(tree[0].Children) != 2 {
		t.Errorf("Expected 2 children under root, got %d", len(tree[0].Children))
	}

	if tree[0].Children[0].ID != child1.ID && tree[0].Children[1].ID != child1.ID {
		t.Errorf("Child 1 not found in tree children")
	}
}
