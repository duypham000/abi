use crate::services::script_service;

#[tauri::command]
pub async fn cmd_run_script(body: String, hidden: bool, admin: bool) -> Result<u32, String> {
    script_service::run_script(body, hidden, admin)
}

#[tauri::command]
pub async fn cmd_kill_script(pid: u32) -> Result<(), String> {
    script_service::kill_script(pid)
}

#[tauri::command]
pub async fn cmd_show_script_window(pid: u32) -> Result<(), String> {
    script_service::show_window(pid)
}

#[tauri::command]
pub async fn cmd_hide_script_window(pid: u32) -> Result<(), String> {
    script_service::hide_window(pid)
}

#[tauri::command]
pub async fn cmd_select_folder() -> Result<Option<String>, String> {
    script_service::select_folder()
}

#[tauri::command]
pub async fn cmd_select_file() -> Result<Option<String>, String> {
    script_service::select_file()
}

#[tauri::command]
pub async fn cmd_is_process_alive(pid: u32) -> bool {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.process(sysinfo::Pid::from_u32(pid)).is_some()
}
