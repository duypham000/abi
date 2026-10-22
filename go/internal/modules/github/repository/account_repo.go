package repository

import (
	"tomo-backend/internal/modules/github/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type GithubAccountRepository interface {
	Save(account *domain.GithubAccount) error
	FindByUserID(userID string) (*domain.GithubAccount, error)
	DeleteByUserID(userID string) error
	UpdateActiveRepo(userID, owner, name, branch, url, workspacePath string) error
}

type gormGithubAccountRepo struct {
	db *gorm.DB
}

func NewGithubAccountRepository(db *gorm.DB) GithubAccountRepository {
	return &gormGithubAccountRepo{db: db}
}

func (r *gormGithubAccountRepo) Save(account *domain.GithubAccount) error {
	// Upsert on user_id
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"username", "email", "name", "avatar_url", "token", "token_preview", "scopes", "updated_at",
		}),
	}).Create(account).Error
}

func (r *gormGithubAccountRepo) FindByUserID(userID string) (*domain.GithubAccount, error) {
	var account domain.GithubAccount
	err := r.db.Where("user_id = ?", userID).First(&account).Error
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func (r *gormGithubAccountRepo) DeleteByUserID(userID string) error {
	return r.db.Where("user_id = ?", userID).Delete(&domain.GithubAccount{}).Error
}

func (r *gormGithubAccountRepo) UpdateActiveRepo(userID, owner, name, branch, url, workspacePath string) error {
	return r.db.Model(&domain.GithubAccount{}).
		Where("user_id = ?", userID).
		Updates(map[string]interface{}{
			"active_repo_owner":  owner,
			"active_repo_name":   name,
			"active_repo_branch": branch,
			"active_repo_url":    url,
			"workspace_path":     workspacePath,
		}).Error
}
