import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useCreateDocMutation } from "@/infrastructure/api/docsApi";
import { setDirty } from "@/presentation/store/docsSlice";
import { setPageTitle } from "@/presentation/store/appSlice";
import type { AppDispatch } from "@/presentation/store";
import type { DocDto, DocMetadata } from "@/core/interfaces/docs";
import { serializeDocMetadata } from "@/core/interfaces/docs";
import { extractBlocksPlainText } from "../utils/plainTextExtractor";
import { getDraft, saveDraft, deleteDraft } from "@/infrastructure/tauri/docCacheService";
import { pushRecentDoc, removeRecentDoc } from "@/infrastructure/tauri/recentDocsService";
import type { SaveStatus } from "./useDocEditor";

const CONTENT_DEBOUNCE_MS = 1500;
const TITLE_DEBOUNCE_MS = 800;
const SUCCESS_RESET_DELAY = 500;

export function useLocalDraftEditor(
  localId: string,
  onPromoted: (backendId: number) => void
) {
  const dispatch = useDispatch<AppDispatch>();
  const [createDoc] = useCreateDocMutation();

  const [doc, setDoc] = useState<DocDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const pendingTitleRef = useRef<string | null>(null);
  const pendingMetaRef = useRef<DocMetadata | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingBlocksRef = useRef<any[] | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Once triggerSave succeeds, permanently block any further SQLite writes so
  // an in-flight or debounced saveToSQLite cannot re-create the deleted draft.
  const promotedRef = useRef(false);

  const docRef = useRef(doc);
  docRef.current = doc;

  // Load draft from SQLite on mount
  useEffect(() => {
    if (!localId) return;
    setIsLoading(true);
    getDraft(localId)
      .then((row) => {
        if (row) {
          const draftDoc: DocDto = {
            id: -1,
            title: row.title,
            content: row.content,
            plainText: row.plain_text ?? null,
            metadata: row.metadata,
            lastSync: null,
            status: 0,
            createdBy: null,
          };
          setDoc(draftDoc);
          dispatch(setPageTitle(row.title || "Untitled"));
          pushRecentDoc({ kind: "draft", id: localId, title: row.title });
        } else {
          // Fallback: if draft not found in local db, initialize a default empty draft structure
          const fallbackDoc: DocDto = {
            id: -1,
            title: "Untitled",
            content: null,
            plainText: null,
            metadata: null,
            lastSync: null,
            status: 0,
            createdBy: null,
          };
          setDoc(fallbackDoc);
          dispatch(setPageTitle("Untitled"));
        }
      })
      .catch(() => {
        // Fallback on error
        const fallbackDoc: DocDto = {
          id: -1,
          title: "Untitled",
          content: null,
          plainText: null,
          metadata: null,
          lastSync: null,
          status: 0,
          createdBy: null,
        };
        setDoc(fallbackDoc);
        dispatch(setPageTitle("Untitled"));
      })
      .finally(() => setIsLoading(false));
  }, [localId, dispatch]);

  const saveToSQLite = useCallback(async () => {
    // Guard: once promoted to backend, never write back to local draft table.
    if (promotedRef.current) return;

    const current = docRef.current;
    const title = pendingTitleRef.current ?? current?.title ?? "Untitled";
    const blocks = pendingBlocksRef.current;
    const content = blocks != null ? JSON.stringify(blocks) : current?.content ?? null;
    const meta = pendingMetaRef.current
      ? serializeDocMetadata(pendingMetaRef.current)
      : current?.metadata ?? null;

    // An empty, untitled draft is not worth a SQLite row — opening then closing
    // quick-create must leave no trace.
    const titleStr = title.trim();
    const isUntitled = titleStr === "" || titleStr === "Untitled";
    const plain =
      blocks != null
        ? extractBlocksPlainText(blocks).trim()
        : (current?.plainText ?? "").trim();
    if (isUntitled && plain === "") return;

    await saveDraft(localId, title, content, meta);

    // Guard again: in case triggerSave completed while we were awaiting saveDraft.
    // Undo the write — delete the row we just (re-)created.
    if (promotedRef.current) {
      await deleteDraft(localId);
      return;
    }

    // Update local state
    setDoc((prev) =>
      prev ? { ...prev, title, content, metadata: meta } : prev
    );

    pendingTitleRef.current = null;
    pendingMetaRef.current = null;
    pendingBlocksRef.current = null;
    dispatch(setDirty(false));
  }, [localId, dispatch]);

  // Ctrl+S: push to backend, delete draft, call onPromoted
  const triggerSave = useCallback(async () => {
    // Prevent double-save if already promoted.
    if (promotedRef.current) return;

    [contentTimerRef, titleTimerRef].forEach((ref) => {
      if (ref.current) { clearTimeout(ref.current); ref.current = null; }
    });

    const current = docRef.current;
    const title = pendingTitleRef.current ?? current?.title ?? "Untitled";
    const blocks = pendingBlocksRef.current;
    const content = blocks != null ? JSON.stringify(blocks) : current?.content ?? null;
    const plainText = blocks != null ? extractBlocksPlainText(blocks) : current?.plainText ?? null;
    const metadata = pendingMetaRef.current
      ? serializeDocMetadata(pendingMetaRef.current)
      : current?.metadata ?? null;

    setSaveStatus("saving");
    if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }

    try {
      const newDoc = await createDoc({
        title,
        content,
        plainText,
        metadata,
        lastSync: new Date().toISOString(),
        status: 1,
      }).unwrap();

      // Set promoted flag BEFORE deleteDraft so any concurrent saveToSQLite
      // running right now will see it and clean up after itself.
      promotedRef.current = true;

      await deleteDraft(localId);
      // Remove the draft from the recent-docs list so it won't show alongside
      // the newly-created backend doc entry.
      await removeRecentDoc("draft", localId);
      dispatch(setDirty(false));
      setSaveStatus("success");
      successTimerRef.current = setTimeout(() => setSaveStatus("idle"), SUCCESS_RESET_DELAY);
      onPromoted(newDoc.id);
    } catch {
      setSaveStatus("error");
    }
  }, [localId, createDoc, dispatch, onPromoted]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBlocksChange = useCallback((blocks: any[]) => {
    pendingBlocksRef.current = blocks;
    dispatch(setDirty(true));
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    contentTimerRef.current = setTimeout(saveToSQLite, CONTENT_DEBOUNCE_MS);
  }, [dispatch, saveToSQLite]);

  const handleTitleChange = useCallback((newTitle: string) => {
    dispatch(setPageTitle(newTitle));
    dispatch(setDirty(true));
    pendingTitleRef.current = newTitle;
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(saveToSQLite, TITLE_DEBOUNCE_MS);
  }, [dispatch, saveToSQLite]);

  const handleMetadataChange = useCallback((meta: DocMetadata) => {
    dispatch(setDirty(true));
    pendingMetaRef.current = meta;
    saveToSQLite();
  }, [dispatch, saveToSQLite]);

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

  return {
    doc,
    isLoading,
    isFetching: false as const,
    saveStatus,
    isDraft: true as const,
    isOffline: false as const,
    handleBlocksChange,
    handleTitleChange,
    handleMetadataChange,
    triggerSave,
    runWithSaveStatus,
  };
}
