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
import { useDeleteDocMutation, useCreateDocMutation } from "@/infrastructure/api/docsApi";
import { parseDocMetadata } from "@/core/interfaces/docs";
import { useDocEditor } from "../../hooks/useDocEditor";
import { usePersistedState } from "@/presentation/hooks/usePersistedState";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import { DocEditorToolbar } from "./components/DocEditorToolbar";
import { DocRightPanel } from "./components/DocRightPanel";
import { ImportModal, type ImportFormat, type ImportTextFormat } from "./components/ImportModal/ImportModal";
import { ExportModal } from "./components/ExportModal/ExportModal";
import { DocEditorBody } from "./components/DocEditorBody";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import { useYjsCollaboration } from "../../hooks/useYjsCollaboration";
import { DocRevisionPanel } from "./components/DocRevisionPanel/DocRevisionPanel";
import { FindReplaceBar } from "./components/FindReplaceBar/FindReplaceBar";
import { useFindAndReplace } from "./hooks/useFindAndReplace";
import { DocGitHistoryDrawer } from "@/presentation/features/git/components/DocGitHistoryDrawer";
import { GitConflictModal } from "@/presentation/features/git/components/GitConflictModal";
import {
  useSaveGitFileMutation,
  useGetWorkspaceManifestQuery,
  useGetFileHistoryQuery,
  useCheckFileStatusMutation,
  usePullRepoMutation,
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
    return [];
  } catch {
    return [];
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
  const isDirty = useSelector((state: RootState) => state.docs.isDirty);
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
    isLoading,
    isFetching,
    saveStatus,
    handleBlocksChange: baseHandleBlocksChange,
    handleTitleChange: baseHandleTitleChange,
    handleMetadataChange,
    handleSeriesIdChange,
    triggerSave,
    runWithSaveStatus,
  } = useDocEditor(docId, editorRef);

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

  const gitFilePath = `docs/doc-${docId}.json`;

  const { data: manifest } = useGetWorkspaceManifestQuery();
  const { data: fileHistory } = useGetFileHistoryQuery(gitFilePath, { skip: !docId });

  const isDocOnGit = useMemo(() => {
    if (!docId) return false;
    const inManifest = manifest?.items?.some(
      (item) => item.id === `doc-${docId}` || item.path === gitFilePath
    );
    const hasHistory = Array.isArray(fileHistory) && fileHistory.length > 0;
    return Boolean(inManifest || hasHistory || gitFileStatus !== "untracked");
  }, [manifest, fileHistory, docId, gitFilePath, gitFileStatus]);

  // Yjs real-time collaboration is only activated when document exists online on backend or git
  const isOnlineDoc = Boolean(docId > 0 && (isSavedOnline || isDocOnGit || (doc && doc.status === 1)));

  const { collaboration, isResolved: isCollabResolved } = useYjsCollaboration(
    !docId || docId <= 0 ? -1 : docId,
    authUser,
    isOnlineDoc
  );

  const checkCurrentFileStatus = useCallback(
    async (currentContent?: unknown, currentTitle?: string) => {
      if (!docId) return;
      try {
        let contentData = currentContent;
        if (contentData === undefined) {
          try {
            contentData = JSON.parse(doc?.content || "[]");
          } catch {
            contentData = doc?.content;
          }
        }
        const payload = {
          id: doc?.id ?? docId,
          title: currentTitle ?? doc?.title,
          slug: `doc-${docId}`,
          status: doc?.status,
          metadata: doc?.metadata,
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
    [docId, doc?.id, doc?.title, doc?.content, doc?.status, doc?.metadata, gitFilePath, checkFileStatus]
  );

  const handleBlocksChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (blocks: any[]) => {
      baseHandleBlocksChange(blocks);
      if (checkStatusTimerRef.current) clearTimeout(checkStatusTimerRef.current);
      checkStatusTimerRef.current = setTimeout(() => {
        checkCurrentFileStatus(blocks);
      }, 500);
    },
    [baseHandleBlocksChange, checkCurrentFileStatus]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      baseHandleTitleChange(newTitle);
      if (checkStatusTimerRef.current) clearTimeout(checkStatusTimerRef.current);
      checkStatusTimerRef.current = setTimeout(() => {
        checkCurrentFileStatus(undefined, newTitle);
      }, 500);
    },
    [baseHandleTitleChange, checkCurrentFileStatus]
  );

  useEffect(() => {
    if (doc?.id) {
      checkCurrentFileStatus();
    }
  }, [doc?.id, checkCurrentFileStatus]);

  const handlePullGit = async () => {
    try {
      const res = await pullRepo({}).unwrap();
      if (res.hasConflicts || res.has_conflict) {
        message.warning("Đã kéo từ Git nhưng có xung đột!");
        setShowConflictModal(true);
      } else {
        message.success("Đã đồng bộ nội dung mới nhất từ Git!");
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
      await triggerSave();
      let contentData: unknown = editorRef.current?.document ?? doc.content;
      if (typeof contentData === "string") {
        try {
          contentData = JSON.parse(contentData || "[]");
        } catch {
          // keep as string
        }
      }
      const payload = {
        id: doc.id,
        title: doc.title,
        slug: `doc-${doc.id}`,
        status: doc.status,
        metadata: doc.metadata,
        content: contentData,
        saved_at: new Date().toISOString(),
      };
      const commitMsg = isDocOnGit
        ? `Update ${doc.title || `doc-${doc.id}`}`
        : `Add ${doc.title || `doc-${doc.id}`} to Git workspace`;

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
      checkCurrentFileStatus(contentData, doc.title);
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
    if (remoteUpdated || gitFileStatus === "behind") {
      message.info("Nội dung trên Git đã được cập nhật — Đang kéo (pull) về...");
      await handlePullGit();
      return;
    }
    if (gitFileStatus === "clean" && !hasGitChanges && !isDirty) {
      message.info("Tài liệu đã được lưu và đồng bộ với Git (không có thay đổi mới).");
      return;
    }
    await handleSaveToGit();
  }, [hasConflict, gitFileStatus, remoteUpdated, hasGitChanges, isDirty, handleSaveToGit, handlePullGit]);

  const handleRestoreGitSnapshot = (snapshotContent: string) => {
    try {
      const parsed = JSON.parse(snapshotContent);
      if (parsed.content) {
        const strContent = typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content);
        handleBlocksChange(parseInitialBlocks(strContent));
        message.success("Restored content from Git snapshot");
      }
    } catch {
      message.error("Could not parse snapshot content as JSON");
    }
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

  async function handleDelete() {
    await deleteDoc(docId);
    navigate("/docs");
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
          isDirty={isDirty}
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
        />
      )}

      <div className="doc-editor-content">
        {effectivelyLoading || !isCollabResolved ? (
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
                key={docId}
                docId={docId}
                initialBlocks={initialBlocks as any}
                onBlocksChange={handleBlocksChange}
                onEditorReady={handleEditorReady}
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
