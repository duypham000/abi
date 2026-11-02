import type { NoteDto, NoteRequest } from "@/core/interfaces/notes";
import type { PageResult } from "@/infrastructure/api/baseApi";
import { getDb, isTauri, now } from "./sqliteDb";
import { computeNoteHash } from "@/core/utils/contentHash";

export interface LocalNote {
  local_id: string;
  backend_id: number | null;
  title: string;
  content: string | null;
  metadata: string | null;
  status: number;
  last_synced: string | null;
  updated_at: string;
  is_dirty: number;
  content_hash?: string | null;
}

let _noteSchemaInit: Promise<void> | null = null;

async function ensureNoteSchema() {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      local_id    TEXT    PRIMARY KEY,
      backend_id  INTEGER,
      title       TEXT    NOT NULL DEFAULT 'Untitled Note',
      content     TEXT,
      metadata    TEXT,
      status      INTEGER NOT NULL DEFAULT 0,
      last_synced TEXT,
      updated_at  TEXT    NOT NULL,
      is_dirty    INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT
    )
  `);
  try { await db.execute(`ALTER TABLE notes ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE notes ADD COLUMN content_hash TEXT`); } catch { /* already exists */ }
}

async function noteDb() {
  if (!isTauri()) return null;
  if (!_noteSchemaInit) {
    _noteSchemaInit = ensureNoteSchema().then(() => undefined);
  }
  await _noteSchemaInit;
  return getDb();
}

function parseOrHashId(localId: string, prefix: string): number {
  if (localId.startsWith(prefix)) {
    const num = Number(localId.slice(prefix.length));
    if (!isNaN(num) && num > 0) return num;
  }
  const digits = localId.replace(/\D/g, "");
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

function rowToNoteDto(r: LocalNote): NoteDto {
  const idNum = r.backend_id ?? parseOrHashId(r.local_id, "note-");
  return {
    id: idNum,
    title: r.title || "Untitled Note",
    content: r.content,
    metadata: r.metadata,
    status: (r.status as 0 | 1) ?? 0,
    lastSync: r.last_synced,
  };
}

export async function listNotesFromSqlite(params?: { page?: number; size?: number }): Promise<PageResult<NoteDto>> {
  const db = await noteDb();
  if (!db) return { items: [], total: 0, page: 0, pageSize: 20 };
  const rows: LocalNote[] = await db.select(
    "SELECT * FROM notes ORDER BY updated_at DESC"
  );
  const items = rows.map(rowToNoteDto);
  return {
    items,
    total: items.length,
    page: params?.page ?? 0,
    pageSize: params?.size ?? (items.length || 20),
  };
}

export async function getNoteFromSqlite(id: number | string): Promise<NoteDto | null> {
  const db = await noteDb();
  if (!db) return null;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  const rows: LocalNote[] = await db.select(
    "SELECT * FROM notes WHERE backend_id = ? OR local_id = ? OR local_id = ? LIMIT 1",
    [numId || -1, strId, `note-${strId}`]
  );
  if (!rows.length) return null;
  return rowToNoteDto(rows[0]);
}

export async function createNoteInSqlite(req: NoteRequest): Promise<NoteDto> {
  const db = await noteDb();
  const ts = now();
  let nextId = Date.now();
  if (db) {
    const res: any[] = await db.select("SELECT MAX(COALESCE(backend_id, 0)) as max_id FROM notes");
    if (res && res[0] && typeof res[0].max_id === "number" && res[0].max_id > 0) {
      nextId = res[0].max_id + 1;
    }
  }
  const localId = `note-${nextId}`;
  const title = req.title || "Untitled Note";
  const content = req.content ?? null;
  const metadata = req.metadata ?? null;
  const status = req.status ?? 0;
  const hash = await computeNoteHash({ title, content, metadata });

  if (db) {
    await db.execute(
      `INSERT INTO notes (local_id, backend_id, title, content, metadata, status, updated_at, is_dirty, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [localId, nextId, title, content, metadata, status, ts, hash]
    );
  }

  return {
    id: nextId,
    title,
    content,
    metadata,
    status: (status as 0 | 1) ?? 0,
    lastSync: ts,
  };
}

export async function updateNoteInSqlite(id: number, req: NoteRequest): Promise<NoteDto> {
  const db = await noteDb();
  const ts = now();
  const strId = String(id);

  if (db) {
    await db.execute(
      `UPDATE notes SET
         title = COALESCE(?, title),
         content = COALESCE(?, content),
         metadata = COALESCE(?, metadata),
         status = COALESCE(?, status),
         updated_at = ?
       WHERE backend_id = ? OR local_id = ? OR local_id = ?`,
      [
        req.title ?? null,
        req.content ?? null,
        req.metadata ?? null,
        req.status ?? null,
        ts,
        id,
        strId,
        `note-${strId}`,
      ]
    );
  }

  const existing = await getNoteFromSqlite(id);
  if (existing) return existing;

  return {
    id,
    title: req.title ?? "Untitled Note",
    content: req.content ?? null,
    metadata: req.metadata ?? null,
    status: (req.status as 0 | 1) ?? 0,
    lastSync: ts,
  };
}

export async function deleteNoteFromSqlite(id: number | string): Promise<void> {
  const db = await noteDb();
  if (!db) return;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  await db.execute(
    "DELETE FROM notes WHERE backend_id = ? OR local_id = ? OR local_id = ?",
    [numId || -1, strId, `note-${strId}`]
  );
}

export async function searchNotesInSqlite(q: string): Promise<NoteDto[]> {
  const db = await noteDb();
  if (!db || !q.trim()) return [];
  const term = `%${q.trim()}%`;
  const rows: LocalNote[] = await db.select(
    "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
    [term, term]
  );
  return rows.map(rowToNoteDto);
}
