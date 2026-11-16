import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface DocsState {
  currentDocId: number | null;
  isDirty: boolean;
}

const initialState: DocsState = {
  currentDocId: null,
  isDirty: false,
};

const docsSlice = createSlice({
  name: "docs",
  initialState,
  reducers: {
    setCurrentDocId(state, action: PayloadAction<number | null>) {
      state.currentDocId = action.payload;
    },
    setDirty(state, action: PayloadAction<boolean>) {
      state.isDirty = action.payload;
    },
  },
});

export const { setCurrentDocId, setDirty } = docsSlice.actions;
export default docsSlice.reducer;
