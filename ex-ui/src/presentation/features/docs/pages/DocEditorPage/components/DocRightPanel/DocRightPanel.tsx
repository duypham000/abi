import { useState, useRef, useEffect, useCallback } from "react";
import { Tabs } from "antd";
import { BookOutlined, CloseOutlined } from "@ant-design/icons";
import type { DocDto, DocMetadata } from "@/core/interfaces/docs";
import { parseDocMetadata } from "@/core/interfaces/docs";
import type { EditorSettings } from "@/presentation/features/docs/pages/DocEditorPage/DocEditorPage";
import { DocTOC } from "@/presentation/components/BlockNote/DocTOC";
import type { HeadingEntry } from "@/presentation/components/BlockNote/DocTOC";
import { DocProperties } from "../DocProperties";
import "./DocRightPanel.scss";

const MIN_WIDTH = 220;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 330;
const MIN_BOOKMARK_HEIGHT = 56;
const DEFAULT_BOOKMARK_HEIGHT = 130;

// ── ContentsTab ────────────────────────────────────────────────────

interface ContentsTabProps {
  initialBookmarks: string[];
  onBookmarkChange: (ids: string[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any | null;
}

function ContentsTab({ initialBookmarks, onBookmarkChange, editor }: ContentsTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<HeadingEntry[]>([]);
  const [bookmarkIds, setBookmarkIds] = useState<string[]>(initialBookmarks);
  const [textMode, setTextMode] = useState<"ellipsis" | "wrap">("ellipsis");
  const [bookmarkHeight, setBookmarkHeight] = useState(DEFAULT_BOOKMARK_HEIGHT);
  const dividerDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const bookmarkSet = new Set(bookmarkIds);
  const bookmarkedHeadings = bookmarkIds
    .map((id) => headings.find((h) => h.id === id))
    .filter((h): h is HeadingEntry => h !== undefined);

  function handleBookmarkToggle(id: string) {
    setBookmarkIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      onBookmarkChange(next);
      return next;
    });
  }

  function handleHeadingsChange(newHeadings: HeadingEntry[]) {
    setHeadings(newHeadings);
    setBookmarkIds((prev) => {
      const valid = new Set(newHeadings.map((h) => h.id));
      const cleaned = prev.filter((id) => valid.has(id));
      if (cleaned.length !== prev.length) onBookmarkChange(cleaned);
      return cleaned;
    });
  }

  // Vertical divider drag to resize bookmark panel height
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dividerDragRef.current) return;
      const delta = e.clientY - dividerDragRef.current.startY;
      const maxH = containerRef.current
        ? Math.floor(containerRef.current.clientHeight * 0.55)
        : 320;
      setBookmarkHeight(
        Math.min(maxH, Math.max(MIN_BOOKMARK_HEIGHT, dividerDragRef.current.startH + delta))
      );
    }
    function onUp() {
      if (!dividerDragRef.current) return;
      dividerDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dividerDragRef.current = { startY: e.clientY, startH: bookmarkHeight };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div ref={containerRef} className="contents-tab">
      {/* Bookmark panel */}
      <div className="bookmark-panel" style={{ height: bookmarkHeight }}>
        <div className="bookmark-panel-header">
          <BookOutlined className="bookmark-panel-icon" />
          <span>Bookmarks</span>
          {bookmarkedHeadings.length > 0 && (
            <span className="bookmark-count-badge">{bookmarkedHeadings.length}</span>
          )}
        </div>
        <div className="bookmark-panel-body">
          {bookmarkedHeadings.length === 0 ? (
            <p className="bookmark-empty">No bookmarks yet</p>
          ) : (
            bookmarkedHeadings.map((h) => (
              <div
                key={h.id}
                className="bookmark-item"
                title={h.text}
              >
                <span className="bookmark-item-level">H{h.level}</span>
                <span className="bookmark-item-text">{h.text}</span>
                <button
                  className="bookmark-item-remove"
                  onClick={(e) => { e.stopPropagation(); handleBookmarkToggle(h.id); }}
                  title="Remove bookmark"
                >
                  <CloseOutlined />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Vertical resize divider */}
      <div className="contents-divider" onMouseDown={onDividerMouseDown} />

      {/* TOC */}
      <div className="toc-section">
        <DocTOC
          editor={editor}
          textMode={textMode}
          onTextModeChange={setTextMode}
          bookmarks={bookmarkSet}
          onBookmarkToggle={handleBookmarkToggle}
          onHeadingsChange={handleHeadingsChange}
        />
      </div>
    </div>
  );
}

// ── DocRightPanel ──────────────────────────────────────────────────

interface DocRightPanelProps {
  doc: DocDto;
  onMetadataChange: (meta: DocMetadata) => void;
  onSeriesIdChange?: (seriesId: number | null) => void;
  activeTab?: "toc" | "properties";
  settings: EditorSettings;
  onSettingsChange: (s: EditorSettings) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any | null;
}

export function DocRightPanel({ doc, onMetadataChange, onSeriesIdChange, activeTab: activeTabProp, settings, onSettingsChange, editor }: DocRightPanelProps) {
  const [activeTab, setActiveTab] = useState<"toc" | "properties">(activeTabProp ?? "toc");
  const metaRef = useRef(parseDocMetadata(doc.metadata));

  useEffect(() => {
    if (activeTabProp) setActiveTab(activeTabProp);
  }, [activeTabProp]);

  useEffect(() => {
    metaRef.current = parseDocMetadata(doc.metadata);
  }, [doc.id]);

  const handleMetaChange = useCallback((meta: DocMetadata) => {
    metaRef.current = meta;
    onMetadataChange(meta);
  }, [onMetadataChange]);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const widthDragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!widthDragRef.current) return;
      const delta = e.clientX - widthDragRef.current.startX;
      setWidth(
        Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widthDragRef.current.startW - delta))
      );
    }
    function onUp() {
      if (!widthDragRef.current) return;
      widthDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function onWidthHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    widthDragRef.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <aside className="doc-right-panel p-4 block overflow-auto" style={{ width }}>
      <div className="doc-right-panel-resize-handle" onMouseDown={onWidthHandleMouseDown} />
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as "toc" | "properties")}
        className="doc-right-panel-tabs"
        size="small"
        items={[
          { key: "toc", label: "Contents" },
          { key: "properties", label: "Properties" },
        ]}
      />
      <div className="doc-right-panel-content">
        <div className={`doc-tab-pane${activeTab === "toc" ? " doc-tab-pane--active" : ""}`}>
          <ContentsTab
            editor={editor}
            initialBookmarks={metaRef.current.bookmarks}
            onBookmarkChange={(ids) => {
              const next = { ...metaRef.current, bookmarks: ids };
              metaRef.current = next;
              onMetadataChange(next);
            }}
          />
        </div>
        <div className={`doc-tab-pane${activeTab === "properties" ? " doc-tab-pane--active" : ""}`}>
          <DocProperties
            doc={doc}
            onMetadataChange={handleMetaChange}
            onSeriesIdChange={onSeriesIdChange}
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
        </div>
      </div>
    </aside>
  );
}
