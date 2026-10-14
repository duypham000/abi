import { useState, useCallback, useEffect, useRef } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Select, Tooltip } from "antd";
import { EditOutlined } from "@ant-design/icons";
import {
  useGetCanvasByIdQuery,
  useListCanvasQuery,
  useSearchCanvasQuery,
} from "@/infrastructure/api/canvasApi";
import { parseCanvasMetadata } from "@/core/interfaces/canvas";
import type { CanvasDto } from "@/core/interfaces/canvas";
import { ExcalidrawEditorModal } from "./ExcalidrawEditorModal";
import "./excalidraw-block.css";

const thumbnailCache = new Map<string, string>();
const NEW_CANVAS_VALUE = "__new__";
const MIN_WIDTH = 120;

export const DRAFT_PREFIX = "draft-";
function isDraft(id: string) { return id.startsWith(DRAFT_PREFIX); }
function isReal(id: string) { return id !== "" && !isDraft(id); }
function generateDraftId() { return DRAFT_PREFIX + crypto.randomUUID(); }

function CanvasOptionLabel({ canvas }: { canvas: CanvasDto }) {
  const thumb = parseCanvasMetadata(canvas.metadata).thumbnail ?? canvas.preview;
  return (
    <span className="excalidraw-block__option-label">
      {thumb && <img src={thumb} className="excalidraw-block__option-thumb" alt="" />}
      {canvas.title || "Untitled Canvas"}
    </span>
  );
}

function BlankCanvasPreview() {
  return (
    <div className="excalidraw-block__blank-preview">
      <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg"
        className="excalidraw-block__blank-svg" aria-hidden>
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 17 }, (_, col) => (
            <circle key={`${row}-${col}`} cx={25 + col * 22} cy={25 + row * 19}
              r="1" fill="currentColor" opacity="0.25" />
          ))
        )}
        <path d="M80 140 Q120 90 160 110 Q200 130 240 80 Q270 50 310 100"
          stroke="currentColor" strokeWidth="2" fill="none" opacity="0.2" strokeLinecap="round" />
        <rect x="130" y="60" width="50" height="35" rx="4"
          stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.15" />
        <circle cx="270" cy="130" r="20"
          stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.15" />
      </svg>
      <span className="excalidraw-block__blank-label">Canvas trống — click để mở editor</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExcalidrawBlockRenderer({ block, editor }: { block: any; editor: any }) {
  const canvasId = (block.props.canvasId as string) || "";
  const storedWidth: number = block.props.previewWidth || 0;
  const isEditable: boolean = editor.isEditable;
  const initDoneRef = useRef(false);

  // Assign draft ID on first mount if empty
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    if (isEditable && canvasId === "") {
      editor.updateBlock(block.id, { props: { canvasId: generateDraftId() } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localThumbnail, setLocalThumbnail] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resize state
  const [width, setWidth] = useState<number>(storedWidth);
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  // Keep width in sync when block prop changes externally (e.g. collab)
  useEffect(() => { setWidth(storedWidth); }, [storedWidth]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentW = wrapperRef.current?.offsetWidth ?? width ?? 400;
    resizeRef.current = { startX: e.clientX, startW: currentW };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const maxW = wrapperRef.current?.parentElement?.offsetWidth ?? 9999;
      const next = Math.max(MIN_WIDTH, Math.min(maxW, resizeRef.current.startW + delta));
      setWidth(next);
    };

    const onUp = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const maxW = wrapperRef.current?.parentElement?.offsetWidth ?? 9999;
      const final = Math.max(MIN_WIDTH, Math.min(maxW, resizeRef.current.startW + delta));
      resizeRef.current = null;
      editor.updateBlock(block.id, { props: { previewWidth: Math.round(final) } });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [block.id, editor, width]);

  // Data fetching
  const realId = isReal(canvasId) ? Number(canvasId) : undefined;
  const { data: canvas } = useGetCanvasByIdQuery(realId!, { skip: realId === undefined });
  const { data: listData } = useListCanvasQuery({ size: 30 });
  const { data: searchResults } = useSearchCanvasQuery(debouncedSearch, { skip: !debouncedSearch });

  const thumbnail =
    localThumbnail ??
    (canvas ? (parseCanvasMetadata(canvas.metadata).thumbnail ?? canvas.preview ?? null) : null);

  useEffect(() => {
    if (isReal(canvasId) && thumbnail) thumbnailCache.set(canvasId, thumbnail);
  }, [canvasId, thumbnail]);

  const handleSearch = useCallback((value: string) => {
    setSearchText(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  const handleSelect = useCallback((value: string) => {
    setLocalThumbnail(null);
    editor.updateBlock(block.id, {
      props: { canvasId: value === NEW_CANVAS_VALUE ? generateDraftId() : value },
    });
    setSearchText(""); setDebouncedSearch("");
  }, [block.id, editor]);

  const handleSaved = useCallback((realCanvasId: string, thumb: string) => {
    if (thumb) { setLocalThumbnail(thumb); thumbnailCache.set(realCanvasId, thumb); }
    if (realCanvasId !== canvasId) {
      editor.updateBlock(block.id, { props: { canvasId: realCanvasId } });
    }
  }, [block.id, canvasId, editor]);

  const canvasList = debouncedSearch ? (searchResults ?? []) : (listData?.items ?? []);
  const selectOptions = [
    { value: NEW_CANVAS_VALUE, label: "+ Thêm canvas mới" },
    ...canvasList.map((c) => ({ value: String(c.id), label: <CanvasOptionLabel canvas={c} /> })),
  ];
  const selectValue = isReal(canvasId) ? canvasId : NEW_CANVAS_VALUE;

  const wrapperStyle: React.CSSProperties = width > 0
    ? { width, maxWidth: "100%" }
    : { width: "100%" };

  return (
    <div
      ref={wrapperRef}
      className="excalidraw-block"
      style={wrapperStyle}
      onMouseEnter={() => isEditable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Toolbar */}
      {isEditable && (
        <div className="excalidraw-block__toolbar" onMouseDown={(e) => e.stopPropagation()}>
          <Tooltip title={canvas?.title ?? (isDraft(canvasId) ? "Canvas mới" : "")}>
            <button className="excalidraw-block__edit-btn" onClick={() => setIsModalOpen(true)}>
              <EditOutlined /> Mở Editor
            </button>
          </Tooltip>
          <Select
            className="excalidraw-block__select"
            value={selectValue}
            showSearch filterOption={false}
            searchValue={searchText}
            onSearch={handleSearch}
            onSelect={handleSelect}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options={selectOptions as any}
            size="small"
            getPopupContainer={() => document.body}
            popupMatchSelectWidth={false}
          />
        </div>
      )}

      {/* Preview area */}
      <div className="excalidraw-block__preview">
        {thumbnail ? (
          <img src={thumbnail} alt={canvas?.title ?? "Excalidraw canvas"}
            className="excalidraw-block__image" />
        ) : isReal(canvasId) ? (
          <div className="excalidraw-block__placeholder">Đang tải canvas...</div>
        ) : (
          <BlankCanvasPreview />
        )}
      </div>

      {/* Resize handle — right edge only */}
      {isEditable && hovered && (
        <div
          className="excalidraw-block__resize-handle"
          onMouseDown={startResize}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <ExcalidrawEditorModal
          canvasId={canvasId || generateDraftId()}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

const excalidrawFactory = createReactBlockSpec(
  {
    type: "excalidraw" as const,
    propSchema: {
      canvasId: { default: "" },
      previewWidth: { default: 0 },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => <ExcalidrawBlockRenderer block={block} editor={editor} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toExternalHTML: ({ block }: { block: any }) => {
      const canvasId = (block.props?.canvasId as string) || "";
      const w = block.props?.previewWidth as number | undefined;
      if (isReal(canvasId) && thumbnailCache.has(canvasId)) {
        return (
          <img src={thumbnailCache.get(canvasId)} alt="Excalidraw canvas"
            data-excalidraw-id={canvasId}
            style={w ? { width: w } : undefined} />
        );
      }
      return <span data-excalidraw-id={canvasId || undefined}>[Excalidraw canvas]</span>;
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as unknown as (opts?: Record<string, unknown>) => any;

export const excalidrawBlock = excalidrawFactory({});
