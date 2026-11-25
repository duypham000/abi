import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { useLayoutManager } from "@/presentation/layout/golden/useLayoutManager";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { message } from "antd";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { type RootState, type AppDispatch } from "@/presentation/store";
import { setCurrentDocId } from "@/presentation/store/docsSlice";
import { useDeleteDocMutation, useCreateDocMutation, useRestoreDocsFromServerMutation, docsApi, type DeleteScope } from "@/infrastructure/api/docsApi";
import { cacheDoc } from "@/infrastructure/tauri/docCacheService";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import { parseDocMetadata } from "@/core/interfaces/docs";
import { useDocEditor } from "../../hooks/useDocEditor";
import { usePersistedState } from "@/presentation/hooks/usePersistedState";
import { parseOrHashId } from "@/core/utils/idUtils";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import { DocEditorToolbar } from "./components/DocEditorToolbar";
import { DocRightPanel } from "./components/DocRightPanel";
import { ImportModal, type ImportFormat, type ImportTextFormat } from "./components/ImportModal/ImportModal";
import { ExportModal } from "./components/ExportModal/ExportModal";
import { DocEditorBody } from "./components/DocEditorBody";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import { useYjsCollaboration } from "../../hooks/useYjsCollaboration";
import { useGitDocSync } from "../../hooks/useGitDocSync";
import type { BlockNoteChangeMeta } from "@/presentation/components/BlockNote/useBlockNoteEditor";
import { useAgentStore } from "@/presentation/features/agent/store/agentStore";
import { DocRevisionPanel } from "./components/DocRevisionPanel/DocRevisionPanel";
import { FindReplaceBar } from "./components/FindReplaceBar/FindReplaceBar";
import { useFindAndReplace } from "./hooks/useFindAndReplace";
import { DocGitHistoryDrawer } from "@/presentation/features/git/components/DocGitHistoryDrawer";
import { GitConflictModal } from "@/presentation/features/git/components/GitConflictModal";
import {
  useGetGithubUserQuery,
  useSaveGitFileMutation,
  useGetWorkspaceManifestQuery,
  useGetFileHistoryQuery,
  useCheckFileStatusMutation,
  usePullRepoMutation,
  githubApi,
} from "@/infrastructure/api/githubApi";
import "./DocEditorPage.scss";

export interface EditorSettings {
  width: "narrow" | "medium" | "wide" | "full";
  pageSize: "A4" | "Letter";
  autoSave: boolean;
  showCanvas: boolean;
  showEditor: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = {
  width: "medium",
  pageSize: "A4",
  autoSave: true,
  showCanvas: false,
  showEditor: true,
};

function parseInitialBlocks(content: string | null | undefined): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.content)) return parsed.content;
    return [];
  } catch {
    return [{ type: "paragraph", content: [{ type: "text", text: content, styles: {} }] }];
  }
}

interface DocEditorPageProps {
  panelMode?: boolean;
  docIdProp?: number;
}

export default function DocEditorPage({ panelMode, docIdProp }: DocEditorPageProps) {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { openPanel } = useLayoutManager();

  const docId = docIdProp ?? Number(params.id);
  const dispatch = useDispatch<AppDispatch>();
  const theme = useSelector((state: RootState) => state.app.theme);
  const authUser = useSelector((state: RootState) => state.auth.user);

  const [editorSettings, setEditorSettings] = usePersistedState<EditorSettings>("editor-settings-v2", DEFAULT_SETTINGS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = useState<any | null>(null);
  const findReplace = useFindAndReplace({ editor });
  const findReplaceRef = useRef(findReplace);
  findReplaceRef.current = findReplace;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const editorAreaRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorReady = useCallback((e: any) => {
    setEditor(e);
    editorRef.current = e;
  }, []);

  const {
    doc,
    isSavedOnline,
    isCheckingRemote,
    isSyncedToServer,
    isLoading,
    isFetching,
    saveStatus,
    persistenceState,
    isDirty,
    justSaved,
    lastError,
    lastSavedLocalAt,
    lastSyncedRemoteAt,
    isDraft,
    handleBlocksChange: baseHandleBlocksChange,
    handleTitleChange: baseHandleTitleChange,
    handleMetadataChange,
    handleSeriesIdChange,
    triggerSave,
    runWithSaveStatus,
    getLatestSnapshot,
  } = useDocEditor(docId, { editorRef, autoSave: editorSettings.autoSave });

  const initialFetchDoneRef = useRef(false);
  if (doc && !isFetching) initialFetchDoneRef.current = true;
  const effectivelyLoading = isLoading || (isFetching && !initialFetchDoneRef.current);

  const { openDocPopup } = useDocPopup();
  const [deleteDoc] = useDeleteDocMutation();
  const [createDoc] = useCreateDocMutation();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"toc" | "properties">("toc");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isRevisionPanelOpen, setIsRevisionPanelOpen] = useState(false);
  const [isGitHistoryOpen, setIsGitHistoryOpen] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [saveGitFile, { isLoading: isSavingGit }] = useSaveGitFileMutation();
  const [checkFileStatus, { isLoading: isCheckingGit }] = useCheckFileStatusMutation();
  const [pullRepo, { isLoading: isPullingGit }] = usePullRepoMutation();

  const [gitFileStatus, setGitFileStatus] = useState<"clean" | "modified" | "untracked" | "conflict" | "behind">("clean");
  const [hasGitChanges, setHasGitChanges] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [remoteUpdated, setRemoteUpdated] = useState(false);

  const checkStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: githubUser } = useGetGithubUserQuery();
  const hasGit = Boolean(
    githubUser?.connected && (githubUser?.activeRepoName || githubUser?.active_repo_name)
  );

  const { data: manifest } = useGetWorkspaceManifestQuery(undefined, { skip: !hasGit });

  const gitFilePath = useMemo(() => {
    const slugKey = doc?.slug || null;
    const uuidKey = doc?.backendUuid || null;
    const matched = manifest?.items?.find((item) => {
      const candidates = [slugKey, uuidKey, String(docId)].filter(Boolean) as string[];
      for (const c of candidates) {
        const prefixed = c.startsWith("doc-") ? c : `doc-${c}`;
        if (
          item.id === c ||
          item.id === prefixed ||
          item.slug === c ||
          item.slug === prefixed ||
          item.path === `docs/${prefixed}.json`
        ) {
          return true;
        }
      }
      return (
        (item.type === "doc" || item.path.startsWith("docs/doc-")) &&
        parseOrHashId(item.id.startsWith("doc-") ? item.id : `doc-${item.id}`, "doc-") === docId
      );
    });
    if (matched?.path) return matched.path;
    return `docs/doc-${docId}.json`;
  }, [manifest, doc?.slug, doc?.backendUuid, docId]);

  const { data: fileHistory } = useGetFileHistoryQuery(gitFilePath, {
    skip: !hasGit || !docId || isLoading,
  });

  const isDocOnGit = useMemo(() => {
    if (!docId) return false;
    const candidates = [doc?.slug, doc?.backendUuid, String(docId)].filter(Boolean) as string[];
    const inManifest = manifest?.items?.some((item) => {
      if (item.path === gitFilePath) return true;
      return candidates.some((c) => {
        const prefixed = c.startsWith("doc-") ? c : `doc-${c}`;
        return item.id === c || item.id === prefixed || item.slug === c || item.slug === prefixed;
      });
    });
    const hasHistory = Array.isArray(fileHistory) && fileHistory.length > 0;
    return Boolean(inManifest || hasHistory);
  }, [manifest, fileHistory, docId, doc?.slug, doc?.backendUuid, gitFilePath]);

  // Yjs real-time collaboration is only activated when document exists online on backend or git
  const needsGitSync = Boolean(!isLoading && !isCheckingRemote && docId > 0 && isDocOnGit && !isSavedOnline);
  const { backendDocId: syncedBackendId, status: gitSyncStatus } = useGitDocSync(
    docId,
    gitFilePath,
    needsGitSync
  );

  // Yjs real-time collaboration is only activated when document exists online on backend or has been synced from git
  // Chỉ kích hoạt Yjs khi doc đã xác nhận có trên server (isSavedOnline) hoặc đã sync từ Git (gitSyncStatus === "synced")
  const isOnlineDoc = Boolean(docId > 0 && (isSavedOnline || gitSyncStatus === "synced"));

  const { collaboration } = useYjsCollaboration(
    isOnlineDoc ? (syncedBackendId || doc?.backendUuid || docId) : -1,
    authUser,
    isOnlineDoc
  );

  const checkCurrentFileStatus = useCallback(
    async (currentContent?: unknown, currentTitle?: string) => {
      if (!docId || !hasGit) return;
      try {
        const snap = getLatestSnapshot();
        let contentData = currentContent;
        if (contentData === undefined) {
          const rawContent = snap?.content ?? doc?.content ?? "[]";
          try {
            contentData = JSON.parse(rawContent || "[]");
          } catch {
            contentData = rawContent;
          }
        }
        const payload = {
          id: doc?.id ?? docId,
          title: currentTitle ?? snap?.title ?? doc?.title,
          slug: `doc-${docId}`,
          status: snap?.status ?? doc?.status,
          metadata: snap?.metadata ?? doc?.metadata,
          content: contentData,
        };
        const res = await checkFileStatus({
          file_path: gitFilePath,
          content: JSON.stringify(payload),
        }).unwrap();

        setGitFileStatus(res.status);
        setHasGitChanges(Boolean(res.has_changes));
        setHasConflict(Boolean(res.has_conflict));
        setRemoteUpdated(Boolean(res.remote_updated));
      } catch (err) {
        console.warn("[DocEditor] checkFileStatus error:", err);
      }
    },
    [docId, hasGit, doc?.id, doc?.title, doc?.content, doc?.status, doc?.metadata, gitFilePath, checkFileStatus, getLatestSnapshot]
  );

  const handleBlocksChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (blocks: any[], meta?: BlockNoteChangeMeta) => {
      baseHandleBlocksChange(blocks, meta);
      if (!hasGit) return;
      if (checkStatusTimerRef.current) clearTimeout(checkStatusTimerRef.current);
      checkStatusTimerRef.current = setTimeout(() => {
        checkCurrentFileStatus(blocks);
      }, 500);
    },
    [baseHandleBlocksChange, checkCurrentFileStatus, hasGit]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      baseHandleTitleChange(newTitle);
      if (!hasGit) return;
      if (checkStatusTimerRef.current) clearTimeout(checkStatusTimerRef.current);
      checkStatusTimerRef.current = setTimeout(() => {
        checkCurrentFileStatus(undefined, newTitle);
      }, 500);
    },
    [baseHandleTitleChange, checkCurrentFileStatus, hasGit]
  );

  useEffect(() => {
    if (doc?.id && hasGit) {
      checkCurrentFileStatus();
    }
  }, [doc?.id, hasGit, checkCurrentFileStatus]);

  const applyGitContentToEditor = useCallback(
    async (rawContent: string | unknown, actionLabel: string) => {
      try {
        let parsed: any = rawContent;
        if (typeof rawContent === "string") {
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            parsed = rawContent;
          }
        }

        let blocksToApply: any[] = [];
        let titleToApply = "";

        if (Array.isArray(parsed)) {
          blocksToApply = parsed;
        } else if (parsed && typeof parsed === "object") {
          if (parsed.title && typeof parsed.title === "string") {
            titleToApply = parsed.title;
          }
          if (Array.isArray(parsed.content)) {
            blocksToApply = parsed.content;
          } else if (typeof parsed.content === "string") {
            blocksToApply = parseInitialBlocks(parsed.content) as any[];
          }
        } else if (typeof rawContent === "string") {
          blocksToApply = parseInitialBlocks(rawContent) as any[];
        }

        if (blocksToApply.length > 0 && editorRef.current) {
          try {
            editorRef.current.replaceBlocks(editorRef.current.document, blocksToApply);
          } catch (e) {
            console.warn("[DocEditor] replaceBlocks failed:", e);
          }
          handleBlocksChange(blocksToApply);
        }

        if (titleToApply && titleToApply !== doc?.title) {
          handleTitleChange(titleToApply);
        }

        if (blocksToApply.length > 0 || titleToApply) {
          await triggerSave();
          message.success(`Đã ${actionLabel} từ Git`);
        } else {
          message.warning("Nội dung Git không chứa khối văn bản hợp lệ");
        }
      } catch (err) {
        console.error(`[DocEditor] Failed to apply ${actionLabel}:`, err);
        message.error(`Không thể xử lý nội dung để ${actionLabel}`);
      }
    },
    [doc?.title, handleBlocksChange, handleTitleChange, triggerSave]
  );

  const handlePullGit = async () => {
    try {
      const res = await pullRepo({}).unwrap();
      if (res.hasConflicts || res.has_conflict) {
        message.warning("Đã kéo từ Git nhưng có xung đột!");
        setShowConflictModal(true);
      } else {
        // Sync all pulled docs from backend DB into local SQLite
        if (isTauri()) {
          try {
            const pullRes = await dispatch(
              docsApi.endpoints.syncPullRemote.initiate(undefined, { forceRefetch: true })
            ).unwrap();
            if (pullRes?.items && Array.isArray(pullRes.items)) {
              for (const item of pullRes.items) {
                await cacheDoc(item, { force: true });
              }
            }
          } catch (e) {
            console.warn("[DocEditor] syncPullRemote after git pull failed:", e);
          }
        }
        message.success("Đã đồng bộ nội dung mới nhất từ Git!");
        try {
          const fileRes = await dispatch(
            githubApi.endpoints.getGitFile.initiate(gitFilePath, { forceRefetch: true })
          ).unwrap();
          if (fileRes?.content) {
            await applyGitContentToEditor(fileRes.content, "cập nhật nội dung mới nhất");
          }
        } catch (e) {
          console.warn("[DocEditor] Failed to reload editor blocks after pull:", e);
        }
        checkCurrentFileStatus();
      }
    } catch (err: unknown) {
      const errMsg = (err as { data?: { message?: string } })?.data?.message;
      message.error(errMsg ? `Pull từ Git thất bại: ${errMsg}` : "Pull từ Git thất bại");
    }
  };

  const handleSaveToGit = async () => {
    if (!doc) return;
    try {
      // Ensure latest editor blocks are flushed into useDocEditor snapshot before saving
      if (editorRef.current?.document) {
        baseHandleBlocksChange(editorRef.current.document);
      }
      await triggerSave();
      const snap = getLatestSnapshot();
      const latestTitle = snap?.title ?? doc.title;
      const latestStatus = snap?.status ?? doc.status;
      const latestMeta = snap?.metadata ?? doc.metadata;
      let contentData: unknown = editorRef.current?.document ?? snap?.content ?? doc.content;
      if (typeof contentData === "string") {
        try {
          contentData = JSON.parse(contentData || "[]");
        } catch {
          // keep as string
        }
      }
      const payload = {
        id: doc.id,
        backend_uuid: doc.backendUuid ?? undefined,
        title: latestTitle,
        slug: `doc-${doc.id}`,
        status: latestStatus,
        metadata: latestMeta,
        content: contentData,
        saved_at: new Date().toISOString(),
      };
      const commitMsg = isDocOnGit
        ? `Update ${latestTitle || `doc-${doc.id}`}`
        : `Add ${latestTitle || `doc-${doc.id}`} to Git workspace`;

      await saveGitFile({
        path: gitFilePath,
        content: payload,
        auto_commit: true,
        auto_push: true,
        message: commitMsg,
      }).unwrap();

      message.success(
        isDocOnGit
          ? `Đã lưu và commit lên GitHub: ${gitFilePath}`
          : `Đã lưu và đẩy lên GitHub: ${gitFilePath}`
      );
      checkCurrentFileStatus(contentData, latestTitle);
    } catch (err) {
      const errMsg = (err as { data?: { message?: string } })?.data?.message;
      message.error(errMsg ? `Failed to push to GitHub: ${errMsg}` : "Failed to push to GitHub");
    }
  };

  const handleSaveAndCommitShortcut = useCallback(async () => {
    if (hasConflict || gitFileStatus === "conflict") {
      message.warning("Phát hiện xung đột Git trên file này — Mở hộp thoại giải quyết.");
      setShowConflictModal(true);
      return;
    }
    // Prioritize saving local editor changes instead of overwriting them with a pull
    if (isDirty || hasGitChanges) {
      await handleSaveToGit();
      return;
    }
    if (remoteUpdated || gitFileStatus === "behind") {
      message.info("Nội dung trên Git đã được cập nhật — Đang kéo (pull) về...");
      await handlePullGit();
      return;
    }
    if (gitFileStatus === "clean") {
      message.info("Tài liệu đã được lưu và đồng bộ với Git (không có thay đổi mới).");
      return;
    }
    await handleSaveToGit();
  }, [hasConflict, gitFileStatus, remoteUpdated, hasGitChanges, isDirty, handleSaveToGit, handlePullGit]);

  const handleRestoreGitSnapshot = async (snapshotContent: string) => {
    await applyGitContentToEditor(snapshotContent, "khôi phục phiên bản");
  };

  const docMeta = useMemo(() => parseDocMetadata(doc?.metadata ?? null), [doc?.metadata]);
  const initialBlocks = useMemo(() => parseInitialBlocks(doc?.content), [doc?.id]);

  function handleSettingsChange(next: EditorSettings) {
    setEditorSettings(next);
  }

  useEffect(() => {
    dispatch(setCurrentDocId(docId));
    return () => { dispatch(setCurrentDocId(null)); };
  }, [docId, dispatch]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSaveAndCommitShortcut();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        triggerSave();
        return;
      }
      const editorArea = editorAreaRef.current;
      const isEditorFocused = !editorArea || editorArea.contains(document.activeElement);
      if (!isEditorFocused) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        findReplaceRef.current.open("find");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        findReplaceRef.current.open("replace");
        return;
      }
      if (e.key === "Escape" && findReplaceRef.current.isOpen) {
        findReplaceRef.current.close();
        editor?.focus?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [triggerSave, handleSaveAndCommitShortcut, editor]);

  function handleBack() {
    if (panelMode) {
      openPanel(PANEL_TYPES.DOCS_LIST, {}, { title: "Docs", singleton: true });
    } else {
      navigate("/docs");
    }
  }

  function handleUndo() {
    if (!editor) return;
    editor.undo();
    editor.focus?.();
  }

  function handleRedo() {
    if (!editor) return;
    editor.redo();
    editor.focus?.();
  }

  useEffect(() => {
    if (!editor) {
      setCanUndo(false);
      setCanRedo(false);
      return;
    }
    const tt = editor._tiptapEditor;
    if (!tt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readHistory = (state: any) => {
      for (const plugin of state.plugins) {
        const ps = plugin.getState?.(state);
        if (ps && typeof ps === "object" && "done" in ps && "undone" in ps) return ps;
      }
      return null;
    };
    const update = () => {
      const hs = readHistory(tt.state);
      setCanUndo(!!hs && hs.done?.eventCount > 0);
      setCanRedo(!!hs && hs.undone?.eventCount > 0);
    };
    update();
    tt.on("transaction", update);
    return () => { tt.off("transaction", update); };
  }, [editor]);

  async function handleDelete(scope: DeleteScope = "server") {
    await deleteDoc({ id: docId, scope });
    navigate("/docs");
  }

  const [restoreDocsFromServer, { isLoading: isRestoringFromServer }] = useRestoreDocsFromServerMutation();

  async function handleRestoreFromServer() {
    try {
      const res = await restoreDocsFromServer({ ids: [docId] }).unwrap();
      if (res.restored.length > 0) {
        const restored = res.restored[0];
        const blocks = parseInitialBlocks(restored.content);
        if (editorRef.current) {
          try {
            editorRef.current.replaceBlocks(editorRef.current.document, blocks);
          } catch (e) {
            console.warn("[DocEditor] replaceBlocks on restore failed:", e);
          }
          baseHandleBlocksChange(blocks);
        }
        if (restored.title && restored.title !== doc?.title) {
          baseHandleTitleChange(restored.title);
        }
        message.success("Đã khôi phục tài liệu từ Server!");
      } else {
        message.warning("Không tìm thấy bản lưu của tài liệu này trên Server.");
      }
    } catch (err: any) {
      message.error(err?.data?.message || "Khôi phục từ Server thất bại");
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
  }

  function handleOpenInNewTab() {
    window.open(window.location.href, "_blank");
  }

  function handleViewInfo() {
    setIsRightPanelOpen(true);
    setRightPanelTab("properties");
  }

  function handleViewTableOfContents() {
    setIsRightPanelOpen(true);
    setRightPanelTab("toc");
  }

  function handleViewHistoryVersion() {
    setIsRevisionPanelOpen(true);
  }

  function handleOpenInPopup() {
    openDocPopup(docId, doc?.title ?? undefined);
  }

  function handleOpenInSplitView() {
    message.info("Split view coming soon");
  }

  async function handleDuplicate() {
    if (!doc) return;
    const result = await createDoc({
      title: doc.title ? `${doc.title} (copy)` : "Untitled (copy)",
      content: doc.content,
      metadata: doc.metadata,
      lastSync: null,
      status: 0,
    });
    if ("data" in result && result.data?.id) {
      if (panelMode) {
        openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.data.id }, { title: result.data.title ?? "Document" });
      } else {
        navigate(`/docs/${result.data.id}`);
      }
    }
  }

  const applyImportToCurrentDoc = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (blocks: any[], newTitle?: string, newMeta?: any) => {
      if (!editor) throw new Error("Editor not ready");
      editor.replaceBlocks(editor.document, blocks.length > 0 ? blocks : [{ type: "paragraph" }]);
      if (newTitle) {
        handleTitleChange(newTitle);
      }
      if (newMeta !== undefined && newMeta !== null) {
        handleMetadataChange(newMeta);
      }
      await triggerSave();
    },
    [editor, handleTitleChange, handleMetadataChange, triggerSave]
  );

  const handleImport = useCallback(
    async (format: ImportFormat, file: File) => {
      try {
        if (format === "markdown") {
          const text = await file.text();
          const { blocknoteMarkdownToBlocks } = await import("./importHelpers");
          const blocks = await blocknoteMarkdownToBlocks(text, editor);
          const newTitle = file.name.replace(/\.md$/, "");
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks, newTitle);
          });
          message.success("Imported Markdown into current document");
          return;
        }

        if (format === "html") {
          const text = await file.text();
          const { blocknoteHTMLToBlocks } = await import("./importHelpers");
          const blocks = await blocknoteHTMLToBlocks(text, editor);
          const newTitle = file.name.replace(/\.html?$/, "");
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks, newTitle);
          });
          message.success("Imported HTML into current document");
          return;
        }

        if (format === "markdown-zip") {
          const { importMarkdownZip } = await import("@/presentation/features/docs/importers/markdownZipImporter");
          const docs = await importMarkdownZip(file);
          if (docs.length === 0) {
            message.warning("No documents found in zip");
            return;
          }
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(docs[0].blocks, docs[0].title);
            for (let i = 1; i < docs.length; i++) {
              await createDoc({
                title: docs[i].title,
                content: JSON.stringify(docs[i].blocks),
                metadata: null,
                lastSync: null,
                status: 1,
              });
            }
          });
          if (docs.length > 1) {
            message.success(`Overwrote current document and created ${docs.length - 1} extra document(s)`);
          } else {
            message.success("Imported zip into current document");
          }
          return;
        }

        if (format === "notion") {
          const { importNotionZip } = await import("@/presentation/features/docs/importers/notionZipImporter");
          const docs = await importNotionZip(file);
          if (docs.length === 0) {
            message.warning("No Notion pages found in zip");
            return;
          }
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(docs[0].blocks, docs[0].title);
            for (let i = 1; i < docs.length; i++) {
              await createDoc({
                title: docs[i].title,
                content: JSON.stringify(docs[i].blocks),
                metadata: null,
                lastSync: null,
                status: 1,
              });
            }
          });
          if (docs.length > 1) {
            message.success(`Overwrote current document and created ${docs.length - 1} extra Notion page(s)`);
          } else {
            message.success("Imported Notion page into current document");
          }
          return;
        }

        if (format === "snapshot") {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const newTitle = parsed.title || file.name.replace(/\.json$/, "");
          const blocks = typeof parsed.content === "string" ? JSON.parse(parsed.content) : (parsed.content ?? []);
          const meta = typeof parsed.metadata === "string" ? JSON.parse(parsed.metadata) : parsed.metadata;
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks, newTitle, meta);
          });
          message.success("Imported snapshot into current document");
          return;
        }
      } catch (err) {
        console.error("[Import] failed:", format, err);
        message.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [editor, applyImportToCurrentDoc, runWithSaveStatus, createDoc]
  );

  const handleImportText = useCallback(
    async (format: ImportTextFormat, text: string) => {
      try {
        if (format === "markdown") {
          const { blocknoteMarkdownToBlocks } = await import("./importHelpers");
          const blocks = await blocknoteMarkdownToBlocks(text, editor);
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks);
          });
          message.success("Imported Markdown into current document");
          return;
        }

        if (format === "html") {
          const { blocknoteHTMLToBlocks } = await import("./importHelpers");
          const blocks = await blocknoteHTMLToBlocks(text, editor);
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks);
          });
          message.success("Imported HTML into current document");
          return;
        }

        if (format === "snapshot") {
          const parsed = JSON.parse(text);
          const newTitle = parsed.title;
          const blocks = typeof parsed.content === "string" ? JSON.parse(parsed.content) : (parsed.content ?? []);
          const meta = typeof parsed.metadata === "string" ? JSON.parse(parsed.metadata) : parsed.metadata;
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks, newTitle, meta);
          });
          message.success("Imported snapshot into current document");
          return;
        }
      } catch (err) {
        console.error("[Import text] failed:", format, err);
        message.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [editor, applyImportToCurrentDoc, runWithSaveStatus]
  );

  const editorContent = (
    <div className="doc-editor-wrapper" style={panelMode ? { height: "100%", display: "flex", flexDirection: "column" } : undefined}>
      {doc && (
        <DocEditorToolbar
          title={doc.title}
          starred={docMeta.starred}
          isRightPanelOpen={isRightPanelOpen}
          settings={editorSettings}
          saveStatus={saveStatus}
          persistenceState={persistenceState}
          justSaved={justSaved}
          saveError={lastError}
          lastSavedLocalAt={lastSavedLocalAt}
          lastSyncedRemoteAt={lastSyncedRemoteAt}
          isDraft={isDraft}
          isDirty={isDirty}
          isSyncedToServer={isSyncedToServer}
          collaborators={collaboration?.collaborators}
          isCollabConnected={collaboration?.isConnected}
          onBack={handleBack}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          undoTooltip="Undo (Ctrl+Z)"
          redoTooltip="Redo (Ctrl+Shift+Z)"
          onManualSave={triggerSave}
          onRetry={triggerSave}
          onTitleChange={handleTitleChange}
          onStarToggle={() => handleMetadataChange({ ...docMeta, starred: !docMeta.starred })}
          onInfoToggle={() => setIsRightPanelOpen((p) => !p)}
          onDelete={handleDelete}
          onCopyLink={handleCopyLink}
          onSettingsChange={handleSettingsChange}
          onOpenInNewTab={handleOpenInNewTab}
          onOpenInPopup={handleOpenInPopup}
          onOpenInSplitView={handleOpenInSplitView}
          onViewInfo={handleViewInfo}
          onViewTableOfContents={handleViewTableOfContents}
          onViewHistoryVersion={handleViewHistoryVersion}
          onViewGitHistory={() => setIsGitHistoryOpen(true)}
          onSaveToGit={handleSaveToGit}
          isOnGit={isDocOnGit}
          isSavingGit={isSavingGit || isCheckingGit || isPullingGit}
          gitFileStatus={gitFileStatus}
          hasGitChanges={hasGitChanges}
          hasConflict={hasConflict}
          remoteUpdated={remoteUpdated}
          onPull={handlePullGit}
          onResolveConflict={() => setShowConflictModal(true)}
          onDuplicate={handleDuplicate}
          onImport={() => setImportModalOpen(true)}
          onExport={() => setExportModalOpen(true)}
          onRestoreFromServer={handleRestoreFromServer}
          isRestoringFromServer={isRestoringFromServer}
        />
      )}

      <div className="doc-editor-content">
        {effectivelyLoading ? (
          <Loading label="Đang tải tài liệu…" />
        ) : (
          <>
            <div className="doc-editor-editor-area" ref={editorAreaRef} style={{ position: "relative" }}>
              {findReplace.isOpen && (
                <FindReplaceBar
                  mode={findReplace.mode}
                  onModeChange={(m) => findReplace.open(m)}
                  searchText={findReplace.searchText}
                  replaceText={findReplace.replaceText}
                  isCaseSensitive={findReplace.isCaseSensitive}
                  isRegex={findReplace.isRegex}
                  regexError={findReplace.regexError}
                  matchCount={findReplace.matches.length}
                  currentIndex={findReplace.currentIndex}
                  onSearchChange={findReplace.setSearchText}
                  onReplaceChange={findReplace.setReplaceText}
                  onCaseSensitiveToggle={() => findReplace.setIsCaseSensitive(!findReplace.isCaseSensitive)}
                  onRegexToggle={() => findReplace.setIsRegex(!findReplace.isRegex)}
                  onPrev={findReplace.goToPrev}
                  onNext={findReplace.goToNext}
                  onReplaceCurrent={findReplace.replaceCurrent}
                  onReplaceAll={findReplace.replaceAll}
                  onClose={findReplace.close}
                />
              )}
              <DocEditorBody
                key={`${docId}-${collaboration ? "collab" : "solo"}`}
                docId={docId}
                initialBlocks={
                  collaboration && editorRef.current?.document?.length
                    ? editorRef.current.document
                    : (initialBlocks as any)
                }
                onBlocksChange={handleBlocksChange}
                onEditorReady={handleEditorReady}
                onAskAI={({ blockId, language, code }) => {
                  useAgentStore.getState().requestAskAI({
                    id: `askai-${blockId}`,
                    prompt: `Review and explain or improve this ${language || "code"} block from "${doc?.title || `Doc #${docId}`}":\n\n\`\`\`${language || "text"}\n${code}\n\`\`\``,
                    scenarioHint: "fullstack",
                    sourceView: "doc",
                    autoSubmit: false,
                    contextItems: [
                      {
                        id: `doc-block-${docId}-${blockId}`,
                        kind: "doc",
                        title: `${doc?.title || `Doc #${docId}`} (${language || "code"})`,
                        excerpt: code.slice(0, 280),
                        language,
                        sourceId: docId,
                      },
                    ],
                  });
                }}
                collaboration={collaboration}
              />
            </div>

            {isRightPanelOpen && doc && (
              <DocRightPanel
                doc={doc}
                editor={editor}
                onMetadataChange={handleMetadataChange}
                onSeriesIdChange={handleSeriesIdChange}
                activeTab={rightPanelTab}
                settings={editorSettings}
                onSettingsChange={handleSettingsChange}
              />
            )}
          </>
        )}
      </div>
    </div>
  );

  const modals = (
    <>
      <DocRevisionPanel
        docId={docId}
        open={isRevisionPanelOpen}
        onClose={() => setIsRevisionPanelOpen(false)}
        onRestored={triggerSave}
      />
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        onImportText={handleImportText}
      />
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        doc={doc ?? null}
        editor={editor}
        getCaptureElement={() => editorAreaRef.current}
      />
      <DocGitHistoryDrawer
        filePath={gitFilePath}
        open={isGitHistoryOpen}
        onClose={() => setIsGitHistoryOpen(false)}
        onRestoreSnapshot={handleRestoreGitSnapshot}
      />
      {showConflictModal && (
        <GitConflictModal
          onClose={() => {
            setShowConflictModal(false);
            checkCurrentFileStatus();
          }}
        />
      )}
    </>
  );

  if (panelMode) {
    return (
      <>
        {editorContent}
        {modals}
      </>
    );
  }

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {editorContent}
      </div>
      {modals}
    </div>
  );
}
