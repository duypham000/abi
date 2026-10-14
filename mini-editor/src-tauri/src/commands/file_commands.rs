use crate::services::file_rename_service::{
    self, DirectoryContentInfo, FileItemInfo, RenameResult, RenameTask,
};
use crate::services::file_service;

#[tauri::command]
pub async fn cmd_read_file(path: String) -> Result<String, String> {
    file_service::read_os_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_write_file(path: String, content: String) -> Result<(), String> {
    file_service::write_os_file(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_scan_folder_files(
    folder_paths: Vec<String>,
    recursive: bool,
    target_ext: Option<String>,
) -> Result<Vec<FileItemInfo>, String> {
    file_rename_service::scan_folder_files(folder_paths, recursive, target_ext)
}

#[tauri::command]
pub async fn cmd_batch_rename_files(
    tasks: Vec<RenameTask>,
) -> Result<Vec<RenameResult>, String> {
    Ok(file_rename_service::batch_rename_files(tasks))
}

#[tauri::command]
pub async fn cmd_select_files_multi() -> Result<Vec<String>, String> {
    file_rename_service::select_files_multi()
}

#[tauri::command]
pub async fn cmd_list_directory_contents(
    path: String,
) -> Result<DirectoryContentInfo, String> {
    file_rename_service::list_directory_contents(&path)
}

