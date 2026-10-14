/**
 * Redux middleware: write-through SQLite cache on successful RTK Query responses.
 *
 * Listens for fulfilled query actions and caches entity data into SQLite.
 * Covers: canvas, note, secret, secret_group (docs handled separately in docCacheService).
 *
 * Also handles offline routing:
 *   - GET requests when offline: routes will return cached data instead.
 *   (Offline GET routing is done in individual hooks that check connectivity;
 *    this middleware only handles the cache-write side.)
 */

import type { Middleware } from "@reduxjs/toolkit";
import { baseApi } from "./baseApi";
import {
  cacheEntity,
  softDeleteEntity,
  type EntityType,
} from "@/infrastructure/tauri/entityCacheService";
import type { PageResult, ScrollResult } from "./baseApi";

// Map RTK Query endpoint names → entity type for caching
const ENDPOINT_TO_ENTITY: Record<string, EntityType> = {
  getCanvasById: "canvas",
  listCanvas: "canvas",
  lazyCanvas: "canvas",
  searchCanvas: "canvas",

  getNoteById: "note",
  listNotes: "note",
  lazyNotes: "note",
  searchNotes: "note",


};

// Endpoints whose payload is a list (PageResult or ScrollResult or plain array)
const LIST_ENDPOINTS = new Set([
  "listCanvas", "lazyCanvas", "searchCanvas",
  "listNotes", "lazyNotes", "searchNotes",
]);

function extractItems(endpointName: string, payload: unknown): Array<{ id: number } & Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];

  if (LIST_ENDPOINTS.has(endpointName)) {
    // PageResult<T> / ScrollResult<T>
    const p = payload as PageResult<{ id: number }> | ScrollResult<{ id: number }>;
    if ("items" in p && Array.isArray(p.items)) return p.items as Array<{ id: number } & Record<string, unknown>>;
    // Plain array
    if (Array.isArray(payload)) return payload as Array<{ id: number } & Record<string, unknown>>;
  } else {
    // Single entity
    const single = payload as { id?: number };
    if (typeof single.id === "number") return [single as { id: number } & Record<string, unknown>];
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cacheMiddleware: Middleware = () => (next) => (action: any) => {
  const result = next(action);

  // Only act on fulfilled query results
  if (!baseApi.endpoints) return result;

  const type: string = action?.type ?? "";
  if (!type.endsWith("/fulfilled")) return result;

  const meta = action?.meta?.arg;
  if (!meta?.endpointName) return result;

  const endpointName: string = meta.endpointName;
  const entityType = ENDPOINT_TO_ENTITY[endpointName];
  if (!entityType) return result;

  const payload = action?.payload;
  if (!payload) return result;

  // Async cache write — fire and forget (don't block the Redux pipeline)
  const items = extractItems(endpointName, payload);
  for (const item of items) {
    if (typeof item.id !== "number") continue;
    const version = typeof (item as { version?: number }).version === "number"
      ? (item as { version?: number }).version
      : null;
    // Secrets: pass raw JSON; encryption is applied when reading back in entityCacheService
    // (cmd_encrypt would need to be awaited — deferred to Bước 7)
    cacheEntity(entityType, item.id, JSON.stringify(item), version).catch(() => { /* non-critical */ });
  }

  return result;
};

// Mutation fulfilled handler — handles soft-delete caching
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mutationCacheMiddleware: Middleware = () => (next) => (action: any) => {
  const result = next(action);

  const type: string = action?.type ?? "";
  if (!type.endsWith("/fulfilled")) return result;

  const meta = action?.meta?.arg;
  if (!meta?.endpointName) return result;

  const endpointName: string = meta.endpointName;

  // Handle DELETE: soft-delete in cache
  const deleteEndpointMap: Record<string, EntityType> = {
    deleteCanvas: "canvas",
    deleteNote: "note",
      };
  const deleteEntityType = deleteEndpointMap[endpointName];
  if (deleteEntityType) {
    const id = meta.originalArgs;
    if (typeof id === "number") {
      softDeleteEntity(deleteEntityType, id).catch(() => { /* non-critical */ });
    }
    return result;
  }

  // Handle CREATE / UPDATE: cache the returned entity
  const mutationEntityMap: Record<string, EntityType> = {
    createCanvas: "canvas", updateCanvas: "canvas",
    createNote: "note", updateNote: "note",
      };
  const mutEntityType = mutationEntityMap[endpointName];
  if (mutEntityType) {
    const payload = action?.payload as ({ id?: number; version?: number } | undefined);
    if (payload && typeof payload.id === "number") {
      cacheEntity(mutEntityType, payload.id, JSON.stringify(payload), payload.version ?? null)
        .catch(() => { /* non-critical */ });
    }
  }

  return result;
};
