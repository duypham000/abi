#[cfg(target_os = "android")]
use std::fs;
#[cfg(target_os = "android")]
use std::path::Path;

#[tauri::command]
pub async fn cmd_check_storage_permission() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        // On Android, probe access to /storage/emulated/0 or common storage
        let root = Path::new("/storage/emulated/0");
        if !root.exists() {
            return Ok(true); // Virtualized or different root
        }
        match fs::read_dir(root) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[cfg(not(target_os = "android"))]
    {
        Ok(true)
    }
}

#[tauri::command]
pub async fn cmd_request_storage_permission() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let root = Path::new("/storage/emulated/0");
        if fs::read_dir(root).is_ok() {
            return Ok(true);
        }

        let _ = std::process::Command::new("am")
            .args([
                "start",
                "-a",
                "android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION",
                "-d",
                "package:com.tomo.app",
            ])
            .output();

        let _ = std::process::Command::new("am")
            .args([
                "start",
                "-a",
                "android.settings.APPLICATION_DETAILS_SETTINGS",
                "-d",
                "package:com.tomo.app",
            ])
            .output();

        Err("Vui lòng bật quyền 'Quản lý tất cả tệp' (All Files Access) trong Cài đặt hệ thống để Tomo đọc được file.".to_string())
    }

    #[cfg(not(target_os = "android"))]
    {
        Ok(true)
    }
}
