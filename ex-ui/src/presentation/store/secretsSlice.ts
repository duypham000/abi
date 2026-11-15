import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface SecretsState {
  selectedSecretId: number | null;
  selectedGroupId: number | null;
  showFavoritesOnly: boolean;
  searchQuery: string;
  expandedGroupIds: number[];
}

const initialState: SecretsState = {
  selectedSecretId: null,
  selectedGroupId: null,
  showFavoritesOnly: false,
  searchQuery: "",
  expandedGroupIds: [],
};

const secretsSlice = createSlice({
  name: "secrets",
  initialState,
  reducers: {
    setSelectedSecret: (state, action: PayloadAction<number | null>) => {
      state.selectedSecretId = action.payload;
    },
    setSelectedGroup: (state, action: PayloadAction<number | null>) => {
      state.selectedGroupId = action.payload;
      state.showFavoritesOnly = false;
      state.selectedSecretId = null;
    },
    setShowFavorites: (state, action: PayloadAction<boolean>) => {
      state.showFavoritesOnly = action.payload;
      state.selectedGroupId = null;
      state.selectedSecretId = null;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    toggleGroupExpanded: (state, action: PayloadAction<number>) => {
      const id = action.payload;
      const idx = state.expandedGroupIds.indexOf(id);
      if (idx >= 0) state.expandedGroupIds.splice(idx, 1);
      else state.expandedGroupIds.push(id);
    },
  },
});

export const {
  setSelectedSecret,
  setSelectedGroup,
  setShowFavorites,
  setSearchQuery,
  toggleGroupExpanded,
} = secretsSlice.actions;
export default secretsSlice.reducer;
