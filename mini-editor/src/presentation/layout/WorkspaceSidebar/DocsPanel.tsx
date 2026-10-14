import { useState, useEffect, useCallback } from "react";
import { SearchIcon, FilePlusIcon, ClockIcon, FileTextIcon } from "lucide-react";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { PANEL_TYPES } from "../golden/panelRegistry";
import { useDocs } from "@/presentation/features/docs/hooks/useDocs";
import { useSearchDocsQuery, useCreateDocMutation } from "@/infrastructure/api/docsApi";
import type { DocDto } from "@/core/interfaces/docs";
import { getRecent, addRecent, type RecentEntry } from "@/presentation/features/docs/utils/recentDocs";
import "./DocsPanel.scss";

export function DocsPanel() {
  const { openPanel } = useGoldenLayout();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recent, setRecent] = useState<RecentEntry[]>(getRecent);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { docs, isLoading } = useDocs();
  const [createDoc] = useCreateDocMutation();
  const { data: searchResults, isFetching: isSearching } = useSearchDocsQuery(
    debouncedQuery,
    { skip: !debouncedQuery }
  );

  const displayDocs: DocDto[] = debouncedQuery ? (searchResults ?? []) : docs;
  const isLoadingDisplay = debouncedQuery ? isSearching : isLoading;

  const handleOpen = useCallback((doc: { id: number; title: string }) => {
    addRecent({ id: doc.id, title: doc.title });
    setRecent(getRecent());
    openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title, singleton: true });
  }, [openPanel]);

  const handleNewDoc = async () => {
    try {
      const doc = await createDoc({
        title: "Untitled",
        content: null,
        metadata: null,
        lastSync: null,
        status: 0,
      }).unwrap();
      openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title || "Document" });
    } catch (err) {
      console.error("[DocsPanel New Doc] failed:", err);
    }
  };

  return (
    <div className="docs-panel">
      {/* Header */}
      <div className="docs-panel__header">
        <span className="docs-panel__title">Docs</span>
        <button className="docs-panel__new-btn" onClick={handleNewDoc} title="New Doc">
          <FilePlusIcon size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="docs-panel__search">
        <SearchIcon size={13} className="docs-panel__search-icon" />
        <input
          className="docs-panel__search-input"
          type="text"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="docs-panel__body">
        {/* Recent section — only shown when not searching */}
        {!debouncedQuery && recent.length > 0 && (
          <div className="docs-panel__section">
            <div className="docs-panel__section-label">
              <ClockIcon size={11} />
              Recent
            </div>
            {recent.map((r) => (
              <button
                key={r.id}
                className="docs-panel__row docs-panel__row--recent"
                onClick={() => handleOpen(r)}
                title={r.title}
              >
                <FileTextIcon size={13} className="docs-panel__row-icon" />
                <span className="docs-panel__row-name">{r.title || "Untitled"}</span>
              </button>
            ))}
          </div>
        )}

        {/* All docs / search results */}
        <div className="docs-panel__section">
          {!debouncedQuery && (
            <div className="docs-panel__section-label">
              <FileTextIcon size={11} />
              All Docs
            </div>
          )}
          {debouncedQuery && (
            <div className="docs-panel__section-label">
              <SearchIcon size={11} />
              Results
            </div>
          )}

          {isLoadingDisplay && <div className="docs-panel__state">Loading docs…</div>}

          {!isLoadingDisplay && displayDocs.length === 0 && (
            <div className="docs-panel__state">
              {debouncedQuery ? "No matching docs" : "No docs yet"}
            </div>
          )}

          {!isLoadingDisplay &&
            displayDocs.map((doc) => (
              <button
                key={doc.id}
                className="docs-panel__row"
                onClick={() => handleOpen(doc)}
                title={doc.title || "Untitled"}
              >
                <FileTextIcon size={13} className="docs-panel__row-icon" />
                <span className="docs-panel__row-name">{doc.title || "Untitled"}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
