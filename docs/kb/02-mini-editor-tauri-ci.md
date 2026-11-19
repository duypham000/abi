# `02-mini-editor-tauri-ci.md` — `mini-editor/src-tauri` & GitHub CI/CD

## 1. Crate, Plugins & Tauri Configs

- **`src-tauri/Cargo.toml`**: `name = "tomo-ui"`, `[lib] name = "tomo_ui_lib"`, `crate-type = ["rlib"]`, Rust 2021.
  - **Cargo feature `local`**: Compiles `AuthCore` default API base as `"http://127.0.0.1:8080/api/v1"` instead of `"http://api.tomoo.uk/go/v1"`.
  - **Release profile**: `opt-level = "s"`, `lto = "thin"`, `codegen-units = 16`, `panic = "abort"`, `strip = true`.
  - **Plugins (`src/lib.rs`)**: All targets: `tauri_plugin_opener`, `tauri_plugin_sql` (`sqlite` feature). `#[cfg(desktop)]` only: `tauri_plugin_global_shortcut`, `tauri_plugin_autostart` (`MacosLauncher::LaunchAgent`, launch arg `"--autostart"`).
- **Tauri Configs**:
  - `tauri.conf.json`: `productName = "Tomo"`, `version = "0.1.1"`, `identifier = "com.tomo.app"`, `beforeDevCommand = "pnpm dev:frontend"` (`localhost:1420`), `beforeBuildCommand = "pnpm build:frontend"`, `frontendDist = "../dist"`, `csp = null`, `bundle.targets = ["nsis"]`. Initial desktop window: `splash` (`520×480`, `/splash.html`, frameless, `alwaysOnTop`, `skipTaskbar`).
  - `tauri.android.conf.json` & `tauri.ios.conf.json`: Override `app.windows` to single `{ "label": "main", "url": "/index.html", "title": "Tomo" }`.

## 2. Window Coordinator, Tray & Shortcuts (`lib.rs`, `window_commands.rs`, `tray_commands.rs`)

All dynamic windows spawn `.visible(false)` until frontend calls `coord_ready` (reveals caller, destroys `splash`, and if `main` destroys `login`).

| Window Label | URL / Route | Size & Flags | Close / Exit Behavior (`lib.rs`) |
|---|---|---|---|
| `splash` | `/splash.html` | `520×480` fixed, `alwaysOnTop`, `skipTaskbar` | Destroyed by `coord_ready` or `--autostart` `coord_start` |
| `main` | `index.html` | `1280×800` (min `800×600`), frameless | `CloseRequested` → `prevent_close()` + `window.hide()` |
| `login` | `login.html` | `480×800` (min `440×700`), frameless | `open_login` hides all other windows; `CloseRequested` → `app.exit(0)` |
| `search-overlay` | `search` | `1100×720`, transparent, `always_on_top`, `skip_taskbar` | Positioned bottom-center (`work_area.bottom - 24px`); normal close |
| `doc-popup-{id}` / `doc-popup-draft-{local_id}` | `doc-popup/{id}` or `doc-popup/draft/{local_id}` | `700×520`, frameless, resizable | Reuses/focuses existing window for same ID; normal close |
| `panel-popup-{type}-{uuid}` | `panel-popup/{type}?s=<b64>` | `900×640` (min `480×320`), frameless | Always spawns new window; mapped titles (`dashboard`, `docs-list`, `doc-editor`, `doc-draft`, `canvas-list`, `canvas-editor`, `ports`, `secrets`, `chat`, `scripts`, `api`, `settings`, `search`) |

- **Exit Guard (`lib.rs`)**: `RunEvent::ExitRequested` with `code.is_none()` calls `api.prevent_exit()` so app stays resident in tray; only explicit `app.exit(0)` terminates process.
- **System Tray (`main-tray`)**: Left-click → `gated_show_main`. Menu: `quick_create` ("New scratch doc"), `Recent` submenu (max 4 items `recent::{kind}::{id}` via `cmd_set_tray_recents` + `recent_more`), `show` ("Show Tomo"), `quit`. `cmd_set_tray_status` draws a top-right status dot on the icon (`loading` amber, `online` green, `offline` gray, `error` red).
- **Global Shortcuts (`shortcut_commands.rs`)**: Dispatched directly in Rust `window_commands::dispatch_shortcut` (auth-gated; no frontend event emitted): `"quickCreateDoc"` → `open_draft`, `"showMainWindow"` → `show_main`, `"openSearch"` → `open_search`.

## 3. Capabilities (`src-tauri/capabilities/*.json`)

| File | Window Selector | Key Permissions Granted |
|---|---|---|
| `default.json` | `["main"]` | `core:default`, `opener:default`, drag/min/max/close/hide, `allow-create-webview-window`, `global-shortcut`, `autostart`, `sql:allow-{load,execute,select}` |
| `doc-popup.json` | `["doc-popup-*"]` | `core:default`, drag/min/close/focus/size/always-on-top/resizable/is-maximized, `sql:allow-{load,execute,select}` |
| `login.json` | `["login"]` | `core:default`, drag/close/min/focus/hide/is-maximized, `sql:allow-{load,execute,select}` |
| `search-overlay.json` | `["search-overlay"]` | `core:default`, close/focus/always-on-top/hide, `core:webview:allow-set-webview-focus` |
| `splash.json` | `["splash"]` | `core:default`, drag/close/hide/focus/is-maximized, `allow-create-webview-window`, `sql:allow-{load,execute,select}` |

> **Gotcha:** `panel-popup-*` windows created by `window_commands::open_panel` currently have **no** matching capability file under `src-tauri/capabilities/`.

## 4. Complete `#[tauri::command]` Inventory (43 Registered in `lib.rs`)

| Module (`src/commands/*.rs`) | Command & Signature | Notes / Usage Status |
|---|---|---|
| `auth_commands.rs` (5) | `auth_login(identifier, password, api_base?: String) -> Result<String>` | Sets `AuthCore.api_base`, calls `POST {base}/auth/login`, stores refresh token, emits `auth://changed`, `finish_login` |
| | `auth_access_token() -> Result<Option<String>>` | Single-flight `tokio::sync::Mutex` refresh via `POST /auth/refresh`; on 4xx clears tokens & `open_login` |
| | `auth_peek_access_token() -> Result<Option<String>>` | Network-free cache read (`exp > now + 30s`) |
| | `auth_is_authenticated() -> Result<bool>` | Checks whether refresh token exists in `token_store` |
| | `auth_logout() -> Result<()>` | Best-effort `POST /auth/logout` (Bearer, no body), clears store, emits `auth://changed`, `open_login` |
| `window_commands.rs` (11) | `coord_is_mobile() -> bool` | Returns `cfg!(mobile)` |
| | `coord_start()`, `coord_show_main()`, `coord_open_doc(id: i64)`, `coord_open_draft(local_id?: String)`, `coord_open_search()`, `coord_open_panel(panel_type, state_json)`, `coord_open_in_main(panel_type, state_json, title?)`, `coord_login_minimize()`, `coord_finish_login()`, `coord_ready(window)` | Desktop window coordinator (`coord_open_in_main` emits `"tomo:open-in-main"` onto `"main"` window) |
| `shortcut_commands.rs` (4) | `cmd_register_shortcut(shortcut, action)`, `cmd_unregister_shortcut(shortcut)`, `cmd_is_shortcut_registered(shortcut) -> bool`, `cmd_show_main_window()` | Desktop-only global shortcut bindings |
| `tray_commands.rs` (2) | `cmd_set_tray_status(status)`, `cmd_set_tray_recents(items: Vec<TrayRecentItem>)` | Desktop-only tray icon badge & recent submenu |
| `translate_commands.rs` (1) | `cmd_translate(q, sl, tl) -> Result<TranslationResult>` | 1h static cache → Node `:8006` (`1500ms`) → Google `translate_a/single` (`dict-chrome-ex`, `at`, `gtx`, `t`) |
| `file_commands.rs` (6) | `cmd_read_file(path)`, `cmd_write_file(path, content)`, `cmd_scan_folder_files(folder_paths, recursive, target_ext?)`, `cmd_batch_rename_files(tasks)`, `cmd_select_files_multi()`, `cmd_list_directory_contents(path)` | Windows multi-picker spawns hidden PowerShell WinForms; `scan`/`batch_rename`/`list_directory` used by `MobileRenameView` |
| `permission_commands.rs` (2) | `cmd_check_storage_permission() -> Result<bool>`, `cmd_request_storage_permission() -> Result<bool>` | Android `/storage/emulated/0` probe & `am start` All-Files-Access intent |
| `crypto_commands.rs` (2) | `cmd_encrypt(plaintext)`, `cmd_decrypt(ciphertext_b64)` | AES-256-GCM via OS keyring (`com.tomo.app` / `cache_encryption_key`); **Android passthrough**; **unused in `mini-editor` TS** |
| `port_commands.rs` (3) | `cmd_scan_port(port)`, `cmd_scan_ports(ports)`, `cmd_kill_process(pid)` | `127.0.0.1` TCP probe + `netstat`/`lsof`/`ss`; **legacy `ex-ui`, unused in `mini-editor` TS** |
| `script_commands.rs` (7) | `cmd_run_script(body, hidden, admin)`, `cmd_kill_script(pid)`, `cmd_show_script_window(pid)`, `cmd_hide_script_window(pid)`, `cmd_select_folder()`, `cmd_select_file()`, `cmd_is_process_alive(pid)` | Windows `cmd`/`RunAs` & Win32 `ShowWindow`; **legacy `ex-ui`, unused in `mini-editor` TS** |

## 5. `AuthCore`, Storage & IPC Events

- **`AuthCore` (`auth_commands.rs`)**: Loads `.env` / `.env.development` via `dotenvy`; resolves `api_base` from `TOMO_API_BASE` → `VITE_GO_API_URL + "/v1"` → compiled default (`local` feature). Hardcodes DNS override `"api.tomo.local" -> 127.0.0.1:80` on `reqwest::Client` (`10s` timeout). Refresh token lives in OS keyring (`com.tomo.app` / `refresh_token`) on desktop/iOS, or plaintext `{app_data_dir}/refresh_token` on Android.
- **IPC Events Emitted by Rust**: ONLY `"auth://changed"` (broadcast) and `"tomo:open-in-main"` (targeted to `"main"`). Frontend listeners for `shortcut://*` and `tray://*` in `useGlobalShortcuts.ts` / `useTrayMenu.ts` are legacy (Rust executes those actions directly).

## 6. Android & `.github/workflows/` CI/CD

- **Android (`src-tauri/gen/android/`)**: `compileSdk=36`, `minSdk=24`, `targetSdk=36`, `applicationId="com.tomo.app"`, `MainActivity.kt` enables edge-to-edge and requests `MANAGE_EXTERNAL_STORAGE` / legacy read-write perms. Release signing checks `ANDROID_KEYSTORE_*` env vars → `src-tauri/keystore/keystore.properties` → debug keystore fallback.
- **`.github/workflows/mini-editor.yaml`**: Triggers on `release/**` branches, `v*` / `mini-editor-v*` tags, or `workflow_dispatch` when `mini-editor/**` changes. On `windows-latest`: `pnpm install --frozen-lockfile`, strips tag prefix to rewrite semver in `tauri.conf.json` + `package.json`, copies `.env.production` → `.env`, runs `pnpm tauri build` (NSIS `.exe`, no `--features local`), uploads `mini-editor-windows-installer`, creates GitHub Release.
- **`.github/workflows/portainer-cicd.yaml`**: Triggers on `main` / `release/**` changes in `go/**`, `node/**`, `docker-compose.yml`. `detect-changes` (`dorny/paths-filter@v3`) triggers multi-arch (`linux/amd64,linux/arm64`) GHCR pushes (`ghcr.io/<owner>/tomo-backend` & `tomo-node` `:latest` + `:<sha>`) then `POST $PORTAINER_WEBHOOK_URL`.
