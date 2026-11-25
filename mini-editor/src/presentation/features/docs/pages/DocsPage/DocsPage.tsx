import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { message, Select } from "antd";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { type RootState, type AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { useDocs } from "../../hooks/useDocs";
import { useSearchDocsQuery, useCreateDocMutation, useRestoreDocsFromServerMutation, type DeleteScope } from "@/infrastructure/api/docsApi";
import { useListSeriesQuery } from "@/infrastructure/api/seriesApi";
import { confirmDeleteWithScope } from "@/presentation/components/ui/ConfirmDeleteModal/confirmDeleteModal";
import { ImportModal, type ImportFormat, type ImportTextFormat } from "../DocEditorPage/components/ImportModal/ImportModal";
import DocList from "../../components/DocList";
import { SeriesManagerModal } from "../../components";
import "./DocsPage.scss";

interface DocsPageProps {
  panelMode?: boolean;
}

export default function DocsPage({ panelMode }: DocsPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { openPanel } = useGoldenLayout();
  const { theme } = useSelector((state: RootState) => state.app);
  
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | undefined>(undefined);
  const [seriesManagerOpen, setSeriesManagerOpen] = useState(false);

  const { docs, isLoading, isDeleting, deleteDoc } = useDocs(0, 20, selectedSeriesId);

  const { data: seriesList, isLoading: seriesLoading } = useListSeriesQuery({ page: 0, size: 100 });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [createDoc] = useCreateDocMutation();
  const [restoreDocs, { isLoading: isRestoringBulk }] = useRestoreDocsFromServerMutation();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults, isFetching: isSearching } = useSearchDocsQuery(
    debouncedQuery,
    { skip: !debouncedQuery }
  );

  const displayDocs = debouncedQuery ? (searchResults ?? []) : docs;
  const isLoadingDisplay = debouncedQuery ? isSearching : isLoading;

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(displayDocs.map((d) => d.id));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayDocs]);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = displayDocs.length > 0 && displayDocs.every((d) => selectedIds.has(d.id));

  const handleToggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayDocs.map((d) => d.id)));
    }
  }, [allSelected, displayDocs]);

  const handleRestoreOne = useCallback(async (id: number) => {
    setRestoringId(id);
    try {
      const res = await restoreDocs({ ids: [id] }).unwrap();
      if (res.count > 0) {
        message.success("Đã khôi phục tài liệu từ Server!");
      } else {
        message.warning("Không tìm thấy bản lưu của tài liệu này trên Server.");
      }
    } catch (err: any) {
      message.error(err?.data?.message || "Khôi phục từ Server thất bại");
    } finally {
      setRestoringId(null);
    }
  }, [restoreDocs]);

  const handleRestoreSelectedOrAll = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      const res = await restoreDocs(ids.length > 0 ? { ids } : undefined).unwrap();
      if (res.count > 0) {
        message.success(`Đã khôi phục ${res.count} tài liệu từ Server!`);
      } else {
        message.warning("Không có tài liệu nào được khôi phục từ Server.");
      }
      if (ids.length > 0) setSelectedIds(new Set());
    } catch (err: any) {
      message.error(err?.data?.message || "Khôi phục từ Server thất bại");
    }
  }, [restoreDocs, selectedIds]);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    confirmDeleteWithScope({
      entityLabel: "tài liệu",
      title: `${ids.length} tài liệu đã chọn`,
      onConfirm: async (scope: DeleteScope) => {
        for (const id of ids) {
          await deleteDoc(id, scope);
        }
        setSelectedIds(new Set());
        message.success(`Đã xoá ${ids.length} tài liệu`);
      },
    });
  }, [selectedIds, deleteDoc]);

  const handleDeleteAll = useCallback(() => {
    if (displayDocs.length === 0) return;
    const ids = displayDocs.map((d) => d.id);
    confirmDeleteWithScope({
      entityLabel: "tài liệu",
      title: `toàn bộ ${ids.length} tài liệu`,
      onConfirm: async (scope: DeleteScope) => {
        for (const id of ids) {
          await deleteDoc(id, scope);
        }
        setSelectedIds(new Set());
        message.success(`Đã xoá toàn bộ ${ids.length} tài liệu`);
      },
    });
  }, [displayDocs, deleteDoc]);

  useEffect(() => {
    dispatch(setPageTitle("Docs"));
  }, [dispatch]);

  const handleNewDoc = async () => {
    try {
      const doc = await createDoc({
        title: "Untitled",
        content: null,
        metadata: null,
        lastSync: null,
        status: 0,
      }).unwrap();
      if (panelMode) {
        openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title || "Untitled" });
      } else {
        navigate(`/docs/${doc.id}`);
      }
    } catch (err) {
      console.error("[New Doc] failed:", err);
      message.error("Failed to create document");
    }
  };

  const handleImport = useCallback(async (format: ImportFormat, file: File) => {
    try {
      if (format === "markdown") {
        const text = await file.text();
        const { blocknoteMarkdownToBlocks } = await import("../DocEditorPage/importHelpers");
        const blocks = await blocknoteMarkdownToBlocks(text);
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
        return;
      }

      if (format === "html") {
        const text = await file.text();
        const { blocknoteHTMLToBlocks } = await import("../DocEditorPage/importHelpers");
        const blocks = await blocknoteHTMLToBlocks(text);
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
        return;
      }
    } catch (err) {
      console.error("[Import] failed:", format, err);
      message.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [createDoc, navigate, openPanel, panelMode]);

  const handleImportText = useCallback(async (format: ImportTextFormat, text: string) => {
    try {
      if (format === "markdown") {
        const { blocknoteMarkdownToBlocks } = await import("../DocEditorPage/importHelpers");
        const blocks = await blocknoteMarkdownToBlocks(text);
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
        return;
      }

      if (format === "html") {
        const { blocknoteHTMLToBlocks } = await import("../DocEditorPage/importHelpers");
        const blocks = await blocknoteHTMLToBlocks(text);
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
        return;
      }

      if (format === "snapshot") {
        const parsed = JSON.parse(text);
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
        return;
      }
    } catch (err) {
      console.error("[Import text] failed:", format, err);
      message.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [createDoc, navigate, openPanel, panelMode]);

  const content = (
    <main className="dashboard-main">
      <section className="dashboard-content docs-page-content">
            <div className="docs-page-header">
              <h2 className="docs-page-title">Docs</h2>
              <div className="docs-page-actions">
                <button
                  className="docs-import-btn"
                  onClick={() => setSeriesManagerOpen(true)}
                >
                  Series
                </button>
                <button
                  className="docs-import-btn"
                  onClick={() => setImportModalOpen(true)}
                >
                  ↑ Import
                </button>
                <button
                  className="docs-new-btn"
                  onClick={handleNewDoc}
                >
                  + New Doc
                </button>
              </div>
            </div>

            <div className="docs-page-search" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search docs…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="docs-page-search__input"
              />
              <Select
                placeholder="Filter by Series"
                allowClear
                loading={seriesLoading}
                value={selectedSeriesId}
                onChange={(val) => setSelectedSeriesId(val)}
                style={{ width: 220 }}
                options={(seriesList?.items ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
            </div>

            <div className="docs-bulk-bar">
              <label className="docs-bulk-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleSelectAll}
                  disabled={displayDocs.length === 0}
                />
                <span>
                  Chọn tất cả ({selectedIds.size}/{displayDocs.length})
                </span>
              </label>
              <div className="docs-bulk-actions">
                <button
                  type="button"
                  className="docs-bulk-btn docs-bulk-btn--restore"
                  onClick={handleRestoreSelectedOrAll}
                  disabled={isRestoringBulk}
                >
                  {isRestoringBulk
                    ? "Đang khôi phục…"
                    : selectedIds.size > 0
                      ? `Khôi phục đã chọn (${selectedIds.size})`
                      : "Khôi phục từ Server"}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    className="docs-bulk-btn docs-bulk-btn--danger"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                  >
                    Xoá đã chọn ({selectedIds.size})
                  </button>
                )}
                {displayDocs.length > 0 && (
                  <button
                    type="button"
                    className="docs-bulk-btn docs-bulk-btn--danger-outline"
                    onClick={handleDeleteAll}
                    disabled={isDeleting}
                  >
                    Xoá toàn bộ
                  </button>
                )}
              </div>
            </div>

            <DocList
              docs={displayDocs}
              onDelete={deleteDoc}
              isDeleting={isDeleting}
              isLoading={isLoadingDisplay}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onRestore={handleRestoreOne}
              restoringId={restoringId}
            />
          </section>
    </main>
  );

  const modals = (
    <>
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        onImportText={handleImportText}
      />
      <SeriesManagerModal
        open={seriesManagerOpen}
        onClose={() => setSeriesManagerOpen(false)}
      />
    </>
  );

  if (panelMode) return <>{content}{modals}</>;

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {content}
      </div>
      {modals}
    </div>
  );
}
