/**
 * WorkspaceShell — top-level app chrome using a VSCode-style layout:
 *
 *  ┌────────────────────────────────────────────────────────┐
 *  │ AppBar  (title bar + hamburger sidebar toggle)         │
 *  ├──┬────────────────┬───────────────────────────────────┤
 *  │  │  Sidebar       │  GL Editor Area                   │
 *  │A │  (collapsible  │  (panel groups — drag & drop)     │
 *  │c │   260 px)      │                                   │
 *  │t │                ├───────────────────────────────────┤
 *  │B │                │  Bottom Panel (collapsible)       │
 *  │a │                │  tabs: Layout State · Open Panels │
 *  │r │                │                                   │
 *  ├──┴────────────────┴───────────────────────────────────┤
 *  │ Status Bar  (panel count · save indicator · toggle)   │
 *  └────────────────────────────────────────────────────────┘
 */
import { useRef, useMemo, useEffect } from "react";
import { useSelector } from "react-redux";
import { AppBar } from "@/presentation/components/AppBar";
import { GoldenLayoutContext } from "./golden/GoldenLayoutContext";
import { componentMap, useOpenPanel, GoldenLayoutHostDiv } from "./golden/GoldenLayoutHost";
import { useGoldenLayoutSetup } from "./golden/useGoldenLayoutSetup";
import { useGLExtensions } from "./golden/useGLExtensions";
import { defaultLayoutConfig } from "./golden/defaultLayout";
import { ActivityBar } from "./ActivityBar/ActivityBar";
import { WorkspaceSidebar } from "./WorkspaceSidebar/WorkspaceSidebar";
import { WorkspacePanel } from "./WorkspacePanel/WorkspacePanel";
import { WorkspaceStatusBar } from "./WorkspaceStatusBar/WorkspaceStatusBar";
import { TabContextMenu } from "./golden/TabContextMenu";
import { CommandPalette } from "@/presentation/features/command-palette";
import { isTauri } from "@/infrastructure/platform";
import { OPEN_IN_MAIN_EVENT, type OpenInMainPayload } from "@/presentation/hooks/useOpenInMainWindow";
import type { PanelType } from "./golden/panelRegistry";
import type { RootState } from "@/presentation/store";
import "golden-layout/dist/css/goldenlayout-base.css";
import "./golden/golden-layout-theme.css";
import "./WorkspaceShell.scss";

export function WorkspaceShell() {
  const hostRef       = useRef<HTMLDivElement>(null);
  const activeSidebar = useSelector((s: RootState) => s.app.activeSidebar);
  const panelOpen     = useSelector((s: RootState) => s.app.panelOpen);
  const theme         = useSelector((s: RootState) => s.app.theme);

  // Pass header-button callbacks to the setup hook via refs (avoids re-init)
  const scrollToggleRef = useRef<((s: unknown) => void) | undefined>(undefined);
  const dropToggleRef   = useRef<((s: unknown) => void) | undefined>(undefined);

  const { layout, portals } = useGoldenLayoutSetup(
    hostRef,
    componentMap,
    defaultLayoutConfig,
    (s) => scrollToggleRef.current?.(s as never),
    (s) => dropToggleRef.current?.(s as never),
  );

  const ext = useGLExtensions(layout);
  scrollToggleRef.current = ext._handleScrollToggle as (s: unknown) => void;
  dropToggleRef.current   = ext._handleDropToggle   as (s: unknown) => void;

  const openPanel = useOpenPanel(layout);

  // Listen for cross-window "open panel in main window" events emitted by popup windows
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<OpenInMainPayload>(OPEN_IN_MAIN_EVENT, (event) => {
        const { panelType, state, title } = event.payload;
        openPanel(panelType as PanelType, state ?? {}, title ? { title } : undefined);
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [openPanel]);

  const ctxValue = useMemo(() => ({
    layout,
    openPanel,
    loadPreset:           ext.loadPreset,
    resetLayout:          ext.resetLayout,
    reorderActiveTab:     ext.reorderActiveTab,
    moveActiveToNewStack: ext.moveActiveToNewStack,
    splitPanel:           ext.splitPanel,
    togglePanelScroll:    ext.togglePanelScroll,
    toggleDropOnHeader:   ext.toggleDropOnHeader,
    registerDragSource:   ext.registerDragSource,
  }), [layout, openPanel, ext]);

  return (
    <GoldenLayoutContext.Provider value={ctxValue}>
      <div className={`workspace-shell theme-${theme}`}>

        {/* Title bar */}
        <AppBar variant="dashboard" />

        {/* Body: ActivityBar + Sidebar + Editor + StatusBar */}
        <div className="workspace-body">

          {/* 48 px icon rail */}
          <ActivityBar />

          {/* Collapsible sidebar (hamburger toggle in AppBar) */}
          <WorkspaceSidebar activeSidebar={activeSidebar} />

          {/* Main editor column: GL panels + bottom panel */}
          <div className="workspace-editor">
            <GoldenLayoutHostDiv hostRef={hostRef} portals={portals} />
            <WorkspacePanel isOpen={panelOpen} />
          </div>

        </div>

        {/* Status bar */}
        <WorkspaceStatusBar />

      </div>

      {/* Tab right-click context menu (portal to document.body) */}
      <TabContextMenu />

      {/* Global command palette (Ctrl+P / Ctrl+Shift+P) */}
      <CommandPalette />

    </GoldenLayoutContext.Provider>
  );
}
