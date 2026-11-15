/**
 * Background connectivity monitor.
 *
 * When offline: polls a lightweight server endpoint every POLL_INTERVAL_MS.
 * When server responds → dispatch startReconnecting() to kick off the sync engine.
 *
 * This hook should be mounted once at the root layout level alongside useSyncEngine.
 */

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "@/presentation/store";
import { startReconnecting, selectConnectivity } from "@/presentation/store/appSlice";

const POLL_INTERVAL_MS = 15_000; // 15 s
const PING_URL =
  (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1/api/v1") + "/health";

async function pingServer(): Promise<boolean> {
  try {
    const res = await fetch(PING_URL, { method: "HEAD", cache: "no-store" });
    return res.ok || (res.status >= 200 && res.status < 500);
  } catch {
    return false;
  }
}

export function useConnectivityMonitor() {
  const dispatch = useDispatch<AppDispatch>();
  const connectivity = useSelector(selectConnectivity);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (connectivity !== "offline") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start polling when offline
    const poll = async () => {
      const alive = await pingServer();
      if (alive) {
        dispatch(startReconnecting());
      }
    };

    poll(); // immediate first check
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connectivity, dispatch]);
}
