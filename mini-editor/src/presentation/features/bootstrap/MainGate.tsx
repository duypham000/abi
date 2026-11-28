import { useEffect, useState, Suspense } from "react";
import { store } from "@/presentation/store";
import { setUser, LOCAL_USER, decodeUser } from "@/presentation/store/authSlice";
import { setOnline } from "@/presentation/store/appSlice";
import type { AuthUser, UserDto } from "@/core/interfaces/auth";
import {
  getLastAuthedUser,
  hydrateFromStorage,
} from "@/presentation/features/bootstrap/hydrate";
import * as authBridge from "@/infrastructure/tauri/authBridge";
import {
  getCachedResourceSync,
  RESOURCE_CACHE_KEYS,
} from "@/infrastructure/tauri/resourceCacheService";
import { runWorkspacePreloader } from "@/infrastructure/preload/workspacePreloader";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import App from "@/App";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function mergeWithCachedProfile(decoded: AuthUser): AuthUser {
  const cachedMe = getCachedResourceSync<UserDto>(RESOURCE_CACHE_KEYS.AUTH_ME);
  if (cachedMe?.data && cachedMe.data.email === decoded.email) {
    return {
      ...decoded,
      username: cachedMe.data.username || decoded.username,
      fullName: cachedMe.data.fullName ?? cachedMe.data.full_name,
      createdAt: cachedMe.data.createdAt ?? cachedMe.data.createdDate,
      active: cachedMe.data.active,
    };
  }
  return decoded;
}

export default function MainGate() {
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      // 1. Fast local SQLite hydration (settings, cached user, resource_cache L1, agentStore)
      await hydrateFromStorage();
      if (!active) return;

      let resolvedRealUser = false;

      // 2. Check cached in-memory access token (Tauri) or localStorage token (Web)
      const peekedToken = await authBridge.peekAccessToken();
      if (peekedToken && peekedToken !== "local-standalone-token") {
        const realUser = decodeUser(peekedToken);
        if (realUser) {
          store.dispatch(setUser(mergeWithCachedProfile(realUser)));
          resolvedRealUser = true;
        }
      }

      // 3. In Tauri, if memory token is null (e.g. cold start / Android / autostart),
      //    check whether OS keyring holds a refresh token so we don't fall back to LOCAL_USER.
      if (!resolvedRealUser && isTauri()) {
        const hasSession = await authBridge.isAuthenticated();
        if (hasSession) {
          const cachedUser = await getLastAuthedUser();
          if (cachedUser) {
            store.dispatch(setUser(cachedUser));
            resolvedRealUser = true;
          }
          // Refresh live token in background so API calls have a fresh Bearer token
          void authBridge.getAccessToken().then((freshToken) => {
            if (!active || !freshToken || freshToken === "local-standalone-token") return;
            const decoded = decodeUser(freshToken);
            if (decoded) {
              store.dispatch(setUser(mergeWithCachedProfile(decoded)));
              void runWorkspacePreloader({ forceRemote: true });
            }
          });
        }
      }

      if (!resolvedRealUser) {
        const current = store.getState().auth.user;
        if (!current) {
          store.dispatch(setUser(LOCAL_USER));
        } else if (isTauri()) {
          const hasSession = await authBridge.isAuthenticated();
          if (!hasSession && current.email !== "local@device") {
            store.dispatch(setUser(LOCAL_USER));
          }
        }
      }

      store.dispatch(setOnline(true));
      if (active) {
        setBootReady(true);
      }
    };

    void bootstrap();

    const unlistenAuth = authBridge.onAuthChanged(() => {
      void (async () => {
        const token = await authBridge.peekAccessToken();
        if (token && token !== "local-standalone-token") {
          const decoded = decodeUser(token);
          if (decoded) {
            store.dispatch(setUser(mergeWithCachedProfile(decoded)));
            void runWorkspacePreloader({ forceRemote: true });
            return;
          }
        }
        const hasSession = await authBridge.isAuthenticated();
        if (hasSession) {
          const fresh = await authBridge.getAccessToken();
          if (fresh && fresh !== "local-standalone-token") {
            const decoded = decodeUser(fresh);
            if (decoded) {
              store.dispatch(setUser(mergeWithCachedProfile(decoded)));
              void runWorkspacePreloader({ forceRemote: true });
            }
          }
        }
      })();
    });

    return () => {
      active = false;
      unlistenAuth();
    };
  }, []);

  useEffect(() => {
    if (!bootReady) return;

    let cancelCoord: (() => void) | undefined;
    if (isTauri()) {
      let cancelled = false;
      import("@tauri-apps/api/core").then(({ invoke }) => {
        if (cancelled) return;
        const raf = requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!cancelled) {
              void invoke("coord_ready").catch(() => {});
            }
          })
        );
        cancelCoord = () => {
          cancelled = true;
          cancelAnimationFrame(raf);
        };
      });
    }

    // Kick off non-blocking background resource preload shortly after first paint
    const preloadTimer = window.setTimeout(() => {
      void runWorkspacePreloader();
    }, 50);

    return () => {
      cancelCoord?.();
      window.clearTimeout(preloadTimer);
    };
  }, [bootReady]);

  if (!bootReady) {
    return <Loading variant="fullscreen" />;
  }

  return (
    <Suspense fallback={<Loading variant="fullscreen" />}>
      <App />
    </Suspense>
  );
}
