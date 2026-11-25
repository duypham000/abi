import { parseOrHashId } from "@/core/utils/idUtils";
import type { DocDto, DocRequest } from "@/core/interfaces/docs";
import type { PageResult } from "@/infrastructure/api/baseApi";
import { getDb, isTauri, now } from "./sqliteDb";
import {
  computeDocLocalHashSync,
  computeDocRemoteHashSync,
  normalizeDocStatusValue,
} from "@/core/utils/contentHash";

export interface LocalDoc {
  local_id: string;
  backend_id: number | null;
  backend_uuid?: string | null;
  slug?: string | null;
  title: string;
  content: string | null;
  metadata: string | null;
  plain_text: string | null;
  yjs_state: string | null;
  series_id?: number | null;
  status: number;
  last_synced: string | null;
  updated_at: string;
  is_dirty: number;
  content_hash?: string | null;
  synced_hash?: string | null;
}

export interface DocSyncSnapshot {
  doc: DocDto;
  localHash: string;
  remoteHash: string;
  syncedHash: string | null;
  hasUnsyncedRemoteChanges: boolean;
  backendUuid: string | null;
}

export interface SaveDocLocallyOptions {
  isDirty?: boolean;
  markRemoteSynced?: boolean;
  confirmedRemoteHash?: string | null;
  preserveSyncedHash?: boolean;
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
      series_id   INTEGER,
      synced_hash TEXT
    )
  `);
  try { await db.execute(`ALTER TABLE docs ADD COLUMN yjs_state TEXT`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE docs ADD COLUMN series_id INTEGER`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE docs ADD COLUMN backend_uuid TEXT`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE docs ADD COLUMN content_hash TEXT`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE docs ADD COLUMN slug TEXT`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE docs ADD COLUMN synced_hash TEXT`); } catch { /* already exists */ }
}

async function docDb() {
  if (!isTauri()) return null;
  if (!_docSchemaInit) {
    _docSchemaInit = ensureDocSchema().then(() => undefined);
  }
  await _docSchemaInit;
  return getDb();
}

export function normalizeDocStatus(status: unknown): 0 | 1 {
  return normalizeDocStatusValue(status);
}

function rowToDocDto(r: LocalDoc): DocDto {
  const idNum = r.backend_id ?? parseOrHashId(r.local_id, "doc-");
  return {
    id: idNum,
    title: r.title || "Untitled",
    content: r.content,
    plainText: r.plain_text,
    metadata: r.metadata,
    seriesId: r.series_id ?? null,
    status: normalizeDocStatus(r.status),
    lastSync: r.last_synced,
    createdBy: null,
    yjsState: r.yjs_state ?? null,
    backendUuid: r.backend_uuid ?? null,
    slug: r.slug ?? null,
    localHash: r.content_hash ?? null,
    syncedHash: r.synced_hash ?? null,
  };
}

function computeRowSyncState(row: LocalDoc): {
  localHash: string;
  remoteHash: string;
  syncedHash: string | null;
  hasUnsyncedRemoteChanges: boolean;
} {
  const localHash = computeDocLocalHashSync({
    title: row.title,
    content: row.content,
    metadata: row.metadata,
    seriesId: row.series_id ?? null,
    status: row.status,
  });
  const remoteHash = computeDocRemoteHashSync({
    title: row.title,
    content: row.content,
    status: row.status,
  });
  const syncedHash =
    row.synced_hash != null
      ? row.synced_hash
      : row.backend_uuid && row.is_dirty === 0
        ? remoteHash
        : null;
  const hasUnsyncedRemoteChanges = row.is_dirty === 1 && (!row.backend_uuid || remoteHash !== syncedHash);
  return { localHash, remoteHash, syncedHash, hasUnsyncedRemoteChanges };
}

const DOC_SELECT_COLS =
  "local_id, backend_id, backend_uuid, slug, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty, content_hash, synced_hash";

function extractNumericDocId(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (n > 0) return n;
    }
    const m = trimmed.match(/^doc-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > 0) return n;
    }
  }
  return null;
}

async function findLocalDocRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  id: number | string,
  slug?: string | null
): Promise<LocalDoc | null> {
  const slugNum = extractNumericDocId(slug);
  const idNum = extractNumericDocId(id);
  const numId = idNum ?? slugNum ?? -1;
  const strId = String(id);
  const slugStr = slug ?? "";
  const withDocPrefix = strId.startsWith("doc-") ? strId : `doc-${strId}`;
  const slugWithDocPrefix = slugStr && !slugStr.startsWith("doc-") ? `doc-${slugStr}` : slugStr;

  const rows: LocalDoc[] = await db.select(
    `SELECT ${DOC_SELECT_COLS} FROM docs
     WHERE backend_id = ?
        OR backend_uuid = ?
        OR local_id = ?
        OR local_id = ?
        OR slug = ?
        OR (? != '' AND (slug = ? OR slug = ? OR local_id = ? OR local_id = ?))
     LIMIT 1`,
    [
      numId > 0 ? numId : -1,
      strId,
      strId,
      withDocPrefix,
      strId,
      slugStr,
      slugStr,
      slugWithDocPrefix,
      slugStr,
      slugWithDocPrefix,
    ]
  );
  if (rows.length > 0) return rows[0];

  // Backfill legacy rows where UUID backend ids left backend_id = NULL
  if (numId > 0) {
    const nullRows: LocalDoc[] = await db.select(
      `SELECT ${DOC_SELECT_COLS} FROM docs WHERE backend_id IS NULL`
    );
    const matched = nullRows.find((r) => parseOrHashId(r.local_id, "doc-") === numId);
    if (matched) {
      await db.execute("UPDATE docs SET backend_id = ? WHERE local_id = ?", [numId, matched.local_id]);
      matched.backend_id = numId;
      return matched;
    }
  }
  return null;
}

// ─── SQLite Full CRUD API for Docs ─────────────────────────────────────────

const DOC_NUMERIC_LOCAL_ID_RE = /^doc-(\d+)$/;

function pickPreferredDocRow(a: LocalDoc, b: LocalDoc): LocalDoc {
  const aNumeric = DOC_NUMERIC_LOCAL_ID_RE.test(a.local_id) || (a.slug ? DOC_NUMERIC_LOCAL_ID_RE.test(a.slug) : false);
  const bNumeric = DOC_NUMERIC_LOCAL_ID_RE.test(b.local_id) || (b.slug ? DOC_NUMERIC_LOCAL_ID_RE.test(b.slug) : false);
  if (aNumeric !== bNumeric) return aNumeric ? a : b;
  const aDocPrefix = (a.slug ?? "").startsWith("doc-");
  const bDocPrefix = (b.slug ?? "").startsWith("doc-");
  if (aDocPrefix !== bDocPrefix) return aDocPrefix ? a : b;
  if (Boolean(a.backend_uuid) !== Boolean(b.backend_uuid)) return a.backend_uuid ? a : b;
  return a.updated_at >= b.updated_at ? a : b;
}

/**
 * Deduplicate local SQLite doc rows caused by legacy auto-slugged docs vs `doc-<id>` Git docs.
 */
export async function deduplicateLocalDocs(): Promise<number> {
  const db = await docDb();
  if (!db) return 0;

  const rows: LocalDoc[] = await db.select(`SELECT ${DOC_SELECT_COLS} FROM docs ORDER BY updated_at DESC`);
  if (rows.length < 2) return 0;

  const toDelete = new Set<string>();

  // 1. Multiple rows sharing the same backend_uuid
  const byUuid = new Map<string, LocalDoc[]>();
  for (const row of rows) {
    if (!row.backend_uuid) continue;
    const list = byUuid.get(row.backend_uuid) ?? [];
    list.push(row);
    byUuid.set(row.backend_uuid, list);
  }
  for (const group of byUuid.values()) {
    if (group.length < 2) continue;
    let keeper = group[0];
    for (let i = 1; i < group.length; i++) {
      keeper = pickPreferredDocRow(keeper, group[i]);
    }
    for (const row of group) {
      if (row.local_id !== keeper.local_id) {
        toDelete.add(row.local_id);
      }
    }
  }

  // 2. Legacy pair: one row with slug "doc-*" and another with auto-generated slug ending "-<uuid8>"
  const remaining = rows.filter((r) => !toDelete.has(r.local_id));
  const docSlugRows = remaining.filter((r) => (r.slug ?? "").startsWith("doc-") || DOC_NUMERIC_LOCAL_ID_RE.test(r.local_id));
  for (const row of remaining) {
    if (!row.backend_uuid || !row.slug || row.slug.startsWith("doc-")) continue;
    const uuidPrefix = row.backend_uuid.slice(0, 8);
    if (!uuidPrefix || !row.slug.endsWith(`-${uuidPrefix}`)) continue;

    const match = docSlugRows.find(
      (candidate) =>
        candidate.local_id !== row.local_id &&
        candidate.title === row.title &&
        (candidate.content ?? "") === (row.content ?? "")
    );
    if (match) {
      toDelete.add(row.local_id);
    }
  }

  for (const localId of toDelete) {
    await db.execute(`DELETE FROM docs WHERE local_id = ?`, [localId]);
  }
  return toDelete.size;
}

export async function listDocsFromSqlite(params?: { page?: number; size?: number; seriesId?: number }): Promise<PageResult<DocDto>> {
  const db = await docDb();
  if (!db) return { items: [], total: 0, page: 0, pageSize: 20 };
  await deduplicateLocalDocs();
  let rows: LocalDoc[];
  if (params?.seriesId) {
    rows = await db.select(`SELECT ${DOC_SELECT_COLS} FROM docs WHERE series_id = ? ORDER BY updated_at DESC`, [params.seriesId]);
  } else {
    rows = await db.select(`SELECT ${DOC_SELECT_COLS} FROM docs ORDER BY updated_at DESC`);
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
  const row = await findLocalDocRow(db, id);
  if (!row) return null;
  return rowToDocDto(row);
}

export async function getDocSyncSnapshot(backendId: number | string): Promise<DocSyncSnapshot | null> {
  const db = await docDb();
  if (!db) return null;
  const row = await findLocalDocRow(db, backendId);
  if (!row) return null;
  const sync = computeRowSyncState(row);
  const dto = rowToDocDto(row);
  dto.localHash = sync.localHash;
  dto.syncedHash = sync.syncedHash;
  return {
    doc: dto,
    localHash: sync.localHash,
    remoteHash: sync.remoteHash,
    syncedHash: sync.syncedHash,
    hasUnsyncedRemoteChanges: sync.hasUnsyncedRemoteChanges,
    backendUuid: row.backend_uuid ?? null,
  };
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
  const status = normalizeDocStatus(req.status);
  const localHash = computeDocLocalHashSync({ title, content, metadata, seriesId, status });

  if (db) {
    await db.execute(
      `INSERT INTO docs (local_id, backend_id, title, content, metadata, plain_text, series_id, status, updated_at, is_dirty, content_hash, synced_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)`,
      [localId, nextId, title, content, metadata, plainText, seriesId, status, ts, localHash]
    );
  }

  return {
    id: nextId,
    title,
    content,
    plainText,
    metadata,
    seriesId,
    status,
    lastSync: ts,
    createdBy: null,
    yjsState: null,
    localHash,
    syncedHash: null,
  };
}

export async function updateDocInSqlite(id: number, req: DocRequest): Promise<DocDto> {
  const db = await docDb();
  const ts = now();
  const normalizedStatus =
    req.status !== undefined && req.status !== null ? normalizeDocStatus(req.status) : null;

  if (db) {
    const existingRow = await findLocalDocRow(db, id);
    if (existingRow) {
      const mergedTitle = req.title ?? existingRow.title;
      const mergedContent = req.content !== undefined ? req.content : existingRow.content;
      const mergedMetadata = req.metadata !== undefined ? req.metadata : existingRow.metadata;
      const mergedPlainText = req.plainText !== undefined ? req.plainText : existingRow.plain_text;
      const mergedSeriesId = "seriesId" in req ? (req.seriesId ?? null) : (existingRow.series_id ?? null);
      const mergedStatus = normalizedStatus ?? normalizeDocStatus(existingRow.status);

      const localHash = computeDocLocalHashSync({
        title: mergedTitle,
        content: mergedContent,
        metadata: mergedMetadata,
        seriesId: mergedSeriesId,
        status: mergedStatus,
      });
      const remoteHash = computeDocRemoteHashSync({
        title: mergedTitle,
        content: mergedContent,
        status: mergedStatus,
      });
      const existingSync = computeRowSyncState(existingRow);
      const isDirtyVal = !existingRow.backend_uuid || remoteHash !== existingSync.syncedHash ? 1 : 0;

      await db.execute(
        `UPDATE docs SET
           title = ?,
           content = ?,
           metadata = ?,
           plain_text = ?,
           series_id = ?,
           status = ?,
           content_hash = ?,
           synced_hash = ?,
           is_dirty = ?,
           updated_at = ?
         WHERE local_id = ?`,
        [
          mergedTitle,
          mergedContent,
          mergedMetadata,
          mergedPlainText,
          mergedSeriesId,
          mergedStatus,
          localHash,
          existingSync.syncedHash,
          isDirtyVal,
          ts,
          existingRow.local_id,
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
    seriesId: req.seriesId ?? null,
    status: normalizeDocStatus(req.status),
    lastSync: ts,
    createdBy: null,
  };
}

export async function deleteDocFromSqlite(id: number | string): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const row = await findLocalDocRow(db, id);
  if (row) {
    await db.execute("DELETE FROM docs WHERE local_id = ?", [row.local_id]);
  }
}

export async function searchDocsInSqlite(q: string): Promise<DocDto[]> {
  const db = await docDb();
  if (!db || !q.trim()) return [];
  const term = `%${q.trim()}%`;
  const rows: LocalDoc[] = await db.select(
    `SELECT ${DOC_SELECT_COLS} FROM docs WHERE title LIKE ? OR plain_text LIKE ? OR content LIKE ? ORDER BY updated_at DESC`,
    [term, term, term]
  );
  return rows.map(rowToDocDto);
}

// ─── Legacy Cache / Draft exports ──────────────────────────────────────────

export async function cacheDoc(doc: DocDto, opts?: { force?: boolean }): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const rawObj = doc as unknown as Record<string, unknown>;
  const rawId = rawObj.id;
  const uuid =
    doc.backendUuid ??
    (typeof rawId === "string" && rawId.length > 10 ? rawId : null);
  const slug = doc.slug ?? (typeof rawObj.slug === "string" ? rawObj.slug : null);
  const slugNumId = extractNumericDocId(slug);
  const resolvedId: number | string =
    typeof rawId === "number" && rawId > 0
      ? rawId
      : slugNumId ?? (uuid ?? String(rawId ?? Date.now()));

  const existing = await findLocalDocRow(db, resolvedId, slug);
  if (existing && !opts?.force) {
    const sync = computeRowSyncState(existing);
    if (sync.hasUnsyncedRemoteChanges) {
      // Protect unsaved local edits: only backfill missing remote identity/slug
      if ((uuid && !existing.backend_uuid) || (slug && !existing.slug)) {
        await db.execute(
          "UPDATE docs SET backend_uuid = COALESCE(backend_uuid, ?), slug = COALESCE(slug, ?) WHERE local_id = ?",
          [uuid, slug, existing.local_id]
        );
      }
      return;
    }
  }

  const targetKey = existing?.backend_id ?? resolvedId;
  await saveDocLocally(
    targetKey,
    {
      title: doc.title,
      content: doc.content,
      metadata: doc.metadata,
      plainText: doc.plainText,
      status: doc.status,
      yjsState: doc.yjsState,
      seriesId: doc.seriesId,
      backendUuid: uuid,
      slug,
    },
    { markRemoteSynced: Boolean(uuid || opts?.force), isDirty: false }
  );
}

export async function getCachedDoc(backendId: number): Promise<DocDto | null> {
  return getDocFromSqlite(backendId);
}

export async function getCachedDocWithDirty(backendId: number): Promise<{ doc: DocDto | null; isDirty: boolean }> {
  const db = await docDb();
  if (!db) return { doc: null, isDirty: false };
  const row = await findLocalDocRow(db, backendId);
  if (!row) return { doc: null, isDirty: false };
  const sync = computeRowSyncState(row);
  return {
    doc: rowToDocDto(row),
    isDirty: sync.hasUnsyncedRemoteChanges,
  };
}

export async function isContentChanged(
  backendId: number,
  fields: { title?: string | null; content?: string | null; metadata?: string | null; seriesId?: number | null; status?: number | string | null }
): Promise<boolean> {
  const db = await docDb();
  if (!db) return true;
  const row = await findLocalDocRow(db, backendId);
  if (!row) return true;
  const currentLocalHash = computeDocLocalHashSync({
    title: row.title,
    content: row.content,
    metadata: row.metadata,
    seriesId: row.series_id ?? null,
    status: row.status,
  });
  const newHash = computeDocLocalHashSync({
    title: fields.title !== undefined ? fields.title : row.title,
    content: fields.content !== undefined ? fields.content : row.content,
    metadata: fields.metadata !== undefined ? fields.metadata : row.metadata,
    seriesId: "seriesId" in fields ? (fields.seriesId ?? null) : (row.series_id ?? null),
    status: fields.status !== undefined && fields.status !== null ? fields.status : row.status,
  });
  return currentLocalHash !== newHash;
}

export async function saveDocLocally(
  backendId: number | string,
  fields: {
    title?: string;
    content?: string | null;
    metadata?: string | null;
    plainText?: string | null;
    status?: number | string;
    yjsState?: string | null;
    seriesId?: number | null;
    backendUuid?: string | null;
    slug?: string | null;
  },
  isDirtyOrOpts: boolean | SaveDocLocallyOptions = false
): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const opts: SaveDocLocallyOptions =
    typeof isDirtyOrOpts === "boolean" ? { isDirty: isDirtyOrOpts } : isDirtyOrOpts;

  const ts = now();
  const strId = String(backendId);
  const numId = typeof backendId === "number" ? backendId : Number(backendId);
  const uuid = fields.backendUuid ?? (typeof backendId === "string" && backendId.length > 10 ? backendId : null);
  const slug = fields.slug ?? null;
  const normalizedStatus =
    fields.status !== undefined && fields.status !== null ? normalizeDocStatus(fields.status) : null;

  let existing = await findLocalDocRow(db, backendId, slug);

  if (existing) {
    const mergedTitle = fields.title !== undefined ? fields.title : existing.title;
    const mergedContent = fields.content !== undefined ? fields.content : existing.content;
    const mergedMetadata = fields.metadata !== undefined ? fields.metadata : existing.metadata;
    const mergedPlainText = fields.plainText !== undefined ? fields.plainText : existing.plain_text;
    const mergedYjsState = fields.yjsState !== undefined ? fields.yjsState : existing.yjs_state;
    const mergedSeriesId = "seriesId" in fields ? (fields.seriesId ?? null) : (existing.series_id ?? null);
    const mergedStatus = normalizedStatus ?? normalizeDocStatus(existing.status);
    const resolvedUuid = uuid ?? existing.backend_uuid ?? null;

    const localHash = computeDocLocalHashSync({
      title: mergedTitle,
      content: mergedContent,
      metadata: mergedMetadata,
      seriesId: mergedSeriesId,
      status: mergedStatus,
    });
    const remoteHash = computeDocRemoteHashSync({
      title: mergedTitle,
      content: mergedContent,
      status: mergedStatus,
    });

    const existingSync = computeRowSyncState(existing);
    let nextSyncedHash = existingSync.syncedHash;
    if (opts.markRemoteSynced) {
      nextSyncedHash = opts.confirmedRemoteHash ?? remoteHash;
    } else if (!opts.preserveSyncedHash && typeof isDirtyOrOpts === "boolean" && !isDirtyOrOpts && resolvedUuid) {
      nextSyncedHash = remoteHash;
    }

    const derivedDirty = !resolvedUuid || remoteHash !== nextSyncedHash;
    const isDirtyInt = opts.isDirty === true || derivedDirty ? 1 : 0;

    await db.execute(
      `UPDATE docs SET
         title = ?,
         content = ?,
         metadata = ?,
         plain_text = ?,
         yjs_state = ?,
         series_id = ?,
         status = ?,
         backend_uuid = COALESCE(?, backend_uuid),
         slug = COALESCE(?, slug),
         is_dirty = ?,
         content_hash = ?,
         synced_hash = ?,
         last_synced = CASE WHEN ? THEN ? ELSE last_synced END,
         updated_at = ?
       WHERE local_id = ?`,
      [
        mergedTitle,
        mergedContent,
        mergedMetadata,
        mergedPlainText,
        mergedYjsState,
        mergedSeriesId,
        mergedStatus,
        uuid,
        slug,
        isDirtyInt,
        localHash,
        nextSyncedHash,
        opts.markRemoteSynced ? 1 : 0,
        ts,
        ts,
        existing.local_id,
      ]
    );
    if (resolvedUuid) {
      await db.execute(`DELETE FROM docs WHERE backend_uuid = ? AND local_id != ?`, [resolvedUuid, existing.local_id]);
    }
  } else {
    const localId = strId.startsWith("doc-") ? strId : `doc-${strId}`;
    const resolvedNumId = !isNaN(numId) && numId > 0 ? numId : parseOrHashId(localId, "doc-");
    const title = fields.title || "Untitled";
    const content = fields.content ?? null;
    const metadata = fields.metadata ?? null;
    const plainText = fields.plainText ?? null;
    const yjsState = fields.yjsState ?? null;
    const seriesId = fields.seriesId ?? null;
    const status = normalizeDocStatus(fields.status);

    const localHash = computeDocLocalHashSync({ title, content, metadata, seriesId, status });
    const remoteHash = computeDocRemoteHashSync({ title, content, status });

    let nextSyncedHash: string | null = null;
    if (opts.markRemoteSynced && uuid) {
      nextSyncedHash = opts.confirmedRemoteHash ?? remoteHash;
    } else if (!opts.preserveSyncedHash && typeof isDirtyOrOpts === "boolean" && !isDirtyOrOpts && uuid) {
      nextSyncedHash = remoteHash;
    }

    const derivedDirty = !uuid || remoteHash !== nextSyncedHash;
    const isDirtyInt = opts.isDirty === true || derivedDirty ? 1 : 0;

    await db.execute(
      `INSERT INTO docs (local_id, backend_id, title, content, metadata, plain_text, yjs_state, series_id, status, last_synced, updated_at, is_dirty, backend_uuid, slug, content_hash, synced_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        localId,
        resolvedNumId,
        title,
        content,
        metadata,
        plainText,
        yjsState,
        seriesId,
        status,
        nextSyncedHash ? ts : null,
        ts,
        isDirtyInt,
        uuid,
        slug,
        localHash,
        nextSyncedHash,
      ]
    );
  }
}

export async function clearBackendUuid(id: number | string): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const row = await findLocalDocRow(db, id);
  if (row && (row.backend_uuid || row.synced_hash)) {
    await db.execute(
      "UPDATE docs SET backend_uuid = NULL, synced_hash = NULL, is_dirty = 1 WHERE local_id = ?",
      [row.local_id]
    );
  }
}

export async function linkRemoteDocToLocal(
  localId: number,
  remoteDoc: Record<string, unknown>,
  opts?: { force?: boolean; confirmedRemoteHash?: string | null }
): Promise<DocDto | null> {
  const db = await docDb();
  if (!db) return null;

  const remoteUuid =
    typeof remoteDoc.id === "string" && remoteDoc.id.length > 10
      ? remoteDoc.id
      : (remoteDoc.backendUuid as string | null) ?? null;
  const slug = (remoteDoc.slug as string | null) ?? null;
  const title = typeof remoteDoc.title === "string" ? remoteDoc.title : undefined;
  const content = typeof remoteDoc.content === "string" ? remoteDoc.content : undefined;
  const status = normalizeDocStatus(remoteDoc.status);

  let existing = await findLocalDocRow(db, localId, slug);

  if (existing) {
    const existingSync = computeRowSyncState(existing);
    if (existingSync.hasUnsyncedRemoteChanges && !opts?.force) {
      if ((remoteUuid && !existing.backend_uuid) || (slug && !existing.slug)) {
        await db.execute(
          `UPDATE docs SET backend_uuid = COALESCE(backend_uuid, ?), slug = COALESCE(slug, ?) WHERE local_id = ?`,
          [remoteUuid, slug, existing.local_id]
        );
      }
      const updated = await findLocalDocRow(db, existing.local_id);
      return updated ? rowToDocDto(updated) : null;
    }

    const ts = now();
    const mergedTitle = opts?.confirmedRemoteHash ? existing.title : (title ?? existing.title);
    const mergedContent = opts?.confirmedRemoteHash ? existing.content : (content ?? existing.content);
    const resolvedUuid = remoteUuid ?? existing.backend_uuid ?? null;
    const localHash = computeDocLocalHashSync({
      title: mergedTitle,
      content: mergedContent,
      metadata: existing.metadata,
      seriesId: existing.series_id ?? null,
      status,
    });
    const remoteHash = computeDocRemoteHashSync({
      title: mergedTitle,
      content: mergedContent,
      status,
    });
    const nextSyncedHash = resolvedUuid ? (opts?.confirmedRemoteHash ?? remoteHash) : null;
    const nextDirty = !resolvedUuid || remoteHash !== nextSyncedHash ? 1 : 0;

    await db.execute(
      `UPDATE docs SET
         backend_uuid = COALESCE(?, backend_uuid),
         slug = COALESCE(?, slug),
         title = ?,
         content = ?,
         status = ?,
         is_dirty = ?,
         last_synced = ?,
         updated_at = ?,
         content_hash = ?,
         synced_hash = ?
       WHERE local_id = ?`,
      [
        remoteUuid,
        slug,
        mergedTitle,
        mergedContent,
        status,
        nextDirty,
        ts,
        ts,
        localHash,
        nextSyncedHash,
        existing.local_id,
      ]
    );
    const updated = await findLocalDocRow(db, existing.local_id);
    return updated ? rowToDocDto(updated) : null;
  }

  await saveDocLocally(
    remoteUuid ?? localId,
    { title, content, status, backendUuid: remoteUuid, slug },
    {
      markRemoteSynced: Boolean(remoteUuid),
      confirmedRemoteHash: opts?.confirmedRemoteHash ?? null,
    }
  );
  return getDocFromSqlite(remoteUuid ?? localId);
}

export async function markRemoteSynced(
  backendId: number | string,
  confirmedRemoteHash: string,
  backendUuid?: string | null
): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const row = await findLocalDocRow(db, backendId);
  if (!row) return;
  const currentRemoteHash = computeDocRemoteHashSync({
    title: row.title,
    content: row.content,
    status: row.status,
  });
  const isDirtyInt = currentRemoteHash !== confirmedRemoteHash ? 1 : 0;
  await db.execute(
    `UPDATE docs SET
       synced_hash = ?,
       backend_uuid = COALESCE(?, backend_uuid),
       last_synced = ?,
       is_dirty = ?
     WHERE local_id = ?`,
    [confirmedRemoteHash, backendUuid ?? null, now(), isDirtyInt, row.local_id]
  );
}

export async function markClean(backendId: number): Promise<void> {
  const db = await docDb();
  if (!db) return;
  const row = await findLocalDocRow(db, backendId);
  if (row) {
    const remoteHash = computeDocRemoteHashSync({
      title: row.title,
      content: row.content,
      status: row.status,
    });
    await db.execute(
      "UPDATE docs SET is_dirty = 0, synced_hash = ?, last_synced = ? WHERE local_id = ?",
      [remoteHash, now(), row.local_id]
    );
  }
}

export async function getPendingSync(): Promise<(LocalDoc & { backend_id: number })[]> {
  return [];
}
