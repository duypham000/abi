import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { message } from "antd";
import { type RootState, type AppDispatch } from "@/store";
import { setCurrentDocId } from "@/store/docsSlice";
import { useDeleteDocMutation, useCreateDocMutation } from "@/infrastructure/api/docsApi";
import { parseDocMetadata } from "@/core/interfaces/docs";
import { useDocEditor } from "../../hooks/useDocEditor";
import { useYjsCollaboration } from "../../hooks/useYjsCollaboration";
import { usePersistedState } from "@/hooks/usePersistedState";
import { DocEditorToolbar } from "./components/DocEditorToolbar";
import { DocRightPanel } from "./components/DocRightPanel";
import { ImportModal, type ImportFormat, type ImportTextFormat } from "./components/ImportModal/ImportModal";
import { ExportModal } from "./components/ExportModal/ExportModal";
import { DocEditorBody } from "./components/DocEditorBody";
import { Loading } from "@/components/ui/Loading/Loading";
import { DocRevisionPanel } from "./components/DocRevisionPanel/DocRevisionPanel";
import { FindReplaceBar } from "./components/FindReplaceBar/FindReplaceBar";
import { useFindAndReplace } from "./hooks/useFindAndReplace";
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

export default function DocEditorPage() {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const docId = Number(params.id);
  const dispatch = useDispatch<AppDispatch>();
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

  // Stable callback so React.memo on DocEditorBody doesn't re-render just because
  // the parent re-renders (e.g. from setDirty). setEditor and editorRef are stable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorReady = useCallback((e: any) => {
    setEditor(e);
    editorRef.current = e;
  }, []);

  const {
    doc,
    isSavedOnline,
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
    handleBlocksChange,
    handleTitleChange,
    handleMetadataChange,
    handleSeriesIdChange,
    triggerSave,
    runWithSaveStatus,
  } = useDocEditor(docId, { editorRef, autoSave: editorSettings.autoSave });

  const isOnlineDoc = Boolean(docId > 0 && isSavedOnline);

  const { collaboration, isResolved: isCollabResolved } = useYjsCollaboration(
    isOnlineDoc ? (doc?.backendUuid || docId) : -1,
    authUser,
    isOnlineDoc
  );

  // Wait for the first fresh server round-trip before mounting the editor,
  // so stale RTK Query cache data never seeds the editor's initial content.
  const initialFetchDoneRef = useRef(false);
  const initialFetchDocIdRef = useRef(docId);
  if (initialFetchDocIdRef.current !== docId) {
    initialFetchDocIdRef.current = docId;
    initialFetchDoneRef.current = false;
  }
  if (doc && !isFetching) initialFetchDoneRef.current = true;
  const effectivelyLoading = isLoading || (isFetching && !initialFetchDoneRef.current);

  const [deleteDoc] = useDeleteDocMutation();
  const [createDoc] = useCreateDocMutation();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"toc" | "properties">("toc");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isRevisionPanelOpen, setIsRevisionPanelOpen] = useState(false);

  const docMeta = useMemo(() => parseDocMetadata(doc?.metadata ?? null), [doc?.metadata]);
  const initialBlocks = useMemo(() => parseInitialBlocks(doc?.content), [doc?.id]);

  function handleSettingsChange(next: EditorSettings) {
    setEditorSettings(next);
  }

  useEffect(() => {
    dispatch(setCurrentDocId(docId));
    return () => { dispatch(setCurrentDocId(null)); };
  }, [docId, dispatch]);

  // Centralized keyboard shortcuts (Ctrl+S save, Ctrl+F find, Ctrl+H replace, Escape close find).
  // findReplace is accessed via ref so this effect only re-registers when triggerSave or editor changes,
  // not on every search state update (matches, currentIndex, etc.).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        triggerSave();
        return;
      }
      // Scope find/replace shortcuts to when this editor area is focused
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
  }, [triggerSave, editor]);

  function handleBack() {
    navigate("/docs");
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
    handleOpenInNewTab();
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
      navigate(`/docs/${result.data.id}`);
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
          const { importMarkdownZip } = await import("@/features/docs/importers/markdownZipImporter");
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
          const { importNotionZip } = await import("@/features/docs/importers/notionZipImporter");
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
    <div className="doc-editor-wrapper" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {doc && (
        <DocEditorToolbar
          title={doc.title}
          starred={docMeta.starred}
          isDraft={isDraft}
          isRightPanelOpen={isRightPanelOpen}
          settings={editorSettings}
          saveStatus={saveStatus}
          persistenceState={persistenceState}
          justSaved={justSaved}
          saveError={lastError}
          lastSavedLocalAt={lastSavedLocalAt}
          lastSyncedRemoteAt={lastSyncedRemoteAt}
          isDirty={isDirty}
          isSyncedToServer={isSyncedToServer}
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
          onDuplicate={handleDuplicate}
          onImport={() => setImportModalOpen(true)}
          onExport={() => setExportModalOpen(true)}
          collaborators={collaboration?.collaborators}
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
                key={`${docId}-${collaboration ? "collab" : "solo"}`}
                docId={docId}
                initialBlocks={
                  collaboration && editorRef.current?.document?.length
                    ? editorRef.current.document
                    : (initialBlocks as any)
                }
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
    </>
  );

  return (
    <>
      {editorContent}
      {modals}
    </>
  );
}
