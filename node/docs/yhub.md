# yjs-server (yhub)

Yjs realtime-collaboration service (y-redis based) for Tomo — a standalone **microservice**,
independent of `base` at build time and coupled only via an HTTP contract + a shared JWT keypair.
One image runs in two roles selected by `YHUB_ROLE`:

- **server** (port `1234`, WSS) — accepts client WebSocket connections, fans updates through Redis
  streams, loads initial doc state from `base`.
- **worker** (reconstruct port `1236`) — drains Redis streams, merges docs, persists to `base`,
  appends revision keyframes/deltas.

## Contract with `base` (runtime only — no shared code)

| Direction | Endpoint | Auth |
|---|---|---|
| yhub → base | `GET/PUT /yjs/internal/docs/{id}/snapshot`, `/state-vector` | Bearer `YJS_SERVICE_SHARED_SECRET` |
| yhub → base | `POST /yjs/auth/perm` (permission callback) | — |
| client → yhub | `yauth` JWT (ES384/P-384), verified with `AUTH_PUBLIC_KEY` (JWK) | base signs with the matching private key |
| base → worker | `:1236/reconstruct` (revision preview/restore) | — |

> `YJS_JAVA_BASE_URL` is the **origin** (e.g. `http://localhost:8080`) — `/yjs/internal/**` is at
> root, NOT under `/api/v1/base`. Changing this contract requires releasing `base` + yhub together.

## Key env

| Var | Meaning |
|---|---|
| `YHUB_ROLE` | `server` \| `worker` |
| `REDIS` | `redis://:<pass>@<host>:6379` |
| `AUTH_PUBLIC_KEY` | P-384 public JWK with `key_ops:["verify"]` |
| `YJS_SERVICE_SHARED_SECRET` | Bearer for `/yjs/internal/**` |
| `YJS_JAVA_BASE_URL` / `AUTH_PERM_CALLBACK` | base origin |
| `KEYFRAME_INTERVAL`, `RECONSTRUCT_PORT` | worker only |

Generate the keypair (base private + yhub JWK) with `node scripts/gen-keys.mjs`; derive the JWK
from an existing public PEM with `node scripts/spki-to-jwk.mjs "<SPKI PEM>"`.

## Run locally

Joins the shared `tomo-local` network created by `../infra`. **Start order: infra → base → yhub.**

```bash
(cd ../infra && docker compose -f docker-compose.local.yaml up -d --build)   # redis/kafka/es + network
(cd ../base  && docker compose -f compose.local.yaml up -d --build)          # base joins tomo-local
docker compose -f docker-compose.local.yaml up -d --build                     # yhub joins
```

## Compose files

- `docker-compose.prod.yaml` — server + worker, **host network**, prebuilt `${YHUB_IMAGE}`. Terraform
  (in `tomo/infra`) uploads it to the config bucket as `compose.yhub.yaml`; the VM runs it.
- `docker-compose.local.yaml` — built from this repo, bridge network `tomo-local`.

## CI / deploy

`.github/workflows/deploy.yaml` (on push to `main`): builds & pushes
`asia-southeast1-docker.pkg.dev/<project>/tomo/yhub:<sha>` + `:latest`, then bumps the VM instance
metadata `yhub-tag=<sha>`. The VM watcher (managed by `tomo/infra`) redeploys only yhub.

Repo secrets: `GCP_PROJECT_ID`, `GCP_SA_KEY` (reuses the `github-actions-deployer` SA). The image
tag/version is independent from `base` (`image-tag`).
