import { invoke } from "@tauri-apps/api/core";

/** True when running inside the Tauri runtime (desktop or mobile webview). */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Resolved once at startup from the Rust `coord_is_mobile` command so the rest of
// the app can read it synchronously while deciding routing/chrome. A narrow
// desktop window is NOT mobile — this is platform (Android/iOS), not viewport.
let mobile = false;

/** Synchronous accessor — valid after `resolveMobile()` has run (see main.tsx). */
export const isMobile = () => mobile;

/** Probe the platform once. Safe to call outside Tauri (resolves to false). */
export async function resolveMobile(): Promise<void> {
  if (!isTauri()) return;
  try {
    mobile = await invoke<boolean>("coord_is_mobile");
  } catch {
    mobile = false;
  }
}
