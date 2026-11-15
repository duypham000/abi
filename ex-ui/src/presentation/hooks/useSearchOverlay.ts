import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { isMobile, isTauri } from "@/infrastructure/platform";

/**
 * Open the search overlay. On desktop the Rust coordinator creates a dedicated
 * overlay window; on mobile (single webview) we navigate to the in-app route.
 */
export function useSearchOverlay() {
  const navigate = useNavigate();

  const openSearchOverlay = useCallback(async () => {
    if (isMobile()) {
      navigate("/search");
      return;
    }
    if (!isTauri()) return;
    await invoke("coord_open_search");
  }, [navigate]);

  return { openSearchOverlay };
}
