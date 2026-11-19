# `07-playbooks.md` — Surgical Edit Checklists & Verification Matrix

Use these ordered file checklists to jump directly to exact touchpoints without scanning unrelated files.

## 1. Add or Modify a REST Endpoint (`go` + `mini-editor` [+ `web`])
1. **`go` backend**:
   - Domain/DTO: `go/internal/modules/<mod>/domain/*.go`, `dto/*.go`
   - Repo & Service: `go/internal/modules/<mod>/repository/*.go`, `service/*.go`
   - Handler & Routes: `go/internal/modules/<mod>/delivery/*.go`, `module.go` *(remember: `docs` mounts on `/api/v1`, `/go/api/v1`, `/go/v1`, `/api/v1/base`, `/go/api/v1/base`; `auth` & `github` mount ONLY on the first 3; use `response.OK`/`Created`/`PageResponse`)*.
   - Update unit/E2E tests in `go/internal/modules/<mod>/service/*_test.go` or `go/cmd/server/server_test.go`.
2. **`mini-editor` frontend**:
   - Contract types: `mini-editor/src/core/interfaces/*.ts`
   - RTK Query endpoint: `mini-editor/src/infrastructure/api/<mod>Api.ts` *(if Tauri uses SQLite-first `queryFn`, also update `src/infrastructure/tauri/*CacheService.ts` + `outboxService.ts`/`syncEngine.ts`!)*.
   - Verify `baseApi.ts` unwrapping matches Go's envelope (watch out for nested `data.items` vs flat `total`!).
3. **`web` SPA (only if Docs/Canvas/Series/Auth)**: Mirror contract + API change in `web/src/core/interfaces/*.ts` & `web/src/infrastructure/api/*Api.ts`.

## 2. Add a New Tauri Rust Command (`mini-editor`)
1. Implement OS/heavy logic in `mini-editor/src-tauri/src/services/*.rs` (keep commands thin).
2. Add `#[tauri::command]` in `mini-editor/src-tauri/src/commands/<mod>_commands.rs` (export in `commands/mod.rs`).
3. Register in `tauri::generate_handler![...]` inside `mini-editor/src-tauri/src/lib.rs` (watch `#[cfg(desktop)]` vs mobile support).
4. Grant permission if needed in `mini-editor/src-tauri/capabilities/{default,doc-popup,login,search-overlay,splash}.json`.
5. Wrap `invoke("...")` inside `mini-editor/src/infrastructure/tauri/*.ts` (guard with `isTauri()` from `src/infrastructure/platform.ts` so Web builds don't crash).

## 3. Add a GoldenLayout Panel & Detached Popup Window
1. Add union key, title, and default size to `mini-editor/src/presentation/layout/golden/panelRegistry.ts`.
2. Register lazy component in `mini-editor/src/presentation/layout/golden/GoldenLayoutHost.tsx` (`renderPanel` / component map).
3. Add trigger in `ActivityBar` / `FeaturesPanel` / `WorkspaceSidebar` / `command-palette/commands.tsx` if discoverable.
4. Support detached popup: add case in `mini-editor/src/presentation/features/panels/PanelPopupPage.tsx` AND map title in `mini-editor/src-tauri/src/commands/window_commands.rs` (`open_panel`) + add a `panel-popup` capability JSON in `src-tauri/capabilities/` if the popup needs restricted APIs.

## 4. Modify BlockNote Custom Blocks or Excalidraw Canvas
1. **BlockNote**: Edit `mini-editor/src/presentation/components/BlockNote/blocks/*` and register in `workspaceSchema` inside `useBlockNoteEditor.ts`.
   - **Invariant**: NEVER break ProseMirror 4-package pins (`pnpm-workspace.yaml` + `vite.config.ts` `resolve.dedupe`).
   - **Invariant**: Wrap custom React node views against Yjs transient `"Cannot find node position"` errors (pattern: `CodeBlockErrorBoundary` in `code-block-enhanced.tsx`).
   - If block creates draft canvases (`draft-<uuid>`), update `canvasFlushHelper.ts` (`flushDraftCanvases`).
2. **Canvas**: Edit `mini-editor/src/presentation/features/canvas/pages/CanvasEditorPage/` or `hooks/useCanvasYjsCollaboration.ts`.
   - Keep `Y.Map("elements")` / `Y.Map("files")` & `hasVisualChange()` filter intact.
3. Check if matching files in `web/src/components/BlockNote/` or `web/src/features/canvas/` also need the fix.

## 5. Modify Yjs Realtime Collaboration or Persistence
1. **Token minting**: `go/internal/modules/docs/{delivery/yjs_handler.go,service/yjs_service.go}` (`GenerateYjsToken`) ↔ `mini-editor/src/infrastructure/api/{docsApi,canvasApi}.ts` (`POST /base/yjs/auth/token`).
2. **WS hub & auth**: `node/src/roles/server.js` ↔ `mini-editor/src/presentation/features/{docs/hooks/useYjsCollaboration,canvas/hooks/useCanvasYjsCollaboration}.ts` (room names `doc-<id>` / `canvas-<id>`, `?yauth=<jwt>`).
3. **Persistence & revisions**: `node/src/roles/worker.js`, `node/src/yjs/{javaStorage,revisions,reconstruct,utils}.js` ↔ `go` `/yjs/internal/*` handlers in `yjs_handler.go` + `yjs_service.go`.
4. **Gotchas to remember**: `Y.XmlFragment("document-store")` for BlockNote; `node:20-slim` Dockerfile; `AUTH_PUBLIC_KEY` P-384 JWK requires `"key_ops":["verify"]`; root `docker-compose.yml` currently lacks `worker`.

## 6. Modify GitHub / Git Workspace Sync
1. Backend Git/Disk ops: `go/internal/modules/github/{delivery/github_handler.go,service/{github_service,workspace_sync,manifest_manager,cache_manager,conflict_service,repo_lock_manager}.go}`.
2. Backend DB bridge: `DocsService.SyncFromGit` in `go/internal/modules/docs/service/docs_service.go`.
3. Frontend API & UI: `mini-editor/src/core/interfaces/github.ts`, `mini-editor/src/infrastructure/api/githubApi.ts`, `GitPanel.tsx`, `GithubSection.tsx`, `features/git/*`, `useGitDocSync.ts`, `useConnectivityManager.ts`.
4. Check known mismatches #1–#3 in [05-cross-service-contracts.md](05-cross-service-contracts.md) before testing `disconnect`, `repo/create`, or `conflicts`.

## 7. Pre-Done Verification Matrix

| Sub-Project | Command(s) | Pass Conditions & Caveats |
|---|---|---|
| `mini-editor` (TS/Vite) | `pnpm --dir mini-editor build:frontend` | Runs `tsc && vite build --mode production`; catches `noUnusedLocals`/`noUnusedParameters` & bundle issues. |
| `mini-editor` (Rust) | `cargo check --manifest-path mini-editor/src-tauri/Cargo.toml` | Also test `--features local` if modifying `AuthCore` URL logic. |
| `go` (Unit/Service) | `$env:CGO_ENABLED="1"; go test -C go ./internal/infrastructure/security/... ./internal/modules/...` | Uses in-memory SQLite (requires CGO + gcc/MinGW). |
| `go` (HTTP E2E) | `$env:CGO_ENABLED="1"; go test -C go -run TestE2E ./cmd/server` | Skips `TestGithubIntegrationE2E` (which attempts real push on Step 9). |
| `go` (Postgres) | `go test -C go ./internal/infrastructure/database/...` | Requires live Postgres matching `go/.env.local`. |
| `node` | `npm --prefix node run build && npm --prefix node test` | `tsc` compiles TS + copies `.js`; note pre-existing `test/javaStorage.test.js:11` (`parseDocId('doc-abc') === null`) conflict. |
| `web` | `pnpm --dir web typecheck && pnpm --dir web build` | Runs `tsc --noEmit` + Vite production bundle. |
