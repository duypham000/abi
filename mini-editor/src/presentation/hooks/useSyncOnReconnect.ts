import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import * as Y from "yjs";
import { selectIsOnline } from "@/presentation/store/appSlice";
import { useUpdateDocMutation, useLazyGetDocByIdQuery } from "@/infrastructure/api/docsApi";
import { getPendingSync, markClean, saveDocLocally } from "@/infrastructure/tauri/docCacheService";
import { uint8ArrayToBase64, base64ToUint8Array } from "@/core/utils/yjsUtils";
import type { DocRequest } from "@/core/interfaces/docs";
import type { LocalDoc } from "@/infrastructure/tauri/docCacheService";

// When true, rely on yhub WS reconnect + CRDT to merge offline edits; only flush
// metadata/content (no yjsState) over REST. When false, keep the legacy full-state
// merge as an emergency path. See docs/yjs/phase-5-frontend-cutover.md.
const USE_YHUB_OFFLINE = true;

export function useSyncOnReconnect() {
  const isOnline = useSelector(selectIsOnline);
  const [updateDoc] = useUpdateDocMutation();
  const [fetchDoc] = useLazyGetDocByIdQuery();
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    const wasOffline = !prevOnline.current;
    prevOnline.current = isOnline;

    if (!isOnline || !wasOffline) return;

    (async () => {
      const pending = await getPendingSync();
      for (const row of pending as (LocalDoc & { backend_id: number })[]) {
        let yjsState: string | null = USE_YHUB_OFFLINE ? null : (row.yjs_state ?? null);

        if (!USE_YHUB_OFFLINE && row.yjs_state) {
          try {
            const { data: serverDoc } = await fetchDoc(row.backend_id);
            const mergedDoc = new Y.Doc();
            Y.applyUpdate(mergedDoc, base64ToUint8Array(row.yjs_state));
            if (serverDoc?.yjsState) {
              Y.applyUpdate(mergedDoc, base64ToUint8Array(serverDoc.yjsState));
            }
            yjsState = uint8ArrayToBase64(Y.encodeStateAsUpdate(mergedDoc));
            mergedDoc.destroy();
          } catch (e) {
            console.warn("[SyncOnReconnect] Y.js merge failed, using local state:", e);
          }
        }

        const body: DocRequest = {
          title: row.title,
          content: row.content,
          plainText: row.plain_text ?? null,
          metadata: row.metadata,
          lastSync: new Date().toISOString(),
          status: row.status as 0 | 1,
          yjsState,
        };

        const result = await updateDoc({ id: row.backend_id, body });
        if (!("error" in result)) {
          if (yjsState) {
            await saveDocLocally(row.backend_id, { yjsState }, false);
          }
          await markClean(row.backend_id);
        }
      }
    })();
  }, [isOnline, updateDoc, fetchDoc]);
}
