package service

import (
	"context"
	"encoding/base64"
	"errors"
	"time"

	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/repository"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrYjsTokenInvalid = errors.New("invalid Yjs access token")
)

type YjsClaims struct {
	DocID      string               `json:"doc_id"`
	UserID     string               `json:"user_id"`
	AccessMode domain.YjsAccessMode `json:"access_mode"`
	jwt.RegisteredClaims
}

type YjsService interface {
	GenerateYjsToken(ctx context.Context, userID string, req dto.YjsTokenRequest) (*dto.YjsTokenResponse, error)
	CheckPermission(ctx context.Context, tokenStr string) (*dto.YjsPermResponse, error)
	SaveUpdate(ctx context.Context, docID string, req dto.YjsUpdateRequest) error
	SaveSnapshot(ctx context.Context, docID string, req dto.YjsSnapshotRequest) (*dto.YjsSnapshotResponse, error)
	GetSnapshot(ctx context.Context, docID string) (*dto.YjsSnapshotResponse, error)
	ReconstructDocument(ctx context.Context, docID string, version int) (*dto.ReconstructResponse, error)
	
	// tomo-node integration methods
	GetRevisionHead(ctx context.Context, docID string) (*dto.YjsRevisionHeadResponse, error)
	AppendInternalRevision(ctx context.Context, docID string, stateVectorB64 string, isKeyframe bool, baseVersion *int, blob []byte) error
	GetRevisionChain(ctx context.Context, docID string, revisionID int) (*dto.YjsRevisionChainResponse, error)
	UpdateDocMeta(ctx context.Context, docID string, plainText string) error
}

type yjsServiceImpl struct {
	docRepo   repository.DocRepository
	yjsRepo   repository.YjsRepository
	revRepo   repository.RevisionRepository
	yjsSecret []byte
}

func NewYjsService(docRepo repository.DocRepository, yjsRepo repository.YjsRepository, revRepo repository.RevisionRepository, yjsSecret string) YjsService {
	return &yjsServiceImpl{
		docRepo:   docRepo,
		yjsRepo:   yjsRepo,
		revRepo:   revRepo,
		yjsSecret: []byte(yjsSecret),
	}
}

func (s *yjsServiceImpl) GenerateYjsToken(ctx context.Context, userID string, req dto.YjsTokenRequest) (*dto.YjsTokenResponse, error) {
	targetID := req.DocID
	if targetID == "" && req.CanvasID != "" {
		targetID = "canvas-" + req.CanvasID
	}

	mode := req.AccessMode
	isCanvas := strings.HasPrefix(targetID, "canvas-") || req.CanvasID != ""

	if !isCanvas {
		doc, err := s.docRepo.FindByID(ctx, targetID)
		if err != nil || doc == nil {
			return nil, ErrDocNotFound
		}

		if mode == "" {
			if doc.OwnerID == userID {
				mode = domain.YjsAccessWrite
			} else {
				mode = domain.YjsAccessRead
			}
		}
	} else {
		if mode == "" {
			mode = domain.YjsAccessWrite
		}
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	claims := YjsClaims{
		DocID:      targetID,
		UserID:     userID,
		AccessMode: mode,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID,
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(s.yjsSecret)
	if err != nil {
		return nil, err
	}

	return &dto.YjsTokenResponse{
		Token:      tokenStr,
		DocID:      targetID,
		AccessMode: mode,
		ExpiresAt:  expiresAt,
		Url:        "ws://127.0.0.1:1234/ws/yjs",
		ExpiresIn:  86400,
	}, nil
}

func (s *yjsServiceImpl) CheckPermission(ctx context.Context, tokenStr string) (*dto.YjsPermResponse, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &YjsClaims{}, func(t *jwt.Token) (interface{}, error) {
		return s.yjsSecret, nil
	})

	if err != nil || !token.Valid {
		return &dto.YjsPermResponse{Allowed: false}, nil
	}

	claims, ok := token.Claims.(*YjsClaims)
	if !ok {
		return &dto.YjsPermResponse{Allowed: false}, nil
	}

	return &dto.YjsPermResponse{
		Allowed:    true,
		DocID:      claims.DocID,
		UserID:     claims.UserID,
		AccessMode: claims.AccessMode,
	}, nil
}

func (s *yjsServiceImpl) SaveUpdate(ctx context.Context, docID string, req dto.YjsUpdateRequest) error {
	rawBytes, err := base64.StdEncoding.DecodeString(req.UpdateBase64)
	if err != nil {
		return errors.New("invalid base64 binary update data")
	}

	update := &domain.YjsUpdate{
		ID:         uuid.New().String(),
		DocID:      docID,
		UpdateData: rawBytes,
		ClientID:   req.ClientID,
	}

	return s.yjsRepo.SaveUpdate(ctx, update)
}

func (s *yjsServiceImpl) SaveSnapshot(ctx context.Context, docID string, req dto.YjsSnapshotRequest) (*dto.YjsSnapshotResponse, error) {
	rawBytes, err := base64.StdEncoding.DecodeString(req.StateVectorBase64)
	if err != nil {
		return nil, errors.New("invalid base64 state vector")
	}

	doc, err := s.docRepo.FindByID(ctx, docID)
	if err != nil || doc == nil {
		return nil, ErrDocNotFound
	}

	doc.YjsStateVector = rawBytes
	doc.UpdatedAt = time.Now()

	if err := s.docRepo.UpdateDoc(ctx, doc); err != nil {
		return nil, err
	}

	return &dto.YjsSnapshotResponse{
		DocID:             docID,
		StateVectorBase64: req.StateVectorBase64,
		UpdatedAt:         doc.UpdatedAt,
	}, nil
}

func (s *yjsServiceImpl) GetSnapshot(ctx context.Context, docID string) (*dto.YjsSnapshotResponse, error) {
	doc, err := s.docRepo.FindByID(ctx, docID)
	if err != nil || doc == nil {
		return nil, ErrDocNotFound
	}

	stateVectorBase64 := ""
	if len(doc.YjsStateVector) > 0 {
		stateVectorBase64 = base64.StdEncoding.EncodeToString(doc.YjsStateVector)
	}

	return &dto.YjsSnapshotResponse{
		DocID:             docID,
		StateVectorBase64: stateVectorBase64,
		UpdatedAt:         doc.UpdatedAt,
	}, nil
}

func (s *yjsServiceImpl) ReconstructDocument(ctx context.Context, docID string, version int) (*dto.ReconstructResponse, error) {
	rev, err := s.revRepo.GetRevisionByVersion(ctx, docID, version)
	if err != nil || rev == nil {
		return nil, errors.New("revision version not found")
	}

	stateVectorBase64 := base64.StdEncoding.EncodeToString(rev.SnapshotBlob)

	return &dto.ReconstructResponse{
		DocID:             docID,
		Version:           version,
		StateVectorBase64: stateVectorBase64,
		ReconstructedAt:   time.Now(),
	}, nil
}

func (s *yjsServiceImpl) GetRevisionHead(ctx context.Context, docID string) (*dto.YjsRevisionHeadResponse, error) {
	revs, err := s.revRepo.GetRevisionsByDocID(ctx, docID)
	if err != nil || len(revs) == 0 {
		return nil, nil // Return nil for 204 No Content
	}

	latest := revs[0]
	stateVectorB64 := ""
	if len(latest.SnapshotBlob) > 0 {
		stateVectorB64 = base64.StdEncoding.EncodeToString(latest.SnapshotBlob)
	}

	return &dto.YjsRevisionHeadResponse{
		VersionNumber:          latest.Version,
		StateVector:            stateVectorB64,
		RevisionsSinceKeyframe: len(revs),
	}, nil
}

func (s *yjsServiceImpl) AppendInternalRevision(ctx context.Context, docID string, stateVectorB64 string, isKeyframe bool, baseVersion *int, blob []byte) error {
	latestVer, err := s.revRepo.GetLatestVersion(ctx, docID)
	if err != nil {
		latestVer = 0
	}

	doc, err := s.docRepo.FindByID(ctx, docID)
	authorID := "system"
	if doc != nil {
		authorID = doc.OwnerID
	}

	summary := "Yjs delta update"
	if isKeyframe {
		summary = "Yjs keyframe snapshot"
	}

	rev := &domain.DocRevision{
		ID:             uuid.New().String(),
		DocID:          docID,
		Version:        latestVer + 1,
		SnapshotBlob:   blob,
		ChangesSummary: summary,
		AuthorID:       authorID,
	}

	return s.revRepo.SaveRevision(ctx, rev)
}

func (s *yjsServiceImpl) GetRevisionChain(ctx context.Context, docID string, revisionID int) (*dto.YjsRevisionChainResponse, error) {
	revs, err := s.revRepo.GetRevisionsByDocID(ctx, docID)
	if err != nil || len(revs) == 0 {
		return nil, errors.New("no revision chain found")
	}

	var updates []string
	for _, rev := range revs {
		if len(rev.SnapshotBlob) > 0 {
			updates = append(updates, base64.StdEncoding.EncodeToString(rev.SnapshotBlob))
		}
	}

	return &dto.YjsRevisionChainResponse{Updates: updates}, nil
}

func (s *yjsServiceImpl) UpdateDocMeta(ctx context.Context, docID string, plainText string) error {
	doc, err := s.docRepo.FindByID(ctx, docID)
	if err != nil || doc == nil {
		return ErrDocNotFound
	}

	doc.Content = plainText
	doc.UpdatedAt = time.Now()
	return s.docRepo.UpdateDoc(ctx, doc)
}
