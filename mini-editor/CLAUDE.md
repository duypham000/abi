# CLAUDE.md — `mini-editor` (`tomo-ui-lite` v`0.1.1`)

Local-first Tauri v2 + React 19 + TypeScript ~5.8 desktop/mobile client for Docs (BlockNote + Yjs), Whiteboards (Excalidraw + Yjs), GitHub Git sync, and Offline Translation. Connects to **`go`** backend (`:8080`) + **`node`** microservices (`api :8006`, `yjs :1234`), NOT Java/Spring.

> **Deep KB References** (read instead of scanning directories):
> - Frontend architecture, stores, SQLite, editors, features: [../docs/kb/01-mini-editor-frontend.md](../docs/kb/01-mini-editor-frontend.md)
> - Rust commands (43), windows, capabilities, Android, CI: [../docs/kb/02-mini-editor-tauri-ci.md](../docs/kb/02-mini-editor-tauri-ci.md)
> - Cross-service contracts & known API mismatches: [../docs/kb/05-cross-service-contracts.md](../docs/kb/05-cross-service-contracts.md)
> - Edit checklists & verification commands: [../docs/kb/07-playbooks.md](../docs/kb/07-playbooks.md)

## Stale Files in `mini-editor/` (Ignore)
- `SKILL.md` (45 KB third-party UI/UX prompt guide, unrelated to Tomo).
- `art.md`, `schema.md`, `README.md` (generic templates / legacy Spring Boot docs).
- `patches/@blocksuite__icons@2.2.17.patch` (dead BlockSuite leftover) and `scripts/yhub-e2e.mjs` (legacy Yjs endpoint script).

## Directory Map
```text
mini-editor/
├── index.html / login.html / splash.html   # 3 Vite HTML entries (main+popups, auth modal, splash)
├── src/
│   ├── main.tsx / App.tsx                  # Boot + coord_is_mobile light-lock + router (Desktop vs MobileShell)
│   ├── core/{interfaces,utils}/            # Pure TS contracts (docs, canvas, notes, series, github) & sha256/jwt/yjs utils
│   ├── infrastructure/{api,platform,tauri}/# RTK Query (baseApi + 8 slices), sqliteDb (tomo-docs.db), outbox/syncEngine, authBridge
│   ├── login/ & splash/                    # Dedicated bundles for login.html & splash.html
│   └── presentation/
│       ├── components/{AppBar,BlockNote,EntityGitBadge,icons,ui}/
│       ├── features/                       # 14 modules: auth, bootstrap, canvas, command-palette, dashboard, docs, git, mobile, panels, search, series, settings, sync, translate
│       ├── hooks/ & store/                 # 16 hooks + Redux (app, auth, docs, settings, conflicts); Zustand only in features/canvas/store
│       └── layout/                         # WorkspaceShell (GoldenLayout 2.6 + ActivityBar + Sidebar + Bottom Panel + StatusBar) & MobileShell
└── src-tauri/
    ├── capabilities/                       # default, doc-popup, login, search-overlay, splash (NOTE: panel-popup-* missing!)
    ├── gen/android/                        # Android TauriActivity (MainActivity.kt, SDK 24–36, MANAGE_EXTERNAL_STORAGE)
    └── src/{lib.rs,commands/,services/}    # 43 #[tauri::command] fns across 10 files + 4 services
```

## Scripts, Env Vars & Vite Dev Proxy
**Scripts (`package.json`):**
- `pnpm dev` (`tauri dev`) | `pnpm dev:frontend` (`vite`, strict port `1420`)
- `pnpm build` (`tauri build`) | `pnpm build:frontend` (`tsc && vite build --mode production`)
- Android build: `pnpm tauri android build --apk --split-per-abi --target aarch64`
- Rust check: `cargo check --manifest-path src-tauri/Cargo.toml`

**Env Vars (`vite.config.ts` `envPrefix: ["VITE_", "TOMO_"]`, Rust `dotenvy`):**
| Variable | Local Default / `.env.example` | Prod (`.env.production`) | Used By |
|---|---|---|---|
| `VITE_GO_API_URL` | `http://127.0.0.1:8080` | `http://api.tomoo.uk/go` | Vite `/api` & `/actuator` proxy; `authBridge.ts` fallback |
| `TOMO_API_BASE` | `http://127.0.0.1:8080/api/v1` | `http://api.tomoo.uk/go/v1` | Rust `AuthCore` (`auth_commands.rs`) & `authBridge.ts` |
| `VITE_NODE_API_URL` | `http://127.0.0.1:8006` | `http://api.tomoo.uk/node` | Vite `/api/v1/translate` proxy |
| `VITE_NODE_WS_URL` | `ws://127.0.0.1:1234` | `wss://ws.tomoo.uk` | Vite `/ws/yjs` proxy & Yjs WS URL resolution |
| `VITE_YJS_SERVER_URL` | *(unset)* | *(optional override)* | Highest-priority Yjs WS URL in collab hooks |
| `VITE_API_BASE_URL` | `/api/v1` | `/api/v1` | Declared in `.env*` (`baseApi.ts` hardcodes `"/api/v1"`) |

**Vite Proxy (`vite.config.ts`):** `/api/v1/translate` → `VITE_NODE_API_URL`; `/api` & `/actuator` → `VITE_GO_API_URL` (preserves subpath); `/ws/yjs` → `VITE_NODE_WS_URL` (`ws: true`).

## Critical Rules & Gotchas
1. **ProseMirror Dedupe**: `pnpm-workspace.yaml` overrides + `vite.config.ts` `resolve.dedupe` MUST keep `prosemirror-model@1.25.9`, `prosemirror-state@1.4.4`, `prosemirror-view@1.41.9`, `prosemirror-transform@1.12.0` aligned or BlockNote throws `"Cannot convert to Fragment"` on keystrokes.
2. **Local-First Mode**: No forced login screen (`ProtectedRoute` is pass-through; unauthenticated defaults to `LOCAL_USER`). Tauri CRUD reads/writes `sqlite:tomo-docs.db` first; `outbox` replays only `"doc"` mutations.
3. **Yjs Shared Types & Rooms**: Docs bind BlockNote to `ydoc.getXmlFragment("document-store")` on room `doc-<id>`; Canvas binds Excalidraw to `ydoc.getMap("elements")` + `ydoc.getMap("files")` on room `canvas-<id>`.
4. **Rust Window Coordinator**: Windows spawn hidden until frontend calls `coord_ready`. `main` hides to tray on close; `login` exits app on close. Android/iOS configs override initial window from `splash` to `main`.
5. **Known Backend Mismatches**: `githubApi.ts` (`DELETE /github/disconnect`, `POST /github/repo/create`, `/github/repo/conflicts`), `auth_commands.rs`/`authApi.ts` (`POST /auth/logout` empty body), and `docsApi.ts` pagination params differ from `go/` — see [../docs/kb/05-cross-service-contracts.md](../docs/kb/05-cross-service-contracts.md) before modifying.
