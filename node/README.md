# tomo-node

Tomo's consolidated Node.js microservice. One repo, one Docker image
(`asia-southeast1-docker.pkg.dev/tomo-497106/tomo/tomo-node`), three roles
selected at runtime by the `YHUB_ROLE` env var:

| Role     | Entry                  | What it does                                                        | Port |
|----------|------------------------|--------------------------------------------------------------------|------|
| `server` | `dist/roles/server.js` | Yjs CRDT WebSocket hub (`@y/redis`/uWebSockets), JWT-authed         | 1234 |
| `worker` | `dist/roles/worker.js` | Drains Redis streams → persists Y.Doc to Java; revision reconstruct | 1236 |
| `api`    | `dist/roles/api.js`    | Fastify HTTP — Google Translate dictionary proxy (`/api/v1/translate`) | 8006 |

This repo merges the former `yjs-server` (server/worker) and `translate`
(now the `api` role) services. See `docs/` for the original Yjs design
(`yhub.md`), translate notes (`translate.md`), rate-limiting strategy
(`ratelimit.md`), and the Google response format (`transdoc.md`).

## Layout

```
src/
  roles/       server.js · worker.js · api.ts   — one entrypoint per role
  yjs/         javaStorage · revisions · reconstruct · utils (.js, unchanged)
  translate/   routes · controllers · services · utils · types  (Fastify + TS)
  config.ts    api-role config        tracing.js  shared OpenTelemetry
```

The yjs modules stay as plain `.js`; `tsc` (with `allowJs`) passes them through
to `dist/` untouched while compiling the TypeScript `api`/translate code.

## Develop

```bash
npm install
npm run build          # tsc → dist/
npm test               # node --test (yjs storage + revision tests)

# api role (translate) with hot reload:
npm run dev:api
curl 'http://localhost:8006/api/v1/translate?q=run&sl=en&tl=vi'
curl http://localhost:8006/health

# full local stack (joins infra's tomo-local network):
docker compose -f docker-compose.local.yaml up --build
```

## Deploy

CI (`.github/workflows/deploy.yaml`) builds the single `tomo-node` image on push
to `main` and rolls both the `yhub` Deployment (server + worker containers) and
the `tomo-node-api` Deployment in the `tomo-app` namespace on k3s. Manifests live
in `infra/k8s/04-apps/` (`yhub.yaml`, `tomo-node-api.yaml`) and
`infra/k8s/03-gateway/ingress-tomo-node.yaml`.
