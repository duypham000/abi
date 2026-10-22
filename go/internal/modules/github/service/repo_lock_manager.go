package service

import (
	"path/filepath"
	"strings"
	"sync"
)

type RepoLockManager struct {
	mu    sync.Mutex
	locks map[string]*sync.RWMutex
}

func NewRepoLockManager() *RepoLockManager {
	return &RepoLockManager{
		locks: make(map[string]*sync.RWMutex),
	}
}

func (m *RepoLockManager) getLock(repoPath string) *sync.RWMutex {
	normalized := filepath.Clean(strings.ToLower(repoPath))
	m.mu.Lock()
	defer m.mu.Unlock()

	l, exists := m.locks[normalized]
	if !exists {
		l = &sync.RWMutex{}
		m.locks[normalized] = l
	}
	return l
}

// RLock acquires a read lock for the repository and returns an unlock function.
func (m *RepoLockManager) RLock(repoPath string) func() {
	l := m.getLock(repoPath)
	l.RLock()
	var once sync.Once
	return func() {
		once.Do(func() {
			l.RUnlock()
		})
	}
}

// Lock acquires an exclusive write lock for the repository and returns an unlock function.
func (m *RepoLockManager) Lock(repoPath string) func() {
	l := m.getLock(repoPath)
	l.Lock()
	var once sync.Once
	return func() {
		once.Do(func() {
			l.Unlock()
		})
	}
}
