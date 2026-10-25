import { useEffect } from "react";

export type PaletteMode = "quick-open" | "command";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

export function openCommandPalette(mode: PaletteMode = "quick-open") {
  window.dispatchEvent(
    new CustomEvent(OPEN_COMMAND_PALETTE_EVENT, { detail: { mode } })
  );
}

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

    const customHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: PaletteMode }>).detail;
      onOpen(detail?.mode ?? "quick-open");
    };

    window.addEventListener("keydown", handler);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, customHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, customHandler);
    };
  }, [onOpen]);
}
