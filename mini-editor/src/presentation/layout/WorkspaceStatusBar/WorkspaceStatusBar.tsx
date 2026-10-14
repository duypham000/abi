/**
 * WorkspaceStatusBar — VS Code-style status bar (24 px strip at the bottom).
 * Shows: panel count · saving state indicator · panel toggle button.
 */
import { useDispatch, useSelector } from "react-redux";
import { PanelBottomIcon, SaveIcon } from "lucide-react";
import { togglePanel } from "@/presentation/store/appSlice";
import type { RootState } from "@/presentation/store";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { walkComponents } from "../golden/GoldenLayoutHost";
import "./WorkspaceStatusBar.scss";

export function WorkspaceStatusBar() {
  const dispatch = useDispatch();
  const panelOpen = useSelector((s: RootState) => s.app.panelOpen);
  const { layout } = useGoldenLayout();

  let panelCount = 0;
  if (layout?.rootItem) {
    walkComponents(layout.rootItem, () => { panelCount++; });
  }

  const hasSaved = Boolean(localStorage.getItem("tomo-gl-layout"));

  return (
    <div className="workspace-statusbar" role="status" aria-label="Status bar">
      {/* Left: panel count + save state */}
      <div className="wsb-left">
        <span className="wsb-item" title="Open panels">
          {panelCount} {panelCount === 1 ? "panel" : "panels"}
        </span>
        {hasSaved && (
          <span className="wsb-item wsb-item--muted" title="Layout saved to localStorage">
            <SaveIcon size={10} />
            Layout saved
          </span>
        )}
      </div>

      {/* Right: panel toggle */}
      <div className="wsb-right">
        <button
          className={`wsb-btn${panelOpen ? " is-active" : ""}`}
          title="Toggle bottom panel"
          onClick={() => dispatch(togglePanel())}
        >
          <PanelBottomIcon size={12} />
          Panel
        </button>
      </div>
    </div>
  );
}
