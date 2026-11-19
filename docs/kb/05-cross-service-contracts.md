# `05-cross-service-contracts.md` — Integration Flows, Env Matrix & Known Mismatches

## 1. End-to-End Integration Flows

1. **Auth & Token Refresh**:
   - **Tauri (`mini-editor`)**: UI → `authBridge` → Rust `AuthCore` (`auth_commands.rs`) → `POST {base}/auth/login` (`{ identifier, password }`) → Go returns HS256 `accessToken` + opaque UUIDv4 `refreshToken`. Rust stores refresh token in OS keyring (or `{app_data_dir}/refresh_token` on Android), keeps access token in memory (`exp > now + 30s`), single-flight refreshes via `POST {base}/auth/refresh` (`{ refreshToken }`), emits `"auth://changed"`.
   - **Web (`mini-editor` web fallback / `web` SPA)**: `authBridge.ts` / `authClient.ts` stores `tomo_access_token` (+ `tomo.refreshToken` in `web`) in `localStorage`; `baseApi` attaches `Authorization: Bearer` and retries once on `401`.
2. **Realtime Yjs Collaboration & Persistence**:
   - Client (`useYjsCollaboration` / `useCanvasYjsCollaboration`) calls Go `POST /api/v1/base/yjs/auth/token` (`{ doc_id }` or `{ canvas_id }`, `access_mode: "write"`). Go mints 24h HS256 `YjsClaims` JWT signed with `YJS_SECRET`.
   - Client connects `WebsocketProvider` to `wss://.../ws/yjs/{doc|canvas}-<id>?yauth=<jwt>` → `node-yjs` (`server.js`).
   - `server.js` validates HS256 (`YJS_SERVICE_SHARED_SECRET`/`YJS_SECRET`), else ES384 (`AUTH_PUBLIC_KEY`), else unverified `decodeJwt` → calls Go `GET /api/v1/yjs/auth/perm/:room/:userid` → opens/replays Redis stream `${prefix}:room:<room>:index` + `store.retrieveDoc` (`GET /yjs/internal/{docs|canvases}/:id/snapshot?branch=main`).
   - *(Requires `node` `worker` role)* `worker.js` claims `${prefix}:worker`, runs `createRevisionCallback` (`GET .../revisions/head` → `POST .../revisions`), calls `JavaStorage.persistDoc` (`PUT /yjs/internal/{docs|canvases}/:id/snapshot?branch=main` + `POST /yjs/internal/docs/:id/meta` extracting plaintext from `Y.XmlFragment('document-store')`).
   - **Shared Y.Doc Types**: Docs = `Y.XmlFragment("document-store")`; Canvas = `Y.Map("elements")` + `Y.Map("files")`.
3. **Local-First Offline Sync (`mini-editor`)**:
   - Tauri `docsApi` writes `sqlite:tomo-docs.db` (`docs` + `content_hash` SHA-256). If real token present, background-syncs `/base/docs*`; else enqueues `"doc"` mutation in `outbox`.
   - `useConnectivityManager` polls `pingServer()` (`15s` offline / `60s` online); on reconnect runs `syncEngine.replayOutbox()` (FIFO, `MAX_RETRIES=5`), invalidates `Doc` tags, pulls Git repo, and syncs Git workspace. Manual bulk sync uses `useSyncDocs` (`POST /base/docs/sync/push`, `GET /base/docs/sync/pull`).
4. **GitHub Workspace Sync**:
   - `mini-editor` (`githubApi.ts` / `GitPanel.tsx` / `GithubSection.tsx`) calls Go `/api/v1/github/*` → Go `github` module clones/locks `<WorkspaceRoot>/<userID>/<owner>_<repo>` (`go-git/v5`), maintains `docs/*.json`, `canvases/*.json`, `.tomo/manifest.json`, `.cache_metadata.json`, and calls `DocsService.SyncFromGit` on workspace sync.
   - Opening a Git-tracked doc missing on backend triggers `useGitDocSync` → pulls file & `POST /api/v1/base/docs/sync-from-git`.
5. **Translation 3-Tier Cascade**:
   - **Tauri**: `translateApi` → `cmd_translate` (`1h` Rust memory cache → `http://127.0.0.1:8006/api/v1/translate` `1.5s` timeout → direct `translate.googleapis.com/translate_a/single` cycling 4 client IDs).
   - **Web**: `GET /api/v1/translate` (Vite proxy → `node-api :8006` w/ 3-day `NodeCache` + IP rate-limit `15/min`) → direct browser Google Translate fallback.

## 2. Unified Environment & Port Matrix

| Component | Local Dev | Docker Compose (`docker-compose*.yml`) | Production (`.env.production` / `.env`) |
|---|---|---|---|
| `mini-editor` Vite / Tauri | Vite `:1420`; `VITE_GO_API_URL=http://127.0.0.1:8080`, `VITE_NODE_API_URL=http://127.0.0.1:8006`, `VITE_NODE_WS_URL=ws://127.0.0.1:1234`, `TOMO_API_BASE=http://127.0.0.1:8080/api/v1` | Talks to mapped host ports (`8080`, `8006`, `1234`) | `VITE_GO_API_URL=http://api.tomoo.uk/go`, `TOMO_API_BASE=http://api.tomoo.uk/go/v1`, `VITE_NODE_API_URL=http://api.tomoo.uk/node`, `VITE_NODE_WS_URL=wss://ws.tomoo.uk` |
| `web` SPA | Vite `:5173` (proxies `/api`, `/actuator`, `/api/v1/translate`, `/ws/yjs`) | — | Proxies or points to `https://api.tomoo.uk/{go,node}` & `wss://ws.tomoo.uk/ws/yjs` |
| `go` (`go-backend`) | `:8080` (`DB_DRIVER=sqlite` w/ CGO or local Postgres) | `:8080` (`DB_DRIVER=postgres`, `CGO_ENABLED=0`, mem `350M`, vol `tomo_workspace_data:/app/data`) | Behind `/go` reverse proxy (`api.tomoo.uk/go`) |
| `node-api` (`YHUB_ROLE=api`) | `:8006` (`npm run dev:api`) | `:8006` (`mem_limit: 384m`, `OTEL_SDK_DISABLED=true`) | Behind `/node` reverse proxy (`api.tomoo.uk/node`) |
| `node-yjs` (`YHUB_ROLE=server`) | `:1234` (`AUTH_PERM_CALLBACK=http://127.0.0.1:8080/api/v1/yjs/auth/perm`) | `:1234` (`AUTH_PERM_CALLBACK=http://go-backend:8080/api/v1/yjs/auth/perm`, `mem_limit: 450m`) | `wss://ws.tomoo.uk/ws/yjs` |
| `node` `worker` (`YHUB_ROLE=worker`) | Reconstruct HTTP `:1236` (`YJS_JAVA_BASE_URL=http://127.0.0.1:8080/api/v1`) | **MISSING from `docker-compose.yml`!** | Must be deployed separately or added to Compose |

## 3. Master Known Contract Mismatches & Active Bugs (15 Verified)

| # | Severity | Components & Exact Files | Verified Mismatch / Bug |
|---:|---|---|---|
| **1** | High | `mini-editor/src/infrastructure/api/githubApi.ts` vs `go/internal/modules/github/module.go` | `githubApi.ts` calls **`DELETE /github/disconnect`**; Go registers **`POST /github/disconnect`**. |
| **2** | High | `mini-editor/src/infrastructure/api/githubApi.ts` vs `go/internal/modules/github/module.go` | `githubApi.ts` calls **`POST /github/repo/create`**; Go registers **`POST /github/repos/create`** (plural). |
| **3** | High | `mini-editor/src/infrastructure/api/githubApi.ts` vs `go/internal/modules/github/delivery/github_handler.go` | `GET /github/repo/conflicts`: frontend expects `{ conflicts: GitConflictItem[] }`, Go returns `{ has_conflict, conflicted_files, ahead_count, behind_count }`. |
| **4** | High | `mini-editor/src-tauri/src/commands/auth_commands.rs`, `authBridge.ts`, `authApi.ts` vs `go/internal/modules/auth/delivery/http_handler.go` | Client sends **`POST /auth/logout` with empty body** (+ Bearer); Go `AuthHandler.Logout` requires JSON `{ refresh_token \| refreshToken }` and returns `400`. |
| **5** | High | `mini-editor/src/infrastructure/tauri/authBridge.ts:37` vs `go/cmd/server/main.go` | If `TOMO_API_BASE` is unset, `authBridge.ts` constructs `${VITE_GO_API_URL}/v1`; on `http://127.0.0.1:8080` that yields `/v1`, which Go does NOT mount (Go mounts `/api/v1`, `/go/api/v1`, `/go/v1`). |
| **6** | High | `mini-editor/src/infrastructure/api/{docsApi,baseApi}.ts` vs `go/internal/modules/docs/delivery/docs_handler.go` | `docsApi.ts` sends 0-based `page`, `size`, `seriesId`, `sortBy`, `sortDirection` & `/search?q=`; Go `ListDocs` reads 1-based `page`, `page_size`, `search`, `parent_id` and returns `PageResponse` nested inside `data` (`data.items`, `data.total_items`). `mini-editor/baseApi.ts` expects flat top-level `total` (fixed only in `web/src/infrastructure/api/baseApi.ts`). |
| **7** | High | `docker-compose.yml` vs `node/src/roles/worker.js` | Root `docker-compose.yml` omits a `YHUB_ROLE=worker` service — Redis Yjs streams accumulate without persisting snapshots/revisions to Go. |
| **8** | High | `go/internal/modules/docs/service/yjs_service.go` vs `node/src/yjs/{javaStorage,revisions}.js` | `SaveSnapshotBinary` stores full V2 update blob in `doc.YjsStateVector` (ignoring `X-Yjs-State-Vector`); `GetStateVectorBinary` & `GetRevisionHead.stateVector` return that V2 blob instead of an encoded state vector (breaking `revisions.js` delta calculation); `GetRevisionChain` returns all revisions desc instead of keyframe-to-target asc; `ReconstructDocument` returns `rev.SnapshotBlob` directly instead of calling `worker:1236/reconstruct`. |
| **9** | Med | `go/internal/modules/docs/module.go` & `yjs_service.go` | `GET\|PUT /yjs/internal/canvases/:docId/{snapshot,state-vector}` call `GetInternalSnapshot`/`PutInternalSnapshot`, which query `docRepo.FindByID` (`docs` table, not canvases → `404` for standalone canvases). |
| **10** | Med | `node/src/yjs/reconstruct.js` vs `mini-editor` / `web` / `javaStorage.js` | `/analyze` and `/init-snapshot` read/write `ydoc.getText('content')`, whereas BlockNote & `javaStorage.extractPlainText` use `ydoc.getXmlFragment('document-store')`. |
| **11** | High | `node/src/roles/server.js` & `go/internal/modules/docs/module.go` | `server.js` `verifyToken` step 3 unconditionally calls unverified `jose.decodeJwt(token)` in all envs; Go `/yjs/internal/*` has zero auth middleware; `/yjs/auth/perm/:room/:userid` unconditionally returns `yaccess: "rw"`. |
| **12** | Med | `mini-editor/src-tauri/capabilities/` vs `window_commands.rs` | `open_panel` spawns `panel-popup-{type}-{uuid}`, which has **no** capability file under `capabilities/`. |
| **13** | Med | `mini-editor/src/infrastructure/api/*.ts` & `ServicesTab.tsx` vs `go/` | Legacy Spring endpoints (`docsApi` revision single/restore & `bin-revisions` & `/admin/search/*`, web `canvasApi`/`notesApi` CRUD, `usersApi` `/admin/users/*`, `ConflictDialog` `/base/{canvas,notes,secret-groups}`, `ServicesTab` Spring health components) are absent in `go/`. |
| **14** | Med | `go/internal/modules/auth/{service,dto}` | `Register` leaves `User.Username = ""` (2nd registration violates `uniqueIndex`), allows arbitrary client `role`, and hardcodes `TokenResponse.expiresIn = 7200`. |
| **15** | Low | `mini-editor/src/core/interfaces/docs.ts` vs `go/internal/modules/docs/domain/doc.go` | Frontend `DocDto` has `seriesId`/`seriesName`, but Go `docs` table has **no `series_id` column** (`Series` & `Doc` are unlinked in DB). |
