mod commands;
mod services;

#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Autostart launches are flagged with `--autostart` so the coordinator
        // can start silently into the tray instead of popping a window.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ));

    builder
        .manage(commands::auth_commands::AuthCore::new())
        .setup(|app| {
            // Resolve the platform token store (no-op except on Android, where it
            // caches the app-private file path used to persist the refresh token).
            commands::auth_commands::init_token_store(app.handle());

            #[cfg(desktop)]
            {
                // Detect an OS-login launch (the autostart plugin appends this
                // arg) so `coord_start` can stay hidden in the tray.
                let autostart = std::env::args().any(|a| a == "--autostart");
                app.manage(commands::window_commands::AutostartLaunch(autostart));

                let menu = commands::tray_commands::build_tray_menu(app, &[])?;

                TrayIconBuilder::with_id("main-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    // Menu opens on right-click only. With the default (true), a
                    // left-click also pops the menu and Windows emits a stray click
                    // that dismisses it and triggers the window-open handler below.
                    .show_menu_on_left_click(false)
                    .tooltip("Tomo")
                    .on_menu_event(|app_handle, event| {
                        // The coordinator handles every tray action directly
                        // (auth-gated). Window creation runs off the event-loop
                        // thread to dispatch cleanly (avoids deadlocks).
                        use commands::window_commands as coord;
                        if event.id.as_ref() == "quit" {
                            app_handle.exit(0);
                            return;
                        }
                        let app = app_handle.clone();
                        let id = event.id.as_ref().to_string();
                        tauri::async_runtime::spawn(async move {
                            match id.as_str() {
                                "quick_create" => coord::dispatch_shortcut(&app, "quickCreateDoc"),
                                "show" | "recent_more" => coord::gated_show_main(&app),
                                _ if id.starts_with("recent::") => {
                                    let rest = &id["recent::".len()..];
                                    if let Some((kind, doc_id)) = rest.split_once("::") {
                                        coord::open_recent(&app, kind, doc_id);
                                    }
                                }
                                _ => {}
                            }
                        });
                    })
                    .on_tray_icon_event(|tray, event| {
                        // Left-click opens/shows the app (auth-gated). Right-click
                        // is reserved for the context menu.
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle().clone();
                            tauri::async_runtime::spawn(async move {
                                commands::window_commands::gated_show_main(&app);
                            });
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = _event {
                match _window.label() {
                    // Closing the login window quits the whole app (modal gate).
                    "login" => {
                        _window.app_handle().exit(0);
                    }
                    // The main window only HIDES on close (keeps its state; the
                    // coordinator reveals it instantly on tray/shortcut). Popups
                    // and the search overlay close for real.
                    "main" => {
                        api.prevent_close();
                        let _ = _window.hide();
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::file_commands::cmd_read_file,
            commands::file_commands::cmd_write_file,
            commands::file_commands::cmd_scan_folder_files,
            commands::file_commands::cmd_batch_rename_files,
            commands::file_commands::cmd_select_files_multi,
            commands::file_commands::cmd_list_directory_contents,
            commands::permission_commands::cmd_check_storage_permission,
            commands::permission_commands::cmd_request_storage_permission,
            commands::port_commands::cmd_scan_port,
            commands::port_commands::cmd_scan_ports,
            commands::port_commands::cmd_kill_process,
            commands::shortcut_commands::cmd_register_shortcut,
            commands::shortcut_commands::cmd_unregister_shortcut,
            commands::shortcut_commands::cmd_is_shortcut_registered,
            commands::shortcut_commands::cmd_show_main_window,
            commands::tray_commands::cmd_set_tray_recents,
            commands::tray_commands::cmd_set_tray_status,
            commands::auth_commands::auth_login,
            commands::auth_commands::auth_access_token,
            commands::auth_commands::auth_peek_access_token,
            commands::auth_commands::auth_is_authenticated,
            commands::auth_commands::auth_logout,
            commands::window_commands::coord_is_mobile,
            commands::window_commands::coord_start,
            commands::window_commands::coord_show_main,
            commands::window_commands::coord_open_doc,
            commands::window_commands::coord_open_draft,
            commands::window_commands::coord_open_search,
            commands::window_commands::coord_open_panel,
            commands::window_commands::coord_open_in_main,
            commands::window_commands::coord_login_minimize,
            commands::window_commands::coord_finish_login,
            commands::window_commands::coord_ready,
            commands::script_commands::cmd_run_script,
            commands::script_commands::cmd_kill_script,
            commands::script_commands::cmd_show_script_window,
            commands::script_commands::cmd_hide_script_window,
            commands::script_commands::cmd_select_folder,
            commands::script_commands::cmd_select_file,
            commands::script_commands::cmd_is_process_alive,
            commands::crypto_commands::cmd_encrypt,
            commands::crypto_commands::cmd_decrypt,
            commands::translate_commands::cmd_translate,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Tray app: never exit just because the last window closed (this
            // also covers the splash→main hand-off, where the window count
            // briefly drops). The app only quits via the tray "Quit" item,
            // which calls app_handle.exit(0) — that sets code=Some(0) and
            // must NOT be blocked here.
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
