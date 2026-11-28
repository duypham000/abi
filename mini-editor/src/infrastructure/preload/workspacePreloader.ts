/**
 * Background Workspace Resource Preloader
 *
 * Runs right after the main window mounts (without blocking first paint) and
 * warms SQLite caches, RTK Query caches, Agent backend metadata, and lazy UI
 * chunks for all core features (`auth/settings`, `docs`, `canvas`, `git`, `agent`).
 *
 * Progress is published to `appSlice.preload` so `WorkspaceStatusBar` displays
 * live status while background tasks run.
 */

import { store } from "@/presentation/store";
import {
  advancePreload,
  finishPreload,
  startPreload,
} from "@/presentation/store/appSlice";
import { decodeUser, setUser } from "@/presentation/store/authSlice";
import type { UserDto } from "@/core/interfaces/auth";
import * as authBridge from "@/infrastructure/tauri/authBridge";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import { isAutostartEnabled } from "@/infrastructure/tauri/autostartService";
import { cacheDoc, deduplicateLocalDocs } from "@/infrastructure/tauri/docCacheService";
import {
  getCachedResourceSync,
  RESOURCE_CACHE_KEYS,
  RESOURCE_CACHE_TTLS,
  setCachedResource,
} from "@/infrastructure/tauri/resourceCacheService";
import { authApi } from "@/infrastructure/api/authApi";
import { docsApi } from "@/infrastructure/api/docsApi";
import { seriesApi } from "@/infrastructure/api/seriesApi";
import { canvasApi } from "@/infrastructure/api/canvasApi";
import { githubApi } from "@/infrastructure/api/githubApi";
import { useAgentStore } from "@/presentation/features/agent/store/agentStore";
import {
  preloadAgentPanel,
  preloadAgentSecondaryTabs,
  preloadWorkflowPanel,
} from "@/presentation/features/agent/preloadAgentResources";

const PRELOAD_TOTAL_STEPS = 6;
const STEP_TIMEOUT_MS = 8000;

let preloadInFlight: Promise<void> | null = null;
let initialPreloadDone = false;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function hasRealSessionToken(): Promise<string | null> {
  const token = await withTimeout(authBridge.getAccessToken(), 3000, null);
  if (!token || token === "local-standalone-token") return null;
  return token;
}

export interface RunPreloaderOptions {
  forceRemote?: boolean;
}

export async function runWorkspacePreloader(
  opts: RunPreloaderOptions = {}
): Promise<void> {
  if (preloadInFlight) {
    if (!opts.forceRemote) return preloadInFlight;
    await preloadInFlight.catch(() => undefined);
  }
  if (initialPreloadDone && !opts.forceRemote) {
    return;
  }

  const forceRemote = Boolean(opts.forceRemote);

  preloadInFlight = (async () => {
    store.dispatch(
      startPreload({
        total: PRELOAD_TOTAL_STEPS,
        currentLabel: "Tài khoản & Cài đặt",
      })
    );

    try {
      // ── Step 1: Auth & Settings ─────────────────────────────────────────────
      const token = await hasRealSessionToken();
      const step1Tasks: Promise<unknown>[] = [];

      if (token) {
        const decoded = decodeUser(token);
        if (decoded) {
          const cachedMe = getCachedResourceSync<UserDto>(RESOURCE_CACHE_KEYS.AUTH_ME);
          const current = store.getState().auth.user;
          if (!current || current.email === "local@device") {
            store.dispatch(
              setUser(
                cachedMe?.data && cachedMe.data.email === decoded.email
                  ? {
                      ...decoded,
                      username: cachedMe.data.username || decoded.username,
                      fullName: cachedMe.data.fullName ?? cachedMe.data.full_name,
                      createdAt: cachedMe.data.createdAt ?? cachedMe.data.createdDate,
                      active: cachedMe.data.active,
                    }
                  : decoded
              )
            );
          }
        }
        step1Tasks.push(
          withTimeout(
            store
              .dispatch(
                authApi.endpoints.getMe.initiate(undefined, {
                  forceRefetch: forceRemote,
                })
              )
              .unwrap()
              .catch(() => null),
            STEP_TIMEOUT_MS,
            null
          )
        );
      }

      if (isTauri()) {
        step1Tasks.push(
          isAutostartEnabled()
            .then((enabled) =>
              setCachedResource(
                RESOURCE_CACHE_KEYS.SETTINGS_AUTOSTART,
                enabled,
                RESOURCE_CACHE_TTLS.SETTINGS_AUTOSTART
              )
            )
            .catch(() => undefined)
        );
      }

      await Promise.allSettled(step1Tasks);

      // ── Step 2: Docs & Series ───────────────────────────────────────────────
      store.dispatch(
        advancePreload({ completed: 1, currentLabel: "Tài liệu & Series" })
      );

      await Promise.allSettled([
        withTimeout(
          store
            .dispatch(
              docsApi.endpoints.listDocs.initiate(
                { page: 0, size: 20 },
                { forceRefetch: forceRemote }
              )
            )
            .catch(() => null),
          STEP_TIMEOUT_MS,
          null
        ),
        withTimeout(
          store
            .dispatch(
              seriesApi.endpoints.listSeries.initiate(
                { page: 0, size: 50 },
                { forceRefetch: forceRemote }
              )
            )
            .catch(() => null),
          STEP_TIMEOUT_MS,
          null
        ),
      ]);

      if (token && isTauri()) {
        try {
          const pullRes = await withTimeout(
            store
              .dispatch(
                docsApi.endpoints.syncPullRemote.initiate(undefined, {
                  forceRefetch: true,
                })
              )
              .unwrap(),
            STEP_TIMEOUT_MS,
            null
          );
          if (pullRes?.items && Array.isArray(pullRes.items) && pullRes.items.length > 0) {
            for (const doc of pullRes.items) {
              await cacheDoc(doc);
            }
            await deduplicateLocalDocs();
            store.dispatch(docsApi.util.invalidateTags(["Doc"]));
          }
        } catch {
          // non-fatal offline sync
        }
      }

      // ── Step 3: Canvas & Thumbnails ─────────────────────────────────────────
      store.dispatch(
        advancePreload({ completed: 2, currentLabel: "Canvas & Hình thu nhỏ" })
      );

      await withTimeout(
        store
          .dispatch(
            canvasApi.endpoints.listCanvas.initiate(
              { page: 0, size: 20 },
              { forceRefetch: forceRemote }
            )
          )
          .catch(() => null),
        STEP_TIMEOUT_MS,
        null
      );

      // ── Step 4: Git & Source Control ────────────────────────────────────────
      store.dispatch(
        advancePreload({ completed: 3, currentLabel: "Git & Source Control" })
      );

      if (token) {
        try {
          const ghUser = await withTimeout(
            store
              .dispatch(
                githubApi.endpoints.getGithubUser.initiate(undefined, {
                  forceRefetch: forceRemote,
                })
              )
              .unwrap()
              .catch(() => null),
            STEP_TIMEOUT_MS,
            null
          );

          if (ghUser?.connected) {
            await withTimeout<unknown>(
              Promise.allSettled([
                store.dispatch(
                  githubApi.endpoints.listGithubRepos.initiate(undefined, {
                    forceRefetch: forceRemote,
                  })
                ),
                store.dispatch(
                  githubApi.endpoints.getWorkspaceStatus.initiate(undefined, {
                    forceRefetch: forceRemote,
                  })
                ),
                store.dispatch(
                  githubApi.endpoints.getWorkspaceManifest.initiate(undefined, {
                    forceRefetch: forceRemote,
                  })
                ),
                store.dispatch(
                  githubApi.endpoints.getGitDiff.initiate(undefined, {
                    forceRefetch: forceRemote,
                  })
                ),
                store.dispatch(
                  githubApi.endpoints.getConflicts.initiate(undefined, {
                    forceRefetch: forceRemote,
                  })
                ),
              ]),
              STEP_TIMEOUT_MS,
              null
            );
          }
        } catch {
          // non-fatal
        }
      }

      // ── Step 5: AI Agent Metadata ───────────────────────────────────────────
      store.dispatch(
        advancePreload({ completed: 4, currentLabel: "AI Agent & Mô hình" })
      );

      try {
        await useAgentStore.getState().hydrate();
        const reachable = await withTimeout(
          useAgentStore
            .getState()
            .refreshBackendMeta({ force: forceRemote })
            .catch(() => false),
          STEP_TIMEOUT_MS,
          false
        );
        if (reachable) {
          await withTimeout(
            useAgentStore.getState().refreshAgentUsage().catch(() => undefined),
            STEP_TIMEOUT_MS,
            undefined
          );
        }
      } catch {
        // non-fatal when agent daemon is offline
      }

      // ── Step 6: Warm Lazy UI Feature Chunks ─────────────────────────────────
      store.dispatch(
        advancePreload({ completed: 5, currentLabel: "Giao diện chức năng" })
      );

      await Promise.allSettled([
        import("@/presentation/features/docs/pages/DocsPage"),
        import("@/presentation/features/canvas/pages/CanvasListPage"),
        import("@/presentation/features/settings/pages/SettingsPage/SettingsPage"),
        preloadAgentPanel(),
      ]);

      await Promise.allSettled([
        import("@/presentation/features/docs/pages/DocEditorPage"),
        import("@/presentation/features/canvas/pages/CanvasEditorPage"),
        import("@/presentation/features/series/pages/SeriesDetailPanel"),
        preloadWorkflowPanel(),
        preloadAgentSecondaryTabs(),
      ]);

      initialPreloadDone = true;
    } finally {
      store.dispatch(finishPreload());
      preloadInFlight = null;
    }
  })();

  return preloadInFlight;
}
