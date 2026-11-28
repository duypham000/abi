import { store } from "@/presentation/store";
import {
  updateShortcut,
  type ShortcutSettings,
} from "@/presentation/store/settingsSlice";
import { setUser } from "@/presentation/store/authSlice";
import type { AuthUser, UserDto } from "@/core/interfaces/auth";
import * as kvStore from "@/infrastructure/tauri/kvStore";
import {
  getCachedResourceSync,
  preloadAllCachedResources,
  removeCachedResource,
  RESOURCE_CACHE_KEYS,
} from "@/infrastructure/tauri/resourceCacheService";
import { useAgentStore } from "@/presentation/features/agent/store/agentStore";

let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function userDtoToAuthUser(dto: UserDto): AuthUser {
  return {
    userId: dto.id,
    username: dto.username,
    email: dto.email,
    role: dto.role || "USER",
    fullName: dto.fullName ?? dto.full_name,
    createdAt: dto.createdAt ?? dto.createdDate,
    active: dto.active,
  };
}

export async function getLastAuthedUser(): Promise<AuthUser | null> {
  const cachedMe = getCachedResourceSync<UserDto>(RESOURCE_CACHE_KEYS.AUTH_ME);
  if (cachedMe?.data && cachedMe.data.email && cachedMe.data.email !== "local@device") {
    return userDtoToAuthUser(cachedMe.data);
  }
  const raw = await kvStore.getItem("last_authed_user").catch(() => null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AuthUser;
      if (parsed && parsed.email && parsed.email !== "local@device") {
        return parsed;
      }
    } catch {
      /* ignore corrupt user */
    }
  }
  return null;
}

/**
 * Load persisted settings, cached user, SQLite resource_cache L1 mirror, and
 * Agent store into memory (once per window/JS context). Fast & network-free.
 */
export async function hydrateFromStorage(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const [settingsRaw, userRaw] = await Promise.all([
      kvStore.getItem("settings").catch(() => null),
      kvStore.getItem("user").catch(() => null),
      preloadAllCachedResources(),
      useAgentStore.getState().hydrate().catch(() => undefined),
    ]);

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

    let restoredUser: AuthUser | null = null;
    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw) as AuthUser;
        if (parsed && parsed.email) {
          restoredUser = parsed;
        }
      } catch {
        /* ignore corrupt user */
      }
    }

    // Merge richer profile fields (fullName, createdAt, username) if cached
    if (restoredUser && restoredUser.email !== "local@device") {
      const cachedMe = getCachedResourceSync<UserDto>(RESOURCE_CACHE_KEYS.AUTH_ME);
      if (cachedMe?.data && cachedMe.data.email === restoredUser.email) {
        restoredUser = {
          ...restoredUser,
          ...userDtoToAuthUser(cachedMe.data),
        };
      }
      store.dispatch(setUser(restoredUser));
    } else if (restoredUser) {
      store.dispatch(setUser(restoredUser));
    }

    // Persist settings and auth user to SQLite on change.
    let prev = store.getState();
    store.subscribe(() => {
      const curr = store.getState();
      if (curr.settings !== prev.settings) {
        void kvStore.setItem("settings", JSON.stringify(curr.settings));
      }
      if (curr.auth.user !== prev.auth.user) {
        if (curr.auth.user) {
          void kvStore.setItem("user", JSON.stringify(curr.auth.user));
          if (curr.auth.user.email !== "local@device") {
            void kvStore.setItem("last_authed_user", JSON.stringify(curr.auth.user));
          }
        } else {
          void kvStore.removeItem("user");
          void kvStore.removeItem("last_authed_user");
          void removeCachedResource(RESOURCE_CACHE_KEYS.AUTH_ME);
        }
      }
      prev = curr;
    });

    hydrated = true;
  })();

  return hydratePromise;
}
