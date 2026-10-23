package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"tomo-backend/config"

	_ "github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ensurePostgresDB connects to the default "postgres" database and creates
// the target database if it does not already exist.
func ensurePostgresDB(dsn string) error {
	var dbName string
	for _, part := range strings.Fields(dsn) {
		if strings.HasPrefix(part, "dbname=") {
			dbName = strings.TrimPrefix(part, "dbname=")
			break
		}
	}
	if dbName == "" {
		return fmt.Errorf("could not parse dbname from DSN")
	}

	// Connect to "postgres" default database to check/create target db
	adminDSN := strings.ReplaceAll(dsn, "dbname="+dbName, "dbname=postgres")
	db, err := sql.Open("pgx", adminDSN)
	if err != nil {
		return fmt.Errorf("failed to open admin connection: %w", err)
	}
	defer db.Close()

	var exists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", dbName).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check database existence: %w", err)
	}

	if !exists {
		log.Printf("Database %q does not exist, creating...", dbName)
		_, err = db.Exec(fmt.Sprintf(`CREATE DATABASE "%s"`, dbName))
		if err != nil {
			return fmt.Errorf("failed to create database %q: %w", dbName, err)
		}
		log.Printf("Database %q created successfully", dbName)
	}

	return nil
}

func InitDB(cfg *config.Config) (*gorm.DB, error) {
	gormLogger := logger.Default.LogMode(logger.Info)
	if cfg.Environment == "production" {
		gormLogger = logger.Default.LogMode(logger.Error)
	}

	var dialector gorm.Dialector

	switch strings.ToLower(cfg.DBDriver) {
	case "postgres", "postgresql":
		// Auto-create the database if it doesn't exist
		if err := ensurePostgresDB(cfg.DBDsn); err != nil {
			log.Printf("Warning: could not ensure database exists: %v", err)
		}
		dialector = postgres.Open(cfg.DBDsn)
	case "sqlite", "sqlite3":
		dialector = sqlite.Open(cfg.DBDsn)
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.DBDriver)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		log.Printf("Failed to connect to %s database: %v", cfg.DBDriver, err)
		return nil, err
	}

	log.Printf("Database connection established successfully using %s driver", cfg.DBDriver)
	return db, nil
}
