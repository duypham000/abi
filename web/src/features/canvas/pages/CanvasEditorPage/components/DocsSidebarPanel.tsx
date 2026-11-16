import { useState, useEffect, useRef, useCallback } from "react";
import { useLazyDocsQuery, useSearchDocsQuery } from "@/infrastructure/api/docsApi";
import type { DocDto } from "@/core/interfaces/docs";
import "./DocsSidebarPanel.scss";

export const DOC_DRAG_TYPE = "application/x-tomo-doc-id";

interface DocsSidebarPanelProps {
  onSelect: (docId: number) => void;
}

export function DocsSidebarPanel({ onSelect }: DocsSidebarPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lastId, setLastId] = useState<number | undefined>(undefined);
  const [allDocs, setAllDocs] = useState<DocDto[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seenCursors = useRef(new Set<string>());

  // Debounce search input 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Lazy loading for browse mode (no search)
  const { data, isFetching } = useLazyDocsQuery({ lastId, size: 20 });

  useEffect(() => {
    if (!data) return;
    const key = lastId == null ? "init" : String(lastId);
    if (seenCursors.current.has(key)) return;
    seenCursors.current.add(key);
    setAllDocs((prev) => [...prev, ...data.items]);
    setHasMore(data.hasMore);
  }, [data, lastId]);

  const loadMore = useCallback(() => {
    if (!hasMore || isFetching || data?.nextCursor == null) return;
    setLastId(data.nextCursor);
  }, [hasMore, isFetching, data?.nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore]);

  // Server-side search mode
  const { data: searchResults, isFetching: isSearching } = useSearchDocsQuery(
    debouncedSearch,
    { skip: !debouncedSearch }
  );

  const displayDocs = debouncedSearch ? (searchResults ?? []) : allDocs;
  const currentlyFetching = debouncedSearch ? isSearching : isFetching;

  return (
    <div className="docs-sidebar-panel">
      <div className="docs-sidebar-panel__search">
        <input
          type="text"
          placeholder="Search docs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="docs-sidebar-panel__search-input"
        />
      </div>

      <div className="docs-sidebar-panel__list">
        {displayDocs.length === 0 && !currentlyFetching && (
          <div className="docs-sidebar-panel__empty">
            {allDocs.length === 0 && !debouncedSearch ? "No docs yet" : "No results"}
          </div>
        )}

        {displayDocs.map((doc) => (
          <div
            key={doc.id}
            className="docs-sidebar-panel__item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DOC_DRAG_TYPE, String(doc.id));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onSelect(doc.id)}
          >
            <span className="docs-sidebar-panel__item-icon">📄</span>
            <span className="docs-sidebar-panel__item-title">
              {doc.title || "Untitled"}
            </span>
          </div>
        ))}

        {!debouncedSearch && (
          <div ref={sentinelRef} className="docs-sidebar-panel__sentinel" />
        )}

        {currentlyFetching && (
          <div className="docs-sidebar-panel__loading">Loading…</div>
        )}
      </div>
    </div>
  );
}
