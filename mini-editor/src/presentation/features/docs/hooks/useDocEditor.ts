import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useGetDocByIdQuery, useUpdateDocMutation } from "@/infrastructure/api/docsApi";
import {
  setDocSaveState,
  clearDocSaveState,
  type DocPersistenceState,
} from "@/presentation/store/docsSlice";
import { setPageTitle, selectIsOnline, connectionLost } from "@/presentation/store/appSlice";
import type { AppDispatch } from "@/presentation/store";
import type { DocDto, DocMetadata, DocRequest } from "@/core/interfaces/docs";
import { serializeDocMetadata } from "@/core/interfaces/docs";
import {
  computeDocLocalHashSync,
  computeDocRemoteHashSync,
  normalizeDocStatusValue,
} from "@/core/utils/contentHash";
import { extractBlocksPlainText } from "../utils/plainTextExtractor";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import {
  getCachedDoc,
  getDocSyncSnapshot,
  saveDocLocally,
  markRemoteSynced,
} from "@/infrastructure/tauri/docCacheService";
import { enqueue } from "@/infrastructure/tauri/outboxService";
import { pushRecentDoc } from "@/infrastructure/tauri/recentDocsService";
import type { BlockNoteChangeMeta } from "@/presentation/components/BlockNote/useBlockNoteEditor";
import { flushDraftCanvases } from "./canvasFlushHelper";

export type SaveStatus = "idle" | "saving" | "success" | "error";

export interface UseDocEditorOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef?: React.MutableRefObject<any>;
  autoSave?: boolean;
}

export interface DocEditableSnapshot {
  title: string;
  content: string | null;
  plainText: string | null;
  metadata: string | null;
  seriesId: number | null;
  status: 0 | 1;
}

const JUST_SAVED_RESET_MS = 1500;
const LOCAL_CONTENT_DEBOUNCE_MS = 800;
const LOCAL_TITLE_DEBOUNCE_MS = 600;
const LOCAL_META_DEBOUNCE_MS = 400;
const REMOTE_CONTENT_DEBOUNCE_MS = 2000;
const REMOTE_TITLE_DEBOUNCE_MS = 1200;
const REMOTE_META_DEBOUNCE_MS = 1200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = async (..._args: any[]) => {};

function isOptionsObj(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arg?: UseDocEditorOptions | React.MutableRefObject<any>
): arg is UseDocEditorOptions {
  return Boolean(arg && typeof arg === "object" && !("current" in arg));
}

function snapshotFromDoc(d: DocDto): DocEditableSnapshot {
  return {
    title: d.title ?? "Untitled",
    content: d.content ?? null,
    plainText: d.plainText ?? null,
    metadata: d.metadata ?? null,
    seriesId: d.seriesId ?? null,
    status: normalizeDocStatusValue(d.status),
  };
}

function buildRequestFromSnapshot(snap: DocEditableSnapshot): DocRequest {
  return {
    title: snap.title,
    content: snap.content,
    plainText: snap.plainText,
    metadata: snap.metadata,
    seriesId: snap.seriesId,
    lastSync: new Date().toISOString(),
    status: snap.status,
    // yhub worker persists the Y.Doc; never send full state over REST.
    yjsState: null,
  };
}

function formatRtkError(err: unknown): string {
  if (!err || typeof err !== "object") {
    return String(err || "Lưu tài liệu thất bại");
  }
  const obj = err as { status?: number | string; error?: string; data?: { message?: string; error?: string } };
  return (
    obj.data?.message ||
    obj.data?.error ||
    obj.error ||
    (obj.status === "FETCH_ERROR" ? "Mất kết nối tới server" : `Lưu thất bại (${String(obj.status ?? "unknown")})`)
  );
}

export function useDocEditor(
  id: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optionsOrRef?: UseDocEditorOptions | React.MutableRefObject<any>
) {
  const editorRef = isOptionsObj(optionsOrRef) ? optionsOrRef.editorRef : optionsOrRef;
  const autoSave = isOptionsObj(optionsOrRef) ? (optionsOrRef.autoSave ?? true) : true;

  const dispatch = useDispatch<AppDispatch>();
  const isOnline = useSelector(selectIsOnline);

  const skip = !Number.isFinite(id) || id < 0;
  const { data: backendData, error, isLoading: backendLoading, isFetching } = useGetDocByIdQuery(id, {
    skip,
    refetchOnMountOrArgChange: true,
  });

  const [cachedDoc, setCachedDoc] = useState<DocDto | undefined>(undefined);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [unsyncedLocalDoc, setUnsyncedLocalDoc] = useState<DocDto | undefined>(undefined);

  const [updateDoc] = useUpdateDocMutation();

  // Operation state
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [externalSavingCount, setExternalSavingCount] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSavedLocalAt, setLastSavedLocalAt] = useState<string | null>(null);
  const [lastSyncedRemoteAt, setLastSyncedRemoteAt] = useState<string | null>(null);

  // Content-addressed hashes & remote identity (state for render + refs for sync async access)
  const [editorLocalHash, setEditorLocalHash] = useState<string | null>(null);
  const [editorRemoteHash, setEditorRemoteHash] = useState<string | null>(null);
  const [localSavedHash, setLocalSavedHash] = useState<string | null>(null);
  const [remoteSyncedHash, setRemoteSyncedHash] = useState<string | null>(null);
  const [hasRemoteIdentity, setHasRemoteIdentity] = useState(false);

  const editorLocalHashRef = useRef<string | null>(null);
  const editorRemoteHashRef = useRef<string | null>(null);
  const localSavedHashRef = useRef<string | null>(null);
  const remoteSyncedHashRef = useRef<string | null>(null);
  const hasRemoteIdentityRef = useRef(false);

  const editorSnapshotRef = useRef<DocEditableSnapshot | null>(null);
  const userEditedRef = useRef(false);

  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single-flight coordination refs
  const localSaveInFlightRef = useRef<Promise<void> | null>(null);
  const localSaveQueuedRef = useRef(false);
  const remoteSaveInFlightRef = useRef<Promise<void> | null>(null);
  const remoteSaveQueuedRef = useRef(false);
  const queuedExplicitRef = useRef(false);

  const activeDocIdRef = useRef(id);
  activeDocIdRef.current = id;

  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

  const setEditorHashes = useCallback((localHash: string | null, remoteHash: string | null) => {
    editorLocalHashRef.current = localHash;
    editorRemoteHashRef.current = remoteHash;
    setEditorLocalHash(localHash);
    setEditorRemoteHash(remoteHash);
  }, []);

  const setLocalSavedHashSynced = useCallback((hash: string | null) => {
    localSavedHashRef.current = hash;
    setLocalSavedHash(hash);
  }, []);

  const setRemoteSyncedHashSynced = useCallback((hash: string | null) => {
    remoteSyncedHashRef.current = hash;
    setRemoteSyncedHash(hash);
  }, []);

  const setHasRemoteIdentitySynced = useCallback((val: boolean) => {
    hasRemoteIdentityRef.current = val;
    setHasRemoteIdentity(val);
  }, []);

  const flashJustSaved = useCallback(() => {
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    setJustSaved(true);
    justSavedTimerRef.current = setTimeout(() => {
      setJustSaved(false);
      justSavedTimerRef.current = null;
    }, JUST_SAVED_RESET_MS);
  }, []);

  const clearDebounceTimers = useCallback(() => {
    if (localTimerRef.current) {
      clearTimeout(localTimerRef.current);
      localTimerRef.current = null;
    }
    if (remoteTimerRef.current) {
      clearTimeout(remoteTimerRef.current);
      remoteTimerRef.current = null;
    }
  }, []);

  // Priority: unsynced local SQLite > fresh API > SQLite error fallback
  const doc = !skip ? (unsyncedLocalDoc ?? backendData ?? cachedDoc ?? null) : null;
  const docRef = useRef(doc);
  docRef.current = doc;

  const isCheckingRemote = Boolean(backendData && !error && backendData.remoteStatus === "pending");
  const isSavedOnline = Boolean(
    backendData &&
      !error &&
      backendData.remoteStatus !== "pending" &&
      backendData.remoteStatus !== "local-only"
  );
  const isOffline = !skip && !!error && !backendLoading;
  const isLoading = !skip && (backendLoading || cacheLoading);
  const isDraft = (editorSnapshotRef.current?.status ?? doc?.status) === 0;

  // Derived truth from hashes (single source of truth — never manually mutated)
  const isLocalDirty = Boolean(
    editorLocalHash && localSavedHash && editorLocalHash !== localSavedHash
  );
  const isRemoteDirty = Boolean(
    editorRemoteHash && (!hasRemoteIdentity || editorRemoteHash !== remoteSyncedHash)
  );
  const isDirty = isLocalDirty || isRemoteDirty;
  const isSaving = isSavingLocal || isSavingRemote || externalSavingCount > 0;
  const isSyncedToServer = Boolean(hasRemoteIdentity && !isRemoteDirty);

  const persistenceState: DocPersistenceState = isSaving
    ? "saving"
    : lastError
      ? "error"
      : isLocalDirty
        ? "unsaved"
        : isRemoteDirty
          ? "saved-local"
          : "synced";

  const saveStatus: SaveStatus = isSaving
    ? "saving"
    : lastError
      ? "error"
      : justSaved
        ? "success"
        : "idle";

  // Reset all state on docId switch; flush dirty local edits if autoSave is ON
  useEffect(() => {
    clearDebounceTimers();
    if (justSavedTimerRef.current) {
      clearTimeout(justSavedTimerRef.current);
      justSavedTimerRef.current = null;
    }

    userEditedRef.current = false;
    editorSnapshotRef.current = null;
    setEditorHashes(null, null);
    setLocalSavedHashSynced(null);
    setRemoteSyncedHashSynced(null);
    setHasRemoteIdentitySynced(false);
    localSaveInFlightRef.current = null;
    localSaveQueuedRef.current = false;
    remoteSaveInFlightRef.current = null;
    remoteSaveQueuedRef.current = false;
    queuedExplicitRef.current = false;

    setUnsyncedLocalDoc(undefined);
    setCachedDoc(undefined);
    setCacheLoading(false);
    setIsSavingLocal(false);
    setIsSavingRemote(false);
    setExternalSavingCount(0);
    setJustSaved(false);
    setLastError(null);
    setLastSavedLocalAt(null);
    setLastSyncedRemoteAt(null);

    if (skip) return;

    let cancelled = false;
    if (isTauri()) {
      getDocSyncSnapshot(id).then((snap) => {
        if (cancelled || activeDocIdRef.current !== id || !snap) return;
        setLocalSavedHashSynced(snap.localHash);
        setRemoteSyncedHashSynced(snap.syncedHash);
        setHasRemoteIdentitySynced(Boolean(snap.backendUuid));
        if (snap.doc.lastSync && !snap.hasUnsyncedRemoteChanges) {
          setLastSyncedRemoteAt((prev) => prev ?? snap.doc.lastSync);
        }
        if (snap.hasUnsyncedRemoteChanges) {
          setUnsyncedLocalDoc(snap.doc);
        }
        if (!userEditedRef.current) {
          editorSnapshotRef.current = snapshotFromDoc(snap.doc);
          setEditorHashes(snap.localHash, snap.remoteHash);
        }
      });
    }

    return () => {
      cancelled = true;
      clearDebounceTimers();
      if (justSavedTimerRef.current) {
        clearTimeout(justSavedTimerRef.current);
        justSavedTimerRef.current = null;
      }
      // Best-effort local persistence on unmount/switch if autoSave is active
      if (
        isTauri() &&
        autoSaveRef.current &&
        editorSnapshotRef.current &&
        editorLocalHashRef.current &&
        editorLocalHashRef.current !== localSavedHashRef.current
      ) {
        const snapToFlush = editorSnapshotRef.current;
        void saveDocLocally(id, snapToFlush, { preserveSyncedHash: true });
      }
      dispatch(clearDocSaveState(id));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, skip]);

  // Fallback to SQLite when API fails
  useEffect(() => {
    if (!error || skip || !isTauri()) return;
    let cancelled = false;
    setCacheLoading(true);
    getCachedDoc(id).then((d) => {
      if (cancelled) return;
      setCachedDoc(d ?? undefined);
      setCacheLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [error, id, skip]);

  // Reconcile baseline hashes whenever backendData updates (initial fetch, syncSingle, reconnect)
  useEffect(() => {
    if (skip) return;
    let cancelled = false;

    if (isTauri()) {
      getDocSyncSnapshot(id).then((snap) => {
        if (cancelled || activeDocIdRef.current !== id) return;
        if (snap) {
          setLocalSavedHashSynced(snap.localHash);
          setRemoteSyncedHashSynced(snap.syncedHash);
          setHasRemoteIdentitySynced(Boolean(snap.backendUuid));
          if (snap.doc.lastSync && !snap.hasUnsyncedRemoteChanges) {
            setLastSyncedRemoteAt((prev) => prev ?? snap.doc.lastSync);
          }
          if (snap.hasUnsyncedRemoteChanges) {
            setUnsyncedLocalDoc(snap.doc);
          } else {
            setUnsyncedLocalDoc(undefined);
          }
          if (!userEditedRef.current) {
            editorSnapshotRef.current = snapshotFromDoc(snap.doc);
            setEditorHashes(snap.localHash, snap.remoteHash);
          }
          return;
        }

        if (backendData && !error) {
          const snapObj = snapshotFromDoc(backendData);
          const lHash = computeDocLocalHashSync(snapObj);
          const rHash = computeDocRemoteHashSync(snapObj);
          const synced = backendData.remoteStatus !== "local-only" && backendData.remoteStatus !== "pending";
          setLocalSavedHashSynced(lHash);
          setRemoteSyncedHashSynced(synced ? rHash : null);
          setHasRemoteIdentitySynced(Boolean(backendData.backendUuid || synced));
          if (!userEditedRef.current) {
            editorSnapshotRef.current = snapObj;
            setEditorHashes(lHash, rHash);
          }
        }
      });
    } else if (backendData && !error) {
      const snapObj = snapshotFromDoc(backendData);
      const lHash = computeDocLocalHashSync(snapObj);
      const rHash = computeDocRemoteHashSync(snapObj);
      setHasRemoteIdentitySynced(true);
      setLocalSavedHashSynced(lHash);
      setRemoteSyncedHashSynced(rHash);
      if (backendData.lastSync) {
        setLastSyncedRemoteAt((prev) => prev ?? backendData.lastSync);
      }
      if (!userEditedRef.current) {
        editorSnapshotRef.current = snapObj;
        setEditorHashes(lHash, rHash);
      }
    }

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, skip, backendData, error]);

  // Keep page title & recent docs updated
  useEffect(() => {
    if (doc?.title) dispatch(setPageTitle(doc.title));
    if (!skip && id > 0 && doc) {
      pushRecentDoc({ kind: "doc", id: String(id), title: doc.title });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  // Publish per-doc save state to Redux (drives currentDocId + global/tab consumers)
  useEffect(() => {
    if (skip) return;
    dispatch(
      setDocSaveState({
        docId: id,
        status: persistenceState,
        isLocalDirty,
        isRemoteDirty,
        isSaving,
        lastSavedLocalAt,
        lastSyncedRemoteAt,
        errorMessage: lastError,
      })
    );
  }, [
    skip,
    id,
    persistenceState,
    isLocalDirty,
    isRemoteDirty,
    isSaving,
    lastSavedLocalAt,
    lastSyncedRemoteAt,
    lastError,
    dispatch,
  ]);

  const getLatestSnapshot = useCallback((): DocEditableSnapshot | null => {
    if (editorSnapshotRef.current) return editorSnapshotRef.current;
    if (docRef.current) return snapshotFromDoc(docRef.current);
    return null;
  }, []);

  // Single-flight local SQLite save
  const saveLocalNow = useCallback(async () => {
    if (skip || !isTauri()) return;

    if (localSaveInFlightRef.current) {
      localSaveQueuedRef.current = true;
      await localSaveInFlightRef.current;
      return;
    }

    const run = async () => {
      const targetId = activeDocIdRef.current;
      const snap = getLatestSnapshot();
      if (!snap) return;

      const snapLocalHash = computeDocLocalHashSync(snap);
      if (snapLocalHash === localSavedHashRef.current) return;

      setIsSavingLocal(true);
      try {
        await saveDocLocally(targetId, snap, { preserveSyncedHash: true });
        if (activeDocIdRef.current !== targetId) return;
        setLocalSavedHashSynced(snapLocalHash);
        setLastSavedLocalAt(new Date().toISOString());
      } catch (err) {
        console.warn("[DocEditor] saveLocalNow failed:", err);
      } finally {
        if (activeDocIdRef.current === targetId) {
          setIsSavingLocal(false);
        }
      }
    };

    const p = run().finally(() => {
      localSaveInFlightRef.current = null;
      const shouldReplay =
        localSaveQueuedRef.current ||
        (autoSaveRef.current &&
          editorLocalHashRef.current !== null &&
          editorLocalHashRef.current !== localSavedHashRef.current);
      localSaveQueuedRef.current = false;
      if (shouldReplay && activeDocIdRef.current === id) {
        void saveLocalNow();
      }
    });

    localSaveInFlightRef.current = p;
    await p;
  }, [id, skip, getLatestSnapshot, setLocalSavedHashSynced]);

  // Single-flight remote + local save
  const saveRemoteNow = useCallback(
    async ({ explicit }: { explicit: boolean }) => {
      if (skip) return;
      clearDebounceTimers();

      if (remoteSaveInFlightRef.current) {
        remoteSaveQueuedRef.current = true;
        queuedExplicitRef.current = queuedExplicitRef.current || explicit;
        await remoteSaveInFlightRef.current;
        return;
      }

      const run = async () => {
        const targetId = activeDocIdRef.current;
        const baseSnap = getLatestSnapshot();
        if (!baseSnap) return;

        // Explicit save promotes draft -> published
        const snap: DocEditableSnapshot =
          explicit && baseSnap.status === 0 ? { ...baseSnap, status: 1 } : baseSnap;

        if (snap !== baseSnap) {
          editorSnapshotRef.current = snap;
          setEditorHashes(computeDocLocalHashSync(snap), computeDocRemoteHashSync(snap));
        }

        const snapLocalHash = computeDocLocalHashSync(snap);
        const snapRemoteHash = computeDocRemoteHashSync(snap);

        const needsLocal = isTauri() && snapLocalHash !== localSavedHashRef.current;
        const needsRemote =
          !hasRemoteIdentityRef.current || snapRemoteHash !== remoteSyncedHashRef.current;

        if (!needsLocal && !needsRemote) {
          setLastError(null);
          if (explicit) flashJustSaved();
          return;
        }

        setIsSavingRemote(true);
        setLastError(null);
        if (justSavedTimerRef.current) {
          clearTimeout(justSavedTimerRef.current);
          justSavedTimerRef.current = null;
        }
        setJustSaved(false);

        try {
          // Wait for any active local write before reading/mutating SQLite state
          if (localSaveInFlightRef.current) {
            await localSaveInFlightRef.current;
          }

          if (activeDocIdRef.current !== targetId) return;

          if (isTauri() && snapLocalHash !== localSavedHashRef.current) {
            await saveDocLocally(targetId, snap, { preserveSyncedHash: true });
            if (activeDocIdRef.current !== targetId) return;
            setLocalSavedHashSynced(snapLocalHash);
            setLastSavedLocalAt(new Date().toISOString());
          }

          if (!needsRemote) {
            if (explicit) flashJustSaved();
            return;
          }

          const requestBody = buildRequestFromSnapshot(snap);

          if (!isOnlineRef.current) {
            if (isTauri()) {
              await enqueue({
                entityType: "doc",
                op: "update",
                localId: `doc-${targetId}`,
                backendId: targetId,
                payload: requestBody,
              });
              // Stay honestly in "saved-local" (no false "Saved" or remoteSyncedHash update)
              setLastError(null);
            } else {
              setLastError("Đang ngoại tuyến — chưa thể lưu lên server");
            }
            return;
          }

          const result = await updateDoc({ id: targetId, body: requestBody });
          if (activeDocIdRef.current !== targetId) return;

          if ("error" in result) {
            const errObj = result.error as { status?: string };
            if (errObj?.status === "FETCH_ERROR" || errObj?.status === "TIMEOUT_ERROR") {
              dispatch(connectionLost());
            }
            setLastError(formatRtkError(result.error));
            return;
          }

          const returned = result.data;
          if (returned.remoteStatus === "online") {
            setHasRemoteIdentitySynced(true);
            // Strictly mark the snapshot we ACTUALLY sent as synced — never live editor state
            setRemoteSyncedHashSynced(snapRemoteHash);
            setLocalSavedHashSynced(snapLocalHash);
            const nowIso = new Date().toISOString();
            setLastSavedLocalAt(nowIso);
            setLastSyncedRemoteAt(nowIso);
            setLastError(null);

            if (isTauri()) {
              await markRemoteSynced(targetId, snapRemoteHash, returned.backendUuid);
            }

            if (
              (explicit || !isTauri()) &&
              editorLocalHashRef.current === snapLocalHash &&
              editorRemoteHashRef.current === snapRemoteHash
            ) {
              flashJustSaved();
            }
          } else {
            // Honest fallback: saved locally in SQLite + queued in outbox, NOT synced to server
            setLocalSavedHashSynced(snapLocalHash);
            setLastSavedLocalAt(new Date().toISOString());

            if (returned.remoteSyncNetworkError) {
              dispatch(connectionLost());
            }
            if (returned.remoteSyncError && explicit) {
              setLastError(returned.remoteSyncError);
            } else {
              setLastError(null);
            }
          }
        } catch (err) {
          if (activeDocIdRef.current === targetId) {
            setLastError(err instanceof Error ? err.message : String(err));
          }
        } finally {
          if (activeDocIdRef.current === targetId) {
            setIsSavingRemote(false);
          }
        }
      };

      const p = run().finally(() => {
        remoteSaveInFlightRef.current = null;
        if (remoteSaveQueuedRef.current && activeDocIdRef.current === id) {
          const nextExplicit = queuedExplicitRef.current;
          remoteSaveQueuedRef.current = false;
          queuedExplicitRef.current = false;
          void saveRemoteNow({ explicit: nextExplicit });
        } else {
          remoteSaveQueuedRef.current = false;
          queuedExplicitRef.current = false;
        }
      });

      remoteSaveInFlightRef.current = p;
      await p;
    },
    [
      id,
      skip,
      clearDebounceTimers,
      getLatestSnapshot,
      setEditorHashes,
      setLocalSavedHashSynced,
      setRemoteSyncedHashSynced,
      setHasRemoteIdentitySynced,
      flashJustSaved,
      updateDoc,
      dispatch,
    ]
  );

  const applySnapshotPatch = useCallback(
    (
      patch: Partial<DocEditableSnapshot>,
      opts: { isRemote?: boolean; localDebounceMs?: number; remoteDebounceMs?: number } = {}
    ) => {
      if (skip) return;
      const base =
        editorSnapshotRef.current ?? (docRef.current ? snapshotFromDoc(docRef.current) : null);
      if (!base) return;

      const next: DocEditableSnapshot = { ...base, ...patch };
      editorSnapshotRef.current = next;

      const nextLocalHash = computeDocLocalHashSync(next);
      const nextRemoteHash = computeDocRemoteHashSync(next);
      setEditorHashes(nextLocalHash, nextRemoteHash);

      if (opts.isRemote) {
        // Remote Yjs sync update: persist silently only when there are no pending local manual edits
        const wasLocalClean =
          localSavedHashRef.current !== null &&
          editorLocalHashRef.current === localSavedHashRef.current;
        if (isTauri() && wasLocalClean && nextLocalHash !== localSavedHashRef.current) {
          void saveDocLocally(id, next, { preserveSyncedHash: true }).then(() => {
            if (activeDocIdRef.current === id) {
              setLocalSavedHashSynced(nextLocalHash);
            }
          });
        }
        return;
      }

      userEditedRef.current = true;
      setLastError(null);

      if (!autoSaveRef.current) {
        // Auto-save disabled: keep timers stopped; hashes drive exact dirty UI immediately
        return;
      }

      const localDelay = opts.localDebounceMs ?? LOCAL_CONTENT_DEBOUNCE_MS;
      const remoteDelay = opts.remoteDebounceMs ?? REMOTE_CONTENT_DEBOUNCE_MS;

      if (isTauri()) {
        if (localTimerRef.current) clearTimeout(localTimerRef.current);
      localTimerRef.current = setTimeout(() => {
        localTimerRef.current = null;
        void saveLocalNow();
      }, localDelay);
      }

      // Only auto-push published docs to backend; drafts stay safe in SQLite until Ctrl+S
      if (
        next.status === 1 &&
        isOnlineRef.current &&
        (!hasRemoteIdentityRef.current || nextRemoteHash !== remoteSyncedHashRef.current)
      ) {
        if (remoteTimerRef.current) clearTimeout(remoteTimerRef.current);
        remoteTimerRef.current = setTimeout(() => {
          remoteTimerRef.current = null;
          void saveRemoteNow({ explicit: false });
        }, remoteDelay);
      }
    },
    [
      id,
      skip,
      setEditorHashes,
      setLocalSavedHashSynced,
      saveLocalNow,
      saveRemoteNow,
    ]
  );

  // Flush pending local/remote edits if user toggles autoSave back ON
  useEffect(() => {
    if (skip || !autoSave) return;
    if (
      isTauri() &&
      editorLocalHashRef.current &&
      localSavedHashRef.current &&
      editorLocalHashRef.current !== localSavedHashRef.current
    ) {
      void saveLocalNow();
    }
    const snap = getLatestSnapshot();
    if (
      snap?.status === 1 &&
      isOnlineRef.current &&
      editorRemoteHashRef.current &&
      (!hasRemoteIdentityRef.current || editorRemoteHashRef.current !== remoteSyncedHashRef.current)
    ) {
      void saveRemoteNow({ explicit: false });
    }
  }, [autoSave, skip, saveLocalNow, saveRemoteNow, getLatestSnapshot]);

  // Explicit save (Ctrl+S / Save button / Publish)
  const triggerSave = useCallback(async () => {
    if (skip) return;
    clearDebounceTimers();

    // Flush draft excalidraw blocks → create real canvases and sync editor state
    const editorInstance = editorRef?.current;
    if (editorInstance) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawBlocks: any[] = editorInstance.document;
        const { updatedBlocks, createdCount } = await flushDraftCanvases(rawBlocks);
        if (createdCount > 0) {
          const base =
            editorSnapshotRef.current ?? (docRef.current ? snapshotFromDoc(docRef.current) : null);
          if (base) {
            const updated: DocEditableSnapshot = {
              ...base,
              content: JSON.stringify(updatedBlocks),
              plainText: extractBlocksPlainText(updatedBlocks),
            };
            editorSnapshotRef.current = updated;
            setEditorHashes(computeDocLocalHashSync(updated), computeDocRemoteHashSync(updated));
          }
          try {
            editorInstance.replaceBlocks(editorInstance.document, updatedBlocks);
          } catch {
            // replaceBlocks may fail in collab mode; snapshot ref update is sufficient
          }
        }
      } catch (e) {
        console.warn("[DocEditor] draft canvas flush failed", e);
      }
    }

    await saveRemoteNow({ explicit: true });
  }, [skip, clearDebounceTimers, editorRef, setEditorHashes, saveRemoteNow]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBlocksChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (blocks: any[], meta?: BlockNoteChangeMeta) => {
      applySnapshotPatch(
        {
          content: JSON.stringify(blocks),
          plainText: extractBlocksPlainText(blocks),
        },
        {
          isRemote: meta?.isRemote,
          localDebounceMs: LOCAL_CONTENT_DEBOUNCE_MS,
          remoteDebounceMs: REMOTE_CONTENT_DEBOUNCE_MS,
        }
      );
    },
    [applySnapshotPatch]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      dispatch(setPageTitle(newTitle));
      applySnapshotPatch(
        { title: newTitle },
        {
          localDebounceMs: LOCAL_TITLE_DEBOUNCE_MS,
          remoteDebounceMs: REMOTE_TITLE_DEBOUNCE_MS,
        }
      );
    },
    [dispatch, applySnapshotPatch]
  );

  const handleMetadataChange = useCallback(
    (meta: DocMetadata) => {
      applySnapshotPatch(
        { metadata: serializeDocMetadata(meta) },
        {
          localDebounceMs: LOCAL_META_DEBOUNCE_MS,
          remoteDebounceMs: REMOTE_META_DEBOUNCE_MS,
        }
      );
    },
    [applySnapshotPatch]
  );

  const handleSeriesIdChange = useCallback(
    (seriesId: number | null) => {
      applySnapshotPatch(
        { seriesId },
        {
          localDebounceMs: LOCAL_META_DEBOUNCE_MS,
          remoteDebounceMs: REMOTE_META_DEBOUNCE_MS,
        }
      );
    },
    [applySnapshotPatch]
  );

  const runWithSaveStatus = useCallback(
    async (fn: () => Promise<unknown>) => {
      setExternalSavingCount((c) => c + 1);
      setLastError(null);
      try {
        await fn();
        flashJustSaved();
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
      } finally {
        setExternalSavingCount((c) => Math.max(0, c - 1));
      }
    },
    [flashJustSaved]
  );

  if (skip) {
    return {
      doc: null,
      backendData: null,
      isSavedOnline: false,
      isCheckingRemote: false,
      isSyncedToServer: false,
      isLoading: false,
      isFetching: false,
      saveStatus: "idle" as SaveStatus,
      persistenceState: "synced" as DocPersistenceState,
      isDirty: false,
      isLocalDirty: false,
      isRemoteDirty: false,
      justSaved: false,
      lastError: null,
      lastSavedLocalAt: null,
      lastSyncedRemoteAt: null,
      isDraft: false,
      isOffline: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleBlocksChange: noop as (blocks: any[], meta?: BlockNoteChangeMeta) => void,
      handleTitleChange: noop as (title: string) => void,
      handleMetadataChange: noop as (meta: DocMetadata) => void,
      handleSeriesIdChange: noop as (seriesId: number | null) => void,
      triggerSave: noop,
      runWithSaveStatus: noop as typeof runWithSaveStatus,
      getLatestSnapshot: () => null,
    };
  }

  return {
    doc,
    backendData: backendData ?? null,
    isSavedOnline,
    isCheckingRemote,
    isSyncedToServer,
    isLoading,
    isFetching,
    saveStatus,
    persistenceState,
    isDirty,
    isLocalDirty,
    isRemoteDirty,
    justSaved,
    lastError,
    lastSavedLocalAt,
    lastSyncedRemoteAt,
    isDraft,
    isOffline,
    handleBlocksChange,
    handleTitleChange,
    handleMetadataChange,
    handleSeriesIdChange,
    triggerSave,
    runWithSaveStatus,
    getLatestSnapshot,
  };
}
