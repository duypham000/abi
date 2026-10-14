import { lazy, Suspense, useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";
import { PANEL_TITLES, PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import type { PanelState, PanelType } from "@/presentation/layout/golden/panelRegistry";
import { GoldenLayoutContext } from "@/presentation/layout/golden/GoldenLayoutContext";
import { openInMainWindow } from "@/presentation/hooks/useOpenInMainWindow";
import { PanelPopupAppBar } from "./PanelPopupAppBar";
import "./PanelPopupPage.scss";

const DashboardPage    = lazy(() => import("@/presentation/features/dashboard/pages/DashboardPage"));
const DocsPage         = lazy(() => import("@/presentation/features/docs/pages/DocsPage"));
const CanvasListPage   = lazy(() => import("@/presentation/features/canvas/pages/CanvasListPage"));
const CanvasEditorPage = lazy(() => import("@/presentation/features/canvas/pages/CanvasEditorPage"));
const SettingsPage     = lazy(() => import("@/presentation/features/settings/pages/SettingsPage/SettingsPage"));
const SearchOverlayPage = lazy(() => import("@/presentation/features/search/pages/SearchOverlayPage"));
const TranslatePage     = lazy(() => import("@/presentation/features/translate/pages/TranslatePage"));

function PanelSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="panel-popup-loading">Loading…</div>}>
      {children}
    </Suspense>
  );
}

function parseState(search: string): Record<string, unknown> {
  try {
    const s = new URLSearchParams(search).get("s");
    if (!s) return {};
    return JSON.parse(atob(s)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const noop = () => {};
function useBridgeContext() {
  return useMemo(() => ({
    layout: null,
    openPanel: (type: PanelType, state: PanelState = {}, options?: { title?: string }) => {
      openInMainWindow(type, state, options?.title);
    },
    loadPreset: noop,
    resetLayout: noop,
    reorderActiveTab: noop,
    moveActiveToNewStack: noop,
    splitPanel: noop,
    togglePanelScroll: noop,
    toggleDropOnHeader: noop,
    registerDragSource: () => null,
  }), []);
}

export default function PanelPopupPage() {
  const { panelType } = useParams<{ panelType: string }>();
  const location = useLocation();
  const state = useMemo(() => parseState(location.search), [location.search]);
  const bridgeCtx = useBridgeContext();

  const type = panelType ?? "";
  const title = PANEL_TITLES[type as keyof typeof PANEL_TITLES] ?? type;

  function renderPanel() {
    switch (type) {
      case PANEL_TYPES.DASHBOARD:
        return <PanelSuspense><DashboardPage panelMode /></PanelSuspense>;
      case PANEL_TYPES.DOCS_LIST:
        return <PanelSuspense><DocsPage panelMode /></PanelSuspense>;
      case PANEL_TYPES.CANVAS_LIST:
        return <PanelSuspense><CanvasListPage panelMode /></PanelSuspense>;
      case PANEL_TYPES.CANVAS_EDITOR:
        return <PanelSuspense><CanvasEditorPage panelMode canvasIdProp={state.id as number | undefined} /></PanelSuspense>;
      case PANEL_TYPES.SETTINGS:
        return <PanelSuspense><SettingsPage panelMode initialSection={state.section as string | undefined} /></PanelSuspense>;
      case PANEL_TYPES.SEARCH:
        return <PanelSuspense><SearchOverlayPage panelMode /></PanelSuspense>;
      case PANEL_TYPES.TRANSLATE:
        return <PanelSuspense><TranslatePage panelMode /></PanelSuspense>;
      default:
        return <div className="panel-popup-unsupported">Panel type "{type}" cannot be opened in a new window.</div>;
    }
  }

  return (
    <GoldenLayoutContext.Provider value={bridgeCtx}>
      <div className="panel-popup-layout">
        <PanelPopupAppBar title={title} />
        <div className="panel-popup-content">
          {renderPanel()}
        </div>
      </div>
    </GoldenLayoutContext.Provider>
  );
}
