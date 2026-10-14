use std::process::Command;

pub fn run_script(body: String, hidden: bool, admin: bool) -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        if admin {
            run_as_admin_windows(body)
        } else if hidden {
            run_hidden_windows(body)
        } else {
            run_normal_windows(body)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hidden, admin);
        let child = Command::new("sh")
            .args(["-c", &body])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(child.id())
    }
}

#[cfg(target_os = "windows")]
fn run_normal_windows(body: String) -> Result<u32, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x00000010;

    let child = Command::new("cmd")
        .args(["/K", &body])
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(child.id())
}

#[cfg(target_os = "windows")]
fn run_hidden_windows(body: String) -> Result<u32, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let child = Command::new("cmd")
        .args(["/C", &body])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(child.id())
}

#[cfg(target_os = "windows")]
fn run_as_admin_windows(body: String) -> Result<u32, String> {
    let escaped = body.replace('\'', "''");
    let ps_cmd = format!(
        "(Start-Process -FilePath cmd -ArgumentList '/K','{}' -Verb RunAs -PassThru).Id",
        escaped
    );

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &ps_cmd,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    stdout
        .parse::<u32>()
        .map_err(|_| "UAC was cancelled or failed to start as admin".to_string())
}

pub fn kill_script(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}

pub fn show_window(pid: u32) -> Result<(), String> {
    set_window_visibility(pid, true)
}

pub fn hide_window(pid: u32) -> Result<(), String> {
    set_window_visibility(pid, false)
}

#[cfg(target_os = "windows")]
fn set_window_visibility(pid: u32, visible: bool) -> Result<(), String> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, ShowWindow, SW_HIDE, SW_SHOW,
    };

    struct SearchData {
        target_pid: u32,
        found_hwnd: HWND,
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam as *mut SearchData);
        let mut proc_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut proc_id);
        if proc_id == data.target_pid && hwnd != 0 {
            data.found_hwnd = hwnd;
            0
        } else {
            1
        }
    }

    let mut data = SearchData {
        target_pid: pid,
        found_hwnd: 0,
    };

    unsafe {
        EnumWindows(Some(enum_callback), &mut data as *mut _ as LPARAM);
        if data.found_hwnd == 0 {
            return Err(format!("No window found for PID {}", pid));
        }
        let cmd = if visible { SW_SHOW } else { SW_HIDE };
        ShowWindow(data.found_hwnd, cmd);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_window_visibility(_pid: u32, _visible: bool) -> Result<(), String> {
    Err("Window management is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn select_folder() -> Result<Option<String>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Script Working Directory'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        Ok(None)
    } else {
        Ok(Some(stdout))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn select_folder() -> Result<Option<String>, String> {
    Err("Folder selection is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn select_file() -> Result<Option<String>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'PowerShell Scripts (*.ps1)|*.ps1'; $f.Title = 'Select PowerShell Script File'; if ($f.ShowDialog() -eq 'OK') { $f.FileName }",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        Ok(None)
    } else {
        Ok(Some(stdout))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn select_file() -> Result<Option<String>, String> {
    Err("File selection is only supported on Windows".to_string())
}
