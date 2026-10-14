import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { message, Modal, Select } from "antd";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { type RootState, type AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { useDocs } from "../../hooks/useDocs";
import { useSearchDocsQuery, useReindexAllMutation, useCreateDocMutation } from "@/infrastructure/api/docsApi";
import { useListSeriesQuery } from "@/infrastructure/api/seriesApi";
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
  const [reindexAll, { isLoading: isReindexing }] = useReindexAllMutation();
  const [createDoc] = useCreateDocMutation();
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults, isFetching: isSearching } = useSearchDocsQuery(
    debouncedQuery,
    { skip: !debouncedQuery }
  );

  const displayDocs = debouncedQuery ? (searchResults ?? []) : docs;
  // Drafts are local-only; search hits the backend, so hide them while searching.
  const isLoadingDisplay = debouncedQuery ? isSearching : isLoading;

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

  const handleReindex = () => {
    Modal.confirm({
      title: "Reindex search?",
      content: "Toàn bộ docs sẽ được đánh lại index từ DB. Thao tác này có thể mất vài giây.",
      okText: "Reindex",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const result = await reindexAll().unwrap();
          message.success(`Reindex thành công: ${result} documents`);
        } catch {
          message.error("Reindex thất bại");
        }
      },
    });
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
                  className="docs-reindex-btn"
                  onClick={handleReindex}
                  disabled={isReindexing}
                >
                  {isReindexing ? "Reindexing…" : "Reindex"}
                </button>
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

            <DocList
              docs={displayDocs}
              onDelete={deleteDoc}
              isDeleting={isDeleting}
              isLoading={isLoadingDisplay}
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
