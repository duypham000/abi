/**
 * Unified SQLite Stale-While-Revalidate (SWR) resource cache + in-memory L1 mirror.
 *
 * Stores feature metadata (auth profile, GitHub account/repos/workspace status,
 * Agent backend metadata, settings, etc.) in `sqlite:tomo-docs.db` (`resource_cache`)
 * with `localStorage` fallback on Web.
 *
 * Cache entries never disappear on TTL expiration; instead `isExpired` signals
 * callers to serve the cached value immediately (0 ms) and revalidate in the
 * background so offline/startup experiences stay seamless.
 */

import { getDb, isTauri } from "./sqliteDb";

export const RESOURCE_CACHE_KEYS = {
  AUTH_ME: "auth:me",
  GITHUB_USER: "github:user",
  GITHUB_REPOS: "github:repos",
  GITHUB_WORKSPACE_STATUS: "github:workspace_status",
  GITHUB_WORKSPACE_MANIFEST: "github:workspace_manifest",
  GITHUB_DIFF: "github:diff",
  GITHUB_CONFLICTS: "github:conflicts",
  AGENT_BACKEND_META: "agent:backend_meta",
  SETTINGS_AUTOSTART: "settings:autostart",
} as const;

export const RESOURCE_CACHE_TTLS = {
  AUTH_ME: 10 * 60 * 1000,
  GITHUB_USER: 5 * 60 * 1000,
  GITHUB_REPOS: 10 * 60 * 1000,
  GITHUB_WORKSPACE_STATUS: 2 * 60 * 1000,
  GITHUB_WORKSPACE_MANIFEST: 5 * 60 * 1000,
  GITHUB_DIFF: 2 * 60 * 1000,
  GITHUB_CONFLICTS: 2 * 60 * 1000,
  AGENT_BACKEND_META: 5 * 60 * 1000,
  SETTINGS_AUTOSTART: 30 * 60 * 1000,
  DEFAULT: 5 * 60 * 1000,
} as const;

interface RawCacheRow {
  cache_key: string;
  data_json: string;
  updated_at: number;
  ttl_ms: number;
}

interface L1CacheEntry<T = unknown> {
  data: T;
  updatedAt: number;
  ttlMs: number;
}

export interface CachedResourceResult<T> {
  data: T;
  updatedAt: number;
  ttlMs: number;
  isExpired: boolean;
}

const WEB_STORAGE_PREFIX = "tomo_rc_:";
const l1Cache = new Map<string, L1CacheEntry<unknown>>();
let _schemaInit: Promise<void> | null = null;
let _preloadPromise: Promise<void> | null = null;
let _preloaded = false;

async function ensureResourceCacheSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS resource_cache (
      cache_key   TEXT PRIMARY KEY,
      data_json   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      ttl_ms      INTEGER NOT NULL
    )
  `);
}

async function rcDb() {
  if (!isTauri()) return null;
  if (!_schemaInit) {
    _schemaInit = ensureResourceCacheSchema().then(() => undefined);
  }
  await _schemaInit;
  return getDb();
}

function toResult<T>(entry: L1CacheEntry<T>): CachedResourceResult<T> {
  const age = Date.now() - entry.updatedAt;
  return {
    data: entry.data,
    updatedAt: entry.updatedAt,
    ttlMs: entry.ttlMs,
    isExpired: entry.ttlMs > 0 ? age > entry.ttlMs : false,
  };
}

/**
 * Load all persisted `resource_cache` rows into the L1 in-memory Map in one
 * query during init so synchronous reads (`getCachedResourceSync`) are instant.
 */
export async function preloadAllCachedResources(force = false): Promise<void> {
  if (_preloaded && !force) return;
  if (_preloadPromise && !force) return _preloadPromise;

  _preloadPromise = (async () => {
    try {
      if (isTauri()) {
        const db = await rcDb();
        if (db) {
          const rows: RawCacheRow[] = await db.select(
            "SELECT cache_key, data_json, updated_at, ttl_ms FROM resource_cache"
          );
          for (const row of rows) {
            try {
              const parsed = JSON.parse(row.data_json) as unknown;
              l1Cache.set(row.cache_key, {
                data: parsed,
                updatedAt: Number(row.updated_at) || 0,
                ttlMs: Number(row.ttl_ms) || RESOURCE_CACHE_TTLS.DEFAULT,
              });
            } catch {
              // ignore corrupt JSON row
            }
          }
        }
      } else if (typeof window !== "undefined" && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const fullKey = window.localStorage.key(i);
          if (!fullKey || !fullKey.startsWith(WEB_STORAGE_PREFIX)) continue;
          const cacheKey = fullKey.slice(WEB_STORAGE_PREFIX.length);
          const raw = window.localStorage.getItem(fullKey);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as L1CacheEntry<unknown>;
            if (parsed && "data" in parsed) {
              l1Cache.set(cacheKey, parsed);
            }
          } catch {
            // ignore corrupt web cache entry
          }
        }
      }
      _preloaded = true;
    } catch {
      // non-fatal during init
    } finally {
      _preloadPromise = null;
    }
  })();

  return _preloadPromise;
}

/**
 * Synchronous L1 cache read (populated by `preloadAllCachedResources()`).
 */
export function getCachedResourceSync<T>(key: string): CachedResourceResult<T> | null {
  const entry = l1Cache.get(key) as L1CacheEntry<T> | undefined;
  if (!entry) return null;
  return toResult(entry);
}

/**
 * Read a cached resource from L1 memory or SQLite/localStorage.
 */
export async function getCachedResource<T>(key: string): Promise<CachedResourceResult<T> | null> {
  const inMem = l1Cache.get(key) as L1CacheEntry<T> | undefined;
  if (inMem) {
    return toResult(inMem);
  }

  try {
    if (isTauri()) {
      const db = await rcDb();
      if (!db) return null;
      const rows: RawCacheRow[] = await db.select(
        "SELECT cache_key, data_json, updated_at, ttl_ms FROM resource_cache WHERE cache_key = ? LIMIT 1",
        [key]
      );
      if (!rows[0]) return null;
      const parsed = JSON.parse(rows[0].data_json) as T;
      const entry: L1CacheEntry<T> = {
        data: parsed,
        updatedAt: Number(rows[0].updated_at) || 0,
        ttlMs: Number(rows[0].ttl_ms) || RESOURCE_CACHE_TTLS.DEFAULT,
      };
      l1Cache.set(key, entry);
      return toResult(entry);
    }

    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(`${WEB_STORAGE_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as L1CacheEntry<T>;
      if (!parsed || !("data" in parsed)) return null;
      l1Cache.set(key, parsed);
      return toResult(parsed);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Write-through update to both L1 memory and SQLite `resource_cache` (or localStorage).
 */
export async function setCachedResource<T>(
  key: string,
  data: T,
  ttlMs: number = RESOURCE_CACHE_TTLS.DEFAULT
): Promise<void> {
  const updatedAt = Date.now();
  const entry: L1CacheEntry<T> = { data, updatedAt, ttlMs };
  l1Cache.set(key, entry);

  try {
    if (isTauri()) {
      const db = await rcDb();
      if (!db) return;
      await db.execute(
        `INSERT INTO resource_cache (cache_key, data_json, updated_at, ttl_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           data_json  = excluded.data_json,
           updated_at = excluded.updated_at,
           ttl_ms     = excluded.ttl_ms`,
        [key, JSON.stringify(data), updatedAt, ttlMs]
      );
      return;
    }

    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(`${WEB_STORAGE_PREFIX}${key}`, JSON.stringify(entry));
    }
  } catch {
    // non-fatal cache write failure
  }
}

export async function removeCachedResource(key: string): Promise<void> {
  l1Cache.delete(key);
  try {
    if (isTauri()) {
      const db = await rcDb();
      if (!db) return;
      await db.execute("DELETE FROM resource_cache WHERE cache_key = ?", [key]);
      return;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(`${WEB_STORAGE_PREFIX}${key}`);
    }
  } catch {
    // non-fatal
  }
}

export async function clearCachedResourcesByPrefix(prefix: string): Promise<void> {
  for (const key of Array.from(l1Cache.keys())) {
    if (key.startsWith(prefix)) {
      l1Cache.delete(key);
    }
  }
  try {
    if (isTauri()) {
      const db = await rcDb();
      if (!db) return;
      await db.execute("DELETE FROM resource_cache WHERE cache_key LIKE ?", [`${prefix}%`]);
      return;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      const fullPrefix = `${WEB_STORAGE_PREFIX}${prefix}`;
      const toRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // non-fatal
  }
}
