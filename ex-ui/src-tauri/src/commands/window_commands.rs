//! Window coordinator — the always-alive Rust process owns ALL window
//! orchestration: which shortcut/tray action opens which window, the login modal
//! gate, and auth-driven transitions. No window needs to be alive for this to
//! work; the app survives with zero windows (see `prevent_exit` in lib.rs).

#[cfg(desktop)]
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
pub const MAIN: &str = "main";
#[cfg(desktop)]
pub const LOGIN: &str = "login";
#[cfg(desktop)]
pub const SPLASH: &str = "splash";
#[cfg(desktop)]
pub const SEARCH: &str = "search-overlay";

#[cfg(desktop)]
fn authed() -> bool {
    crate::commands::auth_commands::has_session()
}

/// Managed flag: true when the app was launched at OS login via the autostart
/// plugin (the `--autostart` arg). Set once in `lib.rs` setup.
pub struct AutostartLaunch(pub bool);

// ── window builders / show helpers ───────────────────────────────────────────

#[cfg(desktop)]
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Tomo")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .decorations(false)
        .shadow(true)
        .center()
        .visible(false)
        .build();
}

// The search panel is a fixed-size, frameless window (no fullscreen overlay): it
// sits horizontally centered and snug to the bottom, and closes on Esc/blur like
// an OS menu. The webview is sized to the panel itself — see `WindowsSearch`.
#[cfg(desktop)]
const SEARCH_W: f64 = 1100.0;
#[cfg(desktop)]
const SEARCH_H: f64 = 720.0;
#[cfg(desktop)]
const SEARCH_BOTTOM_GAP: f64 = 24.0;

#[cfg(desktop)]
pub fn open_search(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SEARCH) {
        position_search(&w);
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    if let Ok(w) = WebviewWindowBuilder::new(app, SEARCH, WebviewUrl::App("search".into()))
        .transparent(true)
        .decorations(false)
        .inner_size(SEARCH_W, SEARCH_H)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(true)
        .visible(false)
        .build()
    {
        position_search(&w);
    }
}

/// Center horizontally, snug to the bottom of the primary monitor's work area
/// (above the taskbar). Runs before the window is shown (still `visible(false)`).
#[cfg(desktop)]
fn position_search(w: &tauri::WebviewWindow) {
    use tauri::LogicalPosition;
    let Ok(Some(monitor)) = w.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    // `work_area()` -> &Rect (dpi `position`/`size`); excludes the taskbar.
    let area = monitor.work_area();
    let pos = area.position.to_logical::<f64>(scale);
    let size = area.size.to_logical::<f64>(scale);
    let x = pos.x + (size.width - SEARCH_W) / 2.0;
    let y = pos.y + size.height - SEARCH_H - SEARCH_BOTTOM_GAP;
    let _ = w.set_position(LogicalPosition::new(x, y));
}

#[cfg(desktop)]
pub fn open_doc(app: &AppHandle, id: i64) {
    let label = format!("doc-popup-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("doc-popup/{id}").into()))
        .title("Doc")
        .inner_size(700.0, 520.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .focused(true)
        .visible(false)
        .build();
}

#[cfg(desktop)]
pub fn open_panel(app: &AppHandle, panel_type: &str, state_json: &str) {
    // Base64-encode the JSON state so it can be safely embedded in a URL query param
    // without needing an external URL-encoding crate.
    use base64::{Engine as _, engine::general_purpose};
    let encoded = general_purpose::STANDARD.encode(state_json.as_bytes());
    let url = format!("panel-popup/{panel_type}?s={encoded}");
    let label = format!("panel-popup-{}-{}", panel_type, uuid::Uuid::new_v4().simple());
    let _ = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(title_for_panel(panel_type))
        .inner_size(900.0, 640.0)
        .min_inner_size(480.0, 320.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .focused(true)
        .visible(false)
        .build();
}

#[cfg(desktop)]
fn title_for_panel(panel_type: &str) -> &'static str {
    match panel_type {
        "dashboard"     => "Dashboard",
        "docs-list"     => "Docs",
        "doc-editor"    => "Document",
        "doc-draft"     => "Draft",
        "canvas-list"   => "Canvas",
        "canvas-editor" => "Canvas",
        "ports"         => "Ports",
        "secrets"       => "Secrets",
        "chat"          => "Chat",
        "scripts"       => "Scripts",
        "api"           => "API Client",
        "settings"      => "Settings",
        "search"        => "Search",
        _               => "Panel",
    }
}

#[cfg(desktop)]
pub fn open_draft(app: &AppHandle, local_id: &str) {
    let label = format!("doc-popup-draft-{local_id}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let url = format!("doc-popup/draft/{local_id}");
    let _ = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("New Doc")
        .inner_size(700.0, 520.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .focused(true)
        .visible(false)
        .build();
}

// ── login modal gate ─────────────────────────────────────────────────────────

/// Hide every window except the login modal and the splash (kept for the
/// startup splash→login hand-off). Windows are only HIDDEN, never closed, so
/// they keep their state and reappear on a successful sign-in.
#[cfg(desktop)]
pub fn hide_others(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label != LOGIN && label != SPLASH {
            let _ = w.hide();
        }
    }
}

#[cfg(desktop)]
pub fn hide_all(app: &AppHandle) {
    for (_label, w) in app.webview_windows() {
        let _ = w.hide();
    }
}

/// Open the login window as a modal gate: it floats on top and EVERY other
/// window is hidden until sign-in succeeds.
#[cfg(desktop)]
pub fn open_login(app: &AppHandle) {
    hide_others(app);
    if let Some(w) = app.get_webview_window(LOGIN) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, LOGIN, WebviewUrl::App("login.html".into()))
        .title("Tomo")
        .inner_size(480.0, 800.0)
        .min_inner_size(440.0, 700.0)
        .decorations(false)
        .shadow(true)
        .center()
        .resizable(true)
        .focused(true)
        .visible(false)
        .build();
}

/// After a successful sign-in: re-enable + reveal the app windows and dismiss
/// the login window.
#[cfg(desktop)]
pub fn finish_login(app: &AppHandle) {
    let mut had_other = false;
    for (label, w) in app.webview_windows() {
        if label != LOGIN && label != SPLASH {
            had_other = true;
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
    if had_other {
        // Existing app windows are visible again → safe to drop login now.
        if let Some(login) = app.get_webview_window(LOGIN) {
            let _ = login.destroy();
        }
    } else {
        // Fresh sign-in: create main HIDDEN and keep login up until main has
        // painted; main's `coord_ready` then destroys login (no blank gap).
        show_main(app);
    }
}

// ── shortcut dispatch (called from the global-shortcut handler) ───────────────

#[cfg(desktop)]
pub fn dispatch_shortcut(app: &AppHandle, action: &str) {
    if !authed() {
        open_login(app);
        return;
    }
    match action {
        "quickCreateDoc" => open_draft(app, &uuid::Uuid::new_v4().to_string()),
        "showMainWindow" => show_main(app),
        "openSearch" => open_search(app),
        _ => {}
    }
}

/// Tray helpers (also auth-gated).
#[cfg(desktop)]
pub fn gated_show_main(app: &AppHandle) {
    if authed() {
        show_main(app);
    } else {
        open_login(app);
    }
}

#[cfg(desktop)]
pub fn open_recent(app: &AppHandle, kind: &str, id: &str) {
    if !authed() {
        open_login(app);
        return;
    }
    match kind {
        "draft" => open_draft(app, id),
        "doc" => {
            if let Ok(n) = id.parse::<i64>() {
                open_doc(app, n);
            }
        }
        _ => {}
    }
}

// ── commands invoked from JS ──────────────────────────────────────────────────

/// Platform probe for the frontend: true on Tauri mobile (Android/iOS), false on
/// desktop. Lets the SPA switch from the multi-window flow to single-webview,
/// in-app navigation. A narrow desktop window is NOT mobile.
#[tauri::command]
pub fn coord_is_mobile() -> bool {
    cfg!(mobile)
}

#[tauri::command]
pub async fn coord_start(app: tauri::AppHandle) {
    #[cfg(desktop)]
    {
        // Launched at OS login: sit silently in the tray. Drop the splash (as
        // `coord_ready` would) without opening main/login — a tray click runs
        // `gated_show_main` later.
        if app.state::<AutostartLaunch>().0 {
            if let Some(splash) = app.get_webview_window(SPLASH) {
                let _ = splash.destroy();
            }
            return;
        }
        if authed() {
            show_main(&app);
        } else {
            open_login(&app);
        }
    }
    #[cfg(not(desktop))]
    let _ = app;
}

#[tauri::command]
pub async fn coord_show_main(app: tauri::AppHandle) {
    #[cfg(desktop)]
    if authed() {
        show_main(&app);
    } else {
        open_login(&app);
    }
    #[cfg(not(desktop))]
    let _ = app;
}

#[tauri::command]
pub async fn coord_open_doc(app: tauri::AppHandle, id: i64) {
    #[cfg(desktop)]
    if authed() {
        open_doc(&app, id);
    } else {
        open_login(&app);
    }
    #[cfg(not(desktop))]
    let _ = (app, id);
}

#[tauri::command]
pub async fn coord_open_draft(app: tauri::AppHandle, local_id: Option<String>) {
    #[cfg(desktop)]
    if authed() {
        let id = local_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        open_draft(&app, &id);
    } else {
        open_login(&app);
    }
    #[cfg(not(desktop))]
    let _ = (app, local_id);
}

#[tauri::command]
pub async fn coord_open_search(app: tauri::AppHandle) {
    #[cfg(desktop)]
    if authed() {
        open_search(&app);
    } else {
        open_login(&app);
    }
    #[cfg(not(desktop))]
    let _ = app;
}

/// Called from popup windows when the user triggers an action that should open a
/// panel in the main window (e.g. "Open in new tab"). Focuses the EXISTING main
/// window and emits the event directly to it — no cross-window JS emit needed.
#[tauri::command]
pub async fn coord_open_in_main(
    app: tauri::AppHandle,
    panel_type: String,
    state_json: String,
    title: Option<String>,
) {
    #[cfg(desktop)]
    {
        if !authed() {
            open_login(&app);
            return;
        }
        if let Some(w) = app.get_webview_window(MAIN) {
            // Show and focus the existing main window
            let _ = w.show();
            let _ = w.set_focus();
            // Emit the open-panel event directly to that window
            let state_value: serde_json::Value =
                serde_json::from_str(&state_json).unwrap_or(serde_json::json!({}));
            let _ = w.emit(
                "tomo:open-in-main",
                serde_json::json!({
                    "panelType": panel_type,
                    "state": state_value,
                    "title": title,
                }),
            );
        } else {
            // No main window exists yet — just open it; the user can retry.
            show_main(&app);
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, panel_type, state_json, title);
}

#[tauri::command]
pub async fn coord_open_panel(app: tauri::AppHandle, panel_type: String, state_json: String) {
    #[cfg(desktop)]
    if authed() {
        open_panel(&app, &panel_type, &state_json);
    } else {
        open_login(&app);
    }
    #[cfg(not(desktop))]
    let _ = (app, panel_type, state_json);
}

#[tauri::command]
pub async fn coord_login_minimize(app: tauri::AppHandle) {
    #[cfg(desktop)]
    hide_all(&app);
    #[cfg(not(desktop))]
    let _ = app;
}

/// A freshly-loaded window signals it has painted: reveal it (windows are
/// created hidden to avoid a white flash while the webview boots) and dismiss
/// the splash if it's still up — giving a seamless splash→app hand-off.
#[tauri::command]
pub async fn coord_ready(window: tauri::WebviewWindow) {
    #[cfg(desktop)]
    {
        let _ = window.show();
        let _ = window.set_focus();
        let app = window.app_handle();
        // Bridge: drop the splash once any window has painted.
        if let Some(splash) = app.get_webview_window(SPLASH) {
            let _ = splash.destroy();
        }
        // When MAIN becomes ready it replaces the login modal (the login→main
        // hand-off keeps login visible until main has painted — no blank gap).
        if window.label() == MAIN {
            if let Some(login) = app.get_webview_window(LOGIN) {
                let _ = login.destroy();
            }
        }
    }
    #[cfg(not(desktop))]
    let _ = window;
}
