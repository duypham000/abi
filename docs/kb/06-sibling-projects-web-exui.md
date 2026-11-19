# `06-sibling-projects-web-exui.md` — `web` (`tomo-web`) & `ex-ui` (`tomo-ui-temp`)

## 1. `web/` (`tomo-web` v`0.1.0`, `166` files, `150` in `src/`)

Standalone Vite + React 19 browser SPA extracted from `ex-ui`, covering **Docs** and **Canvas** only, updated for the split Go + Node backend. Runs on Vite dev port **`5173`** (`vite.config.ts` proxies `/api/v1/translate` → `VITE_NODE_API_URL`, `/api` & `/actuator` → `VITE_GO_API_URL`, `/ws/yjs` → `VITE_NODE_WS_URL`; falls back to `VITE_PROXY_TARGET` / `https://api.tomoo.uk/go`).

### Architecture & Key Differences vs `mini-editor`
- **Flat `src/` structure**: No `presentation/` wrapper, no `splash/`, no `login/` multi-entry, no `infrastructure/tauri/`, no GoldenLayout, no `react-resizable-panels`, no SQLite/outbox/offline sync, no GitHub Git panel, no Translate page, no Settings/Search/MobileShell.
- **Routes (`web/src/App.tsx`)**:
  - Public: `/login` → `LoginPage` (2-step `LoginForm`; no Register/Verify routes).
  - Guarded by `<RequireAuth />` (`routes/RequireAuth.tsx`) → `<AppShell />` (`layout/AppShell.tsx` topbar + collapsible `/docs` & `/canvas` nav): `/` → `/docs`, `/docs` (`DocsPage`), `/docs/:id` (lazy `DocEditorPage`), `/canvas` (`CanvasListPage`), `/canvas/:id` (lazy `CanvasEditorPage`), `*` → `/docs`.
- **Browser Auth (`web/src/infrastructure/auth/authClient.ts`)**:
  - Stores `tomo_access_token` & `tomo.refreshToken` in `localStorage` with `storage` cross-tab sync.
  - `login()` sends `{ identifier, username: identifier, email: identifier, password }` (Go + Spring compatible) and reads `accessToken || access_token || token`.
  - Single-flight `POST ${API_BASE}/auth/refresh` with `{ refreshToken }`, clearing tokens on 4xx.
- **Stores (`web/src/store/`)**: Redux `{ auth, app, docs, api }` + `[baseApi.middleware, errorToastMiddleware]` + Zustand `useCanvasUiStore` (`features/canvas/store/canvasUiStore.ts`).
- **Pure HTTP APIs (`web/src/infrastructure/api/`)**: `baseApi.ts`, `docsApi.ts`, `canvasApi.ts`, `notesApi.ts`, `seriesApi.ts` (no SQLite `queryFn`). Both `useYjsCollaboration` and `useCanvasYjsCollaboration` match `mini-editor` (`POST /base/yjs/auth/token`, rooms `doc-<id>` / `canvas-<id>`, `document-store` / `elements`+`files`, `4000ms` timeout).
- **Important Upgrade Only in `web`**: `web/src/infrastructure/api/baseApi.ts` handles **nested Go pagination** (`data: { items, total|total_items|totalItems, page, pageSize|page_size }`) AND outer-envelope Spring pagination — `mini-editor/src/infrastructure/api/baseApi.ts` does NOT yet handle nested `data.items`!

### Drift Between `web/src` (150 files) and `mini-editor/src`
- **94 files**: Byte-identical (modulo CRLF) to both `ex-ui` and `mini-editor`.
- **37 files**: Tailored for `web` (paths, `authClient`, `AppShell`, `RequireAuth`, HTTP-only APIs).
- **14 files identical ONLY to `ex-ui` (stale vs `mini-editor`)**:
  `code-block-affine.css`, `code-block-enhanced.tsx` (lacks dark-theme `MutationObserver`), `code-block-highlighter.ts`, `ExcalidrawEditorModal.tsx`, `WindowIcons.tsx`, `core/interfaces/{auth,docs}.ts`, `CanvasEditorPage.scss`, `SeriesManagerModal.tsx`, `DocEditorToolbar.scss`, `notesApi.ts`, `seriesApi.ts`, `store/appSlice.ts` (no `"git"` sidebar key), `store/authSlice.ts` (no `LOCAL_USER`).

## 2. `ex-ui/` (`tomo-ui-temp` v`0.1.0`, `539` files, `431` in `src/`)

Upstream full-featured Tauri v2 app targeting the legacy **Java/Spring + Kong** gateway (`https://api.tomoo.uk` or `http://127.0.0.1` via `--features local`). Kept only as a reference archive (`rev_*.bin`, `snapshot.json`, `base_log.txt` also sit in `ex-ui/`).

### Comparison: `ex-ui` vs `mini-editor` (`tomo-ui-lite`)
- **File Diff**: `ex-ui/src` (`431`) → `mini-editor/src` (`331`): `137` files removed from `ex-ui`, `37` new files added in `mini-editor`, `294` common (`207` identical, `87` modified). In `src-tauri/src/`: **0 Rust files removed** (`port_commands`, `script_commands`, `crypto_commands` remain compiled & registered!), `2` files added (`permission_commands.rs`, `translate_commands.rs`).
- **10 Feature Domains Stripped Out in `mini-editor`**:
  1. **API Client Workbench** (`features/api/` — 75 files: REST, GraphQL, WebSocket, SSE, Socket.IO, MQTT, cURL parser).
  2. **AI Agent Chat** (`features/chat/` — 11 files, `@ant-design/x` `XProvider`, HITL approval).
  3. **Secrets Vault** (`features/secrets/`, `secretsApi.ts`, `secretGroupsApi.ts`, `secretsSlice.ts` + AES-GCM SQLite encryption).
  4. **Scripts Runner** (`features/scripts/` — 18 files + `WorkspacePanel/ScriptsTab.tsx`).
  5. **PowerShell Runner** (`features/powershell/`, `powershellRunnerService.ts`).
  6. **Port Scanner / Killer** (`features/ports/`, `portService.ts`).
  7. **Desktop Batch Rename** (`features/batch-rename/`, `infrastructure/{services,tauri,web}/fileService.ts`) — replaced by mobile `MobileRenameView`.
  8. **Admin Users UI** (`features/users/`, though `usersApi.ts` remains).
  9. **Local-only Doc Drafts** (`useDrafts`, `useLocalDraftEditor`, `/doc-popup/draft/:localId`) — replaced by direct SQLite docs.
  10. **Forced Auth Gate** (`ProtectedRoute` guard, `SessionLostOverlay`, mounted `OfflineModePrompt`/`ConflictDialog`).
- **4 Major Capabilities Added in `mini-editor`**:
  1. **Go + Node Backend Split**: Split Vite proxies (`VITE_GO_API_URL`, `VITE_NODE_API_URL`, `VITE_NODE_WS_URL`), `dotenvy` in Rust `AuthCore`, `POST /base/yjs/auth/token`, 3-tier `cmd_translate`.
  2. **Local-First SQLite Full CRUD + Sync**: `canvasCacheService`, `noteCacheService`, `seriesCacheService`, rewritten `docCacheService`, `syncEngine`, `useConnectivityManager`, `useSyncDocs`, `contentHash`, `idUtils`, inline `AccountSection` login modal.
  3. **GitHub Source Control** (`features/git/`, `githubApi.ts`, `GitPanel.tsx`, `GithubSection.tsx`, `EntityGitBadge`, `diffEngine.ts`).
  4. **MobileShell & Android Storage**: `MobileShell.tsx`, `features/mobile/`, `permission_commands.rs`, `cmd_list_directory_contents`.

## 3. Agent Operating Rules for Sibling Projects

1. **NEVER read or modify `ex-ui/`** unless the user explicitly asks to port/inspect one of the 10 stripped features above.
2. **Treat `web/` as an active sibling for Docs & Canvas**: When fixing a bug in `mini-editor` inside shared BlockNote (`code-block-enhanced`, `excalidraw-block`, `useBlockNoteEditor`), Canvas (`useCanvasYjsCollaboration`, `Embedded*Frame`), or Yjs (`useYjsCollaboration`), note whether `web/` needs the matching patch.
3. **Cross-pollinating fixes**: Remember `web/src/infrastructure/api/baseApi.ts` already parses Go's nested `data.items` pagination, whereas `mini-editor/src/infrastructure/api/baseApi.ts` does not yet.
