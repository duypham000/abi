package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"tomo-backend/internal/modules/github/domain"
)

const (
	CacheMetadataFileName = ".cache_metadata.json"
)

type CacheManager struct {
	ttl time.Duration
	mu  sync.Mutex
}

func NewCacheManager(ttlHours int) *CacheManager {
	if ttlHours <= 0 {
		ttlHours = 24
	}
	return &CacheManager{
		ttl: time.Duration(ttlHours) * time.Hour,
	}
}

type MetadataFile struct {
	Entries map[string]domain.CacheEntry `json:"entries"`
}

func (cm *CacheManager) getMetadataFilePath(repoPath string) string {
	return filepath.Join(repoPath, CacheMetadataFileName)
}

func (cm *CacheManager) readMetadata(repoPath string) (*MetadataFile, error) {
	metaPath := cm.getMetadataFilePath(repoPath)
	data, err := os.ReadFile(metaPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &MetadataFile{Entries: make(map[string]domain.CacheEntry)}, nil
		}
		return nil, err
	}
	var mf MetadataFile
	if err := json.Unmarshal(data, &mf); err != nil {
		return &MetadataFile{Entries: make(map[string]domain.CacheEntry)}, nil
	}
	if mf.Entries == nil {
		mf.Entries = make(map[string]domain.CacheEntry)
	}
	return &mf, nil
}

func (cm *CacheManager) writeMetadata(repoPath string, mf *MetadataFile) error {
	metaPath := cm.getMetadataFilePath(repoPath)
	data, err := json.MarshalIndent(mf, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(metaPath, data, 0644)
}

func (cm *CacheManager) RecordAccess(repoPath, relFilePath, commitSHA string, isDirty bool) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	mf, err := cm.readMetadata(repoPath)
	if err != nil {
		return err
	}

	normalized := filepath.ToSlash(filepath.Clean(relFilePath))
	now := time.Now()
	mf.Entries[normalized] = domain.CacheEntry{
		FilePath:     normalized,
		CommitSHA:    commitSHA,
		LastAccessed: now,
		ExpiresAt:    now.Add(cm.ttl),
		IsDirty:      isDirty,
	}

	return cm.writeMetadata(repoPath, mf)
}

func (cm *CacheManager) IsFresh(repoPath, relFilePath string) bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	fullPath := filepath.Join(repoPath, filepath.FromSlash(relFilePath))
	if _, err := os.Stat(fullPath); err != nil {
		return false
	}

	mf, err := cm.readMetadata(repoPath)
	if err != nil {
		return false
	}

	normalized := filepath.ToSlash(filepath.Clean(relFilePath))
	entry, exists := mf.Entries[normalized]
	if !exists {
		return false
	}

	return time.Now().Before(entry.ExpiresAt)
}

func (cm *CacheManager) GetEntry(repoPath, relFilePath string) (*domain.CacheEntry, bool) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	mf, err := cm.readMetadata(repoPath)
	if err != nil {
		return nil, false
	}

	normalized := filepath.ToSlash(filepath.Clean(relFilePath))
	entry, exists := mf.Entries[normalized]
	if !exists {
		return nil, false
	}
	return &entry, true
}

func (cm *CacheManager) PruneExpired(repoPath string, isDirtyChecker func(relPath string) bool) ([]string, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	mf, err := cm.readMetadata(repoPath)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var pruned []string
	for relPath, entry := range mf.Entries {
		if now.After(entry.ExpiresAt) {
			// CRITICAL: NEVER delete dirty/uncommitted files
			if isDirtyChecker != nil && isDirtyChecker(relPath) {
				continue
			}

			fullPath := filepath.Join(repoPath, filepath.FromSlash(relPath))
			if err := os.Remove(fullPath); err == nil || os.IsNotExist(err) {
				pruned = append(pruned, relPath)
				delete(mf.Entries, relPath)
			}
		}
	}

	if len(pruned) > 0 {
		_ = cm.writeMetadata(repoPath, mf)
	}

	return pruned, nil
}
