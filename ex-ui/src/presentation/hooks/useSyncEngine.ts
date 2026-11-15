/**
 * Sync engine — replays the outbox FIFO when connectivity transitions
 * offline → reconnecting → online.
 *
 * For each outbox item:
 *   create  → POST; remap local_id to real backend_id
 *   delete  → DELETE (optimistic concurrency: base_version in header)
 *   update  → fetch current server version → 3-way merge:
 *               no conflict → PUT merged result
 *               field conflict → dispatch to conflictsSlice → user resolves in ConflictDialog
 *
 * Docs: Yjs content is handled separately by the legacy useSyncOnReconnect
 *       hook (Y.applyUpdate merge). This engine handles canvas, note, secret,
 *       secret_group and any future doc metadata updates.
 *
 * Mounts once at root (ProtectedShell). Replace useSyncOnReconnect when
 * doc Yjs sync has been migrated to this engine.
 */

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "@/presentation/store";
import {
  selectConnectivity,
  backOnline,
} from "@/presentation/store/appSlice";
import {
  listQueue,
  dequeue,
  bumpAttempt,
  remapLocalId,
  pendingCount,
  type OutboxItem,
} from "@/infrastructure/tauri/outboxService";
import {
  markEntityClean,
  promoteLocalEntity,
  softDeleteEntity,
  getCached,
  type EntityType,
} from "@/infrastructure/tauri/entityCacheService";
import { addConflict } from "@/presentation/store/conflictsSlice";
import { threeWayMergeJson } from "@/core/utils/threeWayMerge";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1/api/v1";

// Entity → REST path segment mapping
const ENTITY_PATH: Record<EntityType, string> = {
  canvas: "canvas",
  note: "notes",
  secret: "secrets",
  secret_group: "secret-groups",
};

async function apiFetch(
  method: string,
  url: string,
  body?: unknown,
  baseVersion?: number | null
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (baseVersion != null) {
    headers["If-Match"] = String(baseVersion);
  }

  // Get access token from auth bridge
  let token: string | null = null;
  try {
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      token = await invoke<string | null>("auth_access_token");
    }
  } catch { /* no token, proceed without auth */ }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  try {
    const text = await res.text();
    if (text) {
      const parsed = JSON.parse(text);
      // Unwrap server envelope { status, code, message, data }
      data = parsed?.data ?? parsed;
    }
  } catch { /* ignore parse errors */ }

  return { ok: res.ok, status: res.status, data };
}

async function replayItem(
  item: OutboxItem,
  dispatch: AppDispatch
): Promise<void> {
  const entityType = item.entity_type as EntityType;
  const path = ENTITY_PATH[entityType];
  if (!path) return; // doc handled by useSyncOnReconnect

  const payload = item.payload_json ? JSON.parse(item.payload_json) : {};

  if (item.op === "create") {
    const res = await apiFetch("POST", `/base/${path}`, payload);
    if (!res.ok) {
      await bumpAttempt(item.id, `HTTP ${res.status}`);
      return;
    }
    const created = res.data as { id: number; version?: number };
    if (typeof created?.id === "number") {
      await promoteLocalEntity(
        entityType,
        item.local_id,
        created.id,
        JSON.stringify(created),
        created.version ?? null
      );
      await remapLocalId(entityType, item.local_id, created.id);
    }
    await dequeue(item.id);
    return;
  }

  if (item.op === "delete") {
    if (!item.backend_id) { await dequeue(item.id); return; }
    const res = await apiFetch(
      "DELETE",
      `/base/${path}/${item.backend_id}`,
      undefined,
      item.base_version
    );
    if (res.ok || res.status === 404) {
      await softDeleteEntity(entityType, item.backend_id);
      await dequeue(item.id);
    } else {
      await bumpAttempt(item.id, `HTTP ${res.status}`);
    }
    return;
  }

  if (item.op === "update") {
    if (!item.backend_id) { await dequeue(item.id); return; }

    // Fetch current server state to detect conflicts
    const serverRes = await apiFetch("GET", `/base/${path}/${item.backend_id}`);
    if (!serverRes.ok) {
      await bumpAttempt(item.id, `fetch server: HTTP ${serverRes.status}`);
      return;
    }
    const serverData = serverRes.data as { version?: number } & Record<string, unknown>;

    // Check if server version has changed
    const cached = await getCached(entityType, item.backend_id);
    const serverVersion = serverData?.version ?? null;
    const baseVersion = item.base_version ?? cached?.base_version ?? null;

    const serverChanged = baseVersion != null && serverVersion != null
      ? serverVersion > baseVersion
      : false;

    if (!serverChanged) {
      // Clean: PUT directly
      const putRes = await apiFetch(
        "PUT",
        `/base/${path}/${item.backend_id}`,
        payload,
        baseVersion
      );
      if (putRes.ok) {
        const updated = putRes.data as { version?: number };
        await markEntityClean(
          entityType,
          item.backend_id,
          updated?.version ?? null,
          JSON.stringify(putRes.data)
        );
        await dequeue(item.id);
      } else if (putRes.status === 409) {
        // Race: server changed between fetch and PUT → retry from top
        await bumpAttempt(item.id, "409 conflict, will retry");
      } else {
        await bumpAttempt(item.id, `HTTP ${putRes.status}`);
      }
      return;
    }

    // Server changed → attempt 3-way merge
    const cachedBase = cached?.base_json ?? null;
    const localJson = item.payload_json;
    const serverJson = JSON.stringify(serverData);

    const mergeResult = threeWayMergeJson(cachedBase, localJson, serverJson);

    if (!mergeResult) {
      // Cannot parse → fallback: PUT local wins
      const putRes = await apiFetch("PUT", `/base/${path}/${item.backend_id}`, payload);
      if (putRes.ok) {
        await markEntityClean(entityType, item.backend_id, null, localJson ?? undefined);
        await dequeue(item.id);
      } else {
        await bumpAttempt(item.id, `fallback PUT: HTTP ${putRes.status}`);
      }
      return;
    }

    if (mergeResult.conflicts.length === 0) {
      // Auto-merge: no user intervention needed
      const putRes = await apiFetch(
        "PUT",
        `/base/${path}/${item.backend_id}`,
        mergeResult.merged,
        serverVersion
      );
      if (putRes.ok) {
        const updated = putRes.data as { version?: number };
        await markEntityClean(
          entityType,
          item.backend_id,
          updated?.version ?? null,
          JSON.stringify(putRes.data)
        );
        await dequeue(item.id);
      } else {
        await bumpAttempt(item.id, `auto-merge PUT: HTTP ${putRes.status}`);
      }
      return;
    }

    // True conflict: dispatch to Redux for user resolution
    const conflictId = `${entityType}-${item.backend_id}`;
    dispatch(
      addConflict({
        id: conflictId,
        entityType,
        backendId: item.backend_id,
        localId: item.local_id,
        outboxId: item.id,
        conflictingFields: mergeResult.conflicts,
        baseJson: cachedBase,
        localJson,
        serverJson,
        mergedJson: JSON.stringify(mergeResult.merged),
      })
    );
    // Leave item in outbox; ConflictDialog resolves and dequeues it
  }
}

export function useSyncEngine() {
  const dispatch = useDispatch<AppDispatch>();
  const connectivity = useSelector(selectConnectivity);
  const prevConnectivity = useRef(connectivity);

  useEffect(() => {
    prevConnectivity.current = connectivity;

    // Trigger sync when we enter the 'reconnecting' state
    if (connectivity !== "reconnecting") return;

    (async () => {
      const count = await pendingCount();
      if (count === 0) {
        dispatch(backOnline());
        return;
      }

      const items = await listQueue();
      for (const item of items) {
        try {
          await replayItem(item, dispatch);
        } catch (err) {
          await bumpAttempt(item.id, String(err));
        }
      }

      dispatch(backOnline());
    })();
  }, [connectivity, dispatch]);
}
