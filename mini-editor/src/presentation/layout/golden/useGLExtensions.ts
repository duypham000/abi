/**
 * useGLExtensions — implements all "Custom Functionality" and "Adding Items"
 * features from the GoldenLayout examples page.
 *
 * Returned functions are injected into GoldenLayoutContext so every child
 * (LayoutToolbar, ActivityBar, etc.) can call them without prop-drilling.
 */
import { useCallback, useRef } from "react";
import type {
  GoldenLayout,
  ComponentItem,
  ContentItem,
  Stack,
  ComponentItemConfig,
  LayoutConfig,
  DragSource,
  RowOrColumn,
} from "golden-layout";
import { LayoutManager } from "golden-layout";
import { walkComponents } from "./GoldenLayoutHost";
import { PANEL_TITLES, PANEL_TYPES, type PanelType, type PanelState } from "./panelRegistry";
import { defaultLayoutConfig } from "./defaultLayout";

const STORAGE_KEY = "tomo-gl-layout";

// ── Helpers ───────────────────────────────────────────────────────────────

function getFocused(layout: GoldenLayout): ComponentItem | null {
  if (!layout.rootItem) return null;
  let found: ComponentItem | null = null;
  walkComponents(layout.rootItem, (comp) => {
    if (!found && comp.focused) found = comp;
  });
  return found;
}

function getStack(comp: ComponentItem): Stack {
  return comp.parentItem as unknown as Stack;
}

// TypeId values (const enum can't be used at runtime with isolatedModules)
const TypeId = {
  FocusedStack: 1 as LayoutManager.LocationSelector.TypeId,
  FirstStack:   2 as LayoutManager.LocationSelector.TypeId,
  Empty:        6 as LayoutManager.LocationSelector.TypeId,
  Root:         7 as LayoutManager.LocationSelector.TypeId,
};

// ── Panel type → short badge text (2 letters, shown in coloured icon square) ─

export const PANEL_ABBR: Partial<Record<PanelType, string>> = {
  [PANEL_TYPES.DASHBOARD]:    "DB",
  [PANEL_TYPES.DOCS_LIST]:    "DL",
  [PANEL_TYPES.DOC_EDITOR]:   "DE",
  [PANEL_TYPES.CANVAS_LIST]:  "CL",
  [PANEL_TYPES.CANVAS_EDITOR]:"CE",
  [PANEL_TYPES.SETTINGS]:     "ST",
  [PANEL_TYPES.SEARCH]:       "SR",
};

// ── Panel type → emoji icon (kept for tooltip text fallback) ─────────────

const PANEL_ICONS: Partial<Record<PanelType, string>> = {
  [PANEL_TYPES.DASHBOARD]:    "⬡",
  [PANEL_TYPES.DOCS_LIST]:    "📄",
  [PANEL_TYPES.DOC_EDITOR]:   "✏️",
  [PANEL_TYPES.CANVAS_LIST]:  "🎨",
  [PANEL_TYPES.CANVAS_EDITOR]:"🖌️",
  [PANEL_TYPES.SETTINGS]:     "⚙️",
  [PANEL_TYPES.SEARCH]:       "🔍",
};

// ── Tab / header DOM extensions ────────────────────────────────────────────

/** Called from bindComponentEvent via requestAnimationFrame — GL has fully
 *  set up the Tab by the time this runs. */
export function setupTabExtension(
  container: {
    tab: { element: HTMLElement; titleElement: HTMLElement; closeElement?: HTMLElement };
    element: HTMLElement;
    parent: ComponentItem;
    close: () => void;
  },
  componentType: string,
  conditionalCloseTypes: Set<string>
) {
  const tab = container.tab;
  if (!tab) return;

  // ── Configured CSS class on the content element ───────────────────────
  container.element.classList.add(`gl-panel--${componentType}`);

  // ── data-panel-type on the tab element for CSS badge colour selectors ─
  tab.element.dataset.panelType = componentType;

  // ── Extending Tabs: inject panel-type icon badge before the title ─────
  const icon = PANEL_ICONS[componentType as PanelType];
  if (!tab.titleElement.querySelector(".gl-tab-icon")) {
    const iconSpan = document.createElement("span");
    iconSpan.className = "gl-tab-icon";
    iconSpan.textContent = icon ?? "📄";
    tab.titleElement.prepend(iconSpan);
  }

  // ── Custom Tooltips: replace browser title attr with CSS tooltip ──────
  tab.element.removeAttribute("title");
  if (!tab.element.querySelector(".gl-tooltip")) {
    const tooltip = document.createElement("div");
    tooltip.className = "gl-tooltip";
    tooltip.textContent = tab.titleElement.textContent?.replace(icon ?? "", "").trim() ?? "";
    tab.element.appendChild(tooltip);
  }

  // ── Shared close logic (used by button click + middle-click) ────────────
  const confirmAndClose = () => {
    if (conditionalCloseTypes.has(componentType)) {
      if (window.confirm(`Close "${tab.titleElement.textContent?.trim()}"? Unsaved changes will be lost.`)) {
        container.close();
      }
    } else {
      container.close();
    }
  };

  // ── Conditional Closing: intercept the GL close button ───────────────
  if (tab.closeElement) {
    if (conditionalCloseTypes.has(componentType)) {
      tab.closeElement.addEventListener(
        "click",
        (e) => { e.stopImmediatePropagation(); confirmAndClose(); },
        { capture: true }
      );
    }
  }

  // ── Middle-click closes the tab ───────────────────────────────────────
  // mousedown preventDefault suppresses the browser autoscroll cursor.
  // auxclick fires on mouseup for button 1 and is the reliable close trigger.
  tab.element.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 1) { e.preventDefault(); e.stopPropagation(); }
  });
  tab.element.addEventListener("auxclick", (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      confirmAndClose();
    }
  });

  // ── Right-click context menu ───────────────────────────────────────────
  tab.element.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const componentItem = container.parent;
    const stack = (componentItem as unknown as { parentItem: Stack }).parentItem;
    const state = (componentItem.toConfig().componentState ?? {}) as Record<string, unknown>;
    window.dispatchEvent(new CustomEvent("gl-tab-contextmenu", {
      detail: { x: e.clientX, y: e.clientY, componentType, componentState: state, componentItem, stack },
    }));
  });
}

/** Adds custom action buttons to the stack header's controls area.
 *  Only adds once per stack (checks for existing gl-header-btn). */
export function setupHeaderExtension(
  stack: Stack,
  _onScrollToggle: (stack: Stack) => void,
  _onDropToggle: (stack: Stack) => void
) {
  const controls = (stack.header as unknown as { controlsContainerElement: HTMLElement })
    .controlsContainerElement;
  if (!controls || controls.querySelector(".gl-header-btn")) return;

  // ── Mouse wheel horizontal scroll listener ────────────────────────────
  const tabsContainer = (stack.header as any).tabsContainerElement;
  if (tabsContainer && !(tabsContainer as any)._hasWheelListener) {
    (tabsContainer as any)._hasWheelListener = true;
    tabsContainer.addEventListener("wheel", (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabsContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

}

// ── Main hook ──────────────────────────────────────────────────────────────

export function useGLExtensions(layout: GoldenLayout | null) {
  // Stacks that have drop disabled
  const disabledDropStacks = useRef<Set<Stack>>(new Set());
  // Stacks that have scroll enabled
  const scrolledStacks = useRef<Set<Stack>>(new Set());

  // ── Load preset layout ───────────────────────────────────────────────
  const loadPreset = useCallback((config: LayoutConfig) => {
    if (!layout) return;
    try { layout.loadLayout(config); } catch { /* invalid config */ }
  }, [layout]);

  // ── Reset to default + clear localStorage ────────────────────────────
  const resetLayout = useCallback(() => {
    if (!layout) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      layout.loadLayout(defaultLayoutConfig);
    } catch { /* ignore */ }
  }, [layout]);

  // ── Programmatic Reorder: move active tab left / right in its stack ──
  const reorderActiveTab = useCallback((direction: "left" | "right") => {
    if (!layout) return;
    const comp = getFocused(layout);
    if (!comp) return;
    const stack = getStack(comp);
    const items = stack.contentItems as unknown as ContentItem[];
    const idx = items.indexOf(comp as unknown as ContentItem);
    const newIdx = direction === "left" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    // Remove keepChild=true, then re-insert at new position
    stack.removeChild(comp as unknown as ContentItem, true);
    stack.addChild(comp as unknown as ContentItem, newIdx);
  }, [layout]);

  // ── Programmatic Reorder 2: move active panel to a new standalone stack
  const moveActiveToNewStack = useCallback(() => {
    if (!layout) return;
    const comp = getFocused(layout);
    if (!comp) return;
    const cfg = comp.toConfig();
    const itemConfig: ComponentItemConfig = {
      type: "component",
      componentType: cfg.componentType as string,
      componentState: cfg.componentState as Record<string, unknown>,
      title: cfg.title,
    };
    comp.close();
    try {
      layout.addItemAtLocation(itemConfig, [
        { typeId: TypeId.Empty },
        { typeId: TypeId.Root },
      ]);
    } catch {
      layout.addComponent(itemConfig.componentType, itemConfig.componentState, itemConfig.title);
    }
  }, [layout]);

  // ── Row / Column: add a sibling panel beside the focused stack ────────
  const splitPanel = useCallback((_direction: "row" | "column") => {
    if (!layout) return;
    const dashConfig: ComponentItemConfig = {
      type: "component",
      componentType: PANEL_TYPES.DASHBOARD,
      componentState: {},
      title: PANEL_TITLES[PANEL_TYPES.DASHBOARD],
    };
    const comp = getFocused(layout);
    if (comp) {
      // Try to insert next to the focused stack
      const stack = getStack(comp);
      const parent = stack.parent as unknown as RowOrColumn;
      if (parent && typeof (parent as unknown as RowOrColumn & { addItem?: unknown }).addItem === "function") {
        const parentItems = parent.contentItems as unknown as ContentItem[];
        const stackIdx = parentItems.indexOf(stack as unknown as ContentItem);
        try {
          (parent as unknown as RowOrColumn & { addItem: (c: ComponentItemConfig, i: number) => void })
            .addItem(dashConfig, stackIdx + 1);
          return;
        } catch { /* fall through */ }
      }
    }
    // Fallback: use location selectors
    try {
      layout.addItemAtLocation(dashConfig, [
        { typeId: TypeId.FocusedStack },
        { typeId: TypeId.FirstStack },
        { typeId: TypeId.Root },
      ]);
    } catch {
      layout.addComponent(dashConfig.componentType, dashConfig.componentState, dashConfig.title);
    }
  }, [layout]);

  // ── Panel Scrolling: toggle overflow on focused panel content ─────────
  const togglePanelScroll = useCallback(() => {
    if (!layout) return;
    const comp = getFocused(layout);
    if (!comp) return;
    const el = comp.container.element;
    const isScrolled = el.style.overflowY === "auto";
    el.style.overflowY = isScrolled ? "hidden" : "auto";
    const stack = getStack(comp);
    const btn = (stack.header as unknown as { controlsContainerElement: HTMLElement })
      .controlsContainerElement?.querySelector(".gl-header-btn--scroll");
    btn?.classList.toggle("is-active", !isScrolled);
    if (!isScrolled) scrolledStacks.current.add(stack);
    else scrolledStacks.current.delete(stack);
  }, [layout]);

  // ── Scroll toggle called from header button (stack-level) ─────────────
  const handleScrollToggle = useCallback((stack: Stack) => {
    const active = stack.getActiveComponentItem();
    if (!active) return;
    const el = active.container.element;
    const isScrolled = el.style.overflowY === "auto";
    el.style.overflowY = isScrolled ? "hidden" : "auto";
    const btn = (stack.header as unknown as { controlsContainerElement: HTMLElement })
      .controlsContainerElement?.querySelector(".gl-header-btn--scroll");
    btn?.classList.toggle("is-active", !isScrolled);
  }, []);

  // ── Disable Drop on Header: toggle drag-reorder on active stack ───────
  const toggleDropOnHeader = useCallback(() => {
    if (!layout) return;
    const comp = getFocused(layout);
    if (!comp) return;
    const stack = getStack(comp);
    _toggleDrop(stack);
  }, [layout]);

  // ── Drop toggle called from header button (stack-level) ───────────────
  const handleDropToggle = useCallback((stack: Stack) => {
    _toggleDrop(stack);
  }, []);

  function _toggleDrop(stack: Stack) {
    const disabled = disabledDropStacks.current.has(stack);
    if (disabled) {
      disabledDropStacks.current.delete(stack);
      (stack.header as unknown as { element: HTMLElement }).element.classList.remove("gl-no-drop");
      stack.header.tabs.forEach((tab) => { tab.reorderEnabled = true; });
    } else {
      disabledDropStacks.current.add(stack);
      (stack.header as unknown as { element: HTMLElement }).element.classList.add("gl-no-drop");
      stack.header.tabs.forEach((tab) => { tab.reorderEnabled = false; });
    }
    const btn = (stack.header as unknown as { controlsContainerElement: HTMLElement })
      .controlsContainerElement?.querySelector(".gl-header-btn--drop");
    btn?.classList.toggle("is-active", disabledDropStacks.current.has(stack));
  }

  // ── By Drag: register a DOM element as GL drag source ────────────────
  const registerDragSource = useCallback((
    el: HTMLElement,
    type: PanelType,
    state: PanelState = {},
    title?: string
  ): DragSource | null => {
    if (!layout) return null;
    try {
      return layout.newDragSource(el, () => ({
        type: "component",
        componentType: type,
        componentState: state as Record<string, unknown>,
        title: title ?? PANEL_TITLES[type],
      }));
    } catch {
      return null;
    }
  }, [layout]);

  return {
    loadPreset,
    resetLayout,
    reorderActiveTab,
    moveActiveToNewStack,
    splitPanel,
    togglePanelScroll,
    toggleDropOnHeader,
    registerDragSource,
    // Internal callbacks for header buttons
    _handleScrollToggle: handleScrollToggle,
    _handleDropToggle: handleDropToggle,
  };
}
