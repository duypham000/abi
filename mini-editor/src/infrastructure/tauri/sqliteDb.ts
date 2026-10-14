/**
 * Shared SQLite connection singleton for tomo-docs.db.
 * All services (kvStore, docCacheService, entityCacheService, outboxService)
 * share this single connection to avoid opening multiple file handles.
 */

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

export async function getDb() {
  if (_db) return _db;
  if (!isTauri()) return null;
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  _db = await Database.load("sqlite:tomo-docs.db");
  return _db;
}

export function now(): string {
  return new Date().toISOString();
}
