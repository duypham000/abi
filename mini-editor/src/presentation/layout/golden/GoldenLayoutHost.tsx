/**
 * GoldenLayoutHost — exports panel registry utilities used by WorkspaceShell.
 *
 * WorkspaceShell owns the GoldenLayoutContext.Provider so that ActivityBar
 * (a sibling of the GL host div) is inside the provider tree.
 */
import { useCallback, lazy, Suspense, type RefObject, type ReactPortal } from "react";
import type { ComponentItemConfig, ContentItem, ComponentItem } from "golden-layout";
import { LayoutManager } from "golden-layout";
import type { GoldenLayout } from "golden-layout";
import type { OpenPanelOptions } from "./GoldenLayoutContext";
import type { ComponentMap } from "./useGoldenLayoutSetup";
import { PANEL_TITLES, PANEL_TYPES, type PanelState, type PanelType } from "./panelRegistry";

// ── Lazy-loaded panel pages ───────────────────────────────────────────────
const DashboardPage    = lazy(() => import("@/presentation/features/dashboard/pages/DashboardPage"));
const DocsPage         = lazy(() => import("@/presentation/features/docs/pages/DocsPage"));
const DocEditorPage    = lazy(() => import("@/presentation/features/docs/pages/DocEditorPage"));
const CanvasListPage   = lazy(() => import("@/presentation/features/canvas/pages/CanvasListPage"));
const CanvasEditorPage  = lazy(() => import("@/presentation/features/canvas/pages/CanvasEditorPage"));
const SettingsPage     = lazy(() => import("@/presentation/features/settings/pages/SettingsPage/SettingsPage"));
const SearchOverlayPage = lazy(() => import("@/presentation/features/search/pages/SearchOverlayPage"));
const TranslatePage     = lazy(() => import("@/presentation/features/translate/pages/TranslatePage"));
const SeriesDetailPanel = lazy(() =>
  import("@/presentation/features/series/pages/SeriesDetailPanel").then((m) => ({ default: m.SeriesDetailPanel }))
);

function PanelSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="gl-panel-loading">Loading…</div>}>
      {children}
    </Suspense>
  );
}

// ── Component map: panel type → renderer ─────────────────────────────────
export const componentMap: ComponentMap = {
  [PANEL_TYPES.DASHBOARD]:     ()      => <PanelSuspense><DashboardPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.DOCS_LIST]:     ()      => <PanelSuspense><DocsPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.DOC_EDITOR]:    (state) => <PanelSuspense><DocEditorPage panelMode docIdProp={state.id as number | undefined} /></PanelSuspense>,
  [PANEL_TYPES.CANVAS_LIST]:   ()      => <PanelSuspense><CanvasListPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.CANVAS_EDITOR]: (state) => <PanelSuspense><CanvasEditorPage panelMode canvasIdProp={state.id as number | undefined} /></PanelSuspense>,
  [PANEL_TYPES.SETTINGS]:      (state) => <PanelSuspense><SettingsPage panelMode initialSection={state.section as string | undefined} /></PanelSuspense>,
  [PANEL_TYPES.SEARCH]:        ()      => <PanelSuspense><SearchOverlayPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.TRANSLATE]:     ()      => <PanelSuspense><TranslatePage panelMode /></PanelSuspense>,
  [PANEL_TYPES.SERIES_DETAIL]: (state) => <PanelSuspense><SeriesDetailPanel panelMode seriesIdProp={state.id as number | undefined} /></PanelSuspense>,
};

// ── Walk GL content tree to find ComponentItems ───────────────────────────
export function walkComponents(item: ContentItem, cb: (comp: ComponentItem) => void) {
  if (item.isComponent) {
    cb(item as ComponentItem);
    return;
  }
  item.contentItems.forEach((child) => walkComponents(child, cb));
}

// ── Hook: creates the openPanel callback bound to the GL instance ─────────
export function useOpenPanel(layout: GoldenLayout | null) {
  return useCallback(
    (type: PanelType, state: PanelState = {}, options: OpenPanelOptions = {}) => {
      if (!layout) return;
      const title = options.title ?? PANEL_TITLES[type];

      if (options.singleton !== false && layout.rootItem) {
        const existingId = state.id;
                let found: ComponentItem | null = null;
        walkComponents(layout.rootItem, (comp) => {
          if (found) return;
          const sameType = (comp.componentType as string) === type;
          const cs = comp.toConfig().componentState as Record<string, unknown> | undefined;
          let sameId = false;
          sameId = existingId == null || cs?.id === existingId;
          if (sameType && sameId) found = comp;
        });
        if (found) { layout.focusComponent(found); return; }
      }

      const itemConfig: ComponentItemConfig = {
        type: "component",
        componentType: type,
        componentState: state as Record<string, unknown>,
        title,
      };

      const selectors: LayoutManager.LocationSelector[] = [
        { typeId: 1 as LayoutManager.LocationSelector.TypeId },
        { typeId: 2 as LayoutManager.LocationSelector.TypeId },
        { typeId: 6 as LayoutManager.LocationSelector.TypeId },
        { typeId: 7 as LayoutManager.LocationSelector.TypeId },
      ];

      try {
        layout.addItemAtLocation(itemConfig, selectors);
      } catch {
        layout.addComponent(type, state as Record<string, unknown>, title);
      }
    },
    [layout]
  );
}

export function GoldenLayoutHostDiv({ hostRef, portals }: { hostRef: RefObject<HTMLDivElement | null>; portals: ReactPortal[] }) {
  return (
    <>
      <div
        ref={hostRef}
        className="gl-host"
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
      />
      {portals}
    </>
  );
}
