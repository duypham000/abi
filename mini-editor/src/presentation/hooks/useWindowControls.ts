import { useCallback, useEffect, useRef, useState } from "react";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// How long (ms) to suppress close/minimize after a window move ends.
// In production builds, WebView2 can synthesize a spurious click event
// immediately after a window drag completes. This guard prevents that
// synthetic click from accidentally triggering destructive window actions.
const POST_MOVE_GUARD_MS = 250;

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const movedRecently = useRef(false);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isTauri()) return;

    let unlistenResize: Promise<() => void> | null = null;
    let unlistenMoved: (() => void) | null = null;

    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win.isMaximized().then(setIsMaximized);

      unlistenResize = win.onResized(async () => {
        setIsMaximized(await win.isMaximized());
      });

      // Track window moves so we can suppress spurious post-drag clicks.
      win.onMoved(() => {
        movedRecently.current = true;
        clearTimeout(moveTimerRef.current);
        moveTimerRef.current = setTimeout(() => {
          movedRecently.current = false;
        }, POST_MOVE_GUARD_MS);
      }).then((fn) => {
        unlistenMoved = fn;
      });
    });

    return () => {
      unlistenResize?.then((fn) => fn());
      unlistenMoved?.();
      clearTimeout(moveTimerRef.current);
    };
  }, []);

  const minimize = useCallback(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().minimize());
  }, []);

  const toggleMaximize = useCallback(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize());
  }, []);

  const close = useCallback(() => {
    if (!isTauri()) return;
    // Ignore clicks that arrive within POST_MOVE_GUARD_MS after the window
    // moved — these are likely synthetic events from the drag completion.
    if (movedRecently.current) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
  }, []);

  // Hide the window to the system tray (app keeps running in the background).
  const hide = useCallback(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().hide());
  }, []);

  return { isMaximized, minimize, toggleMaximize, close, hide };
}
