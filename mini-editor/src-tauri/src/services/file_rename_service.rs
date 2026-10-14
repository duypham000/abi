use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileItemInfo {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub parent_dir: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirNodeInfo {
    pub path: String,
    pub name: String,
    pub parent_dir: String,
    pub item_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirectoryContentInfo {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub subdirs: Vec<DirNodeInfo>,
    pub files: Vec<FileItemInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameTask {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameResult {
    pub old_path: String,
    pub new_path: String,
    pub success: bool,
    pub error: Option<String>,
}

pub fn scan_folder_files(
    folder_paths: Vec<String>,
    recursive: bool,
    target_ext: Option<String>,
) -> Result<Vec<FileItemInfo>, String> {
    let mut results = Vec::new();
    let filter_ext = target_ext
        .map(|e| e.trim().trim_start_matches('.').to_lowercase())
        .filter(|e| !e.is_empty() && e != "*" && e != "tất cả" && e != "all");

    for folder in folder_paths {
        let trimmed = folder.trim();
        if trimmed.is_empty() {
            continue;
        }
        let p = Path::new(trimmed);
        if p.exists() && p.is_dir() {
            scan_dir(p, recursive, filter_ext.as_deref(), &mut results)?;
        } else {
            return Err(format!("Thư mục không tồn tại hoặc không đọc được: {}", folder));
        }
    }
    Ok(results)
}

fn scan_dir(
    dir: &Path,
    recursive: bool,
    filter_ext: Option<&str>,
    results: &mut Vec<FileItemInfo>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Không thể đọc thư mục {:?}: {}", dir, e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if name.starts_with('.') {
            continue; // Skip hidden files/directories
        }

        // On Android, check if it's a directory. If not, treat as a file item.
        let is_dir = path.is_dir();

        if is_dir {
            if recursive {
                let _ = scan_dir(&path, recursive, filter_ext, results);
            }
        } else {
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();

            if let Some(target) = filter_ext {
                if ext != target {
                    continue;
                }
            }

            let parent_dir = dir.to_string_lossy().to_string();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let full_path = path.to_string_lossy().to_string();

            results.push(FileItemInfo {
                path: full_path,
                name,
                ext,
                parent_dir,
                size,
            });
        }
    }
    Ok(())
}

pub fn batch_rename_files(tasks: Vec<RenameTask>) -> Vec<RenameResult> {
    let mut results = Vec::new();
    for task in tasks {
        let old_p = Path::new(&task.old_path);
        let new_p = Path::new(&task.new_path);

        if !old_p.exists() {
            results.push(RenameResult {
                old_path: task.old_path,
                new_path: task.new_path,
                success: false,
                error: Some("File does not exist".to_string()),
            });
            continue;
        }

        if let Some(parent) = new_p.parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    results.push(RenameResult {
                        old_path: task.old_path,
                        new_path: task.new_path,
                        success: false,
                        error: Some(format!("Failed to create parent directory: {}", e)),
                    });
                    continue;
                }
            }
        }

        match fs::rename(old_p, new_p) {
            Ok(_) => results.push(RenameResult {
                old_path: task.old_path,
                new_path: task.new_path,
                success: true,
                error: None,
            }),
            Err(e) => results.push(RenameResult {
                old_path: task.old_path,
                new_path: task.new_path,
                success: false,
                error: Some(e.to_string()),
            }),
        }
    }
    results
}

#[cfg(target_os = "windows")]
pub fn select_files_multi() -> Result<Vec<String>, String> {
    use std::process::Command;
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Multiselect = $true; $f.Title = 'Select Files'; if ($f.ShowDialog() -eq 'OK') { $f.FileNames | ForEach-Object { $_ } }",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let files: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(files)
}

#[cfg(not(target_os = "windows"))]
pub fn select_files_multi() -> Result<Vec<String>, String> {
    Ok(vec![])
}

pub fn list_directory_contents(target_path: &str) -> Result<DirectoryContentInfo, String> {
    let mut path_str = target_path.trim().to_string();
    if path_str.is_empty() {
        #[cfg(target_os = "android")]
        {
            path_str = "/storage/emulated/0".to_string();
        }
        #[cfg(not(target_os = "android"))]
        {
            path_str = std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| "/".to_string());
        }
    }

    let p = Path::new(&path_str);
    if !p.exists() {
        return Err(format!("Directory does not exist: {}", path_str));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path_str));
    }

    let parent_path = p
        .parent()
        .map(|parent| parent.to_string_lossy().to_string());

    let entries = fs::read_dir(p)
        .map_err(|e| format!("Failed to read directory {}: {}", path_str, e))?;

    let mut subdirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        let name = entry_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if name.starts_with('.') {
            continue; // Skip hidden files/directories
        }

        if entry_path.is_dir() {
            let item_count = fs::read_dir(&entry_path)
                .map(|it| it.count())
                .unwrap_or(0);

            subdirs.push(DirNodeInfo {
                path: entry_path.to_string_lossy().to_string(),
                name,
                parent_dir: path_str.clone(),
                item_count,
            });
        } else {
            let ext = entry_path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

            files.push(FileItemInfo {
                path: entry_path.to_string_lossy().to_string(),
                name,
                ext,
                parent_dir: path_str.clone(),
                size,
            });
        }
    }

    subdirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(DirectoryContentInfo {
        current_path: p.to_string_lossy().to_string(),
        parent_path,
        subdirs,
        files,
    })
}

