import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Whether the app is registered to launch at OS login. False outside Tauri. */
export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  return isEnabled();
}

/** Register/unregister the app for launch at OS login. No-op outside Tauri. */
export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri()) return;
  if (on) await enable();
  else await disable();
}
