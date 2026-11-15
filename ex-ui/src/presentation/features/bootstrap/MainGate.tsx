import { Suspense, lazy, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/presentation/store";
import { setUser, decodeUser } from "@/presentation/store/authSlice";
import { setOnline, goOffline } from "@/presentation/store/appSlice";
import {
  peekAccessToken,
  getAccessToken,
  onAuthChanged,
} from "@/infrastructure/tauri/authBridge";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import { hydrateFromStorage } from "./hydrate";
import * as kvStore from "@/infrastructure/tauri/kvStore";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Lazy-load the router/app so the initial bundle stays tiny. Heavy editors
// (BlockNote, Excalidraw, …) load on demand instead of blocking first paint.
const App = lazy(() => import("@/App"));

/** Mirror the Rust auth state into the store. Fetch-only — never on render path. */
async function syncUser(): Promise<void> {
  // Fast, network-free peek first so auth status resolves almost instantly.
  const peeked = await peekAccessToken();
  if (peeked) {
    store.dispatch(setUser(decodeUser(peeked)));
  } else {
    // Try to load cached user from kvStore for offline instant render
    const cachedUserRaw = await kvStore.getItem("user");
    if (cachedUserRaw) {
      try {
        store.dispatch(setUser(JSON.parse(cachedUserRaw)));
      } catch {}
    }
  }

  // Then a full check that may refresh over the network (background).
  try {
    const token = await getAccessToken();
    store.dispatch(setUser(token ? decodeUser(token) : null));
    if (token) {
      store.dispatch(setOnline(true));
    }
  } catch (error) {
    // Server is dead / unreachable, keep the hydrated/peeked user, do not logout!
    store.dispatch(setOnline(false));
    store.dispatch(goOffline());
  }
}

/**
 * Light gate for the main window and every popup.
 *
 * Render is NEVER blocked on a fetch: the app shell mounts immediately while
 * settings hydration and the auth sync run in parallel in the background and
 * update the store reactively (see authSlice `status` + ProtectedRoute). This
 * keeps doc popups — especially local drafts — instant, independent of the
 * network.
 */
export default function MainGate() {
  useEffect(() => {
    void hydrateFromStorage();
    void syncUser();
    const unlisten = onAuthChanged(() => {
      void syncUser();
    });
    return unlisten;
  }, []);

  // The window was created hidden (no white flash while the webview boots).
  // Reveal it after the first paint and dismiss the splash → seamless hand-off.
  useEffect(() => {
    if (!isTauri()) return;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void invoke("coord_ready").catch(() => {});
      })
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Suspense fallback={<Loading variant="fullscreen" />}>
      <App />
    </Suspense>
  );
}
