import type { SeriesDto, SeriesRequest } from "@/core/interfaces/series";
import type { PageResult } from "@/infrastructure/api/baseApi";
import { getDb, isTauri, now } from "./sqliteDb";

export interface LocalSeries {
  local_id: string;
  backend_id: number | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

let _seriesSchemaInit: Promise<void> | null = null;

async function ensureSeriesSchema() {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series (
      local_id    TEXT    PRIMARY KEY,
      backend_id  INTEGER,
      name        TEXT    NOT NULL,
      description TEXT,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    )
  `);
}

async function seriesDb() {
  if (!isTauri()) return null;
  if (!_seriesSchemaInit) {
    _seriesSchemaInit = ensureSeriesSchema().then(() => undefined);
  }
  await _seriesSchemaInit;
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

function rowToSeriesDto(r: LocalSeries): SeriesDto {
  const idNum = r.backend_id ?? parseOrHashId(r.local_id, "series-");
  return {
    id: idNum,
    name: r.name,
    description: r.description,
    createdBy: null,
    createdDate: r.created_at,
    lastModifiedDate: r.updated_at,
  };
}

export async function listSeriesFromSqlite(params?: { page?: number; size?: number }): Promise<PageResult<SeriesDto>> {
  const db = await seriesDb();
  if (!db) return { items: [], total: 0, page: 0, pageSize: 20 };
  const rows: LocalSeries[] = await db.select(
    "SELECT * FROM series ORDER BY updated_at DESC"
  );
  const items = rows.map(rowToSeriesDto);
  return {
    items,
    total: items.length,
    page: params?.page ?? 0,
    pageSize: params?.size ?? (items.length || 20),
  };
}

export async function getSeriesFromSqlite(id: number | string): Promise<SeriesDto | null> {
  const db = await seriesDb();
  if (!db) return null;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  const rows: LocalSeries[] = await db.select(
    "SELECT * FROM series WHERE backend_id = ? OR local_id = ? OR local_id = ? LIMIT 1",
    [numId || -1, strId, `series-${strId}`]
  );
  if (!rows.length) return null;
  return rowToSeriesDto(rows[0]);
}

export async function createSeriesInSqlite(req: SeriesRequest): Promise<SeriesDto> {
  const db = await seriesDb();
  const ts = now();
  let nextId = Date.now();
  if (db) {
    const res: any[] = await db.select("SELECT MAX(COALESCE(backend_id, 0)) as max_id FROM series");
    if (res && res[0] && typeof res[0].max_id === "number" && res[0].max_id > 0) {
      nextId = res[0].max_id + 1;
    }
  }
  const localId = `series-${nextId}`;
  const name = req.name || "Untitled Series";
  const description = req.description ?? null;

  if (db) {
    await db.execute(
      `INSERT INTO series (local_id, backend_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [localId, nextId, name, description, ts, ts]
    );
  }

  return {
    id: nextId,
    name,
    description,
    createdBy: null,
    createdDate: ts,
    lastModifiedDate: ts,
  };
}

export async function updateSeriesInSqlite(id: number, req: SeriesRequest): Promise<SeriesDto> {
  const db = await seriesDb();
  const ts = now();
  const strId = String(id);

  if (db) {
    await db.execute(
      `UPDATE series SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         updated_at = ?
       WHERE backend_id = ? OR local_id = ? OR local_id = ?`,
      [
        req.name ?? null,
        req.description ?? null,
        ts,
        id,
        strId,
        `series-${strId}`,
      ]
    );
  }

  const existing = await getSeriesFromSqlite(id);
  if (existing) return existing;

  return {
    id,
    name: req.name ?? "Untitled Series",
    description: req.description ?? null,
    createdBy: null,
    createdDate: ts,
    lastModifiedDate: ts,
  };
}

export async function deleteSeriesFromSqlite(id: number | string): Promise<void> {
  const db = await seriesDb();
  if (!db) return;
  const numId = typeof id === "number" ? id : Number(id);
  const strId = String(id);
  await db.execute(
    "DELETE FROM series WHERE backend_id = ? OR local_id = ? OR local_id = ?",
    [numId || -1, strId, `series-${strId}`]
  );
  await db.execute(
    "UPDATE docs SET series_id = NULL WHERE series_id = ?",
    [numId || -1]
  );
}

export async function searchSeriesInSqlite(q: string): Promise<SeriesDto[]> {
  const db = await seriesDb();
  if (!db || !q.trim()) return [];
  const term = `%${q.trim()}%`;
  const rows: LocalSeries[] = await db.select(
    "SELECT * FROM series WHERE name LIKE ? OR description LIKE ? ORDER BY updated_at DESC",
    [term, term]
  );
  return rows.map(rowToSeriesDto);
}

export async function cacheSeries(series: SeriesDto): Promise<void> {
  const db = await seriesDb();
  if (!db) return;
  const ts = now();
  const localId = `series-${series.id}`;
  await db.execute(
    `INSERT INTO series (local_id, backend_id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(local_id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       updated_at = excluded.updated_at`,
    [localId, series.id, series.name, series.description ?? null, series.createdDate || ts, series.lastModifiedDate || ts]
  );
}
