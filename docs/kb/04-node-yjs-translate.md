# `04-node-yjs-translate.md` — `node/` Microservice (`tomo-node`)

Single Node `>=20` ESM codebase (`"type": "module"`, TS `5.6` with `allowJs: true` copying `.js` Yjs/tracing files untouched to `dist/`). Runtime entrypoint is selected by **`YHUB_ROLE=server | worker | api`**: `node --import ./dist/tracing.js dist/roles/${YHUB_ROLE}.js`.

## 1. Container, Tracing & Critical Constraints

- **Dockerfile (`node/Dockerfile`)**: Uses **`node:20-slim` (Debian/glibc)**. NEVER switch to Alpine/musl — `@y/redis` depends on `uWebSockets.js` glibc-only prebuilt binaries.
- **ESM Import Hoisting Gotcha**: In `server.js` and `worker.js`, inline fallback assignments for `process.env.AUTH_PUBLIC_KEY` and `process.env.REDIS` sit between static imports and cannot beat static import evaluation (`@y/redis` calls `env.ensureConf('redis')` / `'auth-public-key'` at module load). Both MUST exist in `.env` or process environment beforehand.
- **`src/tracing.js`**: Starts OpenTelemetry `NodeSDK` (`OTEL_EXPORTER_OTLP_ENDPOINT`, disabled in Compose via `OTEL_SDK_DISABLED=true`, `@opentelemetry/instrumentation-fs` off) and swallows `SocketClosedUnexpectedlyError` / Redis socket exceptions in `uncaughtException` instead of crashing.
- **Unused Dependency**: `ioredis` in `package.json` is unused (`@y/redis` uses `redis` v4).
- **Compose Gap**: Root `docker-compose.yml` deploys `node-api` (`api`) and `node-yjs` (`server`) only — **no `worker` container is defined**.

## 2. Role `server` (`src/roles/server.js`, default port `1234`)

- **Port Resolution**: `YJS_PORT ?? NODE_YJS_PORT ?? (YHUB_ROLE === 'server' ? (PORT ?? '1234') : '1234')`.
- **Engine & Routes (`uWebSockets.js` + `@y/redis`)**:
  - WS routes: `/:room`, `/ws/yjs/:room`, `/ws/:room` *(each call opens 2 Redis clients = 6 Redis connections total)*. `maxPayloadLength: 100 MB`, `idleTimeout: 60s`.
  - HTTP routes: `GET /health`, `GET /ws/yjs/health` → `200 {"status":"ok","role":"server","prefix":"..."}`; `GET /*` → `426 Upgrade Required`.
- **Room Parsing (`src/yjs/utils.js`)**: `parseRoom` matches `/^(doc|canvas)-([a-zA-Z0-9_\-]+)$/`. Non-matching rooms skip backend persistence.
- **Auth (`extractToken` → `verifyToken` → `checkAuth`)**:
  1. Token extracted from `Sec-WebSocket-Protocol: yauth-<jwt>` or `?yauth=<jwt>`.
  2. Verified in 3 steps: (a) HS256 (`YJS_SERVICE_SHARED_SECRET ?? YJS_SECRET ?? <dev fallback in server.js>`), (b) ES384 (`AUTH_PUBLIC_KEY` P-384 JWK), (c) **unconditional unverified `jose.decodeJwt(token)` fallback** (not gated by `NODE_ENV`!).
  3. Missing token allowed only when `APP_ENV === 'development' || !NODE_ENV || NODE_ENV === 'development'` (`dev-guest`).
  4. Calls `GET ${AUTH_PERM_CALLBACK}/${room}/${encodeURIComponent(userid)}` (default `http://127.0.0.1:8080/api/v1/yjs/auth/perm`); reads `perm.yaccess === 'rw'`, silently falls back to token's `access_mode` if unreachable.
- **Redis Streams**: Room stream `${REDIS_PREFIX}:room:${encodeURIComponent(room)}:index` (hardcoded `docid="index"`), queue `${REDIS_PREFIX}:worker`. On open calls `store.retrieveDoc` + replays stream; never calls `store.persistDoc` itself.

## 3. Role `worker` (`src/roles/worker.js` + `src/yjs/*`, default HTTP port `1236`)

- **Stream Consumer (`@y/redis` `createWorker`)**: Claims tasks from `${prefix}:worker` via `XAUTOCLAIM` (`REDIS_TASK_DEBOUNCE`, default `10000` ms in `@y/redis`; `REDIS_MIN_MESSAGE_LIFETIME` `60000` ms). When `tr.changed.size > 0`, runs `createRevisionCallback` (errors swallowed) then `JavaStorage.persistDoc`, then trims stream via `XTRIM MINID`.
- **`JavaStorage` (`src/yjs/javaStorage.js`)** — calls `YJS_JAVA_BASE_URL` (default `http://127.0.0.1:8080/api/v1`) with `Authorization: Bearer ${sharedSecret}`:
  - `persistDoc`: `PUT /yjs/internal/{docs|canvases}/${id}/snapshot?branch=main` (`Content-Type: application/octet-stream`, `X-Yjs-State-Vector: <b64>`, body = `Y.encodeStateAsUpdateV2(ydoc)`). For `doc-*` only, extracts plaintext recursively from **`Y.XmlFragment('document-store')`** and fire-and-forgets `POST /yjs/internal/docs/${id}/meta` (`{ plainText }`).
  - `retrieveDoc` / `retrieveStateVector`: `GET /yjs/internal/{docs|canvases}/${id}/{snapshot|state-vector}?branch=main` (`204`/`404` → `null`).
- **Delta Revisions (`src/yjs/revisions.js`)**: `doc-*` rooms only. Calls `GET /yjs/internal/docs/${docId}/revisions/head`; creates keyframe if `!head || !head.stateVector || head.revisionsSinceKeyframe >= KEYFRAME_INTERVAL` (default `20`) or `delta.length >= full.length * 0.9`; posts V2 blob to `POST /yjs/internal/docs/${docId}/revisions` with `X-Yjs-State-Vector`, `X-Yjs-Is-Keyframe`, `X-Yjs-Base-Version`.
- **In-Process Internal HTTP (`src/yjs/reconstruct.js`, `RECONSTRUCT_PORT=1236`)** — unauthenticated, **`POST`-only**:
  - `POST /reconstruct` `{ docId, revisionId }` → fetches `/yjs/internal/docs/${docId}/revisions/${revisionId}/chain`, returns `{ update }` (`Y.mergeUpdatesV2`).
  - `POST /analyze` `{ update }` → reads `ydoc.getText('content')` or `ydoc.getMap('elements')` *(NOTE: mismatch with BlockNote's `document-store`!)*.
  - `POST /init-snapshot` `{ room, content, type }` → populates `getText('content')` or `getMap('elements')`, returns `{ update, stateVector, byteLength }`.

## 4. Role `api` (`src/roles/api.ts`, `src/config.ts`, `src/translate/*`, default port `8006`)

- **Framework**: Fastify 5 (`trustProxy: true`, `@fastify/cors` `{ origin: CORS_ORIGIN || '*' }`).
- **Routes**:
  - Health (unthrottled): `GET /health`, `GET /node/health` → `{"status":"ok"}`.
  - Translate (mounted under **4 prefixes**: `/api/v1`, `/node/api/v1`, `/node/v1`, `/node` + `/translate`): `GET ?q=<1..1000>&sl=<en>&tl=<vi>`. Each prefix scope has an independent `@fastify/rate-limit` (`RATE_LIMIT_MAX=15`, `RATE_LIMIT_WINDOW_MS=60000`, keyed by IP).
- **Caching & Upstream (`cache.service.ts`, `google-translate.service.ts`, `parse.ts`)**:
  - `NodeCache` key `${sl}:${tl}:${q.trim().toLowerCase()}`, TTL `CACHE_TTL_SECONDS` (`259200`s = 3 days). Returns `cached: true|false`.
  - Calls `https://translate.googleapis.com/translate_a/single` (`8000`ms timeout), trying `CLIENTS = ['at', 'gtx']` with `dt=t,bd,ss,md,ex`, `hl=tl`, rotating 20 browser `User-Agent`s (`user-agents.ts`). Maps 429 → `429`, upstream failure → `502`.
  - Response shape (`TranslationResult`): `{ query, sourceLang, targetLang, detectedSourceLanguage, mainTranslation, originalText, dictionary, definitions, synonyms, examples, cached }`.

## 5. Key Crypto, Scripts & Test Notes

- **P-384 JWK Constraint**: `@y/redis` (`lib0/crypto/ecdsa`) requires **ES384 (P-384)** and `AUTH_PUBLIC_KEY` JWK MUST contain `"key_ops": ["verify"]` (`scripts/gen-keys.mjs`, `scripts/spki-to-jwk.mjs`).
- **Known Script/Test Quirks**:
  - `scripts/backfill.js` aborts if `YJS_JAVA_BASE_URL` contains `/api/v1` (legacy Java root expectation vs Go's `/api/v1`).
  - `test/javaStorage.test.js:11` asserts `parseDocId('doc-abc') === null`, conflicting with `src/yjs/utils.js` (widened to allow alphanumeric/slug IDs).
- **Commands**: `npm run build` (`tsc`) | `npm run dev:api` (`tsx watch src/roles/api.ts`) | `npm test` (`node --test`).
