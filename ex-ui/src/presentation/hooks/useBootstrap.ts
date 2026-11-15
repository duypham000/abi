import { useCallback, useEffect, useRef, useState } from "react";
import { store } from "@/presentation/store";
import { setUser, decodeUser } from "@/presentation/store/authSlice";
import { setOnline } from "@/presentation/store/appSlice";
import { pingServer } from "@/infrastructure/api/sessionBootstrap";
import { getAccessToken, isAuthenticated } from "@/infrastructure/tauri/authBridge";
import { setTrayStatus } from "@/infrastructure/tauri/trayStatus";
import { hydrateFromStorage } from "@/presentation/features/bootstrap/hydrate";
import { warmSharedResources } from "@/splash/warmSharedResources";
import * as kvStore from "@/infrastructure/tauri/kvStore";

export type BootstrapPhase = "loading" | "error" | "ready";

export interface BootstrapState {
  phase: BootstrapPhase;
  /** Human-readable description of the current step (Vietnamese). */
  step: string;
  /** True once the previous session expired and the user must sign in again. */
  sessionExpired: boolean;
  /** Re-run the connectivity + session checks (used by the "Thử lại" button). */
  retry: () => void;
}

const MIN_DISPLAY_MS = 700;
const SESSION_EXPIRED_NOTICE_MS = 1500;

const STEP = {
  loadLocal: "Đang nạp dữ liệu cục bộ…",
  checkServer: "Đang kết nối máy chủ…",
  restoreSession: "Đang khôi phục phiên đăng nhập…",
  warm: "Đang chuẩn bị tài nguyên…",
  ready: "Sẵn sàng",
  offline: "Không thể kết nối máy chủ",
} as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useBootstrap(): BootstrapState {
  const [phase, setPhase] = useState<BootstrapPhase>("loading");
  const [step, setStep] = useState<string>(STEP.loadLocal);
  const [sessionExpired, setSessionExpired] = useState(false);
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    const startedAt = Date.now();
    setPhase("loading");
    setSessionExpired(false);
    setTrayStatus("loading");

    // Success path: warm shared resources (best-effort) while the splash is up,
    // then keep the init screen visible for at least MIN_DISPLAY_MS so it never
    // flashes. Called only once we have a usable session.
    const becomeReady = async () => {
      setStep(STEP.warm);
      await warmSharedResources();
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_DISPLAY_MS) await sleep(MIN_DISPLAY_MS - elapsed);
      setStep(STEP.ready);
      setPhase("ready");
    };

    // 1. Local settings (only does real work the first time).
    setStep(STEP.loadLocal);
    await hydrateFromStorage();

    // 2. Server reachability (advisory: drives the online indicator).
    setStep(STEP.checkServer);
    const serverUp = await pingServer();
    store.dispatch(setOnline(serverUp));

    // 3. Restore the session via the Rust auth core (refreshes from the keychain
    // refresh token, single-flight). Returns a fresh access token or null.
    setStep(STEP.restoreSession);
    let token: string | null = null;
    let refreshFailed = false;
    try {
      token = await getAccessToken();
    } catch {
      // Network error while refreshing (server unreachable).
      refreshFailed = true;
    }

    if (token) {
      store.dispatch(setUser(decodeUser(token)));
      store.dispatch(setOnline(true));
      setTrayStatus("online");
      await becomeReady();
      return;
    }

    // No usable access token. If a refresh token exists but the server is
    // unreachable, we can enter offline mode rather than blocking on the splash screen.
    if ((refreshFailed || !serverUp) && (await isAuthenticated())) {
      store.dispatch(setOnline(false));
      setTrayStatus("offline");
      
      const cachedUserRaw = await kvStore.getItem("user");
      let cachedUser = null;
      if (cachedUserRaw) {
        try {
          cachedUser = JSON.parse(cachedUserRaw);
        } catch {}
      }
      store.dispatch(setUser(cachedUser));
      
      await becomeReady();
      return;
    }

    // No session and server is down -> offline error with retry.
    if ((refreshFailed || !serverUp) && !(await isAuthenticated())) {
      store.dispatch(setOnline(false));
      setTrayStatus("error");
      setStep(STEP.offline);
      setPhase("error");
      return;
    }

    // Truly signed out (no refresh token) -> proceed; main shows the login view.
    store.dispatch(setUser(null));
    setSessionExpired(true);
    await sleep(SESSION_EXPIRED_NOTICE_MS);
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
  }, [run]);

  const retry = useCallback(() => {
    run();
  }, [run]);

  return { phase, step, sessionExpired, retry };
}
