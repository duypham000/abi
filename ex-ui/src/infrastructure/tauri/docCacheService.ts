import type { DocDto } from "@/core/interfaces/docs";
import { getDb, isTauri, now } from "./sqliteDb";

export interface LocalDoc {
  local_id: string;
  backend_id: number | null;
  title: string;
  content: string | null;
  metadata: string | null;
  plain_text: string | null;
  yjs_state: string | null;
  status: number;
  last_synced: string | null;
  updated_at: string;
  is_dirty: number;
}

let _docSchemaInit: Promise<void> | null = null;

async function ensureDocSchema() {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS docs (
      local_id    TEXT    PRIMARY KEY,
      backend_id  INTEGER,
      title       TEXT    NOT NULL DEFAULT 'Untitled',
      content     TEXT,
      metadata    TEXT,
      plain_text  TEXT,
      status      INTEGER NOT NULL DEFAULT 0,
      last_synced TEXT,
      updated_at  TEXT    NOT NULL,
      is_dirty    INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Migration: add yjs_state column if absent
  try { await db.execute(`ALTER TABLE docs ADD COLUMN yjs_state TEXT`); } catch { /* already exists */ }
}

async function docDb() {
  if (!isTauri()) return null;
  if (!_docSchemaInit) {
    _docSchemaInit = ensureDocSchema().then(() => undefined);
  }
  await _docSchemaInit;
  return getDb();
}

function localIdForBackend(backendId: number): string {
  return `doc-${backendId}`;
}

// ─── Cache (backend docs) ────────────────────────────────────────────────────

export async function cacheDoc(doc: DocDto): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const localId = localIdForBackend(doc.id);
  await db.execute(
    `INSERT INTO docs (local_id, backend_id, title, content, metadata, plain_text, yjs_state, status, last_synced, updated_at, is_dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(local_id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       metadata = excluded.metadata,
       plain_text = excluded.plain_text,
       yjs_state = CASE WHEN is_dirty = 1 THEN yjs_state ELSE excluded.yjs_state END,
       status = excluded.status,
       last_synced = excluded.last_synced,
       updated_at = excluded.updated_at,
       is_dirty = CASE WHEN is_dirty = 1 THEN 1 ELSE 0 END`,
    [localId, doc.id, doc.title, doc.content, doc.metadata, doc.plainText, doc.yjsState ?? null, doc.status, now(), now()]
  );
}

export async function getCachedDoc(backendId: number): Promise<DocDto | null> {
  const db = await docDb();
  if (!db) return null;
  const rows: LocalDoc[] = await db.select(
    "SELECT * FROM docs WHERE backend_id = ? LIMIT 1",
    [backendId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.backend_id!,
    title: r.title,
    content: r.content,
    plainText: r.plain_text,
    metadata: r.metadata,
    status: r.status as 0 | 1,
    lastSync: r.last_synced,
    createdBy: null,
    yjsState: r.yjs_state ?? null,
  };
}

export async function getCachedDocWithDirty(
  backendId: number
): Promise<{ doc: DocDto | null; isDirty: boolean }> {
  const db = await getDb();
  if (!db) return { doc: null, isDirty: false };
  const rows: LocalDoc[] = await db.select(
    "SELECT * FROM docs WHERE backend_id = ? LIMIT 1",
    [backendId]
  );
  if (!rows.length) return { doc: null, isDirty: false };
  const r = rows[0];
  const doc: DocDto = {
    id: r.backend_id!,
    title: r.title,
    content: r.content,
    plainText: r.plain_text,
    metadata: r.metadata,
    status: r.status as 0 | 1,
    lastSync: r.last_synced,
    createdBy: null,
    yjsState: r.yjs_state ?? null,
  };
  return { doc, isDirty: r.is_dirty === 1 };
}

// ─── Dirty / sync ────────────────────────────────────────────────────────────

export async function saveDocLocally(
  backendId: number,
  fields: { title?: string; content?: string | null; metadata?: string | null; plainText?: string | null; status?: number; yjsState?: string | null },
  isDirty: boolean
): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const localId = localIdForBackend(backendId);
  await db.execute(
    `INSERT INTO docs (local_id, backend_id, title, content, metadata, plain_text, yjs_state, status, updated_at, is_dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(local_id) DO UPDATE SET
       title = COALESCE(excluded.title, title),
       content = COALESCE(excluded.content, content),
       metadata = COALESCE(excluded.metadata, metadata),
       plain_text = COALESCE(excluded.plain_text, plain_text),
       yjs_state = COALESCE(excluded.yjs_state, yjs_state),
       status = excluded.status,
       updated_at = excluded.updated_at,
       is_dirty = excluded.is_dirty`,
    [
      localId,
      backendId,
      fields.title ?? "",
      fields.content ?? null,
      fields.metadata ?? null,
      fields.plainText ?? null,
      fields.yjsState ?? null,
      fields.status ?? 0,
      now(),
      isDirty ? 1 : 0,
    ]
  );
}

export async function markClean(backendId: number): Promise<void> {
  const db = await docDb();
  if (!db) return;
  await db.execute(
    "UPDATE docs SET is_dirty = 0, last_synced = ? WHERE backend_id = ?",
    [now(), backendId]
  );
}

export async function getPendingSync(): Promise<(LocalDoc & { backend_id: number })[]> {
  const db = await docDb();
  if (!db) return [];
  const rows: LocalDoc[] = await db.select(
    "SELECT * FROM docs WHERE is_dirty = 1 AND backend_id IS NOT NULL"
  );
  return rows as (LocalDoc & { backend_id: number })[];
}

// ─── Drafts (local-only) ─────────────────────────────────────────────────────

export async function saveDraft(
  localId: string,
  title: string,
  content: string | null,
  metadata: string | null
): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const ts = now();
  await db.execute(
    `INSERT INTO docs (local_id, backend_id, title, content, metadata, status, updated_at, is_dirty)
     VALUES (?, NULL, ?, ?, ?, 0, ?, 0)
     ON CONFLICT(local_id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`,
    [localId, title, content, metadata, ts]
  );
}

export async function getDraft(localId: string): Promise<LocalDoc | null> {
  const db = await docDb();
  if (!db) return null;
  const rows: LocalDoc[] = await db.select(
    "SELECT * FROM docs WHERE local_id = ? AND backend_id IS NULL LIMIT 1",
    [localId]
  );
  return rows[0] ?? null;
}

export interface DraftSummary {
  id: string;
  title: string;
  updated_at: string;
}

export async function listDrafts(): Promise<DraftSummary[]> {
  const db = await docDb();
  if (!db) return [];
  const rows: LocalDoc[] = await db.select(
    "SELECT local_id, title, updated_at FROM docs WHERE backend_id IS NULL ORDER BY updated_at ASC"
  );
  return rows.map((r) => ({ id: r.local_id, title: r.title, updated_at: r.updated_at }));
}

export async function deleteDraft(localId: string): Promise<void> {
  const db = await docDb();
  if (!db) return;
  await db.execute("DELETE FROM docs WHERE local_id = ? AND backend_id IS NULL", [localId]);
}
