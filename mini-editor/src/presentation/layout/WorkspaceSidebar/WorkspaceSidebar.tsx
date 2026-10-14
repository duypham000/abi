/**
 * WorkspaceSidebar — VSCode-style left sidebar.
 *
 * Renders one of three panels based on `activeSidebar`:
 *   features → FeaturesPanel (grid of all panel types)
 *   docs     → DocsPanel (search + list)
 *   demo     → DemoPanel (LayoutToolbar example)
 *
 * Width transitions via CSS so GL panels reflow naturally.
 */
import type { SidebarKey } from "@/presentation/store/appSlice";
import { FeaturesPanel } from "./FeaturesPanel";
import { DocsPanel } from "./DocsPanel";
import { SeriesPanel } from "./SeriesPanel";
import { DemoPanel } from "./DemoPanel";
import "./WorkspaceSidebar.scss";

// ── Main sidebar ───────────────────────────────────────────────────────────
export function WorkspaceSidebar({ activeSidebar }: { activeSidebar: SidebarKey | null }) {
  const isOpen = activeSidebar !== null;

  return (
    <aside className={`workspace-sidebar${isOpen ? " is-open" : ""}`} aria-label="Sidebar">
      <div className="workspace-sidebar__inner">
        {activeSidebar === "features" && <FeaturesPanel />}
        {activeSidebar === "docs"     && <DocsPanel />}
        {activeSidebar === "series"   && <SeriesPanel />}
        {activeSidebar === "demo"     && <DemoPanel />}
      </div>
    </aside>
  );
}
