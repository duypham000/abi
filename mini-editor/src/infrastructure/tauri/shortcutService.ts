import { invoke } from "@tauri-apps/api/core";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function registerShortcut(shortcut: string, action: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cmd_register_shortcut", { shortcut, action });
}

export async function unregisterShortcut(shortcut: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cmd_unregister_shortcut", { shortcut });
}

export async function isShortcutRegistered(shortcut: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("cmd_is_shortcut_registered", { shortcut });
}

export async function showMainWindow(): Promise<void> {
  if (!isTauri()) return;
  await invoke("cmd_show_main_window");
}
