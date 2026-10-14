# Tomo Backend - Modular Monolith Architecture (Go)

Hệ thống backend được thiết kế theo kiến trúc **Modular Monolith** hiện đại trong Go. Mỗi module hoàn toàn độc lập về domain, repository, service và HTTP handler, chạy chung trong 1 monolith process duy nhất để đạt hiệu năng cao, dễ bảo trì và sẵn sàng tách thành microservices khi cần.

---

## ⚙️ Cấu Hình Môi Trường (Local & Production Environment)

Ứng dụng hỗ trợ cấu hình linh hoạt qua file `.env` hoặc Biến môi trường hệ thống.

| Biến Môi Trường | Môi trường Local (`.env.local`) | Môi trường Production (`.env.production`) | Mô tả |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | `development` | `production` | Môi trường chạy ứng dụng |
| `SERVER_PORT` | `8080` | `8080` | Port HTTP Server lắng nghe |
| `CORS_ALLOWED_ORIGINS` | `*` | `https://tomo.app,https://admin.tomo.app` | Cấu hình CORS |
| `DB_DRIVER` | `sqlite` | `postgres` | Driver Database (`sqlite` hoặc `postgres`) |
| `DB_DSN` | `tomo_dev.db` | `host=postgres-db user=... dbname=...` | Chuỗi kết nối Database |
| `JWT_SECRET` | Secret dev | Secret prod ngẫu nhiên & bảo mật | Khóa ký JWT Token |
| `JWT_ACCESS_TTL_MINUTES` | `120` | `60` | Thời gian sống của Access Token (phút) |
| `JWT_REFRESH_TTL_DAYS` | `14` | `7` | Thời gian sống của Refresh Token (ngày) |
| `YJS_SECRET` | Secret dev | Secret prod ngẫu nhiên & bảo mật | Khóa ký Yjs Room Token |

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Khởi chạy Local Development (Dùng SQLite)
```bash
# Khởi chạy bằng file .env.local
go run cmd/server/main.go
```

### 2. Khởi chạy Production với Docker & PostgreSQL
```bash
# Khởi chạy toàn bộ hệ thống (App Go + PostgreSQL Database) qua Docker Compose
docker-compose up -d --build

# Xem log server
docker-compose logs -f app
```

---

## 🏗️ Cấu Trúc Thư Mục (Modular Monolith)

```text
go/
├── .env.example                # File mẫu cấu hình biến môi trường
├── .env.local                  # Cấu hình môi trường Local (SQLite)
├── .env.production             # Cấu hình môi trường Production (PostgreSQL)
├── Dockerfile                  # Multi-stage Docker build cho Go
├── docker-compose.yml          # Container setup (Go App + Postgres DB)
├── config/                     # Auto-load .env files & Config struct
│   └── config.go
├── cmd/
│   └── server/
│       ├── main.go             # Entrypoint server Gin HTTP với Graceful Shutdown
│       └── server_test.go      # E2E Integration tests
├── internal/
│   ├── infrastructure/         # Shared Infrastructure (DB, Security, Response, Logger)
│   │   ├── database/           # Support SQLite & PostgreSQL via GORM
│   │   ├── logger/             # Structured Logging (slog)
│   │   ├── response/           # Format JSON Response tiêu chuẩn
│   │   └── security/           # JWT, Bcrypt Hashing, RBAC Middleware
│   │
│   └── modules/                # MODULAR MONOLITH DOMAIN MODULES
│       ├── auth/               # Module Authentication & Authorization (Register, Login, Refresh, Me)
│       └── docs/               # Module Document Management & Yjs Real-time Collaboration
└── go.mod
```

---

## 📡 API Endpoints & cURL Samples

### Auth Endpoints
```bash
# Đăng ký tài khoản
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@tomo.com","password":"password123","full_name":"Tomo Admin","role":"ADMIN"}'

# Đăng nhập
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@tomo.com","password":"password123"}'
```

### Docs & Yjs Endpoints
```bash
# Tạo Document mới
curl -X POST http://localhost:8080/api/v1/docs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"title":"Kiến trúc Modular Monolith","content":"Nội dung...","status":"PUBLISHED"}'

# Lưu Yjs State Vector Snapshot
curl -X POST http://localhost:8080/api/v1/yjs/storage/doc/<DOC_ID>/snapshot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"state_vector_base64":"AQIDBAU="}'
```
