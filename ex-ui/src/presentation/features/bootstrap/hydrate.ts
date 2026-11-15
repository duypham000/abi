import { store } from "@/presentation/store";
import {
  updateShortcut,
  type ShortcutSettings,
} from "@/presentation/store/settingsSlice";
import { setUser } from "@/presentation/store/authSlice";
import * as kvStore from "@/infrastructure/tauri/kvStore";

let hydrated = false;

/**
 * Load persisted settings into the store and wire up persistence (once per
 * window/JS context). Reading from the local kv store (SQLite) is fast and does
 * NOT touch the network.
 */
export async function hydrateFromStorage(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const settingsRaw = await kvStore.getItem("settings");

  if (settingsRaw) {
    try {
      const settings = JSON.parse(settingsRaw) as {
        shortcuts?: Partial<ShortcutSettings>;
      };
      if (settings.shortcuts) {
        for (const [key, value] of Object.entries(settings.shortcuts)) {
          if (value) {
            store.dispatch(
              updateShortcut({ key: key as keyof ShortcutSettings, value })
            );
          }
        }
      }
    } catch {
      /* ignore corrupt settings */
    }
  }

  const userRaw = await kvStore.getItem("user");
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      store.dispatch(setUser(user));
    } catch {
      /* ignore corrupt user */
    }
  }

  // Persist settings and auth user to SQLite on change.
  let prev = store.getState();
  store.subscribe(() => {
    const curr = store.getState();
    if (curr.settings !== prev.settings) {
      kvStore.setItem("settings", JSON.stringify(curr.settings));
    }
    if (curr.auth.user !== prev.auth.user) {
      if (curr.auth.user) {
        kvStore.setItem("user", JSON.stringify(curr.auth.user));
      } else {
        kvStore.removeItem("user");
      }
    }
    prev = curr;
  });
}
