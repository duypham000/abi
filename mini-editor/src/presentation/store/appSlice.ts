import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type SidebarKey = "features" | "docs" | "series" | "demo" | "git";

/**
 * Connectivity state machine:
 *   online          – server reachable, normal operation
 *   connection-lost – first FETCH_ERROR / 5xx detected; prompt user
 *   offline         – user confirmed offline mode; reads from cache, mutations to outbox
 *   reconnecting    – health-check detected server is back; sync engine running
 */
export type Connectivity = "online" | "connection-lost" | "offline" | "reconnecting";

export interface PreloadProgressState {
  active: boolean;
  total: number;
  completed: number;
  currentLabel: string;
  lastCompletedAt: number | null;
}

interface AppState {
  theme: "light";
  sidebarOpen: boolean;
  activeSidebar: SidebarKey | null;
  lastActiveSidebar: SidebarKey;
  panelOpen: boolean;
  pageTitle: string;
  connectivity: Connectivity;
  preload: PreloadProgressState;
}

const initialState: AppState = {
  theme: "light",
  sidebarOpen: false,
  activeSidebar: null,
  lastActiveSidebar: "docs",
  panelOpen: false,
  pageTitle: "Dashboard",
  connectivity: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  preload: {
    active: false,
    total: 0,
    completed: 0,
    currentLabel: "",
    lastCompletedAt: null,
  },
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    toggleSidebar(state) {
      if (state.activeSidebar !== null) {
        state.lastActiveSidebar = state.activeSidebar;
        state.activeSidebar = null;
        state.sidebarOpen = false;
      } else {
        state.activeSidebar = state.lastActiveSidebar || "docs";
        state.sidebarOpen = true;
      }
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
      if (action.payload) {
        if (state.activeSidebar === null) {
          state.activeSidebar = state.lastActiveSidebar || "docs";
        }
      } else {
        if (state.activeSidebar !== null) {
          state.lastActiveSidebar = state.activeSidebar;
          state.activeSidebar = null;
        }
      }
    },
    setActiveSidebar(state, action: PayloadAction<SidebarKey | null>) {
      if (action.payload !== null) {
        state.lastActiveSidebar = action.payload;
        state.sidebarOpen = true;
      } else {
        state.sidebarOpen = false;
      }
      state.activeSidebar = action.payload;
    },
    toggleActiveSidebar(state, action: PayloadAction<SidebarKey>) {
      if (state.activeSidebar === action.payload) {
        state.lastActiveSidebar = action.payload;
        state.activeSidebar = null;
        state.sidebarOpen = false;
      } else {
        state.lastActiveSidebar = action.payload;
        state.activeSidebar = action.payload;
        state.sidebarOpen = true;
      }
    },
    togglePanel(state) { state.panelOpen = !state.panelOpen; },
    setPanelOpen(state, action: PayloadAction<boolean>) { state.panelOpen = action.payload; },
    setPageTitle(state, action: PayloadAction<string>) { state.pageTitle = action.payload; },

    // Connectivity state machine transitions
    setConnectivity(state, action: PayloadAction<Connectivity>) {
      state.connectivity = action.payload;
    },

    /** Called by baseApi on FETCH_ERROR / 502-504 — moves to prompt state unless already offline. */
    connectionLost(state) {
      if (state.connectivity === "online") {
        state.connectivity = "connection-lost";
      }
    },

    /** User confirmed offline mode (answered "Có" in OfflineModePrompt). */
    goOffline(state) {
      state.connectivity = "offline";
    },

    /** Health-check detected server is back; sync engine should start. */
    startReconnecting(state) {
      if (state.connectivity === "offline") {
        state.connectivity = "reconnecting";
      }
    },

    /** Sync engine finished; fully online again. */
    backOnline(state) {
      state.connectivity = "online";
    },

    // Legacy compat: some components still use setOnline(bool).
    setOnline(state, action: PayloadAction<boolean>) {
      if (action.payload) {
        if (state.connectivity === "offline" || state.connectivity === "reconnecting") {
          state.connectivity = "reconnecting";
        } else {
          state.connectivity = "online";
        }
      } else {
        if (state.connectivity === "online") {
          state.connectivity = "connection-lost";
        }
      }
    },

    // Background resource preload progress
    startPreload(state, action: PayloadAction<{ total: number; currentLabel: string }>) {
      state.preload = {
        active: true,
        total: action.payload.total,
        completed: 0,
        currentLabel: action.payload.currentLabel,
        lastCompletedAt: state.preload.lastCompletedAt,
      };
    },

    advancePreload(state, action: PayloadAction<{ completed: number; currentLabel: string }>) {
      state.preload.active = true;
      state.preload.completed = action.payload.completed;
      state.preload.currentLabel = action.payload.currentLabel;
    },

    finishPreload(state) {
      state.preload = {
        active: false,
        total: state.preload.total,
        completed: state.preload.total,
        currentLabel: "",
        lastCompletedAt: Date.now(),
      };
    },
  },
});

export const {
  toggleSidebar, setSidebarOpen,
  setActiveSidebar, toggleActiveSidebar,
  togglePanel, setPanelOpen,
  setPageTitle,
  setConnectivity, connectionLost, goOffline, startReconnecting, backOnline,
  setOnline,
  startPreload, advancePreload, finishPreload,
} = appSlice.actions;

export default appSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

import type { RootState } from ".";

/** Derived boolean for backward compat with code that reads isOnline. */
export const selectIsOnline = (s: RootState): boolean =>
  s.app.connectivity === "online" || s.app.connectivity === "reconnecting";

export const selectConnectivity = (s: RootState): Connectivity => s.app.connectivity;

export const selectIsOfflineMode = (s: RootState): boolean =>
  s.app.connectivity === "offline" || s.app.connectivity === "reconnecting";

export const selectPreloadProgress = (s: RootState): PreloadProgressState => s.app.preload;
