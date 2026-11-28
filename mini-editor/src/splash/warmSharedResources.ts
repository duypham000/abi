/**
 * Splash Resource Warming:
 * 1. Ensures SQLite tables & L1 cache (`docs`, `canvas`, `series`, `resource_cache`) are warm.
 * 2. If a refresh token exists in the OS keyring (`auth_is_authenticated`), refreshes
 *    the in-memory access token in Rust `AuthCore` (bounded to 2500ms) so the main
 *    window receives a live JWT immediately on mount instead of falling back to LOCAL_USER.
 */

import { store } from "@/presentation/store";
import { decodeUser, LOCAL_USER, setUser } from "@/presentation/store/authSlice";
import type { UserDto } from "@/core/interfaces/auth";
import * as authBridge from "@/infrastructure/tauri/authBridge";
import { getLastAuthedUser } from "@/presentation/features/bootstrap/hydrate";
import {
  getCachedResourceSync,
  preloadAllCachedResources,
  RESOURCE_CACHE_KEYS,
} from "@/infrastructure/tauri/resourceCacheService";
import { listDocsFromSqlite } from "@/infrastructure/tauri/docCacheService";
import { listCanvasFromSqlite } from "@/infrastructure/tauri/canvasCacheService";
import { listSeriesFromSqlite } from "@/infrastructure/tauri/seriesCacheService";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";

const TOKEN_WARM_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function warmSharedResources(onStep?: (step: string) => void): Promise<void> {
  // 1. Warm SQLite schemas & page cache in parallel
  onStep?.("Đang khởi tạo bộ nhớ đệm SQLite…");
  const sqliteWarmTask = isTauri()
    ? Promise.allSettled([
        preloadAllCachedResources(),
        listDocsFromSqlite({ page: 0, size: 20 }),
        listCanvasFromSqlite({ page: 0, size: 20 }),
        listSeriesFromSqlite({ page: 0, size: 50 }),
      ])
    : preloadAllCachedResources();

  // 2. Restore / refresh auth token in Rust AuthCore (bounded timeout so slow
  //    networks never stall splash hand-off)
  const authWarmTask = (async () => {
    try {
      const hasSession = await authBridge.isAuthenticated();
      if (!hasSession) {
        if (!store.getState().auth.user) {
          store.dispatch(setUser(LOCAL_USER));
        }
        return;
      }

      onStep?.("Đang khôi phục phiên đăng nhập…");

      // Immediately restore cached real user so UI never flashes LOCAL_USER
      const cachedUser = await getLastAuthedUser();
      if (cachedUser) {
        store.dispatch(setUser(cachedUser));
      }

      // Refresh access token in Rust AuthCore memory (single-flight, bounded wait)
      const token = await withTimeout(
        authBridge.getAccessToken(),
        TOKEN_WARM_TIMEOUT_MS,
        null
      );

      if (token && token !== "local-standalone-token") {
        const decoded = decodeUser(token);
        if (decoded) {
          const cachedMe = getCachedResourceSync<UserDto>(RESOURCE_CACHE_KEYS.AUTH_ME);
          const merged =
            cachedMe?.data && cachedMe.data.email === decoded.email
              ? {
                  ...decoded,
                  username: cachedMe.data.username || decoded.username,
                  fullName: cachedMe.data.fullName ?? cachedMe.data.full_name,
                  createdAt: cachedMe.data.createdAt ?? cachedMe.data.createdDate,
                  active: cachedMe.data.active,
                }
              : decoded;
          store.dispatch(setUser(merged));
        }
      }
    } catch {
      // Keep cached user or LOCAL_USER gracefully when offline
    }
  })();

  await Promise.allSettled([sqliteWarmTask, authWarmTask]);
}
