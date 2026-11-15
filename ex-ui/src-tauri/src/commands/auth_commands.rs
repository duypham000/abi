//! Auth core — Rust is the single source of truth for the session.
//!
//! - The refresh token lives in the OS secure store (Windows Credential Manager
//!   / macOS Keychain / Linux secret-service) and NEVER leaves the Rust side.
//! - The access token is cached in memory only.
//! - `auth_access_token` refreshes transparently when the access token is near
//!   expiry, behind a single-flight lock so concurrent windows can never trigger
//!   competing `/auth/refresh` calls (which would revoke each other's token).

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[cfg(not(target_os = "android"))]
const KEYRING_SERVICE: &str = "com.tomo.app";
#[cfg(not(target_os = "android"))]
const KEYRING_ACCOUNT: &str = "refresh_token";
/// Treat the access token as expired this many seconds early, to avoid sending
/// a token that dies in-flight.
const EXPIRY_MARGIN_SECS: u64 = 30;

/// Backend wraps every response in `{ status, code, message, data }`.
#[derive(Deserialize)]
struct ApiEnvelope<T> {
    data: T,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    #[allow(dead_code)]
    token_type: Option<String>,
    #[allow(dead_code)]
    expires_in: Option<i64>,
}

#[derive(Serialize)]
struct LoginBody<'a> {
    identifier: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RefreshBody<'a> {
    refresh_token: &'a str,
}

struct CachedAccess {
    token: String,
    /// Unix epoch seconds when the access token expires.
    exp: u64,
}

pub struct AuthCore {
    api_base: String,
    http: reqwest::Client,
    access: Mutex<Option<CachedAccess>>,
    /// Single-flight gate around refresh.
    refresh_lock: tokio::sync::Mutex<()>,
}

impl AuthCore {
    pub fn new() -> Self {
        // Runtime env wins; otherwise fall back to the compiled-in default. With the
        // `local` cargo feature (pnpm build:local) that default is the local Docker
        // stack, so a packaged build is fully local with no runtime TOMO_API_BASE.
        #[cfg(feature = "local")]
        let default_base = "http://127.0.0.1/api/v1";
        #[cfg(not(feature = "local"))]
        let default_base = "https://api.tomoo.uk/api/v1";
        let api_base = std::env::var("TOMO_API_BASE")
            .unwrap_or_else(|_| default_base.to_string());
        // Always bound network calls so a slow/unreachable backend can never hang
        // a window's bootstrap indefinitely.
        let mut builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10));
        if let Ok(addr) = "127.0.0.1:80".parse::<std::net::SocketAddr>() {
            builder = builder.resolve("api.tomo.local", addr);
            builder = builder.resolve("127.0.0.1", addr);
        }
        let http = builder.build().unwrap_or_default();
        AuthCore {
            api_base,
            http,
            access: Mutex::new(None),
            refresh_lock: tokio::sync::Mutex::new(()),
        }
    }

    /// Returns the cached access token if it is still comfortably valid.
    fn valid_access(&self) -> Option<String> {
        let guard = self.access.lock().unwrap();
        let cached = guard.as_ref()?;
        if cached.exp > now_secs() + EXPIRY_MARGIN_SECS {
            Some(cached.token.clone())
        } else {
            None
        }
    }

    fn set_access(&self, token: &str) {
        let exp = decode_exp(token).unwrap_or_else(|| now_secs() + 300);
        *self.access.lock().unwrap() = Some(CachedAccess {
            token: token.to_string(),
            exp,
        });
    }

    fn clear_access(&self) {
        *self.access.lock().unwrap() = None;
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Decode the `exp` (seconds since epoch) claim from a JWT without verifying it.
fn decode_exp(token: &str) -> Option<u64> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    json.get("exp")?.as_u64()
}

// ── refresh-token store ──────────────────────────────────────────────────────
//
// Desktop + iOS keep the refresh token in the OS secure store via `keyring`
// (Windows Credential Manager / macOS + iOS Keychain / Linux secret-service).
// Android is NOT covered by any enabled `keyring` backend, so there it falls
// back to a file in the app-private data dir (`/data/data/com.tomo.app/…`,
// sandboxed per-app and not world-readable).

#[cfg(not(target_os = "android"))]
mod token_store {
    use super::{KEYRING_ACCOUNT, KEYRING_SERVICE};

    fn keyring_entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
    }

    pub fn load() -> Result<Option<String>, String> {
        match keyring_entry()?.get_password() {
            Ok(t) => Ok(Some(t)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn store(token: &str) -> Result<(), String> {
        keyring_entry()?.set_password(token).map_err(|e| e.to_string())
    }

    pub fn delete() -> Result<(), String> {
        match keyring_entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(target_os = "android")]
mod token_store {
    use std::path::PathBuf;
    use std::sync::OnceLock;

    // The path is resolved once from the AppHandle during setup and cached so the
    // free-function store API stays the same across platforms.
    static TOKEN_PATH: OnceLock<PathBuf> = OnceLock::new();

    pub fn init(app: &tauri::AppHandle) {
        use tauri::Manager;
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::create_dir_all(&dir);
            let _ = TOKEN_PATH.set(dir.join("refresh_token"));
        }
    }

    fn path() -> Result<&'static PathBuf, String> {
        TOKEN_PATH
            .get()
            .ok_or_else(|| "token store not initialized".to_string())
    }

    pub fn load() -> Result<Option<String>, String> {
        let p = path()?;
        match std::fs::read_to_string(p) {
            Ok(t) if !t.is_empty() => Ok(Some(t)),
            Ok(_) => Ok(None),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn store(token: &str) -> Result<(), String> {
        std::fs::write(path()?, token).map_err(|e| e.to_string())
    }

    pub fn delete() -> Result<(), String> {
        match std::fs::remove_file(path()?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Initialize the platform token store. No-op except on Android, where it
/// resolves and caches the app-private file path from the AppHandle.
pub fn init_token_store(app: &AppHandle) {
    #[cfg(target_os = "android")]
    token_store::init(app);
    #[cfg(not(target_os = "android"))]
    let _ = app;
}

fn load_refresh_token() -> Result<Option<String>, String> {
    token_store::load()
}

/// Synchronous, network-free check used by the coordinator to gate windows:
/// true when a refresh token exists (a session can be restored). Desktop-only.
#[cfg(desktop)]
pub fn has_session() -> bool {
    matches!(load_refresh_token(), Ok(Some(_)))
}

fn store_refresh_token(token: &str) -> Result<(), String> {
    token_store::store(token)
}

fn delete_refresh_token() -> Result<(), String> {
    token_store::delete()
}

/// Persist a freshly obtained token pair and notify all windows.
fn apply_tokens(core: &AuthCore, app: &AppHandle, tokens: &TokenResponse) -> Result<(), String> {
    core.set_access(&tokens.access_token);
    store_refresh_token(&tokens.refresh_token)?;
    let _ = app.emit("auth://changed", ());
    Ok(())
}

// ── commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    core: State<'_, AuthCore>,
    identifier: String,
    password: String,
) -> Result<String, String> {
    let res = core
        .http
        .post(format!("{}/auth/login", core.api_base))
        .json(&LoginBody {
            identifier: &identifier,
            password: &password,
        })
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("login failed: {}", res.status()));
    }

    let body: ApiEnvelope<TokenResponse> =
        res.json().await.map_err(|e| format!("decode: {e}"))?;
    apply_tokens(&core, &app, &body.data)?;
    // Coordinator: dismiss the login modal and reveal the app windows.
    #[cfg(desktop)]
    crate::commands::window_commands::finish_login(&app);
    Ok(body.data.access_token)
}

#[tauri::command]
pub async fn auth_access_token(
    app: AppHandle,
    core: State<'_, AuthCore>,
) -> Result<Option<String>, String> {
    // Fast path: a still-valid cached access token.
    if let Some(tok) = core.valid_access() {
        return Ok(Some(tok));
    }

    let refresh = match load_refresh_token()? {
        Some(r) => r,
        None => return Ok(None),
    };

    // Single-flight: only one window actually refreshes; the rest wait then read
    // the freshly cached token.
    let _guard = core.refresh_lock.lock().await;
    if let Some(tok) = core.valid_access() {
        return Ok(Some(tok));
    }

    let res = core
        .http
        .post(format!("{}/auth/refresh", core.api_base))
        .json(&RefreshBody {
            refresh_token: &refresh,
        })
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        if status.is_client_error() {
            // Refresh token expired/revoked (4xx) -> drop the session and raise the login
            // modal over whatever windows are open.
            core.clear_access();
            let _ = delete_refresh_token();
            let _ = app.emit("auth://changed", ());
            #[cfg(desktop)]
            crate::commands::window_commands::open_login(&app);
            return Ok(None);
        } else {
            // Server error (5xx) -> treat as server dead/network error
            return Err(format!("server error: {}", status));
        }
    }

    let body: ApiEnvelope<TokenResponse> =
        res.json().await.map_err(|e| format!("decode: {e}"))?;
    apply_tokens(&core, &app, &body.data)?;
    Ok(Some(body.data.access_token))
}

#[tauri::command]
pub async fn auth_is_authenticated() -> Result<bool, String> {
    Ok(load_refresh_token()?.is_some())
}

/// Return the in-memory access token ONLY if it is still valid — never performs
/// a network refresh. Lets a window resolve its auth status instantly (no fetch
/// on the render path); the caller follows up with `auth_access_token` in the
/// background to refresh when needed.
#[tauri::command]
pub async fn auth_peek_access_token(core: State<'_, AuthCore>) -> Result<Option<String>, String> {
    Ok(core.valid_access())
}

#[tauri::command]
pub async fn auth_logout(app: AppHandle, core: State<'_, AuthCore>) -> Result<(), String> {
    // Best-effort server revoke using the current access token.
    if let Some(token) = core.valid_access() {
        let _ = core
            .http
            .post(format!("{}/auth/logout", core.api_base))
            .bearer_auth(token)
            .send()
            .await;
    }
    core.clear_access();
    let _ = delete_refresh_token();
    let _ = app.emit("auth://changed", ());
    // Coordinator: raise the login modal (keeps other windows, disabled).
    #[cfg(desktop)]
    crate::commands::window_commands::open_login(&app);
    Ok(())
}
