import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ShortcutSettings {
  quickCreateDoc: string;
  showMainWindow: string;
  openSearch: string;
}

interface SettingsState {
  shortcuts: ShortcutSettings;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  quickCreateDoc: "CommandOrControl+Shift+N",
  showMainWindow: "CommandOrControl+Shift+T",
  openSearch: "CommandOrControl+Shift+F",
};

const initialState: SettingsState = {
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateShortcut(
      state,
      action: PayloadAction<{ key: keyof ShortcutSettings; value: string }>
    ) {
      state.shortcuts[action.payload.key] = action.payload.value;
    },
    resetShortcuts(state) {
      state.shortcuts = { ...DEFAULT_SHORTCUTS };
    },
  },
});

export const { updateShortcut, resetShortcuts } = settingsSlice.actions;
export default settingsSlice.reducer;
