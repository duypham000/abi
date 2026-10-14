package database

import (
	"fmt"
	"log"
	"strings"

	"tomo-backend/config"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func InitDB(cfg *config.Config) (*gorm.DB, error) {
	gormLogger := logger.Default.LogMode(logger.Info)
	if cfg.Environment == "production" {
		gormLogger = logger.Default.LogMode(logger.Error)
	}

	var dialector gorm.Dialector

	switch strings.ToLower(cfg.DBDriver) {
	case "postgres", "postgresql":
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
