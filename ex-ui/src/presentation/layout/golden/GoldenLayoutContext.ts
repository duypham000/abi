import { createContext, useContext } from "react";
import type { GoldenLayout, DragSource, LayoutConfig } from "golden-layout";
import type { PanelState, PanelType } from "./panelRegistry";

export interface OpenPanelOptions {
  title?: string;
  /** Focus existing panel of same type+id instead of opening a duplicate */
  singleton?: boolean;
}

export interface GoldenLayoutContextValue {
  layout: GoldenLayout | null;
  /** Open (or focus) a panel by type */
  openPanel: (type: PanelType, state?: PanelState, options?: OpenPanelOptions) => void;
  /** Load a preset layout configuration */
  loadPreset: (config: LayoutConfig) => void;
  /** Restore the default layout and clear saved state */
  resetLayout: () => void;
  /** Move the focused tab left or right within its stack */
  reorderActiveTab: (direction: "left" | "right") => void;
  /** Move the focused panel into a brand-new stack */
  moveActiveToNewStack: () => void;
  /** Add a new Dashboard panel beside the focused one */
  splitPanel: (direction: "row" | "column") => void;
  /** Toggle overflow:auto on the focused panel's content element */
  togglePanelScroll: () => void;
  /** Toggle drag-drop acceptance on the focused stack's header */
  toggleDropOnHeader: () => void;
  /** Register a DOM element as a GL drag source */
  registerDragSource: (
    el: HTMLElement,
    type: PanelType,
    state?: PanelState,
    title?: string
  ) => DragSource | null;
}

const noop = () => {};

export const GoldenLayoutContext = createContext<GoldenLayoutContextValue>({
  layout: null,
  openPanel: noop,
  loadPreset: noop,
  resetLayout: noop,
  reorderActiveTab: noop,
  moveActiveToNewStack: noop,
  splitPanel: noop,
  togglePanelScroll: noop,
  toggleDropOnHeader: noop,
  registerDragSource: () => null,
});

export function useGoldenLayout() {
  return useContext(GoldenLayoutContext);
}
