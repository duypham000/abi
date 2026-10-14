use serde::Deserialize;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

#[derive(Debug, Clone, Deserialize)]
pub struct TrayRecentItem {
    pub kind: String,
    pub id: String,
    pub title: String,
}

#[cfg(desktop)]
fn truncate_title(title: &str) -> String {
    let t = title.trim();
    let t = if t.is_empty() { "Untitled" } else { t };
    const MAX: usize = 40;
    if t.chars().count() > MAX {
        let head: String = t.chars().take(MAX).collect();
        format!("{head}…")
    } else {
        t.to_string()
    }
}

/// Build the full tray menu (used both at setup and when recents change).
#[cfg(desktop)]
pub fn build_tray_menu<R: Runtime, M: Manager<R>>(
    manager: &M,
    recents: &[TrayRecentItem],
) -> tauri::Result<Menu<R>> {
    let quick_create =
        MenuItem::with_id(manager, "quick_create", "New scratch doc", true, None::<&str>)?;

    // Recent submenu: up to 4 recents + separator + "⋯" (open docs list).
    let recent = Submenu::new(manager, "Recent", true)?;
    if recents.is_empty() {
        let empty =
            MenuItem::with_id(manager, "recent_empty", "No recent docs", false, None::<&str>)?;
        recent.append(&empty)?;
    } else {
        for item in recents.iter().take(4) {
            let id = format!("recent::{}::{}", item.kind, item.id);
            let label = truncate_title(&item.title);
            let mi = MenuItem::with_id(manager, id, label, true, None::<&str>)?;
            recent.append(&mi)?;
        }
    }
    recent.append(&PredefinedMenuItem::separator(manager)?)?;
    let more = MenuItem::with_id(manager, "recent_more", "⋯", true, None::<&str>)?;
    recent.append(&more)?;

    let separator = PredefinedMenuItem::separator(manager)?;
    let show = MenuItem::with_id(manager, "show", "Show Tomo", true, None::<&str>)?;
    let quit = MenuItem::with_id(manager, "quit", "Quit", true, None::<&str>)?;

    Menu::with_items(manager, &[&quick_create, &recent, &separator, &show, &quit])
}

/// Draw a filled status dot (with a thin white separating ring) into the
/// top-right corner of an RGBA8 icon buffer, in place.
#[cfg(desktop)]
fn draw_status_dot(rgba: &mut [u8], w: u32, h: u32, color: [u8; 3]) {
    let wf = w as f32;
    let r = wf * 0.15;
    let ring = (wf * 0.0375).max(1.0);
    let margin = wf * 0.10;
    let cx = wf - r - margin;
    let cy = r + margin;

    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = ((y * w + x) * 4) as usize;
            if idx + 3 >= rgba.len() {
                continue;
            }
            if dist <= r {
                rgba[idx] = color[0];
                rgba[idx + 1] = color[1];
                rgba[idx + 2] = color[2];
                rgba[idx + 3] = 255;
            } else if dist <= r + ring {
                // White ring to separate the dot from the icon underneath.
                rgba[idx] = 255;
                rgba[idx + 1] = 255;
                rgba[idx + 2] = 255;
                rgba[idx + 3] = 255;
            }
        }
    }
}

/// Update the tray icon's status dot + tooltip. `status` is one of
/// "loading" | "online" | "offline" | "error" (anything else -> normal).
#[tauri::command]
pub fn cmd_set_tray_status(app: tauri::AppHandle, status: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri::image::Image;

        let (color, tooltip): ([u8; 3], &str) = match status.as_str() {
            "loading" => ([0xf5, 0x9e, 0x0b], "Tomo — Đang tải…"),
            "online" => ([0x16, 0xa3, 0x4a], "Tomo"),
            "offline" => ([0x9c, 0xa3, 0xaf], "Tomo — Ngoại tuyến"),
            "error" => ([0xef, 0x44, 0x44], "Tomo — Lỗi kết nối"),
            _ => ([0x16, 0xa3, 0x4a], "Tomo"),
        };

        if let Some(tray) = app.tray_by_id("main-tray") {
            if let Some(base) = app.default_window_icon() {
                let w = base.width();
                let h = base.height();
                let mut rgba = base.rgba().to_vec();
                draw_status_dot(&mut rgba, w, h, color);
                let img = Image::new_owned(rgba, w, h);
                tray.set_icon(Some(img)).map_err(|e| e.to_string())?;
            }
            tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, status);

    Ok(())
}

/// Push the latest recent docs from the frontend and rebuild the tray menu.
#[tauri::command]
pub async fn cmd_set_tray_recents(
    app: tauri::AppHandle,
    items: Vec<TrayRecentItem>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let menu = build_tray_menu(&app, &items).map_err(|e| e.to_string())?;
        if let Some(tray) = app.tray_by_id("main-tray") {
            tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, items);

    Ok(())
}
