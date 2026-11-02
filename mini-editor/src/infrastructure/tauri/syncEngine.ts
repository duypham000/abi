/**
 * syncEngine.ts — Offline outbox replay engine.
 *
 * When connectivity is restored (state: "reconnecting"), this engine:
 * 1. Replays FIFO queued mutations (create/update/delete) for doc entities.
 * 2. Maps local_id → backend_id for newly created docs.
 * 3. Applies exponential back-off on failure and gives up after MAX_RETRIES.
 */

import {
  listQueue,
  dequeue,
  bumpAttempt,
  remapLocalId,
  type OutboxItem,
} from "./outboxService";
import { cacheDoc } from "./docCacheService";
import { getAccessToken } from "./authBridge";

const MAX_RETRIES = 5;
const API_BASE = "/api/v1";

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

// ─── Authenticated fetch helper ────────────────────────────────────────────

async function authFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token && token !== "local-standalone-token") {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ─── Per-entity sync handlers ──────────────────────────────────────────────

async function syncDocItem(item: OutboxItem): Promise<void> {
  const payload = item.payload_json ? JSON.parse(item.payload_json) : {};

  if (item.op === "create") {
    const res = await authFetch("/base/docs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`create doc failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const remoteDoc = json?.data ?? json;
    if (remoteDoc?.id) {
      // Remap local_id → backend_id for any pending follow-up ops
      await remapLocalId("doc", item.local_id, remoteDoc.id);
      await cacheDoc(remoteDoc);
    }
    return;
  }

  const backendId = item.backend_id;
  if (!backendId) {
    throw new Error(`${item.op} doc missing backend_id (local_id=${item.local_id})`);
  }

  if (item.op === "update") {
    const res = await authFetch(`/base/docs/${backendId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`update doc ${backendId} failed: ${res.status}`);
    }
    const json = await res.json();
    const remoteDoc = json?.data ?? json;
    if (remoteDoc) await cacheDoc(remoteDoc);
    return;
  }

  if (item.op === "delete") {
    const res = await authFetch(`/base/docs/${backendId}`, {
      method: "DELETE",
    });
    // 404 is fine — already deleted on backend
    if (!res.ok && res.status !== 404) {
      throw new Error(`delete doc ${backendId} failed: ${res.status}`);
    }
    return;
  }

  throw new Error(`Unknown op: ${item.op}`);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Replay all pending outbox items FIFO.
 * Only processes items where a valid auth token exists (skips anonymous/standalone).
 */
export async function replayOutbox(): Promise<SyncResult> {
  const token = await getAccessToken();
  if (!token || token === "local-standalone-token") {
    return { synced: 0, failed: 0, skipped: 0 };
  }

  const items = await listQueue();
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      if (item.entity_type === "doc") {
        await syncDocItem(item);
        await dequeue(item.id);
        synced++;
      } else {
        // Other entity types (canvas, note) handled by their own services
        skipped++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await bumpAttempt(item.id, errMsg);
      failed++;

      if (item.attempts + 1 >= MAX_RETRIES) {
        // Give up — remove from outbox to prevent permanent block
        console.warn(
          `[SyncEngine] Dropping outbox item ${item.id} after ${MAX_RETRIES} attempts: ${errMsg}`
        );
        await dequeue(item.id);
      }
    }
  }

  console.info(
    `[SyncEngine] Outbox replay complete — synced=${synced}, failed=${failed}, skipped=${skipped}`
  );
  return { synced, failed, skipped };
}

