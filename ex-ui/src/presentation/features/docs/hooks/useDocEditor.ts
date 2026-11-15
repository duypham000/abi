import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useGetDocByIdQuery, useUpdateDocMutation } from "@/infrastructure/api/docsApi";
import { setDirty } from "@/presentation/store/docsSlice";
import { setPageTitle, selectIsOnline, connectionLost } from "@/presentation/store/appSlice";
import type { AppDispatch } from "@/presentation/store";
import type { DocMetadata } from "@/core/interfaces/docs";
import { serializeDocMetadata } from "@/core/interfaces/docs";
import { extractBlocksPlainText } from "../utils/plainTextExtractor";
import {
  cacheDoc,
  getCachedDoc,
  getCachedDocWithDirty,
  saveDocLocally,
  markClean,
} from "@/infrastructure/tauri/docCacheService";
import { pushRecentDoc } from "@/infrastructure/tauri/recentDocsService";
import { flushDraftCanvases } from "./canvasFlushHelper";

export type SaveStatus = "idle" | "saving" | "success" | "error";

const SUCCESS_RESET_DELAY = 500;
const CONTENT_DEBOUNCE_MS = 1500;
const TITLE_DEBOUNCE_MS = 800;
const META_DEBOUNCE_MS = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = async (..._args: any[]) => {};

export function useDocEditor(
  id: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef?: React.MutableRefObject<any>
) {
  const dispatch = useDispatch<AppDispatch>();
  const isOnline = useSelector(selectIsOnline);

  const skip = id < 0;
  const { data: backendData, error, isLoading: backendLoading, isFetching } = useGetDocByIdQuery(id, {
    skip,
    refetchOnMountOrArgChange: true,
  });

  const [cachedDoc, setCachedDoc] = useState<typeof backendData>(undefined);
  const [cacheLoading, setCacheLoading] = useState(false);
  // Dirty local content loaded from SQLite on mount (before API responds)
  const [dirtyLocalDoc, setDirtyLocalDoc] = useState<typeof backendData>(undefined);

  const [updateDoc] = useUpdateDocMutation();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Cache successful backend response
  useEffect(() => {
    if (backendData) cacheDoc(backendData);
  }, [backendData]);

  // Fallback to SQLite when API fails
  useEffect(() => {
    if (!error || skip) return;
    setCacheLoading(true);
    getCachedDoc(id).then((d) => {
      setCachedDoc(d ?? undefined);
      setCacheLoading(false);
    });
  }, [error, id, skip]);

  // On mount, check if SQLite has dirty (unsaved-to-server) content and prefer it
  useEffect(() => {
    if (skip) return;
    getCachedDocWithDirty(id).then(({ doc, isDirty }) => {
      if (isDirty && doc) setDirtyLocalDoc(doc as typeof backendData);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, skip]);

  // When the server save succeeds (markClean called elsewhere), clear dirty local state
  // so subsequent re-mounts use fresh API data
  useEffect(() => {
    if (backendData && dirtyLocalDoc && !error) setDirtyLocalDoc(undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendData?.id]);

  // Priority: dirty local SQLite (unsaved edits) > fresh API > SQLite error fallback
  const doc = !skip ? (dirtyLocalDoc ?? backendData ?? cachedDoc ?? null) : null;
  const isOffline = !skip && !!error && !backendLoading;
  const isLoading = !skip && (backendLoading || cacheLoading);

  const isDraft = doc?.status === 0;

  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingTitleRef = useRef<string | null>(null);
  const pendingMetaRef = useRef<DocMetadata | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingBlocksRef = useRef<any[] | null>(null);
  const pendingSeriesIdRef = useRef<number | null | undefined>(undefined);

  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    if (doc?.title) dispatch(setPageTitle(doc.title));
    if (!skip && id > 0 && doc) {
      pushRecentDoc({ kind: "doc", id: String(id), title: doc.title });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const buildRequest = useCallback((explicit = false) => {
    const doc = docRef.current;
    if (!doc) return null;
    const blocks = pendingBlocksRef.current;
    return {
      title: pendingTitleRef.current ?? doc.title,
      content: blocks != null ? JSON.stringify(blocks) : doc.content,
      plainText: blocks != null ? extractBlocksPlainText(blocks) : doc.plainText,
      metadata: pendingMetaRef.current ? serializeDocMetadata(pendingMetaRef.current) : doc.metadata,
      seriesId: pendingSeriesIdRef.current !== undefined ? pendingSeriesIdRef.current : doc.seriesId,
      lastSync: new Date().toISOString(),
      status: (explicit && doc.status === 0 ? 1 : doc.status) as 0 | 1,
      // yhub worker persists the Y.Doc; never send full state over REST.
      yjsState: null,
    };
  }, []);

  // Silently persist to SQLite on every debounced edit
  const saveLocally = useCallback(async () => {
    const doc = docRef.current;
    if (!doc || doc.status === 0) { return; }
    const request = buildRequest();
    if (!request) { return; }
    await saveDocLocally(id, request, true);
  }, [id, buildRequest]);

  // Push to server — only called on explicit save (Ctrl+S)
  const performSave = useCallback(async (explicit = false) => {
    const doc = docRef.current;
    if (!doc) return;
    if (doc.status === 0 && !explicit) return;

    setSaveStatus("saving");
    if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }

    const request = buildRequest(explicit);
    if (!request) return;

    await saveDocLocally(id, request, !isOnlineRef.current);

    if (isOnlineRef.current) {
      const result = await updateDoc({ id, body: request });
      if ("error" in result) {
        const isNetwork = (result.error as { status?: string })?.status === "FETCH_ERROR";
        if (isNetwork) {
          dispatch(connectionLost());
          setSaveStatus("success");
          successTimerRef.current = setTimeout(() => setSaveStatus("idle"), SUCCESS_RESET_DELAY);
        } else {
          setSaveStatus("error");
        }
      } else {
        await markClean(id);
        pendingTitleRef.current = null;
        pendingMetaRef.current = null;
        pendingBlocksRef.current = null;
        pendingSeriesIdRef.current = undefined;
        dispatch(setDirty(false));
        setSaveStatus("success");
        successTimerRef.current = setTimeout(() => setSaveStatus("idle"), SUCCESS_RESET_DELAY);
      }
    } else {
      pendingTitleRef.current = null;
      pendingMetaRef.current = null;
      pendingBlocksRef.current = null;
      pendingSeriesIdRef.current = undefined;
      dispatch(setDirty(false));
      setSaveStatus("success");
      successTimerRef.current = setTimeout(() => setSaveStatus("idle"), SUCCESS_RESET_DELAY);
    }
  }, [id, buildRequest, updateDoc, dispatch]);

  const triggerSave = useCallback(async () => {
    [contentTimerRef, titleTimerRef, metaTimerRef].forEach((ref) => {
      if (ref.current) { clearTimeout(ref.current); ref.current = null; }
    });
    // Flush draft excalidraw blocks → create real canvases and sync editor state
    const editorInstance = editorRef?.current;
    if (editorInstance) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawBlocks: any[] = editorInstance.document;
        const { updatedBlocks, createdCount } = await flushDraftCanvases(rawBlocks);
        if (createdCount > 0) {
          pendingBlocksRef.current = updatedBlocks;
          try {
            editorInstance.replaceBlocks(editorInstance.document, updatedBlocks);
          } catch {
            // replaceBlocks may fail in collab mode; pending ref update is sufficient
          }
        }
      } catch (e) {
        console.warn("[DocEditor] draft canvas flush failed", e);
      }
    }
    await performSave(true);
  }, [performSave, editorRef]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBlocksChange = useCallback((blocks: any[]) => {
    pendingBlocksRef.current = blocks;
    dispatch(setDirty(true));
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    contentTimerRef.current = setTimeout(saveLocally, CONTENT_DEBOUNCE_MS);
  }, [dispatch, saveLocally]);

  const handleTitleChange = useCallback((newTitle: string) => {
    dispatch(setPageTitle(newTitle));
    dispatch(setDirty(true));
    pendingTitleRef.current = newTitle;
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(saveLocally, TITLE_DEBOUNCE_MS);
  }, [dispatch, saveLocally]);

  const handleMetadataChange = useCallback((meta: DocMetadata) => {
    dispatch(setDirty(true));
    pendingMetaRef.current = meta;
    if (metaTimerRef.current) clearTimeout(metaTimerRef.current);
    metaTimerRef.current = setTimeout(saveLocally, META_DEBOUNCE_MS);
  }, [dispatch, saveLocally]);

  const handleSeriesIdChange = useCallback((seriesId: number | null) => {
    dispatch(setDirty(true));
    pendingSeriesIdRef.current = seriesId;
    if (metaTimerRef.current) clearTimeout(metaTimerRef.current);
    metaTimerRef.current = setTimeout(saveLocally, META_DEBOUNCE_MS);
  }, [dispatch, saveLocally]);

  const runWithSaveStatus = useCallback(async (fn: () => Promise<unknown>) => {
    setSaveStatus("saving");
    if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }
    try {
      await fn();
      setSaveStatus("success");
      successTimerRef.current = setTimeout(() => setSaveStatus("idle"), SUCCESS_RESET_DELAY);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  if (skip) {
    return {
      doc: null,
      isLoading: false,
      isFetching: false,
      saveStatus: "idle" as SaveStatus,
      isDraft: false,
      isOffline: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleBlocksChange: noop as (blocks: any[]) => void,
      handleTitleChange: noop as (title: string) => void,
      handleMetadataChange: noop as (meta: import("@/core/interfaces/docs").DocMetadata) => void,
      handleSeriesIdChange: noop as (seriesId: number | null) => void,
      triggerSave: noop,
      runWithSaveStatus: noop as typeof runWithSaveStatus,
    };
  }

  return {
    doc,
    isLoading,
    isFetching,
    saveStatus,
    isDraft,
    isOffline,
    handleBlocksChange,
    handleTitleChange,
    handleMetadataChange,
    handleSeriesIdChange,
    triggerSave,
    runWithSaveStatus,
  };
}
