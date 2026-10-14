import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistedState } from "@/presentation/hooks/usePersistedState";
import { Button, Tooltip } from "antd";
import { EyeOutlined, SwapOutlined } from "@ant-design/icons";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import "./DocTOC.scss";

export interface HeadingEntry {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

type TocKind = "title" | "heading" | "paragraph" | "list" | "quote" | "code" | "other";

interface TocEntry {
  id: string;
  kind: TocKind;
  level: number;
  text: string;
  badge: string | null;
  blockType?: string;
}

interface TocPrefs {
  showTypeIcon: boolean;
  visibility: "all" | "headings";
}

const PREFS_KEY = "doc-toc-prefs-v1";
const DEFAULT_PREFS: TocPrefs = { showTypeIcon: true, visibility: "all" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInlineText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (c?.text) return c.text;
        if (Array.isArray(c?.content)) return extractInlineText(c.content);
        return "";
      })
      .join("");
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyBlock(block: any): { kind: TocKind; badge: string | null; level: number } | null {
  const type: string = block?.type ?? "";
  switch (type) {
    case "heading": {
      const lvl = Math.min(6, Math.max(1, Number(block.props?.level) || 1));
      return { kind: "heading", badge: `H${lvl}`, level: lvl };
    }
    case "paragraph":
      return { kind: "paragraph", badge: null, level: 0 };
    case "bulletListItem":
    case "numberedListItem":
    case "checkListItem":
    case "toggleListItem":
      return { kind: "list", badge: null, level: 0 };
    case "quote":
      return { kind: "quote", badge: null, level: 0 };
    case "codeBlock":
    case "code":
      return { kind: "code", badge: null, level: 0 };
    case "image":
    case "video":
    case "audio":
    case "file":
    case "table":
    case "embed":
      return { kind: "other", badge: null, level: 0 };
    default:
      return null;
  }
}

function blockLabel(kind: TocKind, blockType?: string): string {
  switch (kind) {
    case "paragraph": return "paragraph";
    case "list": return "list";
    case "quote": return "quote";
    case "code": return "code";
    case "other": return blockType || "block";
    default: return "";
  }
}

// ── Type icons (inline SVG, 14×14) ─────────────────────────────────
const IconT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2.5 3h9M7 3v8M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const IconList = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <circle cx="3" cy="4" r="0.8" fill="currentColor" />
    <circle cx="3" cy="7" r="0.8" fill="currentColor" />
    <circle cx="3" cy="10" r="0.8" fill="currentColor" />
    <path d="M5.5 4h6M5.5 7h6M5.5 10h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const IconQuote = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M3 9V7c0-1.4 1-2.5 2.3-3M8 9V7c0-1.4 1-2.5 2.3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M3 9h2v2H3zM8 9h2v2H8z" fill="currentColor" />
  </svg>
);
const IconCode = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M5 4 2 7l3 3M9 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconBlock = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

function renderTypeIcon(kind: TocKind) {
  switch (kind) {
    case "paragraph": return IconT;
    case "list": return IconList;
    case "quote": return IconQuote;
    case "code": return IconCode;
    case "other": return IconBlock;
    default: return null;
  }
}

interface DocTOCProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any | null;
  textMode?: "ellipsis" | "wrap";
  onTextModeChange?: (mode: "ellipsis" | "wrap") => void;
  bookmarks?: Set<string>;
  onBookmarkToggle?: (id: string) => void;
  onHeadingsChange?: (headings: HeadingEntry[]) => void;
}

export function DocTOC({
  editor,
  textMode = "ellipsis",
  onHeadingsChange,
}: DocTOCProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prefs, setPersistedPrefs] = usePersistedState<TocPrefs>(PREFS_KEY, DEFAULT_PREFS);
  const isFromTocClickRef = useRef(false);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const entriesRef = useRef<TocEntry[]>([]);
  const visibleEntriesRef = useRef<TocEntry[]>([]);

  function updatePrefs(patch: Partial<TocPrefs>) {
    setPersistedPrefs({ ...prefs, ...patch });
  }

  // Walk all blocks once → flat TocEntry[] with running heading-based indent.
  const entries = useMemo<TocEntry[]>(() => {
    if (!editor) return [];
    const blocks = editor.document ?? [];
    const result: TocEntry[] = [];
    let currentHeadingLevel = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const block of blocks as any[]) {
      const meta = classifyBlock(block);
      if (!meta) continue;
      const text = extractInlineText(block.content).trim();
      if (meta.kind === "heading") {
        currentHeadingLevel = meta.level;
        result.push({
          id: block.id,
          kind: "heading",
          level: meta.level,
          text: text || `Heading ${meta.level}`,
          badge: meta.badge,
        });
      } else {
        const indentLevel = Math.min(6, (currentHeadingLevel || 0) + 1);
        result.push({
          id: block.id,
          kind: meta.kind,
          level: indentLevel,
          text: text || blockLabel(meta.kind, block.type),
          badge: null,
          blockType: block.type,
        });
      }
    }
    return result;
  }, [editor?.document]);

  // Keep refs in sync with latest rendered values (for use inside event handlers).
  entriesRef.current = entries;

  // Sync visible entries ref after prefs/entries change.
  const visibleEntries = prefs.visibility === "headings"
    ? entries.filter((e) => e.kind === "heading")
    : entries;
  visibleEntriesRef.current = visibleEntries;

  // Subscribe to TipTap transactions to track cursor position → update activeId.
  useEffect(() => {
    const tt = editor?._tiptapEditor;
    if (!tt) return;
    const handleTransaction = () => {
      if (isFromTocClickRef.current) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cursorBlockId = (editor.getTextCursorPosition as any)?.()?.block?.id;
        if (!cursorBlockId) return;
        const allEntries = entriesRef.current;
        const idx = allEntries.findIndex((e) => e.id === cursorBlockId);
        if (idx === -1) return;
        const visibleIds = new Set(visibleEntriesRef.current.map((e) => e.id));
        let found: string | null = null;
        for (let i = idx; i >= 0; i--) {
          if (visibleIds.has(allEntries[i].id)) { found = allEntries[i].id; break; }
        }
        setActiveId(found);
      } catch { /* ignore */ }
    };
    tt.on("transaction", handleTransaction);
    return () => tt.off("transaction", handleTransaction);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?._tiptapEditor]);

  // Scroll active TOC item into view when cursor-driven change occurs.
  useEffect(() => {
    if (!activeId || isFromTocClickRef.current) return;
    activeItemRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeId]);

  // Notify parent of headings only (preserves the existing bookmark API contract).
  // Use refs + signature comparison to avoid an infinite loop: parent recreates
  // `onHeadingsChange` on each render, and parent's setState also re-renders us.
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  onHeadingsChangeRef.current = onHeadingsChange;
  const lastHeadingsSigRef = useRef<string>("");
  useEffect(() => {
    const headings: HeadingEntry[] = entries
      .filter((e) => e.kind === "heading")
      .map((e) => ({
        id: e.id,
        level: Math.min(6, Math.max(1, e.level)) as 1 | 2 | 3 | 4 | 5 | 6,
        text: e.text,
      }));
    const sig = headings.map((h) => `${h.id}:${h.level}:${h.text}`).join("|");
    if (sig === lastHeadingsSigRef.current) return;
    lastHeadingsSigRef.current = sig;
    onHeadingsChangeRef.current?.(headings);
  }, [entries]);

  function scrollToBlock(id: string) {
    isFromTocClickRef.current = true;
    setTimeout(() => { isFromTocClickRef.current = false; }, 500);
    const isSecondClick = activeId === id;
    if (editor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const block = editor.document?.find((b: any) => b.id === id);
      if (block) {
        try { editor.setTextCursorPosition(block, "start"); } catch { /* ignore */ }
        if (isSecondClick) {
          try { editor.setSelection({ startBlock: block, endBlock: block }); } catch { /* ignore */ }
        }
        try { editor.focus(); } catch { /* ignore */ }
      }
    }
    const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }

  if (!editor) {
    return (
      <div className="toc-empty">
        <Loading size="sm" label="Đang tải…" />
      </div>
    );
  }

  const headingsOnly = prefs.visibility === "headings";

  return (
    <div className="toc-wrapper">
      <div className="toc-toolbar">
        <span className="toc-toolbar-title">Table of Contents</span>
        <span className="toc-toolbar-spacer" />
        <Tooltip title={prefs.showTypeIcon ? "Hide type icon" : "Show type icon"} placement="bottom">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => updatePrefs({ showTypeIcon: !prefs.showTypeIcon })}
            className={`toc-toolbar-btn${prefs.showTypeIcon ? " toc-toolbar-btn--active" : ""}`}
          />
        </Tooltip>
        <Tooltip title={headingsOnly ? "Show all blocks" : "Headings only"} placement="bottom">
          <Button
            type="text"
            size="small"
            icon={<SwapOutlined rotate={90} />}
            onClick={() => updatePrefs({ visibility: headingsOnly ? "all" : "headings" })}
            className={`toc-toolbar-btn${headingsOnly ? " toc-toolbar-btn--active" : ""}`}
          />
        </Tooltip>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="toc-empty">No content yet.</div>
      ) : (
        <nav className={`toc${textMode === "wrap" ? " toc--wrap" : ""}${prefs.showTypeIcon ? "" : " toc--no-type"}`}>
          {visibleEntries.map((e) => (
            <button
              key={e.id}
              ref={activeId === e.id ? activeItemRef : undefined}
              className={`toc-item toc-item--${e.kind} toc-item--lvl${e.level}${activeId === e.id ? " toc-item--active" : ""}`}
              onClick={() => scrollToBlock(e.id)}
              title={e.text}
            >
              <span className="toc-item-text">{e.text}</span>
              {e.badge ? (
                <span className="toc-item-badge">{e.badge}</span>
              ) : (
                <span className="toc-item-type">{renderTypeIcon(e.kind)}</span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
