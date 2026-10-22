package service

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"tomo-backend/internal/modules/github/domain"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type ConflictService struct{}

func NewConflictService() *ConflictService {
	return &ConflictService{}
}

// Extract3WayContent retrieves (ours, theirs, base) content for a specific file
func (cs *ConflictService) Extract3WayContent(
	repo *git.Repository,
	repoPath string,
	relFilePath string,
	remoteName string,
	branch string,
) (*domain.ConflictFileDetail, error) {
	relPath := filepath.ToSlash(filepath.Clean(relFilePath))
	detail := &domain.ConflictFileDetail{
		FilePath: relPath,
	}

	// 1. Ours: Read directly from local working copy
	localDiskPath := filepath.Join(repoPath, filepath.FromSlash(relPath))
	if localBytes, err := os.ReadFile(localDiskPath); err == nil {
		detail.OursContent = string(localBytes)
	}

	// 2. Head commit
	headRef, err := repo.Head()
	if err != nil {
		return detail, nil
	}
	headCommit, err := repo.CommitObject(headRef.Hash())
	if err != nil {
		return detail, nil
	}

	// 3. Remote commit
	if remoteName == "" {
		remoteName = "origin"
	}
	if branch == "" {
		branch = headRef.Name().Short()
	}

	remoteRefName := plumbing.ReferenceName("refs/remotes/" + remoteName + "/" + branch)
	remoteRef, err := repo.Reference(remoteRefName, true)
	if err != nil {
		// Try without refs/remotes
		remoteRef, err = repo.Reference(plumbing.ReferenceName(remoteName+"/"+branch), true)
	}

	var remoteCommit *object.Commit
	if err == nil && remoteRef != nil {
		remoteCommit, _ = repo.CommitObject(remoteRef.Hash())
	}

	// Read theirs from remote commit tree
	if remoteCommit != nil {
		if file, err := remoteCommit.File(relPath); err == nil {
			if reader, err := file.Reader(); err == nil {
				theirsBytes, _ := io.ReadAll(reader)
				_ = reader.Close()
				detail.TheirsContent = string(theirsBytes)
			}
		}

		// 4. Base: Find common ancestor (merge-base)
		bases, err := headCommit.MergeBase(remoteCommit)
		if err == nil && len(bases) > 0 {
			baseCommit := bases[0]
			if file, err := baseCommit.File(relPath); err == nil {
				if reader, err := file.Reader(); err == nil {
					baseBytes, _ := io.ReadAll(reader)
					_ = reader.Close()
					detail.BaseContent = string(baseBytes)
				}
			}
		}
	}

	// Check if there is actual conflict
	detail.HasConflict = detail.OursContent != detail.TheirsContent && detail.TheirsContent != ""
	return detail, nil
}

// ResolveConflict applies the chosen resolution strategy and stages the file
func (cs *ConflictService) ResolveConflict(
	repo *git.Repository,
	repoPath string,
	relFilePath string,
	strategy domain.ResolutionStrategy,
	resolvedContent string,
	theirsContent string,
) error {
	wt, err := repo.Worktree()
	if err != nil {
		return err
	}

	relPath := filepath.ToSlash(filepath.Clean(relFilePath))
	targetPath := filepath.Join(repoPath, filepath.FromSlash(relPath))

	switch strategy {
	case domain.ResolutionOurs:
		// File on disk is already ours, ensure trailing newline
		data, err := os.ReadFile(targetPath)
		if err != nil {
			return err
		}
		if len(data) > 0 && data[len(data)-1] != '\n' {
			data = append(data, '\n')
			_ = os.WriteFile(targetPath, data, 0644)
		}

	case domain.ResolutionTheirs:
		if theirsContent == "" {
			return errors.New("theirs content is empty, cannot apply resolution")
		}
		if !strings.HasSuffix(theirsContent, "\n") {
			theirsContent += "\n"
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(targetPath, []byte(theirsContent), 0644); err != nil {
			return err
		}

	case domain.ResolutionManual:
		if resolvedContent == "" {
			return errors.New("manual resolution requires resolved_content")
		}
		if !strings.HasSuffix(resolvedContent, "\n") {
			resolvedContent += "\n"
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(targetPath, []byte(resolvedContent), 0644); err != nil {
			return err
		}

	default:
		return errors.New("invalid resolution strategy, must be 'ours', 'theirs', or 'manual'")
	}

	// Stage the resolved file
	_, err = wt.Add(relPath)
	return err
}
