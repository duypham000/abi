/**
 * Async key-value store backed by SQLite in Tauri.
 * Falls back to localStorage in web/non-Tauri environments.
 */

import { getDb, isTauri } from "./sqliteDb";

let _kvSchemaInit: Promise<void> | null = null;

async function ensureKvSchema() {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

async function kvDb() {
  if (!isTauri()) return null;
  if (!_kvSchemaInit) {
    _kvSchemaInit = ensureKvSchema().then(() => undefined);
  }
  await _kvSchemaInit;
  return getDb();
}

export async function getItem(key: string): Promise<string | null> {
  const db = await kvDb();
  if (!db) return window.localStorage.getItem(key);
  const rows: { value: string }[] = await db.select(
    "SELECT value FROM app_kv WHERE key = ? LIMIT 1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setItem(key: string, value: string): Promise<void> {
  const db = await kvDb();
  if (!db) { window.localStorage.setItem(key, value); return; }
  await db.execute(
    `INSERT INTO app_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function removeItem(key: string): Promise<void> {
  const db = await kvDb();
  if (!db) { window.localStorage.removeItem(key); return; }
  await db.execute("DELETE FROM app_kv WHERE key = ?", [key]);
}
