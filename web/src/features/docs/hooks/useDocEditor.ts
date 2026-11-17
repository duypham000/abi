import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useDispatch } from "react-redux";
import { useGetDocByIdQuery, useUpdateDocMutation } from "@/infrastructure/api/docsApi";
import { setDirty } from "@/store/docsSlice";
import { setPageTitle } from "@/store/appSlice";
import type { AppDispatch } from "@/store";
import type { DocMetadata } from "@/core/interfaces/docs";
import { serializeDocMetadata } from "@/core/interfaces/docs";
import { extractBlocksPlainText } from "../utils/plainTextExtractor";
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
  const skip = id < 0;

  const {
    data: backendData = null,
    error,
    isLoading,
    isFetching,
  } = useGetDocByIdQuery(id, {
    skip,
    refetchOnMountOrArgChange: true,
  });

  const doc = backendData;

  const [updateDoc] = useUpdateDocMutation();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const isOffline = !skip && !!error && !isLoading;
  const isDraft = doc?.status === 0;
  const isSavedOnline = Boolean(!skip && backendData && !error);

  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingTitleRef = useRef<string | null>(null);
  const pendingMetaRef = useRef<DocMetadata | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingBlocksRef = useRef<any[] | null>(null);
  const pendingSeriesIdRef = useRef<number | null | undefined>(undefined);

  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    if (doc?.title) dispatch(setPageTitle(doc.title));
  }, [dispatch, doc?.id, doc?.title]);

  useEffect(() => {
    return () => {
      [contentTimerRef, titleTimerRef, metaTimerRef, successTimerRef].forEach((r) => {
        if (r.current) clearTimeout(r.current);
      });
    };
  }, []);

  const buildRequest = useCallback((explicit = false) => {
    const current = docRef.current;
    if (!current) return null;
    const blocks = pendingBlocksRef.current;
    return {
      title: pendingTitleRef.current ?? current.title,
      content: blocks != null ? JSON.stringify(blocks) : current.content,
      plainText: blocks != null ? extractBlocksPlainText(blocks) : current.plainText,
      metadata: pendingMetaRef.current
        ? serializeDocMetadata(pendingMetaRef.current)
        : current.metadata,
      seriesId:
        pendingSeriesIdRef.current !== undefined
          ? pendingSeriesIdRef.current
          : current.seriesId,
      lastSync: new Date().toISOString(),
      status: (explicit && current.status === 0 ? 1 : current.status) as 0 | 1,
      yjsState: null,
    };
  }, []);

  const performSave = useCallback(
    async (explicit = false) => {
      const current = docRef.current;
      if (!current) return;
      if (current.status === 0 && !explicit) return;

      const request = buildRequest(explicit);
      if (!request) return;

      setSaveStatus("saving");
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }

      const result = await updateDoc({ id, body: request });
      if ("error" in result) {
        setSaveStatus("error");
      } else {
        pendingTitleRef.current = null;
        pendingMetaRef.current = null;
        pendingBlocksRef.current = null;
        pendingSeriesIdRef.current = undefined;
        dispatch(setDirty(false));
        setSaveStatus("success");
        successTimerRef.current = setTimeout(
          () => setSaveStatus("idle"),
          SUCCESS_RESET_DELAY
        );
      }
    },
    [id, buildRequest, updateDoc, dispatch]
  );

  const triggerSave = useCallback(async () => {
    [contentTimerRef, titleTimerRef, metaTimerRef].forEach((ref) => {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    });

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
    contentTimerRef.current = setTimeout(() => {
      void performSave(false);
    }, CONTENT_DEBOUNCE_MS);
  }, [dispatch, performSave]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      dispatch(setPageTitle(newTitle));
      dispatch(setDirty(true));
      pendingTitleRef.current = newTitle;
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      titleTimerRef.current = setTimeout(() => {
        void performSave(false);
      }, TITLE_DEBOUNCE_MS);
    },
    [dispatch, performSave]
  );

  const handleMetadataChange = useCallback(
    (meta: DocMetadata) => {
      dispatch(setDirty(true));
      pendingMetaRef.current = meta;
      if (metaTimerRef.current) clearTimeout(metaTimerRef.current);
      metaTimerRef.current = setTimeout(() => {
        void performSave(false);
      }, META_DEBOUNCE_MS);
    },
    [dispatch, performSave]
  );

  const handleSeriesIdChange = useCallback(
    (seriesId: number | null) => {
      dispatch(setDirty(true));
      pendingSeriesIdRef.current = seriesId;
      if (metaTimerRef.current) clearTimeout(metaTimerRef.current);
      metaTimerRef.current = setTimeout(() => {
        void performSave(false);
      }, META_DEBOUNCE_MS);
    },
    [dispatch, performSave]
  );

  const runWithSaveStatus = useCallback(async (fn: () => Promise<unknown>) => {
    setSaveStatus("saving");
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    try {
      await fn();
      setSaveStatus("success");
      successTimerRef.current = setTimeout(
        () => setSaveStatus("idle"),
        SUCCESS_RESET_DELAY
      );
    } catch {
      setSaveStatus("error");
    }
  }, []);

  if (skip) {
    return {
      doc: null,
      backendData: null,
      isSavedOnline: false,
      isSyncedToServer: false,
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
    backendData,
    isSavedOnline,
    isSyncedToServer: isSavedOnline,
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
