/**
 * ConflictDialog — shown when useSyncEngine detects a true field conflict
 * (both local and server changed the same field to different values).
 *
 * Options:
 *   Keep mine   → PUT local payload as-is
 *   Keep server → discard local; markEntityClean with server data
 *   Use merged  → PUT the auto-merged result (server wins on conflicting fields)
 *
 * After resolution: dequeues the outbox item, clears the conflict record.
 */

import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { AppDispatch } from "@/presentation/store";
import {
  selectPendingConflicts,
  resolveConflict,
  type ConflictRecord,
} from "@/presentation/store/conflictsSlice";
import { markEntityClean } from "@/infrastructure/tauri/entityCacheService";
import { dequeue } from "@/infrastructure/tauri/outboxService";

const BASE_URL = "/api/v1";

const ENTITY_PATH: Record<string, string> = {
  canvas: "canvas",
  note: "notes",
  secret_group: "secret-groups",
};

async function putEntity(
  conflict: ConflictRecord,
  payloadJson: string | null
): Promise<boolean> {
  if (!payloadJson) return false;
  const path = ENTITY_PATH[conflict.entityType];
  if (!path) return false;

  let token: string | null = null;
  try {
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      token = await invoke<string | null>("auth_access_token");
    }
  } catch { /* no token */ }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/base/${path}/${conflict.backendId}`, {
    method: "PUT",
    headers,
    body: payloadJson,
  });

  if (res.ok) {
    let serverVersion: number | null = null;
    try {
      const raw = await res.json();
      const data = raw?.data ?? raw;
      serverVersion = typeof data?.version === "number" ? data.version : null;
    } catch { /* ignore */ }
    await markEntityClean(conflict.entityType as Parameters<typeof markEntityClean>[0], conflict.backendId, serverVersion);
  }
  return res.ok;
}

function fieldDiff(base: unknown, local: unknown, server: unknown, field: string) {
  const b = (base as Record<string, unknown>)?.[field];
  const l = (local as Record<string, unknown>)?.[field];
  const s = (server as Record<string, unknown>)?.[field];
  return { base: b, local: l, server: s };
}

function safeJson(s: string | null): Record<string, unknown> {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function ConflictDialog() {
  const dispatch = useDispatch<AppDispatch>();
  const conflicts = useSelector(selectPendingConflicts);
  const [busy, setBusy] = useState(false);

  const conflict = conflicts[0]; // Handle one at a time
  if (!conflict) return null;

  const base = safeJson(conflict.baseJson);
  const local = safeJson(conflict.localJson);
  const server = safeJson(conflict.serverJson);

  const resolve = async (payloadJson: string | null) => {
    setBusy(true);
    try {
      if (payloadJson) {
        await putEntity(conflict, payloadJson);
      } else {
        // Keep server: just mark clean with server data
        await markEntityClean(
          conflict.entityType as Parameters<typeof markEntityClean>[0],
          conflict.backendId,
          (server as { version?: number })?.version ?? null,
          conflict.serverJson ?? undefined
        );
      }
      await dequeue(conflict.outboxId);
      dispatch(resolveConflict(conflict.id));
    } catch {
      /* show error? for now silently close */
      dispatch(resolveConflict(conflict.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: 12,
          padding: "28px 32px",
          maxWidth: 560,
          width: "94%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
        }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600 }}>
          Xung đột dữ liệu
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--color-text-secondary, #666)" }}>
          Cả bạn lẫn server đều đã sửa{" "}
          <strong>{conflict.entityType}</strong> #{conflict.backendId} trong lúc offline.
          Chọn phiên bản nào để giữ:
        </p>

        {/* Conflicting fields diff */}
        <div style={{ marginBottom: 20 }}>
          {conflict.conflictingFields.map((field) => {
            const diff = fieldDiff(base, local, server, field);
            return (
              <div key={field} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  Trường: <code style={{ background: "#f0f0f0", padding: "1px 5px", borderRadius: 4 }}>{field}</code>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#fff8e1", padding: "8px 10px", borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: "#b8860b" }}>Bản của bạn (local)</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(diff.local, null, 2)}
                    </pre>
                  </div>
                  <div style={{ background: "#e8f5e9", padding: "8px 10px", borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: "#2e7d32" }}>Bản server</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(diff.server, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            disabled={busy}
            onClick={() => resolve(conflict.localJson)}
            style={{
              flex: 1, minWidth: 120,
              padding: "10px 14px", borderRadius: 8,
              border: "1px solid #e0c040", background: "#fffde7",
              cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#7a6000",
            }}
          >
            Giữ bản của tôi
          </button>
          <button
            disabled={busy}
            onClick={() => resolve(null)}
            style={{
              flex: 1, minWidth: 120,
              padding: "10px 14px", borderRadius: 8,
              border: "1px solid #a5d6a7", background: "#e8f5e9",
              cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1b5e20",
            }}
          >
            Giữ bản server
          </button>
          <button
            disabled={busy}
            onClick={() => resolve(conflict.mergedJson)}
            style={{
              flex: 1, minWidth: 120,
              padding: "10px 14px", borderRadius: 8,
              border: "none", background: "var(--color-primary, #5c6bc0)",
              cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#fff",
            }}
          >
            Dùng bản gộp
          </button>
        </div>
        {conflicts.length > 1 && (
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#888", textAlign: "center" }}>
            Còn {conflicts.length - 1} xung đột khác sẽ hiện sau khi giải quyết cái này.
          </p>
        )}
      </div>
    </div>
  );
}
