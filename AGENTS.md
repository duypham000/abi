# AGENTS.md — `my-abi` Knowledge Base Router

> Read this file first (~115 lines). Load only the 1–2 `docs/kb/*.md` modules relevant to your task. Never scan `node_modules/`, `dist/`, `target/`, `gen/`, or `ex-ui/` unless explicitly requested.

## 1. System Summary

`my-abi` is a multi-project workspace centered on **`mini-editor`** (`tomo-ui-lite` v`0.1.1`), a local-first Tauri v2 + React 19 desktop/mobile app for Docs (BlockNote + Yjs), Whiteboards (Excalidraw + Yjs), and GitHub-backed workspace sync. It talks to **`go`** (`tomo-backend`, Go 1.22 + Gin + GORM + `go-git/v5` on `:8080`) for auth, docs/series CRUD, GitHub workspace Git ops, and Yjs token/snapshot persistence, and to **`node`** (`tomo-node`, Node >=20 ESM with 3 `YHUB_ROLE` modes: `server` `:1234` uWebSockets/Redis CRDT hub, `worker` `:1236` stream persistence/revisions, `api` `:8006` Fastify Google Translate proxy). Sibling **`web`** (`tomo-web`, `:5173`) is a browser-only SPA sharing Docs/Canvas/Yjs UI; **`ex-ui`** (`tomo-ui-temp`) is the legacy Java/Spring-targeted upstream app kept only as reference.

## 2. Sub-project Scope Rules

| Folder | Package / Module | Role | Agent Rule |
|---|---|---|---|
| `mini-editor/` | `tomo-ui-lite` (`tomo-ui`) | Primary Tauri v2 + React 19 client (Desktop + Android + Web fallback) | **Active primary** — check `mini-editor/CLAUDE.md` + KB `01`/`02` |
| `go/` | `tomo-backend` | Modular monolith HTTP API + SQLite/Postgres + local Git workspaces | **Active backend** — check KB `03` + `05` |
| `node/` | `tomo-node` | Yjs WS server (`:1234`), Redis worker (`:1236`), Translate API (`:8006`) | **Active microservice** — check KB `04` + `05` |
| `web/` | `tomo-web` | Standalone browser SPA (`Docs` & `Canvas` only, no SQLite/Tauri) | **Active sibling** — check KB `06` when changing shared UI/Yjs |
| `ex-ui/` | `tomo-ui-temp` | Legacy upstream full app (API client, AI chat, Secrets, Scripts, Ports, Users) | **Reference only** — do NOT scan or edit unless explicitly asked |

## 3. Stale / Non-Authoritative Docs Blacklist (DO NOT TRUST OR SPEND TOKENS ON)

- `mini-editor/SKILL.md` (45 KB third-party `ui-ux-pro-max` prompt guide — unrelated to Tomo).
- `mini-editor/art.md`, `mini-editor/schema.md`, `mini-editor/README.md` (generic templates / legacy notes; `mini-editor/CLAUDE.md` has been updated).
- `gem.md` (unrelated Gemini CLI 1.9 GB server ops plan).
- `node/docs/*` (`yhub.md`, `translate.md`, `transdoc.md`, `ratelimit.md`, `translate-test.html` — reflect pre-merge Java/Express assumptions; superseded by KB `04`/`05`).
- `mini-editor/patches/@blocksuite__icons@2.2.17.patch` (dead BlockSuite artifact; app uses BlockNote) and `mini-editor/scripts/yhub-e2e.mjs` (calls legacy `GET /base/yjs/token`).
- `ex-ui/*` (431 `src/` files + binary dumps `base_log.txt`, `rev_*.bin`, `snapshot.json`).

## 4. Task-to-KB Routing Table

| If Your Task Involves… | Read FIRST | Also Check If Needed |
|---|---|---|
| Ecosystem map, file counts, quick CLI/Docker commands | [docs/kb/00-index.md](docs/kb/00-index.md) | — |
| `mini-editor` React UI, GoldenLayout, BlockNote, Canvas, SQLite, Redux/Zustand | [docs/kb/01-mini-editor-frontend.md](docs/kb/01-mini-editor-frontend.md) | [docs/kb/07-playbooks.md](docs/kb/07-playbooks.md) |
| `mini-editor` Rust commands, Tauri windows/tray/shortcuts, Android, GitHub Actions CI | [docs/kb/02-mini-editor-tauri-ci.md](docs/kb/02-mini-editor-tauri-ci.md) | [docs/kb/07-playbooks.md](docs/kb/07-playbooks.md) |
| `go/` REST routes, GORM schema, Auth/JWT, Docs/Series, GitHub Git module, tests | [docs/kb/03-go-backend.md](docs/kb/03-go-backend.md) | [docs/kb/05-cross-service-contracts.md](docs/kb/05-cross-service-contracts.md) |
| `node/` Yjs WebSocket server, Redis worker, reconstruct HTTP, Translate Fastify API | [docs/kb/04-node-yjs-translate.md](docs/kb/04-node-yjs-translate.md) | [docs/kb/05-cross-service-contracts.md](docs/kb/05-cross-service-contracts.md) |
| Auth flow, Yjs sync, offline sync, Git sync, env/ports, **known API bugs/mismatches** | [docs/kb/05-cross-service-contracts.md](docs/kb/05-cross-service-contracts.md) | [docs/kb/07-playbooks.md](docs/kb/07-playbooks.md) |
| `web/` SPA differences, syncing shared editor fixes, or `ex-ui/` stripped features | [docs/kb/06-sibling-projects-web-exui.md](docs/kb/06-sibling-projects-web-exui.md) | [docs/kb/01-mini-editor-frontend.md](docs/kb/01-mini-editor-frontend.md) |
| Step-by-step surgical edit checklists & pre-done verification commands | [docs/kb/07-playbooks.md](docs/kb/07-playbooks.md) | — |

## 5. Top 10 Non-Negotiable Invariants

1. **ProseMirror single-instance pin**: `mini-editor` (`pnpm-workspace.yaml` + `vite.config.ts`) and `web` (`package.json` + `vite.config.ts`) pin & dedupe `prosemirror-model@1.25.9`, `prosemirror-state@1.4.4`, `prosemirror-view@1.41.9`, `prosemirror-transform@1.12.0`. Never drift versions or remove `resolve.dedupe`.
2. **Local-first, no forced auth gate**: `mini-editor` `ProtectedRoute` returns `<Outlet />`; `MainGate` falls back to `LOCAL_USER` (`userId: 0`); Tauri `docs/canvas/notes/series` read/write `sqlite:tomo-docs.db` first.
3. **Go CGO & DB driver split**: `go` uses `mattn/go-sqlite3` (`CGO_ENABLED=1` required for SQLite & most unit tests); `go/Dockerfile` builds `CGO_ENABLED=0` (Postgres only); `go/.env.local` sets `DB_DRIVER=postgres`.
4. **Node glibc + ESM hoisting**: `node/Dockerfile` MUST stay `node:20-slim` (glibc for `uWebSockets.js`, never Alpine/musl). Static ES imports hoist before `server.js`/`worker.js` body fallbacks, so `REDIS` and `AUTH_PUBLIC_KEY` must come from `.env` or process env.
5. **Yjs shared type keys**: BlockNote uses `ydoc.getXmlFragment("document-store")`; Excalidraw uses `ydoc.getMap("elements")` + `ydoc.getMap("files")`. Room names are `doc-<id>` and `canvas-<id>`.
6. **Rust `AuthCore` URL resolution**: `TOMO_API_BASE` → `VITE_GO_API_URL + "/v1"` → compiled default (`local` Cargo feature: `http://127.0.0.1:8080/api/v1`, else `http://api.tomoo.uk/go/v1`).
7. **Tauri window lifecycle**: Dynamic windows spawn `visible(false)` until frontend invokes `coord_ready`; closing `main` hides to tray; closing `login` exits app; `ExitRequested` prevents exit unless `code.is_some()`.
8. **Mobile light lock**: `main.tsx` awaits `coord_is_mobile` before React mounts; mobile adds `html.force-light`, gating Tailwind v4 `@custom-variant dark` (`src/index.css`).
9. **Go route prefix asymmetry**: `docs`/`series`/`yjs` mount on 5 prefixes (`/api/v1`, `/go/api/v1`, `/go/v1`, `/api/v1/base`, `/go/api/v1/base`); `auth` and `github` mount ONLY on the first 3 (no `/base`).
10. **Check known mismatches before debugging**: Auth logout empty body, GitHub `disconnect`/`repo/create`/`conflicts`, Yjs `worker` missing in root `docker-compose.yml`, Go `YjsStateVector` V2-blob conflation, and Docs pagination envelope differences are documented in [docs/kb/05-cross-service-contracts.md](docs/kb/05-cross-service-contracts.md).

## 6. Quick Baseline Commands

- **`mini-editor` frontend check**: `pnpm --dir mini-editor build:frontend` (runs `tsc && vite build --mode production`)
- **`mini-editor` Rust check**: `cargo check --manifest-path mini-editor/src-tauri/Cargo.toml`
- **`go` unit/service tests**: `$env:CGO_ENABLED="1"; go test -C go ./internal/infrastructure/security/... ./internal/modules/...`
- **`node` build & tests**: `npm --prefix node run build && npm --prefix node test`
- **`web` verify**: `pnpm --dir web typecheck && pnpm --dir web build`
