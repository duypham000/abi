import { create } from "zustand";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

interface CanvasUiState {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  insertMenuOpen: boolean;
  pendingDropPoint: { x: number; y: number } | null;

  setExcalidrawAPI: (api: ExcalidrawImperativeAPI | null) => void;
  setInsertMenuOpen: (open: boolean) => void;
  setPendingDropPoint: (point: { x: number; y: number } | null) => void;
}

export const useCanvasUiStore = create<CanvasUiState>((set) => ({
  excalidrawAPI: null,
  insertMenuOpen: false,
  pendingDropPoint: null,

  setExcalidrawAPI: (api) => set({ excalidrawAPI: api }),
  setInsertMenuOpen: (open) => set({ insertMenuOpen: open }),
  setPendingDropPoint: (point) => set({ pendingDropPoint: point }),
}));
