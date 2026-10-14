import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { message, Drawer } from "antd";
import type { RootState } from "@/presentation/store";
import { useDeleteDocMutation, useCreateDocMutation } from "@/infrastructure/api/docsApi";
import { openInMainWindow } from "@/presentation/hooks/useOpenInMainWindow";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { parseDocMetadata } from "@/core/interfaces/docs";
import { useDocEditor } from "../../hooks/useDocEditor";
import { usePersistedState } from "@/presentation/hooks/usePersistedState";
import { DocEditorBody } from "../DocEditorPage/components/DocEditorBody";
import { DocRightPanel } from "../DocEditorPage/components/DocRightPanel";
import { ImportModal, type ImportFormat, type ImportTextFormat } from "../DocEditorPage/components/ImportModal/ImportModal";
import { ExportModal } from "../DocEditorPage/components/ExportModal/ExportModal";
import { DocPopupAppBar, type PopupEditorSettings } from "./DocPopupAppBar";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import "./DocPopupPage.scss";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MIN_NORMAL_WIDTH = 400;
const MIN_NORMAL_HEIGHT = 280;
const RIGHT_PANEL_BREAKPOINT = 600;

const DEFAULT_POPUP_SETTINGS: PopupEditorSettings = {
  autoSave: true,
  pageSize: "A4",
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

export default function DocPopupPage() {
  const { id, localId } = useParams<{ id?: string; localId?: string }>();
    const isDraftMode = !!localId;
  const docId = isDraftMode ? -1 : Number(id);
  const [isMini, setIsMini] = useState(false);

  const isDirty = useSelector((state: RootState) => state.docs.isDirty);

  const [editorSettings, setEditorSettings] = usePersistedState<PopupEditorSettings>("popup-editor-settings", DEFAULT_POPUP_SETTINGS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = useState<any | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"toc" | "properties">("toc");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const editorAreaRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(700);

  const {
    doc,
    isLoading,
    isFetching,
    saveStatus,
    handleBlocksChange,
    handleTitleChange,
    handleMetadataChange,
    triggerSave,
    runWithSaveStatus,
  } = useDocEditor(docId);
  // Wait for the first fresh server round-trip before showing the editor (avoids
  // mounting with stale RTK Query cache data that hasn't been refreshed yet).
  const initialFetchDoneRef = useRef(false);
  if (doc && !isFetching) initialFetchDoneRef.current = true;
  const effectivelyLoading = isLoading || (isFetching && !initialFetchDoneRef.current);

  const [deleteDoc] = useDeleteDocMutation();
  const [createDoc] = useCreateDocMutation();

  const docMeta = useMemo(() => parseDocMetadata(doc?.metadata ?? null), [doc?.metadata]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialBlocks = useMemo(() => parseInitialBlocks(doc?.content), [doc?.id]) as any[];

  // Set window min size on mount
  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      await getCurrentWindow().setMinSize(new LogicalSize(MIN_NORMAL_WIDTH, MIN_NORMAL_HEIGHT));
    })();
  }, []);

  // Responsive width tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Undo/redo history tracking
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

  function handleSettingsChange(next: PopupEditorSettings) {
    setEditorSettings(next);
  }

  // Centralized Ctrl+S — only one listener regardless of draft/backend mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        triggerSave();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [triggerSave]);

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

  async function handleDelete() {
    await deleteDoc(docId);
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    message.success("Link copied");
  }

  function handleOpenInNewTab() {
    if (isTauri()) {
      // Bring main window forward and open this doc as a GL panel there
      const panelType = isDraftMode ? PANEL_TYPES.DOC_EDITOR : PANEL_TYPES.DOC_EDITOR;
      const state = isDraftMode ? { localId } : { id: docId };
      openInMainWindow(panelType, state as Record<string, unknown>, doc?.title ?? undefined);
    } else {
      window.open(window.location.href, "_blank");
    }
  }

  function handleViewInfo() {
    setRightPanelTab("properties");
    setIsRightPanelOpen(true);
  }

  function handleViewTableOfContents() {
    setRightPanelTab("toc");
    setIsRightPanelOpen(true);
  }

  async function handleDuplicate() {
    if (!doc) return;
    await createDoc({
      title: doc.title ? `${doc.title} (copy)` : "Untitled (copy)",
      content: doc.content,
      metadata: doc.metadata,
      lastSync: null,
      status: 0,
    });
    message.success("Document duplicated");
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
          const { blocknoteMarkdownToBlocks } = await import("../DocEditorPage/importHelpers");
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
          const { blocknoteHTMLToBlocks } = await import("../DocEditorPage/importHelpers");
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
          const { blocknoteMarkdownToBlocks } = await import("../DocEditorPage/importHelpers");
          const blocks = await blocknoteMarkdownToBlocks(text, editor);
          await runWithSaveStatus(async () => {
            await applyImportToCurrentDoc(blocks);
          });
          message.success("Imported Markdown into current document");
          return;
        }

        if (format === "html") {
          const { blocknoteHTMLToBlocks } = await import("../DocEditorPage/importHelpers");
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

  const isWide = containerWidth >= RIGHT_PANEL_BREAKPOINT;

  // DocRightPanel needs EditorSettings shape — bridge with fixed non-relevant fields
  const bridgeSettings = useMemo(() => ({
    width: "full" as const,
    pageSize: editorSettings.pageSize,
    autoSave: editorSettings.autoSave,
    showCanvas: false,
    showEditor: true,
  }), [editorSettings]);

  const rightPanelContent = doc ? (
    <DocRightPanel
      doc={doc}
      editor={editor}
      onMetadataChange={handleMetadataChange}
      activeTab={rightPanelTab}
      settings={bridgeSettings}
      onSettingsChange={(next) => handleSettingsChange({ autoSave: next.autoSave, pageSize: next.pageSize })}
    />
  ) : null;

  return (
    <div className={`doc-popup-layout${isMini ? " doc-popup-layout--mini" : ""}`}>
      <DocPopupAppBar
        docTitle={doc?.title ?? ""}
        isMini={isMini}
        isDraft={false}
        onToggleMini={() => setIsMini((p) => !p)}
        saveStatus={saveStatus}
        isDirty={isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        starred={docMeta.starred}
        settings={editorSettings}
        isInfoOpen={isRightPanelOpen}
        onTitleChange={handleTitleChange}
        onManualSave={triggerSave}
        onRetry={triggerSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onStarToggle={() => handleMetadataChange({ ...docMeta, starred: !docMeta.starred })}
        onInfoToggle={() => {
          setRightPanelTab("toc");
          setIsRightPanelOpen((p) => !p);
        }}
        onSettingsChange={handleSettingsChange}
        onDelete={handleDelete}
        onCopyLink={handleCopyLink}
        onOpenInNewTab={handleOpenInNewTab}
        onViewInfo={handleViewInfo}
        onViewTableOfContents={handleViewTableOfContents}
        onDuplicate={handleDuplicate}
        onImport={() => setImportModalOpen(true)}
        onExport={() => setExportModalOpen(true)}
      />

      {!isMini && (
        <div className="doc-popup-body" ref={containerRef}>
          {effectivelyLoading ? (
            <div className="doc-popup-loading">
              <Loading label="Đang tải tài liệu…" />
            </div>
          ) : (
            <>
              <div className="doc-popup-editor-area" ref={editorAreaRef}>
                <DocEditorBody
                  key={docId}
                  docId={docId}
                  initialBlocks={initialBlocks}
                  onBlocksChange={handleBlocksChange}
                  onEditorReady={(e) => { setEditor(e); }}
                />
              </div>

              {isRightPanelOpen && isWide && rightPanelContent}
            </>
          )}
        </div>
      )}

      {/* Narrow mode: bottom drawer */}
      <Drawer
        open={isRightPanelOpen && !isMini && !isWide}
        placement="bottom"
        onClose={() => setIsRightPanelOpen(false)}
        title={null}
        closable={false}
        styles={{ body: { padding: 0 }, header: { display: "none" }, wrapper: { height: "60vh" } }}
      >
        {rightPanelContent}
      </Drawer>

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
    </div>
  );
}
