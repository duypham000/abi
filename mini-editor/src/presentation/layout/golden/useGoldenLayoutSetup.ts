import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactPortal,
} from "react";
import { createPortal } from "react-dom";
import { GoldenLayout, LayoutConfig, ResolvedLayoutConfig, Header } from "golden-layout";
import type { ComponentContainer, ResolvedComponentItemConfig, Stack } from "golden-layout";
import { setupTabExtension, setupHeaderExtension } from "./useGLExtensions";

// Monkey-patch Golden Layout's Header to disable tab auto-hiding
// by passing infinite available width to updateTabSizes.
if (typeof window !== "undefined" && Header) {
  (Header.prototype as any).updateTabSizes = function (this: any) {
    if (this._tabsContainer.tabCount > 0) {
      const headerHeight = this._show ? this._layoutManager.layoutConfig.dimensions.headerHeight : 0;
      if (this._leftRightSided) {
        this._element.style.height = '';
        this._element.style.width = `${headerHeight}px`;
      } else {
        this._element.style.width = '';
        this._element.style.height = `${headerHeight}px`;
      }
      this._tabsContainer.updateTabSizes(999999, this._getActiveComponentItemEvent());
    }
  };
}

interface PortalEntry {
  el: HTMLElement;
  componentType: string;
  componentState: Record<string, unknown>;
  key: string;
}

export type ComponentRenderer = (state: Record<string, unknown>) => React.ReactElement | null;
export type ComponentMap = Partial<Record<string, ComponentRenderer>>;

const STORAGE_KEY = "tomo-gl-layout";
let _portalCounter = 0;

// Panel types that require a close-confirmation dialog
const CONDITIONAL_CLOSE_TYPES = new Set<string>([]);

export function useGoldenLayoutSetup(
  hostRef: RefObject<HTMLDivElement | null>,
  componentMap: ComponentMap,
  initialConfig: LayoutConfig,
  scrollToggle?: (stack: Stack) => void,
  dropToggle?: (stack: Stack) => void,
): { layout: GoldenLayout | null; portals: ReactPortal[] } {
  const [layout, setLayout] = useState<GoldenLayout | null>(null);
  const [portals, setPortals] = useState<Map<ComponentContainer, PortalEntry>>(new Map());
  const initialized = useRef(false);

  // Store callbacks in refs so they don't trigger re-initialization
  const scrollToggleRef = useRef(scrollToggle);
  const dropToggleRef = useRef(dropToggle);
  scrollToggleRef.current = scrollToggle;
  dropToggleRef.current = dropToggle;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || initialized.current) return;
    initialized.current = true;

    const gl = new GoldenLayout(host);

    gl.bindComponentEvent = (
      container: ComponentContainer,
      itemConfig: ResolvedComponentItemConfig
    ) => {
      const el = container.element;

      // Make .lm_content a flex column so children with flex:1 fill panel height
      el.style.display = "flex";
      el.style.flexDirection = "column";

      // Show / hide inactive tab content
      container.virtualVisibilityChangeRequiredEvent = (_c, visible) => {
        el.style.display = visible ? "flex" : "none";
      };

      // z-index for floating / maximised panels
      container.virtualZIndexChangeRequiredEvent = (_c, _logicalZIndex, defaultZIndex) => {
        el.style.zIndex = defaultZIndex;
      };

      const componentType = itemConfig.componentType as string;
      const componentState = (itemConfig.componentState ?? {}) as Record<string, unknown>;
      const key = `portal-${_portalCounter++}`;

      setPortals((prev) => {
        const next = new Map(prev);
        next.set(container, { el, componentType, componentState, key });
        return next;
      });

      // ── Extending Tabs + Configured CSS Classes + Custom Tooltips
      //    + Conditional Closing — runs after GL finishes creating the Tab
      requestAnimationFrame(() => {
        try {
          setupTabExtension(
            container as unknown as Parameters<typeof setupTabExtension>[0],
            componentType,
            CONDITIONAL_CLOSE_TYPES,
          );
        } catch { /* tab may not exist yet (drag proxy) */ }

        // ── Extending Header: add custom action buttons to the stack header
        try {
          const stack = (container.parent as unknown as { parentItem: Stack }).parentItem;
          if (stack?.header) {
            setupHeaderExtension(
              stack,
              (s) => scrollToggleRef.current?.(s),
              (s) => dropToggleRef.current?.(s),
            );
          }
        } catch { /* not in a stack yet */ }
      });

      return { component: undefined, virtual: true };
    };

    gl.unbindComponentEvent = (container: ComponentContainer) => {
      setPortals((prev) => {
        const next = new Map(prev);
        next.delete(container);
        return next;
      });
    };

    // Debounced save
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const saveLayout = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(gl.saveLayout()));
        } catch { /* storage full */ }
      }, 600);
    };
    gl.on("stateChanged", saveLayout);

    // Resize: call gl.updateSize() whenever the host element changes size
    const ro = new ResizeObserver(() => {
      try { gl.updateSize(host.clientWidth, host.clientHeight); } catch { /* layout may be mid-teardown */ }
    });
    ro.observe(host);

    // Restore or load initial
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    let loaded = false;
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw) as ResolvedLayoutConfig;
        if (saved.header) {
          (saved.header as { tabDropdown: boolean | string }).tabDropdown = false;
        }
        gl.loadLayout(LayoutConfig.fromResolved(saved));
        loaded = true;
      } catch { /* corrupt saved state */ }
    }
    if (!loaded) gl.loadLayout(initialConfig);

    // GL measures the host in pixels via JS. Defer one frame so the browser
    // has finished computing the final flex heights (status bar, panel, etc.)
    // before GL records the layout dimensions — otherwise panels bleed over
    // sibling elements like the status bar.
    requestAnimationFrame(() => {
      try { gl.updateSize(host.clientWidth, host.clientHeight); } catch { /* may already be destroyed on HMR */ }
    });

    setLayout(gl);

    return () => {
      initialized.current = false;
      ro.disconnect();
      if (saveTimer) clearTimeout(saveTimer);
      gl.destroy();
      setLayout(null);
      setPortals(new Map());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const portalElements: ReactPortal[] = [];
  portals.forEach((entry) => {
    const Renderer = componentMap[entry.componentType];
    if (!Renderer) return;
    portalElements.push(
      createPortal(Renderer(entry.componentState), entry.el, entry.key) as ReactPortal
    );
  });

  return { layout, portals: portalElements };
}
