/**
 * Redux slice for tracking pending sync conflicts that require user resolution.
 *
 * A conflict is created by useSyncEngine when 3-way merge finds that both
 * local and server changed the same field(s) to different values.
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { EntityType } from "@/infrastructure/tauri/entityCacheService";

export interface ConflictRecord {
  id: string;                   // unique per conflict: `${entityType}-${backendId}`
  entityType: EntityType | "doc";
  backendId: number;
  localId: string;
  outboxId: number;             // outbox row id, used to dequeue after resolution
  conflictingFields: string[];  // field names that conflict
  baseJson: string | null;      // snapshot at last sync
  localJson: string | null;     // local unsaved version
  serverJson: string | null;    // current server version
  mergedJson: string | null;    // auto-merged result (with conflicts defaulting to server)
}

interface ConflictsState {
  pending: ConflictRecord[];
}

const initialState: ConflictsState = {
  pending: [],
};

const conflictsSlice = createSlice({
  name: "conflicts",
  initialState,
  reducers: {
    addConflict(state, action: PayloadAction<ConflictRecord>) {
      // Avoid duplicates
      const exists = state.pending.some((c) => c.id === action.payload.id);
      if (!exists) {
        state.pending.push(action.payload);
      }
    },
    resolveConflict(state, action: PayloadAction<string>) {
      state.pending = state.pending.filter((c) => c.id !== action.payload);
    },
    clearAllConflicts(state) {
      state.pending = [];
    },
  },
});

export const { addConflict, resolveConflict, clearAllConflicts } = conflictsSlice.actions;
export default conflictsSlice.reducer;

import type { RootState } from ".";
export const selectPendingConflicts = (s: RootState) => s.conflicts.pending;
export const selectConflictCount = (s: RootState) => s.conflicts.pending.length;
