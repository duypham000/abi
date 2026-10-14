import { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/presentation/store";
import { useBootstrap } from "@/presentation/hooks/useBootstrap";
import { InitScreen } from "@/presentation/features/bootstrap/InitScreen/InitScreen";
import { registerShortcut } from "@/infrastructure/tauri/shortcutService";
import "@/App.css";
import "@/index.css";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Register Tomo's global shortcuts once (handlers live in the Rust coordinator). */
async function registerShortcuts(): Promise<void> {
  const { shortcuts } = store.getState().settings;
  await Promise.all([
    registerShortcut(shortcuts.quickCreateDoc, "quickCreateDoc"),
    registerShortcut(shortcuts.showMainWindow, "showMainWindow"),
    registerShortcut(shortcuts.openSearch, "openSearch"),
  ]).catch(() => {});
}

/**
 * Bootstrap done — hand off to the Rust coordinator: it opens the right window
 * (main if authenticated, the login modal otherwise), then we close the splash.
 * Tokens + warmed caches were written to the shared keychain/SQLite during
 * bootstrap, so the opened window hydrates instantly.
 */
async function handOff(): Promise<void> {
  if (!isTauri()) return;
  await registerShortcuts();
  // The coordinator opens the right window HIDDEN; that window calls
  // `coord_ready` once it has painted, which reveals it and dismisses THIS
  // splash — a seamless hand-off with no white flash and no blank gap.
  await invoke("coord_start");
}

/**
 * Splash window root. Runs the full app bootstrap (local hydrate → server ping →
 * session refresh → warm shared resources) behind the init screen, then opens
 * the main window and closes itself. The error / session-expired states are
 * handled by InitScreen exactly as before.
 */
function Splash() {
  const state = useBootstrap();
  const opened = useRef(false);

  useEffect(() => {
    if (state.phase === "ready" && !opened.current) {
      opened.current = true;
      void handOff();
    }
  }, [state.phase]);

  return <InitScreen {...state} />;
}

ReactDOM.createRoot(document.getElementById("splash-root") as HTMLElement).render(
  <Provider store={store}>
    <Splash />
  </Provider>
);
