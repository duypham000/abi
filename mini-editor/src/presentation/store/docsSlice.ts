import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type DocPersistenceState = "unsaved" | "saving" | "saved-local" | "synced" | "error";

export interface DocSaveSnapshotState {
  docId: number;
  status: DocPersistenceState;
  isLocalDirty: boolean;
  isRemoteDirty: boolean;
  isSaving: boolean;
  lastSavedLocalAt: string | null;
  lastSyncedRemoteAt: string | null;
  errorMessage: string | null;
}

interface DocsState {
  currentDocId: number | null;
  isDirty: boolean;
  byId: Record<number, DocSaveSnapshotState>;
}

const initialState: DocsState = {
  currentDocId: null,
  isDirty: false,
  byId: {},
};

const docsSlice = createSlice({
  name: "docs",
  initialState,
  reducers: {
    setCurrentDocId(state, action: PayloadAction<number | null>) {
      state.currentDocId = action.payload;
      if (action.payload === null) {
        state.isDirty = false;
      } else {
        const entry = state.byId[action.payload];
        state.isDirty = entry ? entry.isLocalDirty || entry.isRemoteDirty : false;
      }
    },
    setDirty(state, action: PayloadAction<boolean>) {
      state.isDirty = action.payload;
    },
    setDocSaveState(state, action: PayloadAction<DocSaveSnapshotState>) {
      const next = action.payload;
      state.byId[next.docId] = next;
      if (state.currentDocId === next.docId) {
        state.isDirty = next.isLocalDirty || next.isRemoteDirty;
      }
    },
    clearDocSaveState(state, action: PayloadAction<number>) {
      delete state.byId[action.payload];
      if (state.currentDocId === action.payload) {
        state.isDirty = false;
      }
    },
  },
});

export const { setCurrentDocId, setDirty, setDocSaveState, clearDocSaveState } = docsSlice.actions;

export const selectDocSaveState = (state: { docs: DocsState }, docId: number): DocSaveSnapshotState | null =>
  state.docs.byId[docId] ?? null;

export default docsSlice.reducer;
