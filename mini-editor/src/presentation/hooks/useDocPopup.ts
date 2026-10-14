import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { isMobile, isTauri } from "@/infrastructure/platform";

/**
 * Open doc / draft popups. On desktop, window creation + auth-gating live in the
 * Rust coordinator (separate OS windows). On mobile (single webview) there are no
 * popup windows — we navigate in-app to the full-screen editor instead.
 */
export function useDocPopup() {
  const navigate = useNavigate();

  const openDocPopup = async (docId: number, _docTitle?: string) => {
    if (isMobile()) {
      navigate(`/docs/${docId}`);
      return;
    }
    if (!isTauri()) return;
    await invoke("coord_open_doc", { id: docId });
  };

  const openDraftPopup = async (localId: string, _title?: string) => {
    if (isMobile()) {
      navigate(`/docs/draft/${localId}`);
      return;
    }
    if (!isTauri()) return;
    await invoke("coord_open_draft", { localId });
  };

  return { openDocPopup, openDraftPopup };
}
