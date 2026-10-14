use sysinfo::{Pid, System};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub status: String,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
}

pub fn scan_port(port: u16) -> PortInfo {
    // TcpListener::bind uses SO_REUSEADDR which on Windows allows binding even when
    // another process already owns the port, making every port appear free.
    // TcpStream::connect_timeout avoids this: success means occupied, refused means free.
    let addr: std::net::SocketAddr = ([127, 0, 0, 1], port).into();
    let is_occupied = std::net::TcpStream::connect_timeout(
        &addr,
        std::time::Duration::from_millis(200),
    )
    .is_ok();

    if !is_occupied {
        return PortInfo {
            port,
            status: "free".to_string(),
            pid: None,
            process_name: None,
        };
    }

    let pid = find_pid_for_port(port);
    let process_name = pid.and_then(|p| get_process_name(p));

    PortInfo {
        port,
        status: "occupied".to_string(),
        pid,
        process_name,
    }
}

pub fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
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
        let output = std::process::Command::new("kill")
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

fn find_pid_for_port(port: u16) -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        find_pid_windows(port)
    }

    #[cfg(target_os = "macos")]
    {
        find_pid_macos(port)
    }

    #[cfg(target_os = "linux")]
    {
        find_pid_linux(port)
    }

    #[cfg(target_os = "android")]
    {
        let _ = port;
        None
    }
}

#[cfg(target_os = "windows")]
fn find_pid_windows(port: u16) -> Option<u32> {
    let output = std::process::Command::new("netstat")
        .args(["-ano", "-p", "TCP"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let target = format!(":{}", port);

    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // netstat -ano -p TCP columns: Proto LocalAddress ForeignAddress State PID
        if parts.len() >= 5 {
            let local = parts[1];
            if local.ends_with(&target) {
                return parts[4].parse().ok();
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn find_pid_macos(port: u16) -> Option<u32> {
    let output = std::process::Command::new("lsof")
        .args(["-nP", "-i", &format!(":{}", port), "-sTCP:LISTEN", "-t"])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .ok()
}

#[cfg(target_os = "linux")]
fn find_pid_linux(port: u16) -> Option<u32> {
    let output = std::process::Command::new("ss")
        .args(["-tlnp", &format!("sport = :{}", port)])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines().skip(1) {
        if let Some(users) = line.split("users:").nth(1) {
            if let Some(pid_part) = users.split("pid=").nth(1) {
                return pid_part.split(',').next()?.parse().ok();
            }
        }
    }
    None
}

fn get_process_name(pid: u32) -> Option<String> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.process(Pid::from_u32(pid))
        .map(|p| p.name().to_string_lossy().to_string())
}
