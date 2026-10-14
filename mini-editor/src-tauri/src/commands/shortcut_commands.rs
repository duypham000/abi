#[tauri::command]
pub async fn cmd_register_shortcut(
    app: tauri::AppHandle,
    shortcut: String,
    action: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

        // Avoid duplicate registrations (only Tomo's handler stays active).
        let gs = app.global_shortcut();
        if gs.is_registered(shortcut.as_str()) {
            let _ = gs.unregister(shortcut.as_str());
        }

        let action_clone = action.clone();
        gs.on_shortcut(shortcut.as_str(), move |app_handle, _shortcut, event| {
            // The coordinator (Rust) handles the action DIRECTLY — no event is
            // emitted, so no window can double-handle it. Run off the event-loop
            // thread so window creation dispatches cleanly (avoids deadlocks).
            if event.state() == ShortcutState::Pressed {
                let app = app_handle.clone();
                let action = action_clone.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::window_commands::dispatch_shortcut(&app, &action);
                });
            }
        })
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    let _ = (app, shortcut, action);

    Ok(())
}

#[tauri::command]
pub async fn cmd_unregister_shortcut(
    app: tauri::AppHandle,
    shortcut: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        app.global_shortcut()
            .unregister(shortcut.as_str())
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    let _ = (app, shortcut);

    Ok(())
}

#[tauri::command]
pub async fn cmd_is_shortcut_registered(
    app: tauri::AppHandle,
    shortcut: String,
) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        return Ok(app.global_shortcut().is_registered(shortcut.as_str()));
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, shortcut);
        Ok(false)
    }
}

#[tauri::command]
pub async fn cmd_show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(w) = app.get_webview_window("main") {
            w.show().map_err(|e| e.to_string())?;
            w.set_focus().map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(desktop))]
    let _ = app;

    Ok(())
}
