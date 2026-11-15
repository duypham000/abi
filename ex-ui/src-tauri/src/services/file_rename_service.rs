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
        .filter(|e| !e.is_empty() && e != "*");

    for folder in folder_paths {
        let p = Path::new(&folder);
        if p.is_dir() {
            scan_dir(p, recursive, filter_ext.as_deref(), &mut results)?;
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
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory {:?}: {}", dir, e))?;
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_dir() {
                if recursive {
                    let _ = scan_dir(&path, recursive, filter_ext, results);
                }
            } else if path.is_file() {
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

                let name = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
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
