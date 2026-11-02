import { useCallback } from "react";
import { useSyncPushLocalMutation, useLazySyncPullRemoteQuery } from "@/infrastructure/api/docsApi";
import { listDocsFromSqlite, cacheDoc } from "@/infrastructure/tauri/docCacheService";
import { listCanvasFromSqlite } from "@/infrastructure/tauri/canvasCacheService";
import { listNotesFromSqlite } from "@/infrastructure/tauri/noteCacheService";
import { computeDocHash, computeCanvasHash, computeNoteHash } from "@/core/utils/contentHash";

export function useSyncDocs() {
  const [syncPush, { isLoading: isPushing }] = useSyncPushLocalMutation();
  const [triggerPull, { isLoading: isPulling }] = useLazySyncPullRemoteQuery();

  const pushAllToBackend = useCallback(async () => {
    // 1. Docs
    const docs = await listDocsFromSqlite({ size: 1000 });
    const docItems = await Promise.all(
      docs.items.map(async (d) => ({
        local_id: `doc-${d.id}`,
        title: d.title,
        content: d.content ?? "",
        metadata: d.metadata ?? "",
        status: d.status === 1 ? "PUBLISHED" : "DRAFT",
        entity_type: "doc",
        updated_at: new Date().toISOString(),
        content_hash: await computeDocHash({ title: d.title, content: d.content, metadata: d.metadata }),
      }))
    );

    // 2. Canvases
    const canvases = await listCanvasFromSqlite({ size: 1000 });
    const canvasItems = await Promise.all(
      canvases.items.map(async (c) => ({
        local_id: `canvas-${c.id}`,
        title: c.title,
        content: c.scene ?? "",
        metadata: c.metadata ?? "",
        status: c.status === 1 ? "PUBLISHED" : "DRAFT",
        entity_type: "canvas",
        updated_at: new Date().toISOString(),
        content_hash: await computeCanvasHash({ title: c.title, scene: c.scene, metadata: c.metadata }),
      }))
    );

    // 3. Notes
    const notes = await listNotesFromSqlite({ size: 1000 });
    const noteItems = await Promise.all(
      notes.items.map(async (n) => ({
        local_id: `note-${n.id}`,
        title: n.title,
        content: n.content ?? "",
        metadata: n.metadata ?? "",
        status: n.status === 1 ? "PUBLISHED" : "DRAFT",
        entity_type: "note",
        updated_at: new Date().toISOString(),
        content_hash: await computeNoteHash({ title: n.title, content: n.content, metadata: n.metadata }),
      }))
    );

    const allItems = [...docItems, ...canvasItems, ...noteItems];
    if (!allItems.length) {
      return { created: 0, updated: 0, skipped: 0, conflicts: [], mapping: [] };
    }

    return await syncPush({ items: allItems }).unwrap();
  }, [syncPush]);

  const pullAllFromBackend = useCallback(async (since?: string) => {
    const res = await triggerPull({ since }).unwrap();
    if (res?.items && Array.isArray(res.items)) {
      for (const item of res.items) {
        await cacheDoc(item);
      }
    }
    return res;
  }, [triggerPull]);

  return {
    pushAllToBackend,
    pullAllFromBackend,
    isPushing,
    isPulling,
  };
}

