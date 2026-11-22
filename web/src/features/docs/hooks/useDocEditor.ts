import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useGetDocByIdQuery, useUpdateDocMutation } from "@/infrastructure/api/docsApi";
import {
  setDocSaveState,
  clearDocSaveState,
  type DocPersistenceState,
} from "@/store/docsSlice";
import { setPageTitle, selectIsOnline, connectionLost } from "@/store/appSlice";
import type { AppDispatch } from "@/store";
import type { DocDto, DocMetadata, DocRequest } from "@/core/interfaces/docs";
import { serializeDocMetadata } from "@/core/interfaces/docs";
import {
  computeDocLocalHashSync,
  computeDocRemoteHashSync,
  normalizeDocStatusValue,
} from "@/core/utils/contentHash";
import { extractBlocksPlainText } from "../utils/plainTextExtractor";
import type { BlockNoteChangeMeta } from "@/components/BlockNote/useBlockNoteEditor";
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
  const { data: backendData = null, error, isLoading, isFetching } = useGetDocByIdQuery(id, {
    skip,
    refetchOnMountOrArgChange: true,
  });

  const [updateDoc] = useUpdateDocMutation();

  // Operation state
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [externalSavingCount, setExternalSavingCount] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
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

  const remoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single-flight coordination refs
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
    if (remoteTimerRef.current) {
      clearTimeout(remoteTimerRef.current);
      remoteTimerRef.current = null;
    }
  }, []);

  const doc = !skip ? (backendData ?? null) : null;
  const docRef = useRef(doc);
  docRef.current = doc;

  const isSavedOnline = Boolean(!skip && backendData && !error);
  const isOffline = !skip && !!error && !isLoading;
  const isDraft = (editorSnapshotRef.current?.status ?? doc?.status) === 0;

  // Derived truth from hashes (single source of truth — never manually mutated)
  const isLocalDirty = Boolean(
    editorLocalHash && localSavedHash && editorLocalHash !== localSavedHash
  );
  const isRemoteDirty = Boolean(
    editorRemoteHash && (!hasRemoteIdentity || editorRemoteHash !== remoteSyncedHash)
  );
  const isDirty = isLocalDirty || isRemoteDirty;
  const isSaving = isSavingRemote || externalSavingCount > 0;
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

  // Reset all state on docId switch
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
    remoteSaveInFlightRef.current = null;
    remoteSaveQueuedRef.current = false;
    queuedExplicitRef.current = false;

    setIsSavingRemote(false);
    setExternalSavingCount(0);
    setJustSaved(false);
    setLastError(null);
    setLastSyncedRemoteAt(null);

    return () => {
      clearDebounceTimers();
      if (justSavedTimerRef.current) {
        clearTimeout(justSavedTimerRef.current);
        justSavedTimerRef.current = null;
      }
      dispatch(clearDocSaveState(id));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, skip]);

  // Reconcile baseline hashes whenever backendData updates
  useEffect(() => {
    if (skip) return;
    if (backendData && !error) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, skip, backendData, error]);

  // Keep page title updated
  useEffect(() => {
    if (doc?.title) dispatch(setPageTitle(doc.title));
  }, [dispatch, doc?.id, doc?.title]);

  // Publish per-doc save state to Redux
  useEffect(() => {
    if (skip) return;
    dispatch(
      setDocSaveState({
        docId: id,
        status: persistenceState,
        isLocalDirty,
        isRemoteDirty,
        isSaving,
        lastSavedLocalAt: null,
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
    lastSyncedRemoteAt,
    lastError,
    dispatch,
  ]);

  const getLatestSnapshot = useCallback((): DocEditableSnapshot | null => {
    if (editorSnapshotRef.current) return editorSnapshotRef.current;
    if (docRef.current) return snapshotFromDoc(docRef.current);
    return null;
  }, []);

  // Single-flight remote save
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

        const needsRemote =
          !hasRemoteIdentityRef.current || snapRemoteHash !== remoteSyncedHashRef.current;

        if (!needsRemote) {
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
          if (activeDocIdRef.current !== targetId) return;

          if (!isOnlineRef.current) {
            setLastError("Đang ngoại tuyến — chưa thể lưu lên server");
            return;
          }

          const requestBody = buildRequestFromSnapshot(snap);
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

          setHasRemoteIdentitySynced(true);
          // Strictly mark the snapshot we ACTUALLY sent as synced — never live editor state
          setRemoteSyncedHashSynced(snapRemoteHash);
          setLocalSavedHashSynced(snapLocalHash);
          setLastSyncedRemoteAt(new Date().toISOString());
          setLastError(null);

          if (
            editorLocalHashRef.current === snapLocalHash &&
            editorRemoteHashRef.current === snapRemoteHash
          ) {
            flashJustSaved();
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

      const wasClean =
        localSavedHashRef.current !== null &&
        editorLocalHashRef.current === localSavedHashRef.current &&
        (!hasRemoteIdentityRef.current
          ? false
          : editorRemoteHashRef.current === remoteSyncedHashRef.current);

      const next: DocEditableSnapshot = { ...base, ...patch };
      editorSnapshotRef.current = next;

      const nextLocalHash = computeDocLocalHashSync(next);
      const nextRemoteHash = computeDocRemoteHashSync(next);
      setEditorHashes(nextLocalHash, nextRemoteHash);

      if (opts.isRemote) {
        if (wasClean) {
          setLocalSavedHashSynced(nextLocalHash);
          setRemoteSyncedHashSynced(nextRemoteHash);
        }
        return;
      }

      userEditedRef.current = true;
      setLastError(null);

      if (!autoSaveRef.current) {
        return;
      }

      const remoteDelay = opts.remoteDebounceMs ?? REMOTE_CONTENT_DEBOUNCE_MS;

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
      skip,
      setEditorHashes,
      setLocalSavedHashSynced,
      setRemoteSyncedHashSynced,
      saveRemoteNow,
    ]
  );

  // Flush pending remote edits if user toggles autoSave back ON
  useEffect(() => {
    if (skip || !autoSave) return;
    const snap = getLatestSnapshot();
    if (
      snap?.status === 1 &&
      isOnlineRef.current &&
      editorRemoteHashRef.current &&
      (!hasRemoteIdentityRef.current || editorRemoteHashRef.current !== remoteSyncedHashRef.current)
    ) {
      void saveRemoteNow({ explicit: false });
    }
  }, [autoSave, skip, saveRemoteNow, getLatestSnapshot]);

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
    isCheckingRemote: false,
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
    lastSavedLocalAt: null,
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
