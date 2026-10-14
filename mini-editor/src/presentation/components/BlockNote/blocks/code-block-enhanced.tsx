import { useEffect, useMemo, useRef, useState, useCallback, Component } from "react";
import type { ErrorInfo, MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { createReactBlockSpec } from "@blocknote/react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { CODE_LANGUAGES, findLanguage } from "./code-block-languages";
import { highlightToHtml, ensureLanguage } from "./code-block-highlighter";

export interface AskAIPayload {
  blockId: string;
  language: string;
  code: string;
}
export type OnAskAI = (payload: AskAIPayload) => void;

const PROP_SCHEMA = {
  language: { default: "typescript" },
  wrap: { default: false, values: [true, false] as [boolean, boolean] },
  collapsed: { default: false, values: [true, false] as [boolean, boolean] },
  preview: { default: false, values: [true, false] as [boolean, boolean] },
  caption: { default: "" },
  previewHeight: { default: 400 },
} as const;

const MIN_PREVIEW_HEIGHT = 200;
const MAX_PREVIEW_HEIGHT = 1200;

function blockToPlainText(block: { content?: unknown }): string {
  const c = block.content as Array<{ type?: string; text?: string }> | undefined;
  if (!Array.isArray(c)) return "";
  return c
    .map((node) => (node && typeof node.text === "string" ? node.text : ""))
    .join("");
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="4.5" y="4.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SparklesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5l1.4 3.6L13 6.5 9.4 7.9 8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z" fill="currentColor" />
      <circle cx="12.5" cy="12.5" r="1.2" fill="currentColor" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}
function CaptionIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 9.5h3M5 7h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// Compute a `position: fixed` style for a popover anchored to a trigger rect.
// Flips above the trigger when there isn't room below, and clamps horizontally
// to the viewport. Used to portal code-block popovers to <body> so they escape
// the code block's `overflow: hidden` and never get clipped on short blocks.
function computePopoverStyle(
  rect: DOMRect,
  opts: { width: number; align: "left" | "right"; estHeight: number }
): React.CSSProperties {
  const gap = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openUp = spaceBelow < opts.estHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, Math.floor((openUp ? spaceAbove : spaceBelow)));
  let left = opts.align === "left" ? rect.left : rect.right - opts.width;
  left = Math.max(8, Math.min(left, vw - opts.width - 8));
  const style: React.CSSProperties = { position: "fixed", left, width: opts.width, maxHeight };
  if (openUp) style.bottom = vh - rect.top + gap;
  else style.top = rect.bottom + gap;
  return style;
}

function useAnchoredPopover(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  opts: { width: number; align: "left" | "right"; estHeight: number }
): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (el) setStyle(computePopoverStyle(el.getBoundingClientRect(), opts));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
    // opts is a stable per-call-site literal; only `open` should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return style;
}

interface LanguageSelectProps {
  value: string;
  onChange: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
}
function LanguageSelect({ value, onChange, onOpenChange }: LanguageSelectProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback(
    (next: boolean | ((o: boolean) => boolean)) => {
      setOpenState((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        onOpenChange?.(v);
        return v;
      });
    },
    [onOpenChange]
  );
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const current = findLanguage(value);
  const popoverStyle = useAnchoredPopover(open, btnRef, { width: 220, align: "left", estHeight: 320 });

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, setOpen]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CODE_LANGUAGES;
    return CODE_LANGUAGES.filter(
      (l) =>
        l.id.includes(q) ||
        l.label.toLowerCase().includes(q) ||
        l.aliases?.some((a) => a.includes(q))
    );
  }, [query]);

  return (
    <div className="cbx-lang">
      <button
        ref={btnRef}
        type="button"
        className="cbx-lang-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <ChevronDownIcon />
      </button>
      {open &&
        createPortal(
          <div ref={popoverRef} className="cbx-lang-popover" role="listbox" style={popoverStyle}>
            <input
              autoFocus
              className="cbx-lang-search"
              placeholder="Search language..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="cbx-lang-list">
              {items.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="option"
                  aria-selected={l.id === current.id}
                  className={
                    "cbx-lang-item" + (l.id === current.id ? " cbx-lang-item--active" : "")
                  }
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {l.label}
                </button>
              ))}
              {items.length === 0 && <div className="cbx-lang-empty">No match</div>}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

interface MoreMenuProps {
  wrap: boolean;
  collapsed: boolean;
  onToggleWrap: () => void;
  onToggleCollapse: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenChange?: (open: boolean) => void;
}
function MoreMenu({ wrap, collapsed, onToggleWrap, onToggleCollapse, onDuplicate, onDelete, onOpenChange }: MoreMenuProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback(
    (next: boolean | ((o: boolean) => boolean)) => {
      setOpenState((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        onOpenChange?.(v);
        return v;
      });
    },
    [onOpenChange]
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverStyle = useAnchoredPopover(open, btnRef, { width: 180, align: "right", estHeight: 180 });
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, setOpen]);

  return (
    <div className="cbx-more">
      <button ref={btnRef} type="button" className="cbx-icon-btn" onClick={() => setOpen((o) => !o)} title="More">
        <MoreIcon />
      </button>
      {open &&
        createPortal(
          <div ref={popoverRef} className="cbx-more-menu" role="menu" style={popoverStyle}>
            <button type="button" className="cbx-more-item" onClick={() => { onToggleWrap(); setOpen(false); }}>
              {wrap ? "Disable" : "Enable"} word wrap
            </button>
            <button type="button" className="cbx-more-item" onClick={() => { onToggleCollapse(); setOpen(false); }}>
              {collapsed ? "Expand" : "Collapse"}
            </button>
            <div className="cbx-more-sep" />
            <button type="button" className="cbx-more-item" onClick={() => { onDuplicate(); setOpen(false); }}>
              Duplicate
            </button>
            <button
              type="button"
              className="cbx-more-item cbx-more-item--danger"
              onClick={() => { onDelete(); setOpen(false); }}
            >
              Delete
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

interface MermaidViewProps {
  source: string;
  blockId: string;
  isDark: boolean;
  height: number;
  onHeightChange: (next: number) => void;
}
function MermaidView({ source, blockId, isDark, height, onHeightChange }: MermaidViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftHeight, setDraftHeight] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmed = source.trim();
    if (!trimmed) {
      if (ref.current) ref.current.innerHTML = "";
      setError(null);
      return;
    }
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
        });
        const id = `cbx-mermaid-${blockId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const { svg } = await mermaid.render(id, trimmed);
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
        setError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        if (ref.current) ref.current.innerHTML = "";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, blockId, isDark]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;
      const onMove = (ev: MouseEvent) => {
        const next = Math.min(
          MAX_PREVIEW_HEIGHT,
          Math.max(MIN_PREVIEW_HEIGHT, startHeight + (ev.clientY - startY))
        );
        setDraftHeight(next);
      };
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const next = Math.min(
          MAX_PREVIEW_HEIGHT,
          Math.max(MIN_PREVIEW_HEIGHT, startHeight + (ev.clientY - startY))
        );
        setDraftHeight(null);
        if (next !== height) onHeightChange(next);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [height, onHeightChange]
  );

  const effectiveHeight = draftHeight ?? height;

  return (
    <div className="cbx-mermaid">
      <div className="cbx-mermaid-viewport" style={{ height: effectiveHeight }} contentEditable={false}>
        <TransformWrapper
          minScale={0.2}
          maxScale={5}
          initialScale={1}
          centerOnInit
          wheel={{ step: 0.02 }}
          doubleClick={{ disabled: true }}
          panning={{ velocityDisabled: true }}
        >
          {({ zoomIn, zoomOut, resetTransform, centerView }) => (
            <>
              <div className="cbx-mermaid-controls">
                <button
                  type="button"
                  className="cbx-mermaid-ctrl-btn"
                  onClick={() => zoomIn()}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  className="cbx-mermaid-ctrl-btn"
                  onClick={() => zoomOut()}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="cbx-mermaid-ctrl-btn"
                  onClick={() => {
                    resetTransform();
                    centerView(1);
                  }}
                  title="Reset"
                  aria-label="Reset"
                >
                  ⟲
                </button>
              </div>
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <div ref={ref} className="cbx-mermaid-svg" />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
      <div
        className="cbx-mermaid-resize"
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize preview"
        contentEditable={false}
      />
      {error && <pre className="cbx-mermaid-error">{error}</pre>}
    </div>
  );
}

interface CodeBlockComponentProps {
  block: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  editor: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  contentRef: (el: HTMLElement | null) => void;
  askAIRef: MutableRefObject<OnAskAI | null>;
}

function CodeBlockComponent({ block, editor, contentRef, askAIRef }: CodeBlockComponentProps) {
  const language: string = block.props?.language ?? "typescript";
  const wrap: boolean = !!block.props?.wrap;
  const collapsed: boolean = !!block.props?.collapsed;
  const preview: boolean = !!block.props?.preview;
  const caption: string = typeof block.props?.caption === "string" ? block.props.caption : "";
  const previewHeight: number =
    typeof block.props?.previewHeight === "number" && block.props.previewHeight > 0
      ? block.props.previewHeight
      : 400;
  const isMermaid = language === "mermaid";

  const [plain, setPlain] = useState<string>(() => blockToPlainText(block));
  const [highlighted, setHighlighted] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [captionEditing, setCaptionEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  const [isDark, setIsDark] = useState<boolean>(false);

  const updateDarkState = useCallback(() => {
    const el = rootRef.current;
    if (typeof document === "undefined") return;
    const docEl = document.documentElement;
    const bodyEl = document.body;
    const isDarkTheme =
      docEl.getAttribute("data-theme") === "dark" ||
      docEl.classList.contains("dark") ||
      docEl.classList.contains("theme-dark") ||
      bodyEl.classList.contains("dark") ||
      bodyEl.classList.contains("theme-dark") ||
      Boolean(el?.closest('[data-theme="dark"], [data-color-scheme="dark"], .theme-dark, .dark'));
    setIsDark(isDarkTheme);
  }, []);

  useEffect(() => {
    updateDarkState();
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => updateDarkState());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const el = rootRef.current;
    if (el && el.parentElement) {
      const bnParent = el.closest(".bn-container, .dashboard-layout, .workspace-shell") || el.parentElement;
      observer.observe(bnParent, { attributes: true, attributeFilter: ["data-theme", "data-color-scheme", "class"] });
    }
    return () => observer.disconnect();
  }, [updateDarkState]);

  useEffect(() => {
    const unsub = editor.onChange(() => {
      try {
        const fresh = editor.getBlock(block.id);
        if (fresh) setPlain(blockToPlainText(fresh));
      } catch {
        // Block may be temporarily absent during Yjs sync / doc transition —
        // ProseMirror throws "Cannot find node position" in that window.
        // Silently ignore; the next onChange will succeed once the doc settles.
      }
    });
    return typeof unsub === "function" ? unsub : undefined;
  }, [editor, block.id]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const html = await highlightToHtml(plain || "​", language, isDark);
      setHighlighted(html);
    }, 60);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [plain, language, isDark]);

  useEffect(() => {
    ensureLanguage(language);
  }, [language]);

  const updateProps = useCallback(
    (patch: Record<string, unknown>) => {
      editor.updateBlock(block, { props: { ...block.props, ...patch } });
    },
    [editor, block]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [plain]);

  const handleAskAI = useCallback(() => {
    askAIRef.current?.({ blockId: block.id, language, code: plain });
  }, [askAIRef, block.id, language, plain]);

  const handleDuplicate = useCallback(() => {
    editor.insertBlocks(
      [{ type: "codeBlock", props: { ...block.props }, content: block.content }],
      block,
      "after"
    );
  }, [editor, block]);

  const handleDelete = useCallback(() => {
    editor.removeBlocks([block]);
  }, [editor, block]);

  const handleToggleCaption = useCallback(() => {
    if (caption) {
      updateProps({ caption: "" });
      setCaptionEditing(false);
    } else {
      setCaptionEditing(true);
      window.setTimeout(() => captionInputRef.current?.focus(), 0);
    }
  }, [caption, updateProps]);

  const showPreview = isMermaid && preview;
  const showCaption = !!caption || captionEditing;
  const active = langOpen || moreOpen || captionEditing;
  const lineCount = useMemo(() => Math.max(1, plain.split("\n").length), [plain]);

  return (
    <div
      ref={rootRef}
      className={"cbx-root" + (active ? " cbx-root--active" : "")}
      data-wrap={wrap ? "true" : "false"}
      data-collapsed={collapsed && !showPreview ? "true" : "false"}
      data-preview={showPreview ? "true" : "false"}
      data-language={language}
    >
      <div className="cbx-header" contentEditable={false}>
        <LanguageSelect
          value={language}
          onChange={(id) => updateProps({ language: id, preview: id === "mermaid" ? preview : false })}
          onOpenChange={setLangOpen}
        />
        {isMermaid && (
          <div className="cbx-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!preview}
              className={"cbx-tab" + (!preview ? " cbx-tab--active" : "")}
              onClick={() => updateProps({ preview: false })}
            >
              Code
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={preview}
              className={"cbx-tab" + (preview ? " cbx-tab--active" : "")}
              onClick={() => updateProps({ preview: true })}
            >
              Preview
            </button>
          </div>
        )}
        <div className="cbx-spacer" />
        <button type="button" className="cbx-btn cbx-ask-ai" onClick={handleAskAI} title="Ask AI">
          <SparklesIcon />
          <span>Ask AI</span>
        </button>
        <button type="button" className="cbx-icon-btn cbx-copy" onClick={handleCopy} title={copied ? "Copied" : "Copy"} aria-label="Copy">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button
          type="button"
          className={"cbx-icon-btn cbx-caption-btn" + (showCaption ? " cbx-icon-btn--active" : "")}
          onClick={handleToggleCaption}
          title="Caption"
          aria-label="Caption"
          aria-pressed={showCaption}
        >
          <CaptionIcon />
        </button>
        <MoreMenu
          wrap={wrap}
          collapsed={collapsed}
          onToggleWrap={() => updateProps({ wrap: !wrap })}
          onToggleCollapse={() => updateProps({ collapsed: !collapsed })}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onOpenChange={setMoreOpen}
        />
      </div>

      <div className="cbx-body">
        {showPreview ? (
          <MermaidView
            source={plain}
            blockId={String(block.id)}
            isDark={isDark}
            height={previewHeight}
            onHeightChange={(h) => updateProps({ previewHeight: h })}
          />
        ) : (
          <>
            {!wrap && (
              <div className="cbx-gutter" aria-hidden>
                {Array.from({ length: lineCount }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
            )}
            <pre className="cbx-pre">
              <div
                ref={overlayRef}
                className="cbx-overlay"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
              <code ref={contentRef as unknown as React.Ref<HTMLElement>} className="cbx-inline-content" />
            </pre>
          </>
        )}
      </div>

      {showCaption && (
        <div className="cbx-caption" contentEditable={false}>
          <input
            ref={captionInputRef}
            className="cbx-caption-input"
            type="text"
            placeholder="Add a caption..."
            value={caption}
            onChange={(e) => updateProps({ caption: e.target.value })}
            onFocus={() => setCaptionEditing(true)}
            onBlur={() => setCaptionEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Error boundary that catches ProseMirror "Cannot find node position" crashes
 * that originate from ReactNodeViewRenderer during Yjs sync / doc transitions.
 * After catching, it schedules a reset so the block re-renders once the doc
 * has settled (typically within one frame).
 */
interface CBEBState { hasError: boolean }
class CodeBlockErrorBoundary extends Component<{ children: ReactNode }, CBEBState> {
  private _resetTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): CBEBState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Only swallow the specific ProseMirror node-position error.
    // Other errors are re-thrown so they surface normally in dev.
    if (!error?.message?.includes("Cannot find node position")) throw error;
    // Reset after a short delay so the block re-mounts once the Yjs doc settles.
    this._resetTimer = setTimeout(() => {
      this.setState({ hasError: false });
    }, 200);
  }
  componentWillUnmount() {
    if (this._resetTimer !== null) clearTimeout(this._resetTimer);
  }
  render() {
    if (this.state.hasError) {
      // Minimal invisible placeholder — keeps the DOM slot alive
      return <div style={{ minHeight: "2em" }} aria-hidden />;
    }
    return this.props.children;
  }
}

export function createCodeBlockEnhanced(askAIRef: MutableRefObject<OnAskAI | null>) {
  const factory = createReactBlockSpec(
    {
      type: "codeBlock" as const,
      propSchema: PROP_SCHEMA,
      content: "inline",
    },
    {
      render: ({ block, editor, contentRef }) => (
        <CodeBlockErrorBoundary>
          <CodeBlockComponent
            block={block}
            editor={editor}
            contentRef={contentRef as (el: HTMLElement | null) => void}
            askAIRef={askAIRef}
          />
        </CodeBlockErrorBoundary>
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toExternalHTML: ({ block, contentRef }: { block: any; contentRef: any }) => {
        const lang = block.props?.language || "typescript";
        return (
          <pre>
            <code ref={contentRef} className={`language-${lang}`} data-language={lang} />
          </pre>
        );
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as unknown as (opts?: Record<string, unknown>) => any;
  return factory({});
}
