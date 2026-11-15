/**
 * Offline mutation outbox — persists create/update/delete ops that failed
 * because the app was offline. The sync engine replays them FIFO when
 * connectivity is restored.
 *
 * Coalescing rule: for a given (entity_type, local_id), multiple pending
 * 'update' ops are merged into the latest one (only the most recent payload
 * matters). A 'delete' supersedes all prior 'update' ops for the same entity.
 */

import { getDb, isTauri, now } from "./sqliteDb";
import type { EntityType } from "./entityCacheService";

export type OutboxOp = "create" | "update" | "delete";

export interface OutboxItem {
  id: number;
  entity_type: EntityType | "doc";
  op: OutboxOp;
  local_id: string;
  backend_id: number | null;
  payload_json: string | null;
  base_version: number | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

let _schemaInit: Promise<void> | null = null;

async function ensureSchema() {
  const d = await getDb();
  if (!d) return;
  await d.execute(`
    CREATE TABLE IF NOT EXISTS outbox (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type  TEXT    NOT NULL,
      op           TEXT    NOT NULL,
      local_id     TEXT    NOT NULL,
      backend_id   INTEGER,
      payload_json TEXT,
      base_version INTEGER,
      created_at   TEXT    NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_error   TEXT
    )
  `);
}

async function db() {
  if (!isTauri()) return null;
  if (!_schemaInit) {
    _schemaInit = ensureSchema().then(() => undefined);
  }
  await _schemaInit;
  return getDb();
}

// ─── Enqueue ────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  entityType: EntityType | "doc";
  op: OutboxOp;
  localId: string;
  backendId?: number | null;
  payload?: unknown;
  baseVersion?: number | null;
}

/**
 * Add (or coalesce) a mutation into the outbox.
 * - update coalesces into the last pending update for the same entity.
 * - delete supersedes any pending updates for the same entity.
 */
export async function enqueue(opts: EnqueueOptions): Promise<void> {
  const conn = await db();
  if (!conn) return;

  const payloadJson = opts.payload != null ? JSON.stringify(opts.payload) : null;

  if (opts.op === "delete") {
    // Remove pending updates for the same entity, then insert delete.
    await conn.execute(
      "DELETE FROM outbox WHERE entity_type = ? AND local_id = ? AND op = 'update'",
      [opts.entityType, opts.localId]
    );
    await conn.execute(
      `INSERT INTO outbox (entity_type, op, local_id, backend_id, payload_json, base_version, created_at)
       VALUES (?, 'delete', ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [opts.entityType, opts.localId, opts.backendId ?? null, payloadJson, opts.baseVersion ?? null, now()]
    );
    return;
  }

  if (opts.op === "update") {
    // Coalesce: update existing pending update row if one exists.
    const existing: OutboxItem[] = await conn.select(
      "SELECT id FROM outbox WHERE entity_type = ? AND local_id = ? AND op = 'update' LIMIT 1",
      [opts.entityType, opts.localId]
    );
    if (existing.length > 0) {
      await conn.execute(
        "UPDATE outbox SET payload_json = ?, base_version = ?, attempts = 0, last_error = NULL WHERE id = ?",
        [payloadJson, opts.baseVersion ?? null, existing[0].id]
      );
      return;
    }
  }

  await conn.execute(
    `INSERT INTO outbox (entity_type, op, local_id, backend_id, payload_json, base_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [opts.entityType, opts.op, opts.localId, opts.backendId ?? null, payloadJson, opts.baseVersion ?? null, now()]
  );
}

// ─── Read ────────────────────────────────────────────────────────────────────

/** Return all pending items in FIFO order. */
export async function listQueue(): Promise<OutboxItem[]> {
  const conn = await db();
  if (!conn) return [];
  return conn.select("SELECT * FROM outbox ORDER BY id ASC");
}

/** Return items for a specific entity. */
export async function listQueueForEntity(
  entityType: EntityType | "doc",
  localId: string
): Promise<OutboxItem[]> {
  const conn = await db();
  if (!conn) return [];
  return conn.select(
    "SELECT * FROM outbox WHERE entity_type = ? AND local_id = ? ORDER BY id ASC",
    [entityType, localId]
  );
}

/** Count items currently waiting. */
export async function pendingCount(): Promise<number> {
  const conn = await db();
  if (!conn) return 0;
  const rows: { cnt: number }[] = await conn.select("SELECT COUNT(*) as cnt FROM outbox");
  return rows[0]?.cnt ?? 0;
}

// ─── Post-sync bookkeeping ────────────────────────────────────────────────────

/** Remove a successfully synced item. */
export async function dequeue(id: number): Promise<void> {
  const conn = await db();
  if (!conn) return;
  await conn.execute("DELETE FROM outbox WHERE id = ?", [id]);
}

/** Record a failed attempt (for exponential back-off tracking). */
export async function bumpAttempt(id: number, error: string): Promise<void> {
  const conn = await db();
  if (!conn) return;
  await conn.execute(
    "UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?",
    [error, id]
  );
}

/**
 * After a 'create' syncs and we learn the real backend_id,
 * update any remaining outbox items that reference the local_id.
 */
export async function remapLocalId(
  entityType: EntityType | "doc",
  oldLocalId: string,
  newBackendId: number
): Promise<void> {
  const conn = await db();
  if (!conn) return;
  await conn.execute(
    "UPDATE outbox SET backend_id = ?, local_id = ? WHERE entity_type = ? AND local_id = ?",
    [newBackendId, `${entityType}-${newBackendId}`, entityType, oldLocalId]
  );
}

/** Clear the entire outbox (use only in tests / full reset). */
export async function clearOutbox(): Promise<void> {
  const conn = await db();
  if (!conn) return;
  await conn.execute("DELETE FROM outbox");
}
