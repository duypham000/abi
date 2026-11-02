package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	docsDto "tomo-backend/internal/modules/docs/dto"
	docsService "tomo-backend/internal/modules/docs/service"
)

// WorkspaceSyncer bridges the GitHub workspace (disk files) and the docs DB.
// It reads the manifest and calls DocsService.SyncFromGit for every doc/canvas
// file on disk, ensuring the DB is a superset of what is in git.
//
// SyncFromGit is idempotent by git_slug so repeated calls are safe.

// syncWorkspaceToDBInternal scans the workspace manifest and ensures all files
// have a corresponding docs DB entry. Called automatically after a successful
// Pull() and can be triggered manually via the HTTP handler.
func (s *gitHubService) syncWorkspaceToDBInternal(ctx context.Context, userID, repoPath string) error {
	if s.docsService == nil {
		return nil // docs service not wired — skip gracefully
	}

	manifest, err := s.manifestMgr.ReadManifest(repoPath)
	if err != nil {
		// Manifest missing or corrupt — rebuild it first, then re-read
		manifest, err = s.manifestMgr.RebuildManifest(repoPath)
		if err != nil {
			return fmt.Errorf("syncWorkspace: cannot read/rebuild manifest: %w", err)
		}
	}

	var syncErrors []string
	for _, item := range manifest.Items {
		if item.Type != "doc" && item.Type != "canvas" {
			continue
		}

		fullPath := filepath.Join(repoPath, filepath.FromSlash(item.Path))
		data, err := os.ReadFile(fullPath)
		if err != nil {
			syncErrors = append(syncErrors, fmt.Sprintf("read %s: %v", item.Path, err))
			continue
		}

		// Parse title/slug/content from the JSON file
		var meta struct {
			Title   string `json:"title"`
			Slug    string `json:"slug"`
			Content string `json:"content"`
			Status  string `json:"status"`
		}
		_ = json.Unmarshal(data, &meta)

		title := meta.Title
		if title == "" {
			title = strings.TrimSuffix(filepath.Base(item.Path), ".json")
		}

		gitSlug := meta.Slug
		if gitSlug == "" {
			gitSlug = strings.TrimSuffix(filepath.Base(item.Path), ".json")
		}

		status := meta.Status
		if status == "" {
			status = "PUBLISHED"
		}

		req := docsDto.CreateDocFromGitRequest{
			Title:   title,
			Content: meta.Content,
			GitSlug: gitSlug,
			Status:  status,
		}

		_, _, syncErr := s.docsService.SyncFromGit(ctx, userID, req)
		if syncErr != nil {
			syncErrors = append(syncErrors, fmt.Sprintf("syncFromGit %s: %v", gitSlug, syncErr))
		}
	}

	if len(syncErrors) > 0 {
		// Non-fatal — log but don't block
		for _, e := range syncErrors {
			_ = e // caller can log via returned error summary
		}
		return fmt.Errorf("syncWorkspace completed with %d error(s): %s", len(syncErrors), strings.Join(syncErrors[:min(3, len(syncErrors))], "; "))
	}
	return nil
}

// SyncWorkspaceToDB is the public entry-point used by the HTTP handler.
func (s *gitHubService) SyncWorkspaceToDB(ctx context.Context, userID string) error {
	repoPath, _, err := s.getRepoPathOrActive(userID, "")
	if err != nil {
		return err
	}
	return s.syncWorkspaceToDBInternal(ctx, userID, repoPath)
}

// SetDocsService wires in the docs service after construction
// (used when circular init ordering prevents constructor injection).
func (s *gitHubService) SetDocsService(ds docsService.DocsService) {
	s.docsService = ds
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

