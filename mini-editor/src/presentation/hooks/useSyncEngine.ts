/**
 * Standalone Sync Engine (No-op in local SQLite standalone mode).
 */
export function useSyncEngine() {
  // Local SQLite is the single source of truth; no remote HTTP sync needed.
}
