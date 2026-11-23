package service_test

import (
	"bytes"
	"context"
	"testing"

	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/repository"
	"tomo-backend/internal/modules/docs/service"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestCanvasService(t *testing.T) (service.CanvasService, service.YjsService) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:canvas_service_test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open memory db: %v", err)
	}
	if err := db.AutoMigrate(&domain.Doc{}, &domain.Canvas{}, &domain.DocRevision{}, &domain.YjsUpdate{}); err != nil {
		t.Fatalf("Failed to migrate: %v", err)
	}

	docRepo := repository.NewDocRepository(db)
	canvasRepo := repository.NewCanvasRepository(db)
	revRepo := repository.NewRevisionRepository(db)
	yjsRepo := repository.NewYjsRepository(db)

	canvasService := service.NewCanvasService(canvasRepo)
	yjsService := service.NewYjsService(docRepo, yjsRepo, revRepo, "test-yjs-secret")
	yjsService.SetCanvasRepo(canvasRepo)
	return canvasService, yjsService
}

func TestCanvasService_CRUDAndSnapshots(t *testing.T) {
	canvasService, yjsService := setupTestCanvasService(t)
	ctx := context.Background()
	ownerID := "user-canvas-1"

	created, err := canvasService.CreateCanvas(ctx, ownerID, dto.CreateCanvasRequest{
		Title: "Architecture Flow",
	})
	if err != nil {
		t.Fatalf("CreateCanvas failed: %v", err)
	}
	if created.ID == "" || created.Slug == "" {
		t.Fatalf("Expected non-empty ID and slug, got %+v", created)
	}

	// Find by raw ID, canvas- prefixed ID, and slug
	byID, err := canvasService.GetCanvasByID(ctx, created.ID)
	if err != nil || byID.Title != "Architecture Flow" {
		t.Fatalf("GetCanvasByID failed: %v", err)
	}
	byPrefixed, err := canvasService.GetCanvasByID(ctx, "canvas-"+created.ID)
	if err != nil || byPrefixed.ID != created.ID {
		t.Fatalf("GetCanvasByID with canvas- prefix failed: %v", err)
	}
	bySlug, err := canvasService.GetCanvasByID(ctx, created.Slug)
	if err != nil || bySlug.ID != created.ID {
		t.Fatalf("GetCanvasByID by slug failed: %v", err)
	}

	newTitle := "Architecture Flow v2"
	newScene := `{"elements":[{"id":"r1","type":"rectangle"}],"appState":{},"files":{}}`
	updated, err := canvasService.UpdateCanvas(ctx, created.ID, ownerID, dto.UpdateCanvasRequest{
		Title: &newTitle,
		Scene: &newScene,
	})
	if err != nil || updated.Title != newTitle || updated.Scene != newScene {
		t.Fatalf("UpdateCanvas failed: %v %+v", err, updated)
	}

	list, err := canvasService.ListCanvases(ctx, ownerID, 1, 10, "v2")
	if err != nil || list.TotalItems != 1 {
		t.Fatalf("ListCanvases failed: %v total=%v", err, list)
	}

	// Binary Yjs snapshot through YjsService
	blob := []byte{0x00, 0x01, 0x02, 0xFE}
	if err := yjsService.SaveCanvasSnapshotBinary(ctx, "canvas-"+created.ID, blob, ""); err != nil {
		t.Fatalf("SaveCanvasSnapshotBinary failed: %v", err)
	}
	gotBlob, err := yjsService.GetCanvasSnapshotBinary(ctx, created.ID)
	if err != nil || !bytes.Equal(gotBlob, blob) {
		t.Fatalf("GetCanvasSnapshotBinary mismatch: err=%v got=%v", err, gotBlob)
	}
	gotSV, err := yjsService.GetCanvasStateVectorBinary(ctx, created.ID)
	if err != nil || !bytes.Equal(gotSV, blob) {
		t.Fatalf("GetCanvasStateVectorBinary mismatch: err=%v got=%v", err, gotSV)
	}

	if err := canvasService.DeleteCanvas(ctx, created.ID, ownerID); err != nil {
		t.Fatalf("DeleteCanvas failed: %v", err)
	}
	if _, err := canvasService.GetCanvasByID(ctx, created.ID); err != service.ErrCanvasNotFound {
		t.Fatalf("Expected ErrCanvasNotFound after delete, got %v", err)
	}
}
