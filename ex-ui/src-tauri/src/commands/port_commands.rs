use crate::services::port_service::{self, PortInfo};
use futures::future::join_all;

#[tauri::command]
pub async fn cmd_scan_port(port: u16) -> Result<PortInfo, String> {
    Ok(port_service::scan_port(port))
}

#[tauri::command]
pub async fn cmd_scan_ports(ports: Vec<u16>) -> Result<Vec<PortInfo>, String> {
    let futures = ports.into_iter().map(|p| async move { port_service::scan_port(p) });
    Ok(join_all(futures).await)
}

#[tauri::command]
pub async fn cmd_kill_process(pid: u32) -> Result<(), String> {
    port_service::kill_process(pid)
}
