package dto

import (
	"time"

	"tomo-backend/internal/modules/docs/domain"
)

type YjsTokenRequest struct {
	DocID      string               `json:"doc_id"`
	DocIDCamel string               `json:"docId"`
	AccessMode domain.YjsAccessMode `json:"access_mode"`
}

type YjsTokenResponse struct {
	Token      string               `json:"token"`
	DocID      string               `json:"doc_id"`
	AccessMode domain.YjsAccessMode `json:"access_mode"`
	ExpiresAt  time.Time            `json:"expires_at"`
	Url        string               `json:"url,omitempty"`
	ExpiresIn  int64                `json:"expiresIn,omitempty"`
}

type YjsPermResponse struct {
	Allowed    bool                 `json:"allowed"`
	DocID      string               `json:"doc_id"`
	UserID     string               `json:"user_id"`
	AccessMode domain.YjsAccessMode `json:"access_mode"`
}

type YjsUpdateRequest struct {
	UpdateBase64 string `json:"update_base64" binding:"required"`
	ClientID     int64  `json:"client_id"`
}

type YjsSnapshotRequest struct {
	StateVectorBase64 string `json:"state_vector_base64" binding:"required"`
}

type YjsSnapshotResponse struct {
	DocID             string    `json:"doc_id"`
	StateVectorBase64 string    `json:"state_vector_base64"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type ReconstructResponse struct {
	DocID             string    `json:"doc_id"`
	Version           int       `json:"version"`
	StateVectorBase64 string    `json:"state_vector_base64"`
	ReconstructedAt   time.Time `json:"reconstructed_at"`
}

// tomo-node internal integration DTOs
type YjsRevisionHeadResponse struct {
	VersionNumber          int    `json:"versionNumber"`
	StateVector            string `json:"stateVector"`
	RevisionsSinceKeyframe int    `json:"revisionsSinceKeyframe"`
}

type YjsRevisionChainResponse struct {
	Updates []string `json:"updates"`
}

type YjsMetaRequest struct {
	PlainText string `json:"plainText"`
}
