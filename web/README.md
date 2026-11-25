# Tomo Web (Docs & Canvas)

Standalone Vite + React web client extracted from `ex-ui` for Docs (BlockNote + Yjs) and Canvas (Excalidraw + Yjs), using React Router and a simple `AppShell` layout instead of Golden Layout.

## Routes

- `/login` — Sign in (`identifier` / `password`, refresh token in `localStorage`)
- `/docs` — Documents list, search, series filter, import (Markdown/HTML/Zip/Notion/Snapshot)
- `/docs/:id` — Document editor (BlockNote, Yjs realtime, TOC, Properties, Revisions, Find & Replace, Export)
- `/canvas` — Canvas list
- `/canvas/:id` — Canvas editor (Excalidraw, embedded docs/notes, Yjs realtime)

## Development

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm typecheck  # tsc --noEmit
pnpm build      # tsc -b && vite build
```

Configure backend proxy and Yjs server in `.env`:

```env
VITE_API_BASE_URL=/api/v1
VITE_YJS_SERVER_URL=wss://api.tomoo.uk/ws/yjs
VITE_PROXY_TARGET=https://api.tomoo.uk
```

