import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { base64ToUint8Array } from "@/core/utils/yjsUtils";
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
import { useLocalDraftEditor } from "../../hooks/useLocalDraftEditor";
import { useYjsCollaboration } from "../../hooks/useYjsCollaboration";
import { usePersistedState } from "@/presentation/hooks/usePersistedState";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import { DocEditorToolbar } from "./components/DocEditorToolbar";
import { DocRightPanel } from "./components/DocRightPanel";
import { ImportModal, type ImportFormat, type ImportTextFormat } from "./components/ImportModal/ImportModal";
import { ExportModal } from "./components/ExportModal/ExportModal";
import { DocEditorBody } from "./components/DocEditorBody";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
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
    return [];
  } catch {
    return [];
  }
}

interface DocEditorPageProps {
  panelMode?: boolean;
  docIdProp?: number;
  localIdProp?: string;
}

export default function DocEditorPage({ panelMode, docIdProp, localIdProp }: DocEditorPageProps) {
  const params = useParams<{ id?: string; localId?: string }>();
  const navigate = useNavigate();
  const { openPanel, closePanel } = useLayoutManager();

  // In panel mode props take priority over URL params
  const localId = localIdProp ?? params.localId;
  const idParam = docIdProp != null ? String(docIdProp) : params.id;
  const isDraftMode = !!localId;
  const docId = isDraftMode ? -1 : Number(idParam);
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

  // Stable callback so React.memo on DocEditorBody doesn't re-render just because
  // the parent re-renders (e.g. from setDirty). setEditor and editorRef are stable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorReady = useCallback((e: any) => {
    setEditor(e);
    editorRef.current = e;
  }, []);

  const { collaboration, isResolved: isCollabResolved } = useYjsCollaboration(isDraftMode ? -1 : docId, authUser);

  const draftEditor = useLocalDraftEditor(
    localId ?? "",
    (backendId) => {
      if (panelMode) {
        openPanel(PANEL_TYPES.DOC_EDITOR, { id: backendId }, { title: "Document" });
        closePanel(PANEL_TYPES.DOC_DRAFT, { localId });
      } else {
        navigate(`/docs/${backendId}`, { replace: true });
      }
    }
  );
  const backendEditor = useDocEditor(docId, editorRef);
  const {
    doc,
    isLoading,
    isFetching,
    saveStatus,
    isDraft,
    handleBlocksChange,
    handleTitleChange,
    handleMetadataChange,
    triggerSave,
    runWithSaveStatus,
  } = isDraftMode ? draftEditor : backendEditor;

  const handleSeriesIdChange = isDraftMode ? (() => {}) : backendEditor.handleSeriesIdChange;

  // Wait for the first fresh server round-trip before mounting the editor,
  // so stale RTK Query cache data never seeds the editor's initial content.
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

  // Seed Y.Doc from cached yjsState only when WS is unavailable (true offline).
  // When connected, yhub provides initial state via bindState on connect.
  const yjsSeededRef = useRef(false);
  useEffect(() => { yjsSeededRef.current = false; }, [docId]);
  useEffect(() => {
    if (yjsSeededRef.current || !doc?.yjsState || !collaboration?.ydoc) return;
    if (collaboration.isConnected) { yjsSeededRef.current = true; return; }
    try {
      Y.applyUpdate(collaboration.ydoc, base64ToUint8Array(doc.yjsState));
      yjsSeededRef.current = true;
    } catch (e) {
      console.warn("[YjsSeed]", e);
    }
  }, [doc?.yjsState, collaboration?.ydoc, collaboration?.isConnected]);

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
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
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

  const handleImport = useCallback(async (format: ImportFormat, file: File) => {
    try {
      if (format === "markdown") {
        const text = await file.text();
        const { blocknoteMarkdownToBlocks } = await import("./importHelpers");
        const blocks = await blocknoteMarkdownToBlocks(text, editor);
        await runWithSaveStatus(async () => {
          const result = await createDoc({
            title: file.name.replace(/\.md$/, ""),
            content: JSON.stringify(blocks),
            metadata: null,
            lastSync: null,
            status: 1,
          }).unwrap();
          if (panelMode) {
              openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.id }, { title: result.title ?? "Document" });
            } else {
              navigate(`/docs/${result.id}`);
            }
        });
        return;
      }

      if (format === "html") {
        const text = await file.text();
        const { blocknoteHTMLToBlocks } = await import("./importHelpers");
        const blocks = await blocknoteHTMLToBlocks(text, editor);
        await runWithSaveStatus(async () => {
          const result = await createDoc({
            title: file.name.replace(/\.html?$/, ""),
            content: JSON.stringify(blocks),
            metadata: null,
            lastSync: null,
            status: 1,
          }).unwrap();
          if (panelMode) {
              openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.id }, { title: result.title ?? "Document" });
            } else {
              navigate(`/docs/${result.id}`);
            }
        });
        return;
      }

      if (format === "markdown-zip") {
        const { importMarkdownZip } = await import("@/presentation/features/docs/importers/markdownZipImporter");
        const docs = await importMarkdownZip(file);
        for (const d of docs) {
          await createDoc({
            title: d.title,
            content: JSON.stringify(d.blocks),
            metadata: null,
            lastSync: null,
            status: 1,
          });
        }
        message.success(`Imported ${docs.length} document(s) from zip`);
        return;
      }

      if (format === "notion") {
        const { importNotionZip } = await import("@/presentation/features/docs/importers/notionZipImporter");
        const docs = await importNotionZip(file);
        for (const d of docs) {
          await createDoc({
            title: d.title,
            content: JSON.stringify(d.blocks),
            metadata: null,
            lastSync: null,
            status: 1,
          });
        }
        message.success(`Imported ${docs.length} Notion page(s)`);
        return;
      }

      if (format === "snapshot") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        await runWithSaveStatus(async () => {
          const result = await createDoc({
            title: parsed.title || file.name.replace(/\.json$/, ""),
            content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content ?? []),
            metadata: typeof parsed.metadata === "string" || parsed.metadata === null
              ? parsed.metadata
              : JSON.stringify(parsed.metadata),
            lastSync: null,
            status: 1,
          }).unwrap();
          if (panelMode) {
              openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.id }, { title: result.title ?? "Document" });
            } else {
              navigate(`/docs/${result.id}`);
            }
        });
        return;
      }
    } catch (err) {
      console.error("[Import] failed:", format, err);
      message.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [createDoc, navigate, runWithSaveStatus]);

  const handleImportText = useCallback(async (format: ImportTextFormat, text: string) => {
    try {
      if (format === "markdown") {
        const { blocknoteMarkdownToBlocks } = await import("./importHelpers");
        const blocks = await blocknoteMarkdownToBlocks(text, editor);
        await runWithSaveStatus(async () => {
          const result = await createDoc({
            title: "Imported markdown",
            content: JSON.stringify(blocks),
            metadata: null,
            lastSync: null,
            status: 1,
          }).unwrap();
          if (panelMode) {
              openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.id }, { title: result.title ?? "Document" });
            } else {
              navigate(`/docs/${result.id}`);
            }
        });
        return;
      }

      if (format === "html") {
        const { blocknoteHTMLToBlocks } = await import("./importHelpers");
        const blocks = await blocknoteHTMLToBlocks(text, editor);
        await runWithSaveStatus(async () => {
          const result = await createDoc({
            title: "Imported HTML",
            content: JSON.stringify(blocks),
            metadata: null,
            lastSync: null,
            status: 1,
          }).unwrap();
          if (panelMode) {
              openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.id }, { title: result.title ?? "Document" });
            } else {
              navigate(`/docs/${result.id}`);
            }
        });
        return;
      }

      if (format === "snapshot") {
        const parsed = JSON.parse(text);
        await runWithSaveStatus(async () => {
          const result = await createDoc({
            title: parsed.title || "Imported snapshot",
            content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content ?? []),
            metadata: typeof parsed.metadata === "string" || parsed.metadata === null
              ? parsed.metadata
              : JSON.stringify(parsed.metadata),
            lastSync: null,
            status: 1,
          }).unwrap();
          if (panelMode) {
              openPanel(PANEL_TYPES.DOC_EDITOR, { id: result.id }, { title: result.title ?? "Document" });
            } else {
              navigate(`/docs/${result.id}`);
            }
        });
        return;
      }
    } catch (err) {
      console.error("[Import text] failed:", format, err);
      message.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [createDoc, navigate, runWithSaveStatus]);

  const editorContent = (
    <div className="doc-editor-wrapper" style={panelMode ? { height: "100%", display: "flex", flexDirection: "column" } : undefined}>
          {doc && (
            <DocEditorToolbar
              title={doc.title}
              starred={docMeta.starred}
              isDraft={isDraft}
              isRightPanelOpen={isRightPanelOpen}
              settings={editorSettings}
              saveStatus={saveStatus}
              isDirty={isDirty}
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
              collaborators={collaboration?.collaborators ?? []}
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
