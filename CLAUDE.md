# CLAUDE.md — `my-abi` Workspace

Start by reading [AGENTS.md](AGENTS.md) and loading only the 1–2 relevant files under [docs/kb/00-index.md](docs/kb/00-index.md).

## Sub-Project Entrypoints & Docs
- **Primary desktop/mobile client (`mini-editor/`)**: [mini-editor/CLAUDE.md](mini-editor/CLAUDE.md), [docs/kb/01-mini-editor-frontend.md](docs/kb/01-mini-editor-frontend.md), [docs/kb/02-mini-editor-tauri-ci.md](docs/kb/02-mini-editor-tauri-ci.md)
- **Go backend (`go/`)**: [docs/kb/03-go-backend.md](docs/kb/03-go-backend.md)
- **Node Yjs & Translate (`node/`)**: [docs/kb/04-node-yjs-translate.md](docs/kb/04-node-yjs-translate.md)
- **Cross-service flows & known mismatches**: [docs/kb/05-cross-service-contracts.md](docs/kb/05-cross-service-contracts.md)
- **Web client (`web/`) & legacy (`ex-ui/`)**: [docs/kb/06-sibling-projects-web-exui.md](docs/kb/06-sibling-projects-web-exui.md)
- **Edit & verification checklists**: [docs/kb/07-playbooks.md](docs/kb/07-playbooks.md)

## Quick Build / Verify Commands
- `mini-editor`: `pnpm --dir mini-editor build:frontend` | `cargo check --manifest-path mini-editor/src-tauri/Cargo.toml`
- `go`: `$env:CGO_ENABLED="1"; go test -C go ./internal/infrastructure/security/... ./internal/modules/...`
- `node`: `npm --prefix node run build` | `npm --prefix node test`
- `web`: `pnpm --dir web typecheck && pnpm --dir web build`

Ignore `mini-editor/SKILL.md`, `mini-editor/{art,schema,README}.md`, `gem.md`, `node/docs/*`, and `ex-ui/*` (stale or out-of-scope).
