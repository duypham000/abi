import NodeCache from 'node-cache';
import { config } from '../../config.js';
import { TranslationResult } from '../types/dictionary.js';

/**
 * In-memory TTL cache. Once a word is translated by Google we keep the parsed
 * result for CACHE_TTL_SECONDS so any later lookup (by any user) is served from
 * RAM with zero requests to Google — the core defense from docs/ratelimit.md §2.
 *
 * Swap this module for a Redis-backed implementation (same getter/setter
 * signatures) to share the cache across instances.
 */
const cache = new NodeCache({
  stdTTL: config.cacheTtlSeconds,
  checkperiod: Math.min(600, config.cacheTtlSeconds),
  useClones: false,
});

/** Build a normalized cache key from the language pair and query. */
export function cacheKey(
  sourceLang: string,
  targetLang: string,
  query: string,
): string {
  return `${sourceLang}:${targetLang}:${query.trim().toLowerCase()}`;
}

export function getCached(key: string): TranslationResult | undefined {
  return cache.get<TranslationResult>(key);
}

export function setCached(key: string, value: TranslationResult): void {
  cache.set(key, value);
}

export const cacheStats = () => cache.getStats();
