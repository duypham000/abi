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
const DashboardPage   = lazy(() => import("@/presentation/features/dashboard/pages/DashboardPage"));
const DocsPage        = lazy(() => import("@/presentation/features/docs/pages/DocsPage"));
const DocEditorPage   = lazy(() => import("@/presentation/features/docs/pages/DocEditorPage"));
const CanvasListPage  = lazy(() => import("@/presentation/features/canvas/pages/CanvasListPage"));
const CanvasEditorPage = lazy(() => import("@/presentation/features/canvas/pages/CanvasEditorPage"));
const PortsPage       = lazy(() => import("@/presentation/features/ports/pages/PortsPage"));
const SecretsPage     = lazy(() => import("@/presentation/features/secrets/pages/SecretsPage/SecretsPage"));
const ChatPage        = lazy(() => import("@/presentation/features/chat/pages/ChatPage/ChatPage"));
const ScriptsPage     = lazy(() => import("@/presentation/features/scripts/pages/ScriptsPage/ScriptsPage"));
const ApiModulePage   = lazy(() =>
  import("@/presentation/features/api/pages/ApiModulePage").then((m) => ({ default: m.ApiModulePage }))
);
const SettingsPage    = lazy(() => import("@/presentation/features/settings/pages/SettingsPage/SettingsPage"));
const SearchOverlayPage = lazy(() => import("@/presentation/features/search/pages/SearchOverlayPage"));
const TranslatePage    = lazy(() => import("@/presentation/features/translate/pages/TranslatePage"));
const UsersPage        = lazy(() => import("@/presentation/features/users/pages/UsersPage/UsersPage"));
const PowerShellRunnerPage = lazy(() => import("@/presentation/features/powershell/pages/PowerShellRunnerPage"));
const SeriesDetailPanel = lazy(() =>
  import("@/presentation/features/series/pages/SeriesDetailPanel").then((m) => ({ default: m.SeriesDetailPanel }))
);
const BatchRenamePage = lazy(() => import("@/presentation/features/batch-rename/pages/BatchRenamePage"));

function PanelSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="gl-panel-loading">Loading…</div>}>
      {children}
    </Suspense>
  );
}

// ── Component map: panel type → renderer ─────────────────────────────────
export const componentMap: ComponentMap = {
  [PANEL_TYPES.DASHBOARD]:    ()      => <PanelSuspense><DashboardPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.DOCS_LIST]:    ()      => <PanelSuspense><DocsPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.DOC_EDITOR]:   (state) => <PanelSuspense><DocEditorPage panelMode docIdProp={state.id as number | undefined} /></PanelSuspense>,
  [PANEL_TYPES.DOC_DRAFT]:    (state) => <PanelSuspense><DocEditorPage panelMode localIdProp={state.localId as string | undefined} /></PanelSuspense>,
  [PANEL_TYPES.CANVAS_LIST]:  ()      => <PanelSuspense><CanvasListPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.CANVAS_EDITOR]:(state) => <PanelSuspense><CanvasEditorPage panelMode canvasIdProp={state.id as number | undefined} /></PanelSuspense>,
  [PANEL_TYPES.PORTS]:        ()      => <PanelSuspense><PortsPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.SECRETS]:      ()      => <PanelSuspense><SecretsPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.CHAT]:         ()      => <PanelSuspense><ChatPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.SCRIPTS]:      ()      => <PanelSuspense><ScriptsPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.API]:          (state) => <PanelSuspense><ApiModulePage panelMode initialTab={state.tab as string | undefined} /></PanelSuspense>,
  [PANEL_TYPES.SETTINGS]:     (state) => <PanelSuspense><SettingsPage panelMode initialSection={state.section as string | undefined} /></PanelSuspense>,
  [PANEL_TYPES.SEARCH]:       ()      => <PanelSuspense><SearchOverlayPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.TRANSLATE]:    ()      => <PanelSuspense><TranslatePage panelMode /></PanelSuspense>,
  [PANEL_TYPES.USERS]:        ()      => <PanelSuspense><UsersPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.POWERSHELL_RUNNER]: () => <PanelSuspense><PowerShellRunnerPage panelMode /></PanelSuspense>,
  [PANEL_TYPES.SERIES_DETAIL]:     (state) => <PanelSuspense><SeriesDetailPanel panelMode seriesIdProp={state.id as number | undefined} /></PanelSuspense>,
  [PANEL_TYPES.BATCH_RENAME]:      ()      => <PanelSuspense><BatchRenamePage /></PanelSuspense>,
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

      // Singleton: focus existing panel of same type+id instead of opening duplicate
      if (options.singleton !== false && layout.rootItem) {
        const existingId = state.id;
        const existingLocalId = state.localId;
        let found: ComponentItem | null = null;
        walkComponents(layout.rootItem, (comp) => {
          if (found) return;
          const sameType = (comp.componentType as string) === type;
          const cs = comp.toConfig().componentState as Record<string, unknown> | undefined;
          let sameId = false;
          if (type === PANEL_TYPES.DOC_DRAFT) {
            sameId = existingLocalId == null || cs?.localId === existingLocalId;
          } else {
            sameId = existingId == null || cs?.id === existingId;
          }
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

      // TypeId values: FocusedStack=1, FirstStack=2, Empty=6, Root=7
      // (const enum cannot be used at runtime with isolatedModules)
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

// ── GoldenLayoutHostDiv — the bare host element + portals ─────────────────
interface GoldenLayoutHostDivProps {
  hostRef: RefObject<HTMLDivElement | null>;
  portals: ReactPortal[];
}

export function GoldenLayoutHostDiv({ hostRef, portals }: GoldenLayoutHostDivProps) {
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
