import { useEffect, Suspense } from "react";
import { store } from "@/presentation/store";
import { setUser, LOCAL_USER } from "@/presentation/store/authSlice";
import { setOnline } from "@/presentation/store/appSlice";
import { hydrateFromStorage } from "@/presentation/features/bootstrap/hydrate";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import App from "@/App";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function MainGate() {
  useEffect(() => {
    void hydrateFromStorage();
    store.dispatch(setUser(LOCAL_USER));
    store.dispatch(setOnline(true));
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
