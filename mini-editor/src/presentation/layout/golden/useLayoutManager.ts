/**
 * useLayoutManager — reactive hook for reading and controlling the GoldenLayout instance.
 *
 * Subscribes to GL events (stateChanged, focus) so returned state stays
 * in sync without manual polling. Composes with useGoldenLayout() so it
 * works in any component inside the GoldenLayoutContext provider tree.
 *
 * Usage:
 *   const { panels, focusedPanel, stackCount, openPanel, closePanel, ... } = useLayoutManager();
 */

import { useState, useEffect, useCallback } from "react";
import type { ComponentItem, ContentItem, Stack, DragSource } from "golden-layout";
import { LayoutConfig } from "golden-layout";
import { useGoldenLayout } from "./GoldenLayoutContext";
import { walkComponents } from "./GoldenLayoutHost";
import { type PanelType, type PanelState } from "./panelRegistry";

// ── Snapshot types ────────────────────────────────────────────────────────────

export interface PanelInfo {
  /** Panel type key (e.g. "doc-editor") */
  type: PanelType;
  /** Display title shown on the tab */
  title: string;
  /** Arbitrary state passed when the panel was opened */
  state: PanelState;
  /** Whether this panel is currently keyboard-focused in GL */
  focused: boolean;
  /** Zero-based position of this tab inside its stack */
  tabIndex: number;
  /** Zero-based index of the parent stack in the layout tree (DFS order) */
  stackIndex: number;
}

export interface StackInfo {
  /** Zero-based index of this stack in DFS order */
  index: number;
  /** All panels living in this stack (ordered by tab position) */
  panels: PanelInfo[];
  /** The tab index of the currently active (visible) panel, or -1 */
  activePanelIndex: number;
}

export interface LayoutSnapshot {
  /** All open panels across the entire layout */
  panels: PanelInfo[];
  /** All stacks, each containing their panels */
  stacks: StackInfo[];
  /** The currently focused panel, or null */
  focusedPanel: PanelInfo | null;
  /** Total number of open panels */
  panelCount: number;
  /** Total number of stacks */
  stackCount: number;
  /** Whether the layout has been initialised (layout instance exists) */
  ready: boolean;
}

// ── Internal tree walkers / finders ──────────────────────────────────────────

function walkStacks(item: ContentItem, cb: (stack: Stack, idx: number) => void, counter = { n: 0 }) {
  if ((item as unknown as { isStack: boolean }).isStack) {
    cb(item as unknown as Stack, counter.n++);
    return;
  }
  item.contentItems.forEach((child) => walkStacks(child, cb, counter));
}

function findFocused(root: ContentItem): ComponentItem | null {
  let found: ComponentItem | null = null;
  walkComponents(root, (c) => { if (!found && c.focused) found = c; });
  return found;
}

function findByTypeAndId(root: ContentItem, type: string, state?: PanelState): ComponentItem | null {
  let found: ComponentItem | null = null;
  walkComponents(root, (c) => {
    if (found) return;
    const sameType = (c.componentType as string) === type;
    const cs = c.toConfig().componentState as Record<string, unknown> | undefined;
    const id = state?.id;
    const sameId = id == null || cs?.id === id;
    if (sameType && sameId) found = c;
  });
  return found;
}

function collectByType(root: ContentItem, type: string): ComponentItem[] {
  const results: ComponentItem[] = [];
  walkComponents(root, (c) => { if ((c.componentType as string) === type) results.push(c); });
  return results;
}

function buildSnapshot(layout: NonNullable<ReturnType<typeof useGoldenLayout>["layout"]>): LayoutSnapshot {
  if (!layout.rootItem) {
    return { panels: [], stacks: [], focusedPanel: null, panelCount: 0, stackCount: 0, ready: true };
  }

  const stacks: StackInfo[] = [];
  const allPanels: PanelInfo[] = [];

  walkStacks(layout.rootItem, (stack, stackIndex) => {
    const stackPanels: PanelInfo[] = [];

    // GL's contentItems on a stack are the ComponentItems (tabs)
    (stack.contentItems as unknown as ComponentItem[]).forEach((comp, tabIndex) => {
      const cfg = comp.toConfig();
      const info: PanelInfo = {
        type: cfg.componentType as PanelType,
        title: cfg.title ?? (cfg.componentType as string),
        state: (cfg.componentState ?? {}) as PanelState,
        focused: comp.focused,
        tabIndex,
        stackIndex,
      };
      stackPanels.push(info);
      allPanels.push(info);
    });

    const activeItem = stack.getActiveComponentItem();
    const activePanelIndex = activeItem
      ? (stack.contentItems as unknown as ComponentItem[]).indexOf(activeItem)
      : -1;

    stacks.push({ index: stackIndex, panels: stackPanels, activePanelIndex });
  });

  const focusedPanel = allPanels.find((p) => p.focused) ?? null;

  return {
    panels: allPanels,
    stacks,
    focusedPanel,
    panelCount: allPanels.length,
    stackCount: stacks.length,
    ready: true,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLayoutManager() {
  const ctx = useGoldenLayout();
  const { layout, openPanel, loadPreset, resetLayout,
          reorderActiveTab, moveActiveToNewStack, splitPanel,
          togglePanelScroll, toggleDropOnHeader, registerDragSource } = ctx;

  const [snapshot, setSnapshot] = useState<LayoutSnapshot>({
    panels: [],
    stacks: [],
    focusedPanel: null,
    panelCount: 0,
    stackCount: 0,
    ready: false,
  });

  // Rebuild snapshot whenever GL reports a change
  const refresh = useCallback(() => {
    if (!layout) return;
    setSnapshot(buildSnapshot(layout));
  }, [layout]);

  useEffect(() => {
    if (!layout) return;

    // Initial snapshot once layout is ready
    refresh();

    // GL events that signal state changes
    layout.on("stateChanged", refresh);
    layout.on("focus", refresh);
    layout.on("itemCreated", refresh);
    layout.on("itemDestroyed", refresh);

    return () => {
      layout.off("stateChanged", refresh);
      layout.off("focus", refresh);
      layout.off("itemCreated", refresh);
      layout.off("itemDestroyed", refresh);
    };
  }, [layout, refresh]);

  // ── Extra controls not in base context ──────────────────────────────────

  /** Close the focused panel, or the first panel matching type+id */
  const closePanel = useCallback((type?: PanelType, state?: PanelState) => {
    if (!layout?.rootItem) return;
    const target = type
      ? findByTypeAndId(layout.rootItem, type, state)
      : findFocused(layout.rootItem);
    if (target) target.close();
  }, [layout]);

  /** Focus the first panel matching type+id */
  const focusPanel = useCallback((type: PanelType, state?: PanelState) => {
    if (!layout?.rootItem) return;
    const target = findByTypeAndId(layout.rootItem, type, state);
    if (target) layout.focusComponent(target);
  }, [layout]);

  /** Close every open panel */
  const closeAllPanels = useCallback(() => {
    if (!layout?.rootItem) return;
    const all: ComponentItem[] = [];
    walkComponents(layout.rootItem, (c) => all.push(c));
    [...all].reverse().forEach((c) => c.close());
  }, [layout]);

  /** Close all panels of a given type */
  const closePanelsByType = useCallback((type: PanelType) => {
    if (!layout?.rootItem) return;
    collectByType(layout.rootItem, type).forEach((c) => c.close());
  }, [layout]);

  /** True if any open panel matches the given type (+optional id) */
  const isPanelOpen = useCallback((type: PanelType, state?: PanelState): boolean => {
    if (!layout?.rootItem) return false;
    return findByTypeAndId(layout.rootItem, type, state) !== null;
  }, [layout]);

  /** Rename the focused panel's tab title */
  const renameFocusedPanel = useCallback((title: string) => {
    if (!layout?.rootItem) return;
    const focused = findFocused(layout.rootItem);
    if (focused) focused.setTitle(title);
  }, [layout]);

  /** Serialise the current layout to JSON (same format stored in localStorage) */
  const exportLayout = useCallback((): string | null => {
    if (!layout) return null;
    try { return JSON.stringify(layout.saveLayout()); } catch { return null; }
  }, [layout]);

  /** Import a previously exported layout JSON string */
  const importLayout = useCallback((json: string) => {
    if (!layout) return;
    try {
      layout.loadLayout(LayoutConfig.fromResolved(JSON.parse(json)));
    } catch { /* invalid json */ }
  }, [layout]);

  return {
    // ── Live snapshot ──────────────────────────────────────────────────────
    ...snapshot,

    // ── Raw GL instance (escape hatch) ─────────────────────────────────────
    layout,

    // ── Panel actions ──────────────────────────────────────────────────────
    openPanel,
    closePanel,
    focusPanel,
    closeAllPanels,
    closePanelsByType,
    isPanelOpen,
    renameFocusedPanel,

    // ── Layout structure ───────────────────────────────────────────────────
    loadPreset,
    resetLayout,
    splitPanel,
    moveActiveToNewStack,

    // ── Tab order ──────────────────────────────────────────────────────────
    reorderActiveTab,

    // ── Visual toggles ─────────────────────────────────────────────────────
    togglePanelScroll,
    toggleDropOnHeader,

    // ── Drag sources ───────────────────────────────────────────────────────
    registerDragSource,

    // ── Serialisation ──────────────────────────────────────────────────────
    exportLayout,
    importLayout,
  } satisfies LayoutSnapshot & {
    layout: typeof layout;
    openPanel: typeof openPanel;
    closePanel: (type?: PanelType, state?: PanelState) => void;
    focusPanel: (type: PanelType, state?: PanelState) => void;
    closeAllPanels: () => void;
    closePanelsByType: (type: PanelType) => void;
    isPanelOpen: (type: PanelType, state?: PanelState) => boolean;
    renameFocusedPanel: (title: string) => void;
    loadPreset: typeof loadPreset;
    resetLayout: typeof resetLayout;
    splitPanel: typeof splitPanel;
    moveActiveToNewStack: typeof moveActiveToNewStack;
    reorderActiveTab: typeof reorderActiveTab;
    togglePanelScroll: typeof togglePanelScroll;
    toggleDropOnHeader: typeof toggleDropOnHeader;
    registerDragSource: (el: HTMLElement, type: PanelType, state?: PanelState, title?: string) => DragSource | null;
    exportLayout: () => string | null;
    importLayout: (json: string) => void;
  };
}
