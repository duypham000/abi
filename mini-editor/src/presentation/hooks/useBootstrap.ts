import { useCallback, useEffect, useRef, useState } from "react";
import { store } from "@/presentation/store";
import { setOnline } from "@/presentation/store/appSlice";
import { setTrayStatus } from "@/infrastructure/tauri/trayStatus";
import { hydrateFromStorage } from "@/presentation/features/bootstrap/hydrate";
import { warmSharedResources } from "@/splash/warmSharedResources";

export type BootstrapPhase = "loading" | "error" | "ready";

export interface BootstrapState {
  phase: BootstrapPhase;
  step: string;
  sessionExpired: boolean;
  retry: () => void;
}

const MIN_DISPLAY_MS = 120;

const STEP = {
  loadLocal: "Đang nạp dữ liệu cục bộ…",
  warm: "Đang xác thực & chuẩn bị tài nguyên…",
  ready: "Sẵn sàng",
} as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useBootstrap(): BootstrapState {
  const [phase, setPhase] = useState<BootstrapPhase>("loading");
  const [step, setStep] = useState<string>(STEP.loadLocal);
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    const startedAt = Date.now();
    setPhase("loading");

    setStep(STEP.loadLocal);
    await hydrateFromStorage();

    setStep(STEP.warm);
    store.dispatch(setOnline(true));
    setTrayStatus("online");

    await warmSharedResources((msg) => setStep(msg));
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_DISPLAY_MS) await sleep(MIN_DISPLAY_MS - elapsed);
    setStep(STEP.ready);
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  return { phase, step, sessionExpired: false, retry: run };
}
