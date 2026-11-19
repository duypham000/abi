# `03-go-backend.md` — `go/` Backend Architecture (`tomo-backend`)

Go `1.22` modular monolith (`gin v1.9.1`, `gorm v1.25.8` w/ `postgres` & CGO `sqlite3`, `go-git/v5`, HS256 `golang-jwt/v5`, `bcrypt`).

## 1. Boot, Wiring & Config (`cmd/server/main.go`, `config/config.go`)

- **Init Order (`main.go`)**: `LoadConfig()` → `logger` (`slog`, JSON/Info in `production`) → `database.InitDB(cfg)` (`ensurePostgresDB` auto-runs `CREATE DATABASE` if missing) → `JWTManager` → `auth.InitModule` (seeds admin if `users` empty) → `docs.InitModule` → `github.InitModule` (runs Postgres `ALTER TABLE ... TYPE text`) → `githubModule.WireDocsService(docsModule.DocsService)`.
- **Background Goroutine**: `CachePruner` ticks every 6h scanning `WORKSPACE_ROOT/<userID>/<owner>_<repo>`, **currently a no-op stub** (`_ = wsPath`).
- **Global CORS (`main.go`)**: Hardcodes `Access-Control-Allow-Origin: *`, allows `Authorization`, `X-Yjs-Token`, `PATCH`, `204` on `OPTIONS` (**ignores `CORS_ALLOWED_ORIGINS`**).
- **Dotenv Precedence (`config.go`)**: `ENV_FILE` → `.env.local` → `.env` → (if `APP_ENV=production`) `.env.production`. Process env vars always win.

| Env Var | Code Default | Notes |
|---|---|---|
| `APP_ENV` / `SERVER_PORT` | `"development"` / `"8080"` | `"production"` sets Gin ReleaseMode |
| `DB_DRIVER` / `DB_DSN` | `"sqlite"` / `"tomo_dev.db"` | `go/.env.local` sets `postgres`; Docker image compiles `CGO_ENABLED=0` (Postgres only!) |
| `JWT_SECRET` / `YJS_SECRET` | `"dev-secret-key-tomo-2026"` / `"dev-yjs-token-secret-tomo"` | HS256 secrets |
| `JWT_ACCESS_TTL_MINUTES` / `JWT_REFRESH_TTL_DAYS` | `60` / `7` | `TokenResponse.expiresIn` is hardcoded `7200` |
| `GITHUB_API_BASE_URL` / `CACHE_TTL_HOURS` / `WORKSPACE_ROOT` | `"https://api.github.com"` / `24` / `"./data/workspaces"` | Disk path `<WorkspaceRoot>/<userID>/<owner>_<repo>` |
| `NODE_WS_URL` (fallback `VITE_NODE_WS_URL`) | `"ws://127.0.0.1:1234/ws/yjs"` | Auto-appends `/ws/yjs` if absent |
| `CORS_ALLOWED_ORIGINS` | `"*"` | Parsed into `Config` but unused in `main.go` |

## 2. Mount Prefixes, Auth Middleware & Response Envelopes

- **Health (Public)**: `GET /healthz`, `/health`, `/actuator/health`, `/go/healthz`, `/go/health`, `/go/actuator/health`.
- **Prefix Asymmetry**:
  - `auth` + `docs` + `github` mount under **`/api/v1`**, **`/go/api/v1`**, **`/go/v1`**.
  - `docs` module (`/series`, `/docs`, `/yjs`) **additionally** mounts under **`/api/v1/base`**, **`/go/api/v1/base`**.
- **`AuthMiddleware` (`internal/infrastructure/security/middleware.go`)**: Reads `Authorization: Bearer <jwt>` or `?token=<jwt>` (**no cookies**). Sets `user_id`, `user_email`, `user_role`. `RequireRoles(...)` is defined but **not attached to any route**.
- **Standard Envelope (`internal/infrastructure/response/response.go`)**: `APIResponse{ success, message?, data?, error? }` & `PageResponse{ items, total_items, page, page_size, total_pages }` inside `data`.
  - **Envelope Exceptions**: Health (`{ status: "UP", success, message, data }`); `SeriesHandler.List/Search` (raw top-level `{ success, message, data, total, page, pageSize }`, 0-based `page`); `YjsHandler.CheckPermCallback` (`{ yaccess, yuserid, room }`); `/yjs/internal/*` (raw binary bytes, raw JSON, or bare status codes); `GithubHandler.Pull` conflict (`409` w/ `Success: false, Data`).

## 3. Complete HTTP Route Tables (relative to mount prefix)

### Auth (`internal/modules/auth/delivery/http_handler.go`)
| Method & Path | Auth | Notes |
|---|---|---|
| `POST /auth/register` | Public | Bug: omits `Username` (`""`) on unique col; accepts arbitrary client `role` |
| `POST /auth/login` | Public | Accepts `identifier \| username \| email` + `password`; returns snake+camel token fields |
| `POST /auth/refresh` | Public | Accepts `refresh_token \| refreshToken`; revokes old opaque token & rotates pair |
| `POST /auth/logout` | Public | **Requires JSON `{ refresh_token \| refreshToken }` (400 on empty body)** |
| `GET /auth/me` | `AuthMiddleware` | Returns current `User` |

### Docs & Series (`internal/modules/docs/delivery/{docs,series,sync}_handler.go`, also under `*/base`)
| Method & Path | Auth | Notes |
|---|---|---|
| `GET /series`, `/series/list`, `/series/search`, `/series/:id` | `AuthMiddleware` | 0-based `page` + top-level `total` |
| `POST /series`, `PUT /series/:id`, `DELETE /series/:id` | `AuthMiddleware` | No owner check |
| `GET /docs/slug/:slug` | **Public** | Lookup by slug |
| `GET /docs`, `/docs/list`, `/docs/lazy`, `/docs/search`, `/docs/tree`, `/docs/:id`, `/docs/:id/revisions` | `AuthMiddleware` | `ListDocs` reads **1-based** `page`, `page_size`, `search`, `parent_id` |
| `POST /docs`, `PUT /docs/:id`, `DELETE /docs/:id` | `AuthMiddleware` | Hard delete; no owner check |
| `POST /docs/sync-from-git`, `POST /docs/sync/push`, `GET /docs/sync/pull` | `AuthMiddleware` | Git & local SQLite sync |

### Yjs (`internal/modules/docs/delivery/yjs_handler.go`, also under `*/base`)
| Method & Path | Auth | Notes |
|---|---|---|
| `GET\|POST /yjs/auth/token`, `/yjs/token` | `AuthMiddleware` | Mints 24h HS256 `YjsClaims` JWT; skips DB check for `canvas-*`/`canvasId` |
| `GET /yjs/auth/perm` | Validates `?token=`/`X-Yjs-Token` | Returns `allowed, doc_id, user_id, access_mode` |
| `GET /yjs/auth/perm/:room/:userid` | **None (Public)** | **Unconditionally returns `200 { yaccess: "rw", yuserid, room }`** |
| `GET\|PUT /yjs/internal/{docs\|canvases}/:docId/snapshot` | **None** | `canvases` route hits `docRepo.FindByID` (`docs` table!); stores blob into `doc.YjsStateVector` |
| `GET /yjs/internal/{docs\|canvases}/:docId/state-vector` | **None** | Returns `doc.YjsStateVector` (full V2 update blob, not SV) |
| `POST /yjs/internal/docs/:docId/{snapshot,revisions,meta}` | **None** | `revisions` appends `SnapshotBlob`; `meta` updates `Content` plaintext |
| `GET /yjs/internal/docs/:docId/revisions/{head,:revisionId/chain}` | **None** | `head` returns `SnapshotBlob` as `stateVector`; `chain` returns all revs desc |
| `POST /yjs/storage/doc/:docId/{update,snapshot}`, `GET .../snapshot`, `GET /yjs/revision/:docId/reconstruct` | `AuthMiddleware` | `ReconstructDocument` returns latest `rev.SnapshotBlob` directly (doesn't call `node:1236`) |

### GitHub (`internal/modules/github/delivery/github_handler.go`, all require `AuthMiddleware`)
- **Account/Repo**: `POST /github/connect`, `GET /github/user`, `POST /github/disconnect`, `GET /github/repos`, `POST /github/repos/create`, `POST /github/repo/select`, `GET /github/repo/active`.
- **Files & Workspace**: `POST /github/files/save`, `GET /github/files/get`, `GET /github/files/list`, `DELETE /github/files/delete`, `POST /github/cache/prune`, `GET /github/workspace/manifest`, `POST /github/workspace/manifest/rebuild`, `GET /github/workspace/status`, `POST /github/workspace/sync`.
- **Git Ops**: `POST /github/repo/{init,commit-and-push,pull,diff,check-conflicts,resolve-conflict,check-file}`, `GET /github/repo/{file-history,conflicts}`, `GET|POST /github/repo/{file-at-commit,file-diff,conflicts}`.

**Explicitly Absent in `go/`**: Canvas/Notes REST CRUD, binary asset upload endpoints, Soft-delete/Trash, revision restore/`.bin` upload, `/admin/users/*`, `/admin/search/*`.

## 4. GORM Schema (7 Tables) & Disk Workspace

| Table | Key Columns & Behavior |
|---|---|
| `users` | `id` (UUID), `username` (unique), `email` (unique), `password_hash`, `full_name`, `role` (`ADMIN\|USER\|EDITOR`), `enabled`. Seeds `admin@tomo.app` / `admin123` (`ADMIN`) when empty. |
| `refresh_tokens` | `id`, `user_id`, `token` (unique opaque UUIDv4), `expires_at`, `revoked` |
| `docs` | `id` (UUID), `title`, `slug` (unique), `content`, `status` (`DRAFT\|PUBLISHED\|ARCHIVED`), `parent_id`, `owner_id`, `is_pinned`, `is_starred`, `yjs_state_vector` (`[]byte`). **No `series_id` col**. `FindByID` matches raw/`doc-`-stripped/`doc-`-prefixed on `id` OR `slug`. |
| `doc_revisions` | `id`, `doc_id`, `version`, `snapshot_blob` (`[]byte`), `changes_summary`, `author_id` |
| `yjs_updates` | `id`, `doc_id`, `update_data` (`[]byte`), `client_id` |
| `series` | `id` (auto uint), `name`, `description`, `created_by_id` |
| `github_accounts` | `id`, `user_id` (unique — 1 per user), `username`, `token` (plaintext PAT), `active_repo_{owner,name,branch,url}`, `workspace_path` |

On-disk Git workspace (`<WorkspaceRoot>/<userID>/<owner>_<repo>`): `docs/*.json`, `canvases/*.json`, `assets/`, `README.md`, `.gitignore`, `.tomo/manifest.json`, `.cache_metadata.json` (gitignored), guarded by `RepoLockManager` (`sync.RWMutex`).

## 5. Run & Test Commands (`e:\Projects\my-abi\go`)

```powershell
# Local SQLite run (requires CGO + gcc/MinGW; overrides .env.local postgres setting)
$env:CGO_ENABLED="1"; $env:DB_DRIVER="sqlite"; $env:DB_DSN="tomo_dev.db"; go run ./cmd/server/main.go

# Unit + service tests (in-memory SQLite, requires CGO_ENABLED=1)
$env:CGO_ENABLED="1"; go test -v ./internal/infrastructure/security/... ./internal/modules/...

# HTTP E2E tests (auth + docs + yjs; note github_integration_test pushes to github.com on Step 9!)
$env:CGO_ENABLED="1"; go test -v -run TestE2E ./cmd/server

# Live Postgres integration test (requires running Postgres matching .env.local; fails if stopped!)
go test -v ./internal/infrastructure/database/...
```
