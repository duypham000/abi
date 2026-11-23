package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"tomo-backend/internal/modules/docs/dto"
)

func (s *Server) listResources(ctx context.Context, userID string) (*ListResourcesResult, error) {
	resources := []Resource{}

	docsPage, err := s.docsService.ListDocs(ctx, userID, nil, 1, 50, "")
	if err == nil && docsPage != nil {
		if items, ok := docsPage.Items.([]dto.DocDto); ok {
			for _, d := range items {
				resources = append(resources, Resource{
					URI:         "tomo://docs/" + d.ID,
					Name:        d.Title,
					Description: fmt.Sprintf("Document (%s) slug=%s", d.Status, d.Slug),
					MimeType:    "application/json",
				})
			}
		}
	}

	canvasesPage, err := s.canvasService.ListCanvases(ctx, userID, 1, 50, "")
	if err == nil && canvasesPage != nil {
		if items, ok := canvasesPage.Items.([]dto.CanvasDto); ok {
			for _, c := range items {
				resources = append(resources, Resource{
					URI:         "tomo://canvases/" + c.ID,
					Name:        c.Title,
					Description: fmt.Sprintf("Excalidraw Canvas slug=%s", c.Slug),
					MimeType:    "application/json",
				})
			}
		}
	}

	return &ListResourcesResult{Resources: resources}, nil
}

func (s *Server) listResourceTemplates() *ListResourceTemplatesResult {
	return &ListResourceTemplatesResult{
		ResourceTemplates: []ResourceTemplate{
			{
				URITemplate: "tomo://docs/{id}",
				Name:        "Tomo Document by ID",
				Description: "Read a Tomo document by its UUID or ID",
				MimeType:    "application/json",
			},
			{
				URITemplate: "tomo://docs/slug/{slug}",
				Name:        "Tomo Document by Slug",
				Description: "Read a Tomo document by its unique slug",
				MimeType:    "application/json",
			},
			{
				URITemplate: "tomo://canvases/{id}",
				Name:        "Tomo Canvas by ID",
				Description: "Read an Excalidraw canvas by its ID or slug",
				MimeType:    "application/json",
			},
		},
	}
}

func (s *Server) readResource(ctx context.Context, uri string) (*ReadResourceResult, error) {
	switch {
	case strings.HasPrefix(uri, "tomo://docs/slug/"):
		slug := strings.TrimPrefix(uri, "tomo://docs/slug/")
		doc, err := s.docsService.GetDocBySlug(ctx, slug)
		if err != nil {
			return nil, err
		}
		b, _ := json.MarshalIndent(doc, "", "  ")
		return &ReadResourceResult{
			Contents: []ResourceContent{{URI: uri, MimeType: "application/json", Text: string(b)}},
		}, nil

	case strings.HasPrefix(uri, "tomo://docs/"):
		id := strings.TrimPrefix(uri, "tomo://docs/")
		doc, err := s.docsService.GetDocByID(ctx, id)
		if err != nil {
			return nil, err
		}
		b, _ := json.MarshalIndent(doc, "", "  ")
		return &ReadResourceResult{
			Contents: []ResourceContent{{URI: uri, MimeType: "application/json", Text: string(b)}},
		}, nil

	case strings.HasPrefix(uri, "tomo://canvases/"):
		id := strings.TrimPrefix(uri, "tomo://canvases/")
		c, err := s.canvasService.GetCanvasByID(ctx, id)
		if err != nil {
			return nil, err
		}
		b, _ := json.MarshalIndent(c, "", "  ")
		return &ReadResourceResult{
			Contents: []ResourceContent{{URI: uri, MimeType: "application/json", Text: string(b)}},
		}, nil

	default:
		return nil, fmt.Errorf("unsupported resource URI: %s", uri)
	}
}
