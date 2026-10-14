# CLAUDE.md — tomo/ui

## Project Overview

Tauri v2 desktop app with React 19 + TypeScript frontend. Wraps the `tomo/base` Spring Boot API. Can also run as a web app (falls back to localStorage for file operations).

## Tech Stack

- **Tauri 2** (Rust backend) + **React 19** + **TypeScript 5.8**
- **Vite 7** — dev server on port 1420
- **RTK Query** — API calls with automatic JWT refresh
- **Redux Toolkit** — auth state + UI state
- **React Router v7** — client-side routing
- **async-mutex** — prevents concurrent token refresh race conditions

## Running Locally

**Prerequisites:** Rust/Cargo installed and in PATH, pnpm installed.

```powershell
# From tomo/ui
pnpm tauri dev
```

Vite starts on `localhost:1420`, Tauri compiles Rust and opens the desktop window. First run takes several minutes (compiling ~476 crates).

> If `cargo` not found: add `$env:PATH += ";$env:USERPROFILE\.cargo\bin"` before running.

## Architecture

```
src/
├── core/interfaces/        # TypeScript contracts (auth.ts, fileService.ts)
├── infrastructure/
│   ├── api/                # RTK Query — baseApi (with auth refresh), authApi
│   ├── services/           # Runtime detection: Tauri vs Web
│   ├── tauri/              # TauriFileService — invoke() Rust commands
│   └── web/                # WebFileService — localStorage fallback
└── presentation/
    ├── components/         # ProtectedRoute
    ├── features/
    │   ├── auth/           # LoginPage, RegisterPage, useAuth hook
    │   └── dashboard/      # DashboardPage, Sidebar
    └── store/              # authSlice, appSlice
```

## Routes

| Path | Component | Guard |
|---|---|---|
| `/login` | LoginPage | Public |
| `/register` | RegisterPage | Public |
| `/` | DashboardPage | Protected |
| `*` | → `/` | — |

## State Management

**authSlice** — stores `accessToken`, `refreshToken`, `user`; persists to localStorage; decodes JWT payload on `setCredentials`.

**appSlice** — `theme` (light/dark), `sidebarOpen`.

**baseApi** — RTK Query with mutex-locked auto-refresh: on 401, calls `POST /auth/refresh`, retries original request, clears credentials on refresh failure.

## API Base URL

Set via `VITE_API_BASE_URL` env var. Defaults to `http://localhost:8080/api/v1`.

## Tauri Commands (Rust)

Defined in `src-tauri/src/commands/file_commands.rs`:

| Command | Signature | Description |
|---|---|---|
| `cmd_read_file` | `(path: String) → Result<String>` | Read file from OS filesystem |
| `cmd_write_file` | `(path: String, content: String) → Result<()>` | Write file to OS filesystem |

Frontend calls via `invoke("cmd_read_file", { path })` — abstracted behind `IFileService`.

## Adding a New Feature

1. Define contract in `core/interfaces/` if needed
2. Add RTK Query endpoint in `infrastructure/api/`
3. Build page/component in `presentation/features/<feature>/`
4. Add route in `App.tsx`
5. If new Tauri command needed: add in `src-tauri/src/commands/`, register in `lib.rs`

## Build

```powershell
pnpm tauri build   # produces installer in src-tauri/target/release/bundle/
```
