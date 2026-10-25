import { useEffect, Suspense } from "react";
import { store } from "@/presentation/store";
import { setUser, LOCAL_USER, decodeUser } from "@/presentation/store/authSlice";
import { setOnline } from "@/presentation/store/appSlice";
import { hydrateFromStorage } from "@/presentation/features/bootstrap/hydrate";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import App from "@/App";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function MainGate() {
  useEffect(() => {
    const bootstrap = async () => {
      // Restore persisted settings (shortcuts, kv-stored user) first.
      await hydrateFromStorage();

      if (isTauri()) {
        try {
          // auth_peek_access_token is zero-network: returns the in-memory cached
          // token if still valid, or null. This is the authoritative source for
          // whether the Tauri session is alive right now.
          const { invoke } = await import("@tauri-apps/api/core");
          const token = await invoke<string | null>("auth_peek_access_token");
          if (token) {
            const realUser = decodeUser(token);
            if (realUser) {
              store.dispatch(setUser(realUser));
              store.dispatch(setOnline(true));
              return;
            }
          }
        } catch {
          // Tauri invoke failed — fall through to kv-store / LOCAL_USER below.
        }
      }

      // Non-Tauri (web) or Tauri with no live session: keep whatever
      // hydrateFromStorage restored from kv-store, or default to LOCAL_USER.
      const current = store.getState().auth.user;
      if (!current) {
        store.dispatch(setUser(LOCAL_USER));
      }
      store.dispatch(setOnline(true));
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          void invoke("coord_ready").catch(() => {});
        })
      );
      return () => cancelAnimationFrame(raf);
    });
  }, []);

  return (
    <Suspense fallback={<Loading variant="fullscreen" />}>
      <App />
    </Suspense>
  );
}
