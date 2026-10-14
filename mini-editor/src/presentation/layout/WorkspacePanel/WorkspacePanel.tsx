/**
 * WorkspacePanel — VS Code-style bottom panel.
 *
 * Collapses to zero height; expands to show layout info / open panel list /
 * running scripts / service health status.
 * Toggle via the status bar "⊟ Panel" button or Redux panelOpen action.
 */
import { useState } from "react";
import { XIcon, LayoutGridIcon, ActivityIcon, MonitorIcon } from "lucide-react";
import { useDispatch } from "react-redux";
import { togglePanel } from "@/presentation/store/appSlice";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { walkComponents } from "../golden/GoldenLayoutHost";
import { PANEL_TITLES, type PanelType } from "../golden/panelRegistry";
import { ServicesTab } from "./ServicesTab";
import { WindowsTab } from "./WindowsTab";
import "./WorkspacePanel.scss";

// ── Tab type ──────────────────────────────────────────────────────────────
type PanelTab = "layout" | "panels" | "services" | "windows";

// ── Panel content ─────────────────────────────────────────────────────────
function LayoutTab() {
  const { layout } = useGoldenLayout();
  if (!layout) return <p className="wp-empty">Layout not initialised.</p>;

  const saved = localStorage.getItem("tomo-gl-layout");
  const parsed = saved ? JSON.parse(saved) : null;

  return (
    <div className="wp-layout-view">
      <p className="wp-label">Saving State — current serialised config:</p>
      <pre className="wp-pre">
        {parsed
          ? JSON.stringify(parsed, null, 2).slice(0, 1200) + (JSON.stringify(parsed).length > 1200 ? "\n…" : "")
          : "No saved state yet — open and arrange panels first."}
      </pre>
    </div>
  );
}

function PanelsTab() {
  const { layout, openPanel } = useGoldenLayout();
  if (!layout || !layout.rootItem) return <p className="wp-empty">No panels open.</p>;

  const panels: { type: string; title: string }[] = [];
  walkComponents(layout.rootItem, (comp) => {
    panels.push({
      type: comp.componentType as string,
      title: comp.title || PANEL_TITLES[comp.componentType as PanelType] || comp.componentType as string,
    });
  });

  if (panels.length === 0) return <p className="wp-empty">No panels open.</p>;

  return (
    <div className="wp-panels-view">
      <table className="wp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Title</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {panels.map((p, i) => (
            <tr key={i}>
              <td className="wp-table__num">{i + 1}</td>
              <td><code className="wp-code">{p.type}</code></td>
              <td>{p.title}</td>
              <td>
                <button
                  className="wp-focus-btn"
                  onClick={() => openPanel(p.type as PanelType, {}, { singleton: true })}
                  title="Focus"
                >
                  Focus
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function WorkspacePanel({ isOpen }: { isOpen: boolean }) {
  const [activeTab, setActiveTab] = useState<PanelTab>("layout");
  const dispatch = useDispatch();

  return (
    <div className={`workspace-panel${isOpen ? " is-open" : ""}`} aria-label="Bottom panel">
      {/* Tab bar */}
      <div className="workspace-panel__tabs">
        <button
          className={`wp-tab${activeTab === "layout" ? " is-active" : ""}`}
          onClick={() => setActiveTab("layout")}
        >
          <LayoutGridIcon size={12} />
          Layout State
        </button>
        <button
          className={`wp-tab${activeTab === "panels" ? " is-active" : ""}`}
          onClick={() => setActiveTab("panels")}
        >
          Open Panels
        </button>
        
        <button
          className={`wp-tab${activeTab === "services" ? " is-active" : ""}`}
          onClick={() => setActiveTab("services")}
        >
          <ActivityIcon size={12} />
          Services
        </button>
        <button
          className={`wp-tab${activeTab === "windows" ? " is-active" : ""}`}
          onClick={() => setActiveTab("windows")}
        >
          <MonitorIcon size={12} />
          Windows
        </button>

        {/* Close button */}
        <button
          className="wp-close"
          onClick={() => dispatch(togglePanel())}
          title="Close panel"
        >
          <XIcon size={13} />
        </button>
      </div>

      {/* Content */}
      <div className="workspace-panel__content">
        {activeTab === "layout"   && <LayoutTab />}
        {activeTab === "panels"   && <PanelsTab />}
                {activeTab === "services" && <ServicesTab />}
        {activeTab === "windows"  && <WindowsTab />}
      </div>
    </div>
  );
}
