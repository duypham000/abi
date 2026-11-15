import { useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/presentation/store";
import { registerShortcut } from "@/infrastructure/tauri/shortcutService";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useGlobalShortcuts(
  onQuickCreateDoc: () => void,
  onOpenSearch?: () => void
) {
  const { shortcuts } = useSelector((state: RootState) => state.settings);

  useEffect(() => {
    if (!isTauri()) return;

    registerShortcut(shortcuts.quickCreateDoc, "quickCreateDoc").catch(() => {});
    registerShortcut(shortcuts.showMainWindow, "showMainWindow").catch(() => {});
    registerShortcut(shortcuts.openSearch, "openSearch").catch(() => {});
  }, [shortcuts.quickCreateDoc, shortcuts.showMainWindow, shortcuts.openSearch]);

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("shortcut://quick-create-doc", () => {
        onQuickCreateDoc();
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  }, [onQuickCreateDoc]);

  useEffect(() => {
    if (!isTauri() || !onOpenSearch) return;

    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("shortcut://open-search", () => {
        onOpenSearch();
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  }, [onOpenSearch]);
}
