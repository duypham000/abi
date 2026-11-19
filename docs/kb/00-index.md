# `00-index.md` — `my-abi` Ecosystem Index

## 1. Knowledge Base Navigation

| File | Scope | Load When… |
|---|---|---|
| [00-index.md](00-index.md) | Monorepo map, topology, excluded stale docs, CLI/Docker cheatsheet | Starting cold in `my-abi` |
| [01-mini-editor-frontend.md](01-mini-editor-frontend.md) | `mini-editor/src`: multi-entry boot, GoldenLayout, BlockNote, Canvas, SQLite, stores, APIs, dead code | Touching `mini-editor` React/TS UI or local storage |
| [02-mini-editor-tauri-ci.md](02-mini-editor-tauri-ci.md) | `mini-editor/src-tauri` + `.github/workflows`: 43 Rust commands, windows, tray, Android, CI/CD | Touching Rust IPC, capabilities, Android, or workflows |
| [03-go-backend.md](03-go-backend.md) | `go/`: Gin/GORM architecture, config, all HTTP routes, 7 DB tables, GitHub workspace, tests | Touching Go API, DB, auth, or Git sync |
| [04-node-yjs-translate.md](04-node-yjs-translate.md) | `node/`: `YHUB_ROLE=server\|worker\|api`, `@y/redis`, `JavaStorage`, `reconstruct.js`, Fastify translate | Touching Yjs WS hub, worker persistence, or translate |
| [05-cross-service-contracts.md](05-cross-service-contracts.md) | E2E flows (Auth, Yjs, Offline, Git, Translate), env/port matrix, **15 verified contract mismatches** | Debugging cross-service bugs or editing shared contracts |
| [06-sibling-projects-web-exui.md](06-sibling-projects-web-exui.md) | `web/` (`tomo-web`) architecture & drift vs `ex-ui/` (`tomo-ui-temp`) stripped modules | Touching `web/` or checking legacy features in `ex-ui/` |
| [07-playbooks.md](07-playbooks.md) | 6 step-by-step surgical edit checklists + pre-done verification matrix | Making multi-file/multi-repo changes |

## 2. Ecosystem Topology

```text
+----------------------------------+     +-------------------------------+
| mini-editor (Tauri v2 + React19) |     | web (Vite + React19 SPA)      |
| Vite dev :1420 | SQLite local DB |     | Vite dev :5173 | HTTP only    |
+-------+----------------+---------+     +-------+---------------+-------+
        | HTTP/REST      | WS                    | HTTP/REST     | WS
        v                v                       v               v
   [Vite proxy or direct prod: api.tomoo.uk/{go,node}, wss://ws.tomoo.uk]
        |                                        |
        +-------------------+--------------------+
                            |
        +-------------------+--------------------+--------------------+
        v                                        v                    v
+-----------------------------+     +------------------------+  +-----------------------+
| go (tomo-backend :8080)     |     | node YHUB_ROLE=server  |  | node YHUB_ROLE=api    |
| Gin + GORM (PG / SQLite)    |<----| uWebSockets.js :1234   |  | Fastify 5 :8006       |
| Auth, Docs, Series, Yjs JWT |     | GET /yjs/auth/perm/... |  | /api/v1/translate     |
| GitHub Module (go-git disk) |     +-----------+------------+  | (Google Translate +   |
+-----------------------------+                 | Redis Streams |  3-day NodeCache)     |
        ^                                       v               +-----------------------+
        | HTTP /yjs/internal/*       +------------------------+
        +----------------------------| node YHUB_ROLE=worker  |  [!] Worker is NOT in
          (Go calls :1236 unimplemented)| @y/redis + HTTP :1236 |      root docker-compose
                                     +------------------------+
```

## 3. Sub-Project Matrix

| Folder | Name | Stack | Source Files* | Status | Default Port | Primary Entrypoint |
|---|---|---|---:|---|---|---|
| `mini-editor/` | `tomo-ui-lite` v`0.1.1` | Tauri v2, React 19, Vite 7, BlockNote 0.51, Excalidraw 0.18, GoldenLayout 2.6, SQLite | 437 (331 `src/`) | **Active Primary** | `1420` (Vite) | `src/main.tsx`, `src-tauri/src/lib.rs` |
| `go/` | `tomo-backend` | Go 1.22, Gin 1.9, GORM (Postgres/SQLite), `go-git/v5`, HS256 JWT | 63 | **Active Backend** | `8080` | `cmd/server/main.go` |
| `node/` | `tomo-node` v`1.0.0` | Node >=20 ESM, TS 5.6, `@y/redis` + `uWebSockets.js`, Fastify 5, Yjs 13.6 | 36 | **Active Microservice** | `1234` / `1236` / `8006` | `src/roles/{server,worker}.js`, `src/roles/api.ts` |
| `web/` | `tomo-web` v`0.1.0` | React 19, Vite, BlockNote 0.51, Excalidraw 0.18, RTK Query, Yjs | 166 (150 `src/`) | **Active Web SPA** | `5173` | `src/main.tsx`, `src/App.tsx` |
| `ex-ui/` | `tomo-ui-temp` v`0.1.0` | Tauri v2, React 19, Spring/Kong client (API, AI Chat, Secrets, Scripts, Ports, Users) | 539 (431 `src/`) | **Legacy Reference** | `1420` | Do not edit unless asked |

*\*File counts exclude `node_modules/`, `dist/`, `target/`, `gen/`, `.git/`, `.idea/`, `build/`, `coverage/`.*

## 4. Stale / Unrelated Files Exclusion Table

| Path | What It Actually Is | Why Agents Must Skip It |
|---|---|---|
| `mini-editor/SKILL.md` | 45 KB `ui-ux-pro-max` generic design skill | Unrelated prompting guide checked into repo |
| `mini-editor/art.md`, `schema.md`, `README.md` | Generic Tauri/BlockNote templates & `tomo/base` Spring README | Outdated architecture/stack assumptions |
| `gem.md` | Plan for a Gemini CLI 1.9 GB RAM Linux admin bot (`gemops`) | Completely unrelated side note at root |
| `node/docs/{yhub,translate,transdoc,ratelimit}.md`, `translate-test.html` | Pre-merge Java + Express design notes | Superseded (`POST /yjs/auth/perm` → `GET`; Express → Fastify `/api/v1/translate`) |
| `mini-editor/patches/@blocksuite__icons@2.2.17.patch` | Patch for `@blocksuite/icons` | Dead artifact (`@blocksuite/*` removed in favor of BlockNote) |
| `mini-editor/scripts/yhub-e2e.mjs` | E2E Node script targeting `localhost:18000` | Calls legacy `GET /base/yjs/token` instead of `POST /base/yjs/auth/token` |
| `ex-ui/` (`base_log.txt`, `rev_*.bin`, `snapshot.json`, `src/`) | Upstream pre-lite app + debug artifacts | Legacy Java/Spring target; read only if porting stripped features |

## 5. Quick Command Cheat Sheet

```powershell
# --- mini-editor (e:\Projects\my-abi\mini-editor) ---
pnpm install
pnpm dev:frontend        # Vite only on :1420
pnpm dev                 # Tauri desktop + Vite :1420
pnpm build:frontend      # tsc && vite build --mode production
pnpm build               # Windows NSIS installer -> src-tauri/target/release/bundle/nsis/
pnpm tauri android build --apk --split-per-abi --target aarch64
cargo check --manifest-path src-tauri/Cargo.toml

# --- go (e:\Projects\my-abi\go) ---
$env:CGO_ENABLED="1"; $env:DB_DRIVER="sqlite"; $env:DB_DSN="tomo_dev.db"; go run ./cmd/server/main.go
$env:CGO_ENABLED="1"; go test ./internal/infrastructure/security/... ./internal/modules/...
$env:CGO_ENABLED="1"; go test -run TestE2E ./cmd/server

# --- node (e:\Projects\my-abi\node) ---
npm install && npm run build && npm test
npm run dev:api          # Fastify translate hot reload on :8006

# --- web (e:\Projects\my-abi\web) ---
pnpm install && pnpm dev # Vite SPA on :5173
pnpm typecheck && pnpm build

# --- Full Docker stack (e:\Projects\my-abi) ---
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
