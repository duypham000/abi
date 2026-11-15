import { invoke } from "@tauri-apps/api/core";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type TrayStatus = "loading" | "online" | "offline" | "error";

/**
 * Update the system-tray icon's status dot + tooltip (Rust draws a colored
 * dot in the corner). No-op outside Tauri; failures are swallowed since this
 * is a purely cosmetic signal.
 */
export async function setTrayStatus(status: TrayStatus): Promise<void> {
  if (!isTauri()) return;
  await invoke("cmd_set_tray_status", { status }).catch(() => {});
}
