# `01-mini-editor-frontend.md` — `mini-editor/src` Frontend Architecture

Stack (`package.json` `tomo-ui-lite@0.1.1`): React 19.1, TS ~5.8.3 (`strict`), Vite 7.0.4 (`@/* -> ./src/*`), Tailwind v4 (`@tailwindcss/vite`), Ant Design 6, BlockNote 0.51.2 + Mantine 8, Excalidraw 0.18.1, GoldenLayout 2.6.0, Redux Toolkit 2.12 + RTK Query, Zustand 5, Yjs 13.6 + `y-websocket` 3.0.

## 1. Multi-Entry Boot & Routing

Vite builds 3 HTML entries (`vite.config.ts` `build.rollupOptions.input`):

| Entry | JS Root | Purpose & Boot Flow |
|---|---|---|
| `index.html` | `src/main.tsx` | Adds `html.win-search` when `pathname === "/search"` (keeps Tauri search overlay transparent before paint). Awaits `resolveMobile()` (`coord_is_mobile`); if mobile adds `html.force-light` (gating Tailwind `@custom-variant dark` in `src/index.css`) & sets `#boot-bg` white. Mounts `<MainGate>` (`features/bootstrap/MainGate.tsx`) → `hydrateFromStorage()` → Tauri `auth_peek_access_token` (or `LOCAL_USER`) → `setOnline(true)` → 2 rAF → `coord_ready` → `<App />`. |
| `splash.html` | `src/splash/splash.tsx` | Renders `#boot-splash` inline → `useBootstrap()` (hydrates storage, sets `LOCAL_USER`, `setTrayStatus("online")`, `warmSharedResources()`, min `500ms`) → `<InitScreen>` → registers 3 global shortcuts (`quickCreateDoc`, `showMainWindow`, `openSearch`) → invokes `coord_start`. |
| `login.html` | `src/login/login.tsx` | `MemoryRouter` (`/login`, `/register`, `/verify`, `* -> /login`) in `<AuthLayout>`; invokes `coord_ready` after 2 rAFs. |

**`src/App.tsx` Routing**: Calls `useConnectivityManager()`, wraps routes in `<BrowserRouter>` + `<ProtectedRoute />` (**currently pass-through `<Outlet />`, no auth redirect**):
- `/doc-popup/:id` → `DocPopupPage` (standalone Tauri popup for a doc)
- `/panel-popup/:panelType` → `PanelPopupPage` (parses base64 state from `?s=`, supplies bridge `GoldenLayoutContext` calling `coord_open_in_main`)
- `/settings` → `SettingsPage` nested (`index -> general`, `general`, `account`, `github`, `shortcut`, `search`, `about`)
- `/*` → `isMobile() ? <MobileShell /> : <WorkspaceShell />`

## 2. Shells & GoldenLayout (`src/presentation/layout/`)

- **`WorkspaceShell.tsx`**: Composes `AppBar (variant="dashboard")` + `ActivityBar` (48px rail toggling 5 sidebars: `features | docs | series | git | demo` + bottom Settings & avatar) + collapsible `WorkspaceSidebar` + `GoldenLayoutHost` + collapsible bottom `WorkspacePanel` (4 tabs: `Layout State`, `Open Panels`, `Services` polling `/actuator/health` every 30s, `Windows` listing Tauri webviews every 5s) + `WorkspaceStatusBar` (Git branch, ahead/behind, dirty count `*N`, panel count, saved indicator) + `TabContextMenu` + `CommandPalette`. Listens for Tauri event `tomo:open-in-main`.
- **GoldenLayout (`layout/golden/`)**:
  - **9 Registered Panels (`panelRegistry.ts`)**: `dashboard`, `docs-list`, `doc-editor`, `canvas-list`, `canvas-editor`, `series-detail`, `settings`, `search`, `translate` (lazy-loaded in `GoldenLayoutHost.tsx`, mounted via React `createPortal` in `useGoldenLayoutSetup.ts`).
  - **Presets (`presetLayouts.ts`)**: `defaultGoldenLayoutConfig`, `rowDemoLayout`, `columnDemoLayout`, `stackDemoLayout`, `goldenSpiralLayout`, `nestedStacksLayout`.
  - **Persistence & Hacks**: Debounced 600ms save to `localStorage["tomo-gl-layout"]`. `useGoldenLayoutSetup.ts` monkey-patches `Header.prototype.updateTabSizes` (`999999`) to stop tab hiding; `useGLExtensions.ts` adds icons, tooltips, middle-click close, right-click `gl-tab-contextmenu` (Pin/Close/Open in New Window), wheel tab-strip scroll, and drag sources.
- **`MobileShell.tsx`**: Safe-area header/bottom-nav switching `"menu"` (`MobileMenuView`), `"docs"` (`MobileDocsView`), `"rename"` (`MobileRenameView`).

## 3. State Management (`src/presentation/store/` & `features/canvas/store/`)

| Store / Slice | Key State | Notes & Persistence |
|---|---|---|
| `appSlice` | `theme: "light"`, `sidebarOpen`, `activeSidebar` (`features\|docs\|series\|demo\|git`), `lastActiveSidebar`, `panelOpen`, `pageTitle`, `connectivity` (`online\|connection-lost\|offline\|reconnecting`) | Exports `selectIsOnline`, `selectConnectivity`, `selectIsOfflineMode` |
| `authSlice` | `user: AuthUser \| null`, `status: "unknown"\|"authed"\|"guest"` | Exports `LOCAL_USER` (`userId: 0, email: "local@device"`), `decodeUser(token)` |
| `docsSlice` | `currentDocId: number \| null`, `isDirty: boolean` | Tracks active editor dirty state |
| `settingsSlice` | `shortcuts: { quickCreateDoc, showMainWindow, openSearch }` | Persisted via `hydrate.ts` to SQLite `app_kv["settings"]` |
| `conflictsSlice` | `pending: ConflictRecord[]` | `addConflict`, `resolveConflict`, `clearAllConflicts` |
| `useCanvasUiStore` *(Zustand)* | `excalidrawAPI`, `insertMenuOpen`, `pendingDropPoint` | Only Zustand store (`features/canvas/store/canvasUiStore.ts`) |

Store middleware stack (`store/index.ts`): `[baseApi.middleware, errorToastMiddleware, cacheMiddleware, mutationCacheMiddleware]`.

## 4. API Layer (`src/infrastructure/api/`)

- **`baseApi.ts`**: `BASE_URL = "/api/v1"`, `tagTypes = ["Doc", "Canvas", "Note", "SearchIndex", "User", "Series", "GithubAccount", "GitStatus", "GitHistory"]`. Attaches `Authorization: Bearer` via `authBridge.getAccessToken()`; on `401`, refreshes once then clears user; `FETCH_ERROR` / `502..504` dispatches `connectionLost()`; success dispatches `setOnline(true)`; unwraps `("status" in raw || "success" in raw) && "data" in raw` (`total`→`PageResult`, `hasMore`→`ScrollResult`, else `raw.data`).
- **`sessionBootstrap.ts`**: `pingServer(4000)` probes `["/health", "/go/health", "/healthz", "/actuator/health"]`.
- **`errorToastMiddleware.ts`**: AntD `message.error` for rejected RTK actions (ignores `FETCH_ERROR`).
- **`cacheMiddleware.ts`**: Write-through SQLite `entity_cache` for `canvas` & `note`.

| API File | Primary Endpoints & Behavior | Tauri Adapter |
|---|---|---|
| `authApi.ts` | `POST /auth/{login,register,logout}`, `GET /auth/me` | Auth uses `authBridge` → Rust `AuthCore` |
| `docsApi.ts` | CRUD `/base/docs/{list,lazy,:id,search}`, revisions/bin-revisions, `/admin/search/*`, `/base/docs/sync-from-git`, `/base/docs/sync/{push,pull}`, `POST /base/yjs/auth/token` | SQLite-first (`docCacheService`) + bg remote sync + `outbox` |
| `canvasApi.ts` | CRUD `/base/canvas/{list,lazy,:id,search}`, `POST /base/yjs/auth/token` | Tauri pure SQLite CRUD (`canvasCacheService`) |
| `notesApi.ts` | CRUD `/base/notes/{list,lazy,:id,search}` | Tauri pure SQLite CRUD (`noteCacheService`) |
| `seriesApi.ts` | CRUD `/base/series/{list,:id,search}` | SQLite-first (`seriesCacheService`) + bg sync |
| `githubApi.ts` | 24 endpoints `/github/{user,connect,disconnect,repos,repo/*,files/*,cache/prune,workspace/*}` | Pure HTTP (`go` github module) |
| `usersApi.ts` | `/admin/users/*` | **Unused** in `mini-editor` UI |
| `translateApi.ts` | Web: `GET /api/v1/translate?q=&sl=&tl=` → direct Google fallback | Tauri: `invoke("cmd_translate")` |

## 5. Local-First SQLite & Offline Sync (`src/infrastructure/tauri/`)

`sqliteDb.ts` connects to `sqlite:tomo-docs.db` and lazily creates tables via `CREATE TABLE IF NOT EXISTS`:
- `app_kv` (`kvStore.ts`, `localStorage` fallback on Web)
- `docs` (`docCacheService.ts`: `local_id, backend_id, backend_uuid, slug, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty, content_hash`)
- `canvas` (`canvasCacheService.ts`), `notes` (`noteCacheService.ts`), `series` (`seriesCacheService.ts`)
- `entity_cache` (`entityCacheService.ts`, generic cache for `canvas`/`note`; crypto helpers are passthroughs)
- `outbox` (`outboxService.ts`: FIFO mutation queue with update/delete coalescing & `remapLocalId`)
- **Sync Engine**: `syncEngine.ts` `replayOutbox()` replays `"doc"` items FIFO (`MAX_RETRIES = 5`), triggered by `useConnectivityManager.ts` (polls 15s offline / 60s online; on `"reconnecting"` replays outbox, invalidates `Doc`, pulls Git repo & syncs workspace). `useSyncDocs.ts` handles manual batch `POST /base/docs/sync/push` & `GET /base/docs/sync/pull` with SHA-256 `contentHash.ts`. `idUtils.ts` (`parseOrHashId`) hashes backend UUIDs into deterministic positive numeric IDs.

## 6. Editors, Custom Blocks & Yjs Collaboration

- **BlockNote (`presentation/components/BlockNote/`)**:
  - `useBlockNoteEditor.ts`: Creates `workspaceSchema` replacing `codeBlock` with `createCodeBlockEnhanced(askAIRef)` and adding `excalidraw: excalidrawBlock`. Binds Yjs to `ydoc.getXmlFragment("document-store")` (`COLLAB_FRAGMENT`), pastes `text/plain` verbatim inside `codeBlock`, converts files to inline `data:` URLs (`uploadFile`), scopes `Ctrl/Cmd+A` inside code blocks.
  - `blocks/code-block-enhanced.tsx` (760 lines): Shiki overlay (49 langs, 60ms debounce, `MutationObserver` dark mode), Mermaid live preview (`react-zoom-pan-pinch`), `CodeBlockErrorBoundary` recovering ProseMirror `"Cannot find node position"` during Yjs transitions.
  - `blocks/excalidraw-block.tsx` + `ExcalidrawEditorModal.tsx`: Embeds canvas via `draft-<uuid>` or existing ID; `canvasFlushHelper.ts` (`flushDraftCanvases`) persists drafts on Doc save; PNG thumbnail cached in `CanvasMetadata.thumbnail`.
  - `DocTOC.tsx`: Live block outline + bookmarks (`app_kv["doc-toc-prefs-v1"]`).
- **Excalidraw Canvas (`presentation/features/canvas/`)**:
  - `CanvasEditorPage.tsx` (905 lines): Yjs sync via `useCanvasYjsCollaboration` (`Y.Map("elements")`, `Y.Map("files")`, `hasVisualChange()` loop guard, awareness cursors/selections), `EmbeddedDocFrame` (`tomo://doc/{id}`), `EmbeddedNoteFrame` (`tomo://note/{id}`), drag-drop from `DocsSidebarPanel` (`DOC_DRAG_TYPE`), Git save/pull to `canvases/canvas-{id}.json`, touch Navigate/Edit mode toggle.
- **Yjs Hooks**: Both `useYjsCollaboration.ts` (`doc-{id}`) and `useCanvasYjsCollaboration.ts` (`canvas-{id}`) call `POST /base/yjs/auth/token`, refresh 60s pre-expiry, fall back solo after `4000ms`, and resolve WS URL: `VITE_YJS_SERVER_URL` > `${VITE_NODE_WS_URL}/ws/yjs` > `res.url` > `location.host/ws/yjs` > `ws://127.0.0.1:1234/ws/yjs`.

## 7. Feature Modules (`src/presentation/features/`, 187 files)

| Module (files) | Key Components / Capabilities |
|---|---|
| `auth` (16) | `useAuth`, `LoginForm` (2-step; OAuth buttons stubbed), `RegisterForm`, `VerifyPage` (mock `"123456"`), `deviceAuth` WebAuthn |
| `bootstrap` (4) | `MainGate`, `hydrate`, `InitScreen` |
| `canvas` (26) | `CanvasListPage`, `CanvasEditorPage`, `EmbeddedDocFrame`, `EmbeddedNoteFrame`, `ShapeActionToolbar`, `canvasUiStore` |
| `command-palette` (7) | `Ctrl+P` / `Ctrl+Shift+P`, providers `""` (all), `"@"` (docs), `"#"` (canvas), `">"` (commands), `fuzzy.ts` |
| `dashboard` (6) | `DashboardPage`, legacy `Sidebar` |
| `docs` (68) | `DocsPage`, `DocEditorPage` (891 lines), `DocPopupPage`, `useDocEditor`, `useYjsCollaboration`, `useGitDocSync`, `useSyncDocs`, `FindReplaceBar`, `DocProperties`, `DocRevisionPanel`/`Preview`, MD/HTML/Zip/Notion/PNG import & export |
| `git` (11) | `DocGitHistoryDrawer`, `DocSnapshotModal`, `GitDiffModal`, `GitVisualDiffViewer`, `GitConflictModal`, `diffEngine.ts` |
| `mobile` (6) | `MobileMenuView`, `MobileDocsView`, `MobileRenameView`, `FolderScannerModal`, `StoragePermissionModal` |
| `panels` (4) | `PanelPopupPage`, `PanelPopupAppBar` |
| `search` (21) | `SearchOverlayPage` (`Esc`/blur close), `WindowsSearch` (concurrent docs/notes/canvas), `SidePanel` |
| `series` (2) | `SeriesDetailPanel`, `AddDocPicker` |
| `settings` (11) | `SettingsPage` + `General`, `Account` (inline login modal), `Github`, `Shortcut`, `Search` (ADMIN), `About` |
| `sync` (2) | `ConflictDialog`, `OfflineModePrompt` *(neither mounted in `App.tsx`/`WorkspaceShell.tsx`)* |
| `translate` (3) | `TranslatePage` (11 langs, 400ms debounce, `localStorage["tomo-translate-history"]`) |

## 8. Dead / Stubbed / Unused Map & Production Quirks

- **Unused npm deps (`package.json`)**: `mqtt`, `socket.io-client`, `otpauth`, `lit`, `async-mutex`, `@ant-design/x`, `react-resizable-panels`, `@defensestation/blocknote-mermaid`.
- **Stubs & unmounted files**: `useSyncEngine.ts`, `useConnectivityMonitor.ts`, `warmSharedResources.ts`, `docCacheService.getPendingSync()` (returns `[]`), `ConflictDialog.tsx`, `OfflineModePrompt.tsx`, `html-preview-block.tsx` (unregistered in `workspaceSchema`), `usersApi.ts`, `patches/@blocksuite__icons@2.2.17.patch`.
- **Windows WebView2 quirk (`useWindowControls.ts`)**: Blocks `close()` for `250ms` after `onMoved` so synthetic post-drag clicks do not close frameless windows.
