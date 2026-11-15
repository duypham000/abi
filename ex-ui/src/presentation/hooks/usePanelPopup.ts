import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/infrastructure/platform";

export function usePanelPopup() {
  const openPanelPopup = async (panelType: string, state: Record<string, unknown>) => {
    if (!isTauri()) return;
    await invoke("coord_open_panel", {
      panelType,
      stateJson: JSON.stringify(state),
    });
  };

  return { openPanelPopup };
}
