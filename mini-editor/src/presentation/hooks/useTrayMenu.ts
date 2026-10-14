import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import {
  getRecentDocs,
  onRecentDocsChange,
  type RecentDoc,
} from "@/infrastructure/tauri/recentDocsService";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function syncTray(): Promise<void> {
  if (!isTauri()) return;
  const recents = (await getRecentDocs()).slice(0, 4);
  const items = recents.map((r) => ({ kind: r.kind, id: r.id, title: r.title }));
  await invoke("cmd_set_tray_recents", { items }).catch(() => {});
}

/**
 * Wires the system-tray context menu to the app:
 * - pushes the latest recent docs into the tray whenever they change
 * - reacts to tray menu clicks (quick-create / open-recent / open-docs-list)
 */
export function useTrayMenu(onQuickCreateDoc: () => void) {
  const { openDocPopup, openDraftPopup } = useDocPopup();
  const navigate = useNavigate();

  // Keep the tray's "Recent" submenu in sync with the persisted recents.
  useEffect(() => {
    if (!isTauri()) return;
    syncTray();
    const unsubscribe = onRecentDocsChange(() => {
      syncTray();
    });
    return unsubscribe;
  }, []);

  // Listen for tray menu events emitted from Rust.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisteners: Array<() => void> = [];

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("tray://quick-create-doc", () => {
        onQuickCreateDoc();
      }).then((fn) => unlisteners.push(fn));

      listen("tray://open-docs-list", () => {
        navigate("/docs");
      }).then((fn) => unlisteners.push(fn));

      listen<{ kind: string; id: string }>("tray://open-recent", async (event) => {
        const { kind, id } = event.payload;
        const recents = await getRecentDocs();
        const match = recents.find(
          (r: RecentDoc) => r.kind === kind && r.id === id
        );
        const title = match?.title;
        if (kind === "draft") {
          await openDraftPopup(id, title);
        } else if (kind === "doc") {
          await openDocPopup(Number(id), title);
        }
      }).then((fn) => unlisteners.push(fn));
    });

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [onQuickCreateDoc, navigate, openDocPopup, openDraftPopup]);
}
