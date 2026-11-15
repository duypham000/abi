import { invoke } from "@tauri-apps/api/core";

export interface PortInfo {
  port: number;
  status: "free" | "occupied";
  pid?: number;
  processName?: string;
}

export const scanPort = (port: number): Promise<PortInfo> =>
  invoke("cmd_scan_port", { port });

export const scanPorts = (ports: number[]): Promise<PortInfo[]> =>
  invoke("cmd_scan_ports", { ports });

export const killProcess = (pid: number): Promise<void> =>
  invoke("cmd_kill_process", { pid });
