import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type SidebarKey = "features" | "docs" | "series" | "demo";

/**
 * Connectivity state machine:
 *   online          – server reachable, normal operation
 *   connection-lost – first FETCH_ERROR / 5xx detected; prompt user
 *   offline         – user confirmed offline mode; reads from cache, mutations to outbox
 *   reconnecting    – health-check detected server is back; sync engine running
 */
export type Connectivity = "online" | "connection-lost" | "offline" | "reconnecting";

interface AppState {
  theme: "light";
  sidebarOpen: boolean;
  activeSidebar: SidebarKey | null;
  panelOpen: boolean;
  pageTitle: string;
  connectivity: Connectivity;
}

const initialState: AppState = {
  theme: "light",
  sidebarOpen: true,
  activeSidebar: null,
  panelOpen: false,
  pageTitle: "Dashboard",
  connectivity: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    toggleSidebar(state) { state.sidebarOpen = !state.sidebarOpen; },
    setSidebarOpen(state, action: PayloadAction<boolean>) { state.sidebarOpen = action.payload; },
    setActiveSidebar(state, action: PayloadAction<SidebarKey | null>) {
      state.activeSidebar = action.payload;
    },
    toggleActiveSidebar(state, action: PayloadAction<SidebarKey>) {
      state.activeSidebar = state.activeSidebar === action.payload ? null : action.payload;
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
  },
});

export const {
  toggleSidebar, setSidebarOpen,
  setActiveSidebar, toggleActiveSidebar,
  togglePanel, setPanelOpen,
  setPageTitle,
  setConnectivity, connectionLost, goOffline, startReconnecting, backOnline,
  setOnline,
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
