package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"tomo-backend/internal/modules/github/domain"
)

const (
	ManifestDirName  = ".tomo"
	ManifestFileName = "manifest.json"
)

type ManifestManager struct {
	mu sync.RWMutex
}

func NewManifestManager() *ManifestManager {
	return &ManifestManager{}
}

func (mm *ManifestManager) getManifestPath(repoPath string) string {
	return filepath.Join(repoPath, ManifestDirName, ManifestFileName)
}

func (mm *ManifestManager) ReadManifest(repoPath string) (*domain.WorkspaceManifest, error) {
	mm.mu.RLock()
	defer mm.mu.RUnlock()

	p := mm.getManifestPath(repoPath)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return mm.rebuildManifestNoLock(repoPath)
		}
		return nil, err
	}

	var m domain.WorkspaceManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return mm.rebuildManifestNoLock(repoPath)
	}
	if m.Items == nil {
		m.Items = []domain.ManifestItem{}
	}
	return &m, nil
}

func (mm *ManifestManager) WriteManifest(repoPath string, m *domain.WorkspaceManifest) error {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	return mm.writeManifestNoLock(repoPath, m)
}

func (mm *ManifestManager) writeManifestNoLock(repoPath string, m *domain.WorkspaceManifest) error {
	dir := filepath.Join(repoPath, ManifestDirName)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	m.UpdatedAt = time.Now()
	docsCount := 0
	canvasCount := 0
	for _, item := range m.Items {
		if item.Type == "doc" {
			docsCount++
		} else if item.Type == "canvas" {
			canvasCount++
		}
	}
	m.TotalDocs = docsCount
	m.TotalCanvases = canvasCount

	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(mm.getManifestPath(repoPath), data, 0644)
}

func (mm *ManifestManager) UpdateItem(repoPath string, item domain.ManifestItem) error {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	p := mm.getManifestPath(repoPath)
	m := &domain.WorkspaceManifest{
		Version: "1.0",
		Items:   []domain.ManifestItem{},
	}
	if data, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(data, m)
	}

	normalizedPath := filepath.ToSlash(filepath.Clean(item.Path))
	item.Path = normalizedPath
	if item.UpdatedAt.IsZero() {
		item.UpdatedAt = time.Now()
	}

	found := false
	for i, it := range m.Items {
		if it.Path == normalizedPath {
			m.Items[i] = item
			found = true
			break
		}
	}
	if !found {
		m.Items = append(m.Items, item)
	}

	return mm.writeManifestNoLock(repoPath, m)
}

func (mm *ManifestManager) RemoveItem(repoPath, relPath string) error {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	p := mm.getManifestPath(repoPath)
	data, err := os.ReadFile(p)
	if err != nil {
		return nil
	}

	var m domain.WorkspaceManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil
	}

	normalizedPath := filepath.ToSlash(filepath.Clean(relPath))
	var newItems []domain.ManifestItem
	for _, it := range m.Items {
		if it.Path != normalizedPath {
			newItems = append(newItems, it)
		}
	}
	m.Items = newItems
	return mm.writeManifestNoLock(repoPath, &m)
}

func (mm *ManifestManager) RebuildManifest(repoPath string) (*domain.WorkspaceManifest, error) {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	return mm.rebuildManifestNoLock(repoPath)
}

func (mm *ManifestManager) rebuildManifestNoLock(repoPath string) (*domain.WorkspaceManifest, error) {
	manifest := &domain.WorkspaceManifest{
		Version:   "1.0",
		UpdatedAt: time.Now(),
		Items:     []domain.ManifestItem{},
	}

	scanDir := func(subDir, itemType string) {
		fullSub := filepath.Join(repoPath, subDir)
		entries, err := os.ReadDir(fullSub)
		if err != nil {
			return
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			filePath := filepath.Join(fullSub, e.Name())
			info, err := e.Info()
			if err != nil {
				continue
			}
			relPath := filepath.ToSlash(filepath.Join(subDir, e.Name()))

			id := strings.TrimSuffix(e.Name(), ".json")
			title := id
			slug := id

			// Attempt quick JSON parse for title/id
			if data, err := os.ReadFile(filePath); err == nil {
				var docMeta struct {
					ID    interface{} `json:"id"`
					Title string      `json:"title"`
					Slug  string      `json:"slug"`
				}
				if json.Unmarshal(data, &docMeta) == nil {
					if docMeta.Title != "" {
						title = docMeta.Title
					}
					if docMeta.Slug != "" {
						slug = docMeta.Slug
					}
				}
			}

			manifest.Items = append(manifest.Items, domain.ManifestItem{
				ID:        id,
				Type:      itemType,
				Path:      relPath,
				Title:     title,
				Slug:      slug,
				Size:      info.Size(),
				UpdatedAt: info.ModTime(),
			})
		}
	}

	scanDir("docs", "doc")
	scanDir("canvases", "canvas")

	_ = mm.writeManifestNoLock(repoPath, manifest)
	return manifest, nil
}
