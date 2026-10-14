import { useEffect } from "react";

export type PaletteMode = "quick-open" | "command";

/**
 * In-window (webview-level) shortcuts that open the command palette:
 *   - Ctrl/Cmd+P        → quick-open mode (search docs/canvas…)
 *   - Ctrl/Cmd+Shift+P  → command mode (run commands / open features)
 *
 * Independent from the OS-global `openSearch` shortcut and the separate
 * search overlay window — those are left untouched.
 */
export function useCommandPaletteHotkeys(onOpen: (mode: PaletteMode) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      if (e.key !== "p" && e.key !== "P") return;

      // Ctrl+P would otherwise trigger the webview's Print dialog.
      e.preventDefault();
      e.stopPropagation();
      onOpen(e.shiftKey ? "command" : "quick-open");
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
