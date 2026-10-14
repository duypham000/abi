/**
 * Generic SQLite cache for server entities: canvas, note, secret, secret_group.
 * Pattern mirrors docCacheService.ts — dirty flag, base snapshot for 3-way merge,
 * soft-delete, and version tracking for optimistic concurrency.
 *
 * Secrets: data_json is stored encrypted (see crypto_commands.rs).
 * Caller is responsible for encrypt/decrypt via encryptSecret/decryptSecret helpers.
 */

import { getDb, isTauri, now } from "./sqliteDb";

// ─── Crypto helpers for Secrets ───────────────────────────────────────────────

async function encryptIfSecret(_type: EntityType, json: string): Promise<string> { return json; }

async function decryptIfSecret(_type: EntityType, json: string): Promise<string> { return json; }

export type EntityType = "canvas" | "note";

export interface CachedEntity {
  entity_type: EntityType;
  local_id: string;
  backend_id: number | null;
  data_json: string | null;
  base_json: string | null;
  base_version: number | null;
  updated_at: string;
  is_dirty: number;
  deleted: number;
}

async function ensureSchema() {
  const db = await getDb();
  if (!db) return null;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS entity_cache (
      entity_type  TEXT    NOT NULL,
      local_id     TEXT    NOT NULL,
      backend_id   INTEGER,
      data_json    TEXT,
      base_json    TEXT,
      base_version INTEGER,
      updated_at   TEXT    NOT NULL,
      is_dirty     INTEGER NOT NULL DEFAULT 0,
      deleted      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity_type, local_id)
    )
  `);
  return db;
}

let _schemaInit: Promise<void> | null = null;

async function db() {
  if (!isTauri()) return null;
  if (!_schemaInit) {
    _schemaInit = ensureSchema().then(() => undefined);
  }
  await _schemaInit;
  return getDb();
}

function localId(type: EntityType, backendId: number): string {
  return `${type}-${backendId}`;
}

// ─── Write-through cache from server ────────────────────────────────────────

/**
 * Cache a server DTO. Does NOT overwrite data_json / base_version if the row
 * is currently dirty (user has unsaved local edits — same logic as cacheDoc).
 * Pass the version field from the server DTO (may be undefined when backend
 * has not yet added @Version — falls back to null).
 */
export async function cacheEntity(
  type: EntityType,
  backendId: number,
  dataJson: string,
  version?: number | null
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  const lid = localId(type, backendId);
  const storedJson = await encryptIfSecret(type, dataJson);
  await conn.execute(
    `INSERT INTO entity_cache
       (entity_type, local_id, backend_id, data_json, base_json, base_version, updated_at, is_dirty, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
     ON CONFLICT(entity_type, local_id) DO UPDATE SET
       data_json    = CASE WHEN is_dirty = 1 THEN data_json    ELSE excluded.data_json    END,
       base_json    = excluded.base_json,
       base_version = excluded.base_version,
       updated_at   = excluded.updated_at,
       deleted      = 0,
       is_dirty     = CASE WHEN is_dirty = 1 THEN 1 ELSE 0 END`,
    [type, lid, backendId, storedJson, storedJson, version ?? null, now()]
  );
}

// ─── Read from cache ─────────────────────────────────────────────────────────

export async function getCached(
  type: EntityType,
  backendId: number
): Promise<CachedEntity | null> {
  const conn = await db();
  if (!conn) return null;
  const rows: CachedEntity[] = await conn.select(
    "SELECT * FROM entity_cache WHERE entity_type = ? AND backend_id = ? AND deleted = 0 LIMIT 1",
    [type, backendId]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  if (row.data_json) row.data_json = await decryptIfSecret(type, row.data_json);
  return row;
}

export async function listCached(type: EntityType): Promise<CachedEntity[]> {
  const conn = await db();
  if (!conn) return [];
  const rows: CachedEntity[] = await conn.select(
    "SELECT * FROM entity_cache WHERE entity_type = ? AND deleted = 0 ORDER BY updated_at DESC",
    [type]
  );
  // Decrypt in parallel
  return Promise.all(
    rows.map(async (row) => {
      if (row.data_json) row.data_json = await decryptIfSecret(type, row.data_json);
      return row;
    })
  );
}

// ─── Local optimistic writes ──────────────────────────────────────────────────

/**
 * Save local edits (with is_dirty = isDirty).
 * Used for pessimistic offline edits + immediate optimistic UI updates.
 */
export async function saveEntityLocally(
  type: EntityType,
  backendId: number,
  dataJson: string,
  isDirty: boolean
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  const lid = localId(type, backendId);
  const storedJson = await encryptIfSecret(type, dataJson);
  await conn.execute(
    `INSERT INTO entity_cache
       (entity_type, local_id, backend_id, data_json, updated_at, is_dirty)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, local_id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at,
       is_dirty   = excluded.is_dirty`,
    [type, lid, backendId, storedJson, now(), isDirty ? 1 : 0]
  );
}

/**
 * Insert a brand-new entity created while offline (no backend_id yet).
 */
export async function insertLocalEntity(
  type: EntityType,
  localIdVal: string,
  dataJson: string
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  const storedJson = await encryptIfSecret(type, dataJson);
  await conn.execute(
    `INSERT INTO entity_cache
       (entity_type, local_id, backend_id, data_json, updated_at, is_dirty)
     VALUES (?, ?, NULL, ?, ?, 1)`,
    [type, localIdVal, storedJson, now()]
  );
}

// ─── Post-sync bookkeeping ────────────────────────────────────────────────────

/** After successful server sync: clear dirty flag and update base snapshot. */
export async function markEntityClean(
  type: EntityType,
  backendId: number,
  newVersion?: number | null,
  newDataJson?: string
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  if (newDataJson !== undefined) {
    await conn.execute(
      `UPDATE entity_cache
       SET is_dirty = 0, base_json = ?, base_version = ?, updated_at = ?
       WHERE entity_type = ? AND backend_id = ?`,
      [newDataJson, newVersion ?? null, now(), type, backendId]
    );
  } else {
    await conn.execute(
      `UPDATE entity_cache
       SET is_dirty = 0, base_version = ?, updated_at = ?
       WHERE entity_type = ? AND backend_id = ?`,
      [newVersion ?? null, now(), type, backendId]
    );
  }
}

/** Map a local_id (offline-created) to a real backend_id after create syncs. */
export async function promoteLocalEntity(
  type: EntityType,
  localIdVal: string,
  backendId: number,
  newDataJson: string,
  version?: number | null
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  const newLid = localId(type, backendId);
  await conn.execute(
    `UPDATE entity_cache
     SET backend_id = ?, local_id = ?, data_json = ?, base_json = ?,
         base_version = ?, is_dirty = 0, updated_at = ?
     WHERE entity_type = ? AND local_id = ?`,
    [backendId, newLid, newDataJson, newDataJson, version ?? null, now(), type, localIdVal]
  );
}

/** Soft-delete a cached entity (marks deleted=1). */
export async function softDeleteEntity(
  type: EntityType,
  backendId: number
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  await conn.execute(
    "UPDATE entity_cache SET deleted = 1, updated_at = ? WHERE entity_type = ? AND backend_id = ?",
    [now(), type, backendId]
  );
}

// ─── Pending sync ─────────────────────────────────────────────────────────────

export async function getPendingEntities(): Promise<CachedEntity[]> {
  const conn = await db();
  if (!conn) return [];
  return conn.select(
    "SELECT * FROM entity_cache WHERE is_dirty = 1"
  );
}
