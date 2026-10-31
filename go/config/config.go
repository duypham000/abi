package config

import (
	"bufio"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment        string
	ServerPort         string
	DBDriver           string // "sqlite" or "postgres"
	DBDsn              string
	JWTSecret          string
	JWTAccessTTL       time.Duration
	JWTRefreshTTL      time.Duration
	YjsSecret          string
	CORSAllowedOrigins []string
	GitHubAPIBaseURL   string
	CacheTTLHours      int
	WorkspaceRoot      string
	NodeWsURL          string
}

func LoadConfig() *Config {
	// Attempt loading .env files in priority order
	envFile := getEnv("ENV_FILE", "")
	if envFile != "" {
		_ = loadDotEnv(envFile)
	} else {
		// Load .env or .env.local if present
		_ = loadDotEnv(".env.local")
		_ = loadDotEnv(".env")
	}

	appEnv := getEnv("APP_ENV", "development")
	if appEnv == "production" {
		_ = loadDotEnv(".env.production")
	}

	corsOriginsStr := getEnv("CORS_ALLOWED_ORIGINS", "*")
	corsOrigins := strings.Split(corsOriginsStr, ",")
	for i := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
	}

	nodeWsUrl := getEnv("NODE_WS_URL", getEnv("VITE_NODE_WS_URL", "ws://127.0.0.1:1234"))
	if !strings.HasSuffix(nodeWsUrl, "/ws/yjs") {
		nodeWsUrl = strings.TrimRight(nodeWsUrl, "/") + "/ws/yjs"
	}

	return &Config{
		Environment:        appEnv,
		ServerPort:         getEnv("SERVER_PORT", "8080"),
		DBDriver:           getEnv("DB_DRIVER", "sqlite"),
		DBDsn:              getEnv("DB_DSN", "tomo_dev.db"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-key-tomo-2026"),
		JWTAccessTTL:       time.Duration(getEnvAsInt("JWT_ACCESS_TTL_MINUTES", 60)) * time.Minute,
		JWTRefreshTTL:      time.Duration(getEnvAsInt("JWT_REFRESH_TTL_DAYS", 7)) * 24 * time.Hour,
		YjsSecret:          getEnv("YJS_SECRET", "dev-yjs-token-secret-tomo"),
		CORSAllowedOrigins: corsOrigins,
		GitHubAPIBaseURL:   getEnv("GITHUB_API_BASE_URL", "https://api.github.com"),
		CacheTTLHours:      getEnvAsInt("CACHE_TTL_HOURS", 24),
		WorkspaceRoot:      getEnv("WORKSPACE_ROOT", "./data/workspaces"),
		NodeWsURL:          nodeWsUrl,
	}
}

func findEnvFile(filename string) string {
	paths := []string{
		filename,
		"../" + filename,
		"../../" + filename,
		"../../../" + filename,
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return filename
}

func loadDotEnv(filepath string) error {
	resolvedPath := findEnvFile(filepath)
	file, err := os.Open(resolvedPath)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, val)
			}
		}
	}
	log.Printf("Loaded environment settings from %s", resolvedPath)
	return nil
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	if valStr, ok := os.LookupEnv(key); ok {
		if val, err := strconv.Atoi(valStr); err == nil {
			return val
		}
	}
	return fallback
}
