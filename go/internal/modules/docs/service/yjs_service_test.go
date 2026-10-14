package service_test

import (
	"context"
	"encoding/base64"
	"testing"

	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/repository"
	"tomo-backend/internal/modules/docs/service"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestYjsService(t *testing.T) (service.YjsService, service.DocsService, *gorm.DB) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open memory db: %v", err)
	}

	_ = db.AutoMigrate(&domain.Doc{}, &domain.DocRevision{}, &domain.YjsUpdate{})

	docRepo := repository.NewDocRepository(db)
	revRepo := repository.NewRevisionRepository(db)
	yjsRepo := repository.NewYjsRepository(db)

	docsService := service.NewDocsService(docRepo, revRepo)
	yjsService := service.NewYjsService(docRepo, yjsRepo, revRepo, "test-yjs-secret-key")

	return yjsService, docsService, db
}

func TestYjsService_TokenAndPermission(t *testing.T) {
	yjsService, docsService, _ := setupTestYjsService(t)
	ctx := context.Background()

	ownerID := "user-yjs-owner"
	doc, err := docsService.CreateDoc(ctx, ownerID, dto.CreateDocRequest{
		Title:   "Yjs Document",
		Content: "Initial Yjs Content",
	})
	if err != nil {
		t.Fatalf("Failed to create doc: %v", err)
	}

	// 1. Generate Yjs Token
	tokenRes, err := yjsService.GenerateYjsToken(ctx, ownerID, dto.YjsTokenRequest{
		DocID:      doc.ID,
		AccessMode: domain.YjsAccessWrite,
	})
	if err != nil {
		t.Fatalf("Failed to generate Yjs token: %v", err)
	}

	if tokenRes.Token == "" || tokenRes.DocID != doc.ID {
		t.Fatalf("Generated token output invalid")
	}

	// 2. Check Permission
	permRes, err := yjsService.CheckPermission(ctx, tokenRes.Token)
	if err != nil {
		t.Fatalf("Failed to check permission: %v", err)
	}

	if !permRes.Allowed || permRes.DocID != doc.ID || permRes.AccessMode != domain.YjsAccessWrite {
		t.Errorf("Permission response invalid: %+v", permRes)
	}

	// 3. Check invalid token
	invalidPerm, _ := yjsService.CheckPermission(ctx, "invalid.jwt.token")
	if invalidPerm.Allowed {
		t.Errorf("Expected allowed to be false for invalid token")
	}
}

func TestYjsService_SaveUpdateAndSnapshot(t *testing.T) {
	yjsService, docsService, _ := setupTestYjsService(t)
	ctx := context.Background()
	ownerID := "user-yjs-storage"

	doc, _ := docsService.CreateDoc(ctx, ownerID, dto.CreateDocRequest{
		Title: "Storage Doc",
	})

	// 1. Save Binary Update
	binaryData := []byte{0x01, 0x02, 0x03, 0x04, 0x05}
	updateB64 := base64.StdEncoding.EncodeToString(binaryData)

	err := yjsService.SaveUpdate(ctx, doc.ID, dto.YjsUpdateRequest{
		UpdateBase64: updateB64,
		ClientID:     9999,
	})
	if err != nil {
		t.Fatalf("Failed to save Yjs update: %v", err)
	}

	// 2. Save Snapshot State Vector
	stateVector := []byte{0xDE, 0xAD, 0xBE, 0xEF}
	svB64 := base64.StdEncoding.EncodeToString(stateVector)

	snapRes, err := yjsService.SaveSnapshot(ctx, doc.ID, dto.YjsSnapshotRequest{
		StateVectorBase64: svB64,
	})
	if err != nil {
		t.Fatalf("Failed to save snapshot: %v", err)
	}
	if snapRes.StateVectorBase64 != svB64 {
		t.Errorf("Expected snapshot base64 %s, got %s", svB64, snapRes.StateVectorBase64)
	}

	// 3. Get Snapshot
	fetchedSnap, err := yjsService.GetSnapshot(ctx, doc.ID)
	if err != nil {
		t.Fatalf("Failed to get snapshot: %v", err)
	}
	if fetchedSnap.StateVectorBase64 != svB64 {
		t.Errorf("Fetched snapshot base64 mismatch")
	}
}

func TestYjsService_ReconstructDocument(t *testing.T) {
	yjsService, docsService, _ := setupTestYjsService(t)
	ctx := context.Background()
	ownerID := "user-yjs-reconstruct"

	doc, _ := docsService.CreateDoc(ctx, ownerID, dto.CreateDocRequest{
		Title:   "Reconstruct Doc",
		Content: "Initial version",
	})

	// Reconstruct version 1 (created on doc init)
	reconRes, err := yjsService.ReconstructDocument(ctx, doc.ID, 1)
	if err != nil {
		t.Fatalf("Failed to reconstruct version 1: %v", err)
	}

	if reconRes.DocID != doc.ID || reconRes.Version != 1 {
		t.Errorf("Reconstructed document mismatch: %+v", reconRes)
	}
}
