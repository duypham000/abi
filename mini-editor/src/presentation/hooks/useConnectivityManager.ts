/**
 * useConnectivityManager — mounts once at app root.
 *
 * Responsibilities:
 * 1. Polls health endpoint every 15 s when offline/connection-lost.
 * 2. On server recovery → transitions to "reconnecting".
 * 3. In "reconnecting" state → replays outbox, triggers git workspace sync,
 *    then marks back "online".
 */

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "@/presentation/store";
import {
  selectConnectivity,
  startReconnecting,
  backOnline,
  connectionLost,
} from "@/presentation/store/appSlice";
import { pingServer } from "@/infrastructure/api/sessionBootstrap";
import { replayOutbox } from "@/infrastructure/tauri/syncEngine";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import { githubApi } from "@/infrastructure/api/githubApi";
import { docsApi } from "@/infrastructure/api/docsApi";

const HEALTH_POLL_INTERVAL_MS = 15_000;
const ONLINE_RECHECK_MS = 60_000; // recheck even when online (detect silent disconnect)

export function useConnectivityManager() {
  const dispatch = useDispatch<AppDispatch>();
  const connectivity = useSelector(selectConnectivity);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRunning = useRef(false);

  // ── 1. Health polling ──────────────────────────────────────────────────────

  useEffect(() => {
    const clearPoll = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    if (connectivity === "offline" || connectivity === "connection-lost") {
      // Fast polling while disconnected
      clearPoll();
      pollingRef.current = setInterval(async () => {
        const alive = await pingServer();
        if (alive) {
          dispatch(startReconnecting());
        }
      }, HEALTH_POLL_INTERVAL_MS);
    } else if (connectivity === "online") {
      // Slow polling while online — detect silent disconnect
      clearPoll();
      pollingRef.current = setInterval(async () => {
        const alive = await pingServer(3000);
        if (!alive) {
          dispatch(connectionLost());
        }
      }, ONLINE_RECHECK_MS);
    } else {
      // "reconnecting" — stop polling while sync is running
      clearPoll();
    }

    return clearPoll;
  }, [connectivity, dispatch]);

  // ── 2. Reconnect → sync pipeline ──────────────────────────────────────────

  useEffect(() => {
    if (connectivity !== "reconnecting") return;
    if (syncRunning.current) return;

    let cancelled = false;
    syncRunning.current = true;

    (async () => {
      try {
        // Step 1: Replay local outbox (push offline changes to backend)
        if (isTauri()) {
          await replayOutbox();
        }

        if (cancelled) return;

        // Step 2: Invalidate doc cache so fresh data loads from server
        dispatch(docsApi.util.invalidateTags(["Doc"]));

        // Step 3: Pull latest git changes and sync workspace → DB
        // These are fire-and-forget — don't block returning to online state
        try {
          await dispatch(
            githubApi.endpoints.pullRepo.initiate({} as any)
          );
        } catch {
          // Not fatal — user may not have git configured
        }

        try {
          await dispatch(
            githubApi.endpoints.syncWorkspace.initiate()
          );
        } catch {
          // Not fatal
        }
      } catch (err) {
        console.warn("[ConnectivityManager] Sync error during reconnect:", err);
      } finally {
        syncRunning.current = false;
        if (!cancelled) {
          dispatch(backOnline());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectivity, dispatch]);
}

