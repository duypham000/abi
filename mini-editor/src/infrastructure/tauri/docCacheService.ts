
function parseOrHashId(localId: string, prefix: string): number {
  if (localId.startsWith(prefix)) {
    const num = Number(localId.slice(prefix.length));
    if (!isNaN(num) && num > 0) return num;
  }
  const digits = localId.replace(/\D/g, '');
  if (digits.length > 0) {
    const num = Number(digits.slice(-9));
    if (!isNaN(num) && num > 0) return num;
  }
  let hash = 0;
  for (let i = 0; i < localId.length; i++) {
    hash = (hash << 5) - hash + localId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || Date.now();
}
import type { DocDto, DocRequest } from "@/core/interfaces/docs";
import type { PageResult } from "@/infrastructure/api/baseApi";
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
      is_dirty    INTEGER NOT NULL DEFAULT 0,
      yjs_state   TEXT,
      series_id   INTEGER
    )
  `);
  try { await db.execute(`ALTER TABLE docs ADD COLUMN yjs_state TEXT`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE docs ADD COLUMN series_id INTEGER`); } catch { /* already exists */ }
}

async function docDb() {
  if (!isTauri()) return null;
  if (!_docSchemaInit) {
    _docSchemaInit = ensureDocSchema().then(() => undefined);
  }
  await _docSchemaInit;
  return getDb();
}

function rowToDocDto(r: LocalDoc): DocDto {
  const idNum = r.backend_id ?? parseOrHashId(r.local_id, "doc-");
  return {
    id: idNum,
    title: r.title || "Untitled",
    content: r.content,
    plainText: r.plain_text,
    metadata: r.metadata,
    status: (r.status as 0 | 1) ?? 0,
    lastSync: r.last_synced,
    createdBy: null,
    yjsState: r.yjs_state ?? null,
  };
}

// ─── SQLite Full CRUD API for Docs ─────────────────────────────────────────

export async function listDocsFromSqlite(params?: { page?: number; size?: number; seriesId?: number }): Promise<PageResult<DocDto>> {
  const db = await docDb();
  if (!db) return { items: [], total: 0, page: 0, pageSize: 20 };
  let rows: LocalDoc[];
  if (params?.seriesId) {
    rows = await db.select("SELECT local_id, backend_id, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty FROM docs WHERE series_id = ? ORDER BY updated_at DESC", [params.seriesId]);
  } else {
    rows = await db.select("SELECT local_id, backend_id, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty FROM docs ORDER BY updated_at DESC");
  }
  const items = rows.map(rowToDocDto);
  return {
    items,
    total: items.length,
    page: params?.page ?? 0,
    pageSize: params?.size ?? (items.length || 20),
  };
}

export async function getDocFromSqlite(id: number | string): Promise<DocDto | null> {
  const db = await docDb();
  if (!db) return null;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  const rows: LocalDoc[] = await db.select(
    "SELECT local_id, backend_id, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty FROM docs WHERE backend_id = ? OR local_id = ? OR local_id = ? LIMIT 1",
    [numId || -1, strId, `doc-${strId}`]
  );
  if (!rows.length) return null;
  return rowToDocDto(rows[0]);
}

export async function createDocInSqlite(req: DocRequest): Promise<DocDto> {
  const db = await docDb();
  const ts = now();
  let nextId = Date.now();
  if (db) {
    const res = await db.select("SELECT MAX(COALESCE(backend_id, 0)) as max_id FROM docs");
    if (res && res[0] && typeof res[0].max_id === "number" && res[0].max_id > 0) {
      nextId = res[0].max_id + 1;
    }
  }
  const localId = `doc-${nextId}`;
  const title = req.title || "Untitled";
  const content = req.content ?? null;
  const metadata = req.metadata ?? null;
  const plainText = req.plainText ?? null;
  const seriesId = req.seriesId ?? null;
  const status = req.status ?? 0;

  if (db) {
    await db.execute(
      `INSERT INTO docs (local_id, backend_id, title, content, metadata, plain_text, series_id, status, updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [localId, nextId, title, content, metadata, plainText, seriesId, status, ts]
    );
  }

  return {
    id: nextId,
    title,
    content,
    plainText,
    metadata,
    status: status as 0 | 1,
    lastSync: ts,
    createdBy: null,
    yjsState: null,
  };
}

export async function updateDocInSqlite(id: number, req: DocRequest): Promise<DocDto> {
  const db = await docDb();
  const ts = now();
  const strId = String(id);

  if (db) {
    if ("seriesId" in req) {
      await db.execute(
        `UPDATE docs SET
           title = COALESCE(?, title),
           content = COALESCE(?, content),
           metadata = COALESCE(?, metadata),
           plain_text = COALESCE(?, plain_text),
           series_id = ?,
           status = COALESCE(?, status),
           updated_at = ?
         WHERE backend_id = ? OR local_id = ? OR local_id = ?`,
        [
          req.title ?? null,
          req.content ?? null,
          req.metadata ?? null,
          req.plainText ?? null,
          req.seriesId ?? null,
          req.status ?? null,
          ts,
          id,
          strId,
          `doc-${strId}`,
        ]
      );
    } else {
      await db.execute(
        `UPDATE docs SET
           title = COALESCE(?, title),
           content = COALESCE(?, content),
           metadata = COALESCE(?, metadata),
           plain_text = COALESCE(?, plain_text),
           status = COALESCE(?, status),
           updated_at = ?
         WHERE backend_id = ? OR local_id = ? OR local_id = ?`,
        [
          req.title ?? null,
          req.content ?? null,
          req.metadata ?? null,
          req.plainText ?? null,
          req.status ?? null,
          ts,
          id,
          strId,
          `doc-${strId}`,
        ]
      );
    }
  }

  const existing = await getDocFromSqlite(id);
  if (existing) return existing;

  return {
    id,
    title: req.title ?? "Untitled",
    content: req.content ?? null,
    plainText: req.plainText ?? null,
    metadata: req.metadata ?? null,
    status: (req.status as 0 | 1) ?? 0,
    lastSync: ts,
    createdBy: null,
  };
}

export async function deleteDocFromSqlite(id: number | string): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  await db.execute(
    "DELETE FROM docs WHERE backend_id = ? OR local_id = ? OR local_id = ?",
    [numId || -1, strId, `doc-${strId}`]
  );
}

export async function searchDocsInSqlite(q: string): Promise<DocDto[]> {
  const db = await docDb();
  if (!db || !q.trim()) return [];
  const term = `%${q.trim()}%`;
  const rows: LocalDoc[] = await db.select(
    "SELECT local_id, backend_id, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty FROM docs WHERE title LIKE ? OR plain_text LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
    [term, term, term]
  );
  return rows.map(rowToDocDto);
}

// ─── Legacy Cache / Draft exports ──────────────────────────────────────────

export async function cacheDoc(doc: DocDto): Promise<void> {
  await saveDocLocally(doc.id, doc, false);
}

export async function getCachedDoc(backendId: number): Promise<DocDto | null> {
  return getDocFromSqlite(backendId);
}

export async function getCachedDocWithDirty(backendId: number): Promise<{ doc: DocDto | null; isDirty: boolean }> {
  const doc = await getDocFromSqlite(backendId);
  return { doc, isDirty: false };
}

export async function saveDocLocally(
  backendId: number,
  fields: { title?: string; content?: string | null; metadata?: string | null; plainText?: string | null; status?: number; yjsState?: string | null },
  _isDirty = false
): Promise<void> {
  await updateDocInSqlite(backendId, {
    title: fields.title ?? "Untitled",
    content: fields.content ?? null,
    metadata: fields.metadata ?? null,
    plainText: fields.plainText ?? null,
    status: (fields.status as 0 | 1) ?? 0,
    lastSync: new Date().toISOString(),
  });
}

export async function markClean(_backendId: number): Promise<void> {
  // no-op for local-first
}

export async function getPendingSync(): Promise<(LocalDoc & { backend_id: number })[]> {
  return [];
}

