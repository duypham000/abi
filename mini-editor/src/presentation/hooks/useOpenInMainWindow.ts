import { isTauri } from "@/infrastructure/platform";
import type { PanelState, PanelType } from "@/presentation/layout/golden/panelRegistry";

export const OPEN_IN_MAIN_EVENT = "tomo:open-in-main";

export interface OpenInMainPayload {
  panelType: PanelType | string;
  state: PanelState;
  title?: string;
}

/**
 * Called from popup windows: focuses the existing main window and tells it to
 * open a panel. Uses a single Rust command that shows the window and emits
 * the event directly to it — avoiding cross-window JS event delivery issues.
 */
export async function openInMainWindow(
  panelType: PanelType | string,
  state: PanelState = {},
  title?: string
): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("coord_open_in_main", {
    panelType,
    stateJson: JSON.stringify(state),
    title: title ?? null,
  });
}
