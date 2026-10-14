
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
import type { CanvasDto, CanvasRequest } from "@/core/interfaces/canvas";
import type { PageResult } from "@/infrastructure/api/baseApi";
import { getDb, isTauri, now } from "./sqliteDb";

export interface LocalCanvas {
  local_id: string;
  backend_id: number | null;
  title: string;
  scene: string | null;
  metadata: string | null;
  status: number;
  last_synced: string | null;
  updated_at: string;
  deleted: number;
}

let _canvasSchemaInit: Promise<void> | null = null;

async function ensureCanvasSchema() {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS canvas (
      local_id    TEXT    PRIMARY KEY,
      backend_id  INTEGER,
      title       TEXT    NOT NULL DEFAULT 'Untitled Canvas',
      scene       TEXT,
      metadata    TEXT,
      status      INTEGER NOT NULL DEFAULT 0,
      last_synced TEXT,
      updated_at  TEXT    NOT NULL,
      deleted     INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function canvasDb() {
  if (!isTauri()) return null;
  if (!_canvasSchemaInit) {
    _canvasSchemaInit = ensureCanvasSchema().then(() => undefined);
  }
  await _canvasSchemaInit;
  return getDb();
}

function rowToCanvasDto(r: LocalCanvas): CanvasDto {
  const idNum = r.backend_id ?? parseOrHashId(r.local_id, "canvas-");
  return {
    id: idNum,
    title: r.title || "Untitled Canvas",
    scene: r.scene,
    metadata: r.metadata,
    status: (r.status as 0 | 1) ?? 0,
    lastSync: r.last_synced,
    createdBy: null,
  };
}

export async function listCanvasFromSqlite(params?: { page?: number; size?: number }): Promise<PageResult<CanvasDto>> {
  const db = await canvasDb();
  if (!db) return { items: [], total: 0, page: 0, pageSize: 20 };
  const rows: LocalCanvas[] = await db.select(
    "SELECT * FROM canvas WHERE deleted = 0 ORDER BY updated_at DESC"
  );
  const items = rows.map(rowToCanvasDto);
  return {
    items,
    total: items.length,
    page: params?.page ?? 0,
    pageSize: params?.size ?? (items.length || 20),
  };
}

export async function getCanvasFromSqlite(id: number | string): Promise<CanvasDto | null> {
  const db = await canvasDb();
  if (!db) return null;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  const rows: LocalCanvas[] = await db.select(
    "SELECT * FROM canvas WHERE (backend_id = ? OR local_id = ? OR local_id = ?) AND deleted = 0 LIMIT 1",
    [numId || -1, strId, `canvas-${strId}`]
  );
  if (!rows.length) return null;
  return rowToCanvasDto(rows[0]);
}

export async function createCanvasInSqlite(req: CanvasRequest): Promise<CanvasDto> {
  const db = await canvasDb();
  const ts = now();
  let nextId = Date.now();
  if (db) {
    const res = await db.select("SELECT MAX(COALESCE(backend_id, 0)) as max_id FROM canvas");
    if (res && res[0] && typeof res[0].max_id === "number" && res[0].max_id > 0) {
      nextId = res[0].max_id + 1;
    }
  }
  const localId = `canvas-${nextId}`;
  const title = req.title || "Untitled Canvas";
  const scene = req.scene ?? null;
  const metadata = req.metadata ?? null;
  const status = req.status ?? 0;

  if (db) {
    await db.execute(
      `INSERT INTO canvas (local_id, backend_id, title, scene, metadata, status, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [localId, nextId, title, scene, metadata, status, ts]
    );
  }

  return {
    id: nextId,
    title,
    scene,
    metadata,
    status: (status as 0 | 1) ?? 0,
    lastSync: ts,
    createdBy: null,
  };
}

export async function updateCanvasInSqlite(id: number, req: CanvasRequest): Promise<CanvasDto> {
  const db = await canvasDb();
  const ts = now();
  const strId = String(id);

  if (db) {
    await db.execute(
      `UPDATE canvas SET
         title = COALESCE(?, title),
         scene = COALESCE(?, scene),
         metadata = COALESCE(?, metadata),
         status = COALESCE(?, status),
         updated_at = ?
       WHERE backend_id = ? OR local_id = ? OR local_id = ?`,
      [
        req.title ?? null,
        req.scene ?? null,
        req.metadata ?? null,
        req.status ?? null,
        ts,
        id,
        strId,
        `canvas-${strId}`,
      ]
    );
  }

  const existing = await getCanvasFromSqlite(id);
  if (existing) return existing;

  return {
    id,
    title: req.title ?? "Untitled Canvas",
    scene: req.scene ?? null,
    metadata: req.metadata ?? null,
    status: (req.status as 0 | 1) ?? 0,
    lastSync: ts,
    createdBy: null,
  };
}

export async function deleteCanvasFromSqlite(id: number | string): Promise<void> {
  const db = await canvasDb();
  if (!db) return;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  await db.execute(
    "UPDATE canvas SET deleted = 1, updated_at = ? WHERE backend_id = ? OR local_id = ? OR local_id = ?",
    [now(), numId || -1, strId, `canvas-${strId}`]
  );
}

export async function searchCanvasFromSqlite(q: string): Promise<CanvasDto[]> {
  const db = await canvasDb();
  if (!db || !q.trim()) return [];
  const term = `%${q.trim()}%`;
  const rows: LocalCanvas[] = await db.select(
    "SELECT * FROM canvas WHERE (title LIKE ? OR scene LIKE ?) AND deleted = 0 ORDER BY updated_at DESC",
    [term, term]
  );
  return rows.map(rowToCanvasDto);
}
