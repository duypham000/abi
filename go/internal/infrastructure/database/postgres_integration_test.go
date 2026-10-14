package database_test

import (
	"context"
	"testing"
	"time"

	"tomo-backend/config"
	"tomo-backend/internal/infrastructure/database"
	authDomain "tomo-backend/internal/modules/auth/domain"
	docsDomain "tomo-backend/internal/modules/docs/domain"

	"github.com/google/uuid"
)

func TestPostgreSQL_EnvConnectionAndMigration(t *testing.T) {
	// 1. Load configuration from .env.local
	cfg := config.LoadConfig()

	if cfg.DBDriver != "postgres" {
		t.Fatalf("Expected DBDriver to be 'postgres' from .env.local, got: %s", cfg.DBDriver)
	}

	// 2. Initialize DB Connection to Docker PostgreSQL instance
	db, err := database.InitDB(cfg)
	if err != nil {
		t.Fatalf("Failed to connect to PostgreSQL database using .env.local DSN: %v", err)
	}

	// Verify underlying SQL DB connection
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("Failed to get underlying sql.DB: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		t.Fatalf("Ping failed on PostgreSQL database: %v", err)
	}

	t.Logf("Successfully connected to PostgreSQL at %s", cfg.DBDsn)

	// 3. Perform AutoMigrate for all module entities
	err = db.AutoMigrate(
		&authDomain.User{},
		&authDomain.RefreshToken{},
		&docsDomain.Doc{},
		&docsDomain.DocRevision{},
		&docsDomain.YjsUpdate{},
	)
	if err != nil {
		t.Fatalf("Failed auto-migration on PostgreSQL: %v", err)
	}

	// 4. Test CRUD operations on PostgreSQL database
	testUserID := uuid.New().String()
	testUser := &authDomain.User{
		ID:           testUserID,
		Email:        "envtest_" + testUserID[:8] + "@tomo.com",
		PasswordHash: "$2a$10$dummyhashforpostgresenvtest",
		FullName:     "Postgres Env Tester",
		Role:         authDomain.RoleAdmin,
		Enabled:      true,
	}

	// Insert User
	if err := db.Create(testUser).Error; err != nil {
		t.Fatalf("Failed to insert test user into PostgreSQL: %v", err)
	}

	// Query User back
	var fetchedUser authDomain.User
	if err := db.Where("id = ?", testUserID).First(&fetchedUser).Error; err != nil {
		t.Fatalf("Failed to query inserted user from PostgreSQL: %v", err)
	}

	if fetchedUser.Email != testUser.Email {
		t.Errorf("Expected user email %s, got %s", testUser.Email, fetchedUser.Email)
	}

	// Create test document owned by user
	docID := uuid.New().String()
	testDoc := &docsDomain.Doc{
		ID:        docID,
		Title:     "PostgreSQL Integration Doc",
		Slug:      "postgres-integration-doc-" + docID[:8],
		Content:   "Testing Postgres connection with .env.local",
		Status:    docsDomain.DocStatusPublished,
		OwnerID:   testUserID,
		IsPinned:  true,
		IsStarred: true,
	}

	if err := db.Create(testDoc).Error; err != nil {
		t.Fatalf("Failed to insert test doc into PostgreSQL: %v", err)
	}

	// Query Document back
	var fetchedDoc docsDomain.Doc
	if err := db.Where("id = ?", docID).First(&fetchedDoc).Error; err != nil {
		t.Fatalf("Failed to query inserted doc from PostgreSQL: %v", err)
	}

	if fetchedDoc.Title != testDoc.Title {
		t.Errorf("Expected doc title %s, got %s", testDoc.Title, fetchedDoc.Title)
	}

	// Clean up test data
	_ = db.Delete(testDoc)
	_ = db.Delete(testUser)

	t.Log("PostgreSQL database integration test completed with 100% SUCCESS!")
}
