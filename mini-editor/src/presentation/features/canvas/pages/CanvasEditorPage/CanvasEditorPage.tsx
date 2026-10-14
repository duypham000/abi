import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { useSelector } from "react-redux";
import { Excalidraw, Sidebar as ExcalidrawSidebar } from "@excalidraw/excalidraw";
import { FileTextOutlined, FormOutlined } from "@ant-design/icons";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { nanoid } from "nanoid";
import { type RootState } from "@/presentation/store";
import { AppBar } from "@/presentation/components/AppBar";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { useCreateNoteMutation } from "@/infrastructure/api/notesApi";
import { useTouchDevice } from "@/presentation/hooks/useTouchDevice";
import { useCanvasEditor } from "../../hooks/useCanvasEditor";
import { useCanvasUiStore } from "../../store/canvasUiStore";
import { EmbeddedDocFrame } from "./components/EmbeddedDocFrame";
import { EmbeddedNoteFrame } from "./components/EmbeddedNoteFrame";
import { DocsSidebarPanel, DOC_DRAG_TYPE } from "./components/DocsSidebarPanel";
import { ShapeActionToolbar } from "./components/ShapeActionToolbar";
import "./CanvasEditorPage.scss";

const TOMO_DOC_PREFIX = "tomo://doc/";
const TOMO_NOTE_PREFIX = "tomo://note/";
const EMBED_WIDTH = 480;
const EMBED_HEIGHT = 320;
const EMBED_HEIGHT_COLLAPSED = 56;

interface CanvasEditorPageProps {
  panelMode?: boolean;
  canvasIdProp?: number;
}

export default function CanvasEditorPage({ panelMode, canvasIdProp }: CanvasEditorPageProps) {
  const params = useParams<{ id: string }>();
  const rawId = canvasIdProp ?? (params.id ? Number(params.id) : 1);
  const canvasId = isNaN(rawId) ? 1 : rawId;
  const navigate = useNavigate();
  const { openPanel } = useGoldenLayout();
  const { theme } = useSelector((state: RootState) => state.app);

  const { canvas, isLoading, saveStatus, initialScene, handleSceneChange } =
    useCanvasEditor(canvasId);
  const isTouch = useTouchDevice();
  const [canvasMode, setCanvasMode] = useState<"navigate" | "edit">(isTouch ? "navigate" : "edit");

  useEffect(() => {
    setCanvasMode(isTouch ? "navigate" : "edit");
  }, [isTouch]);

  const setExcalidrawAPIStore = useCanvasUiStore((s) => s.setExcalidrawAPI);
  const [excalidrawAPIState, _setExcalidrawAPIState] = useState<ExcalidrawImperativeAPI | null>(null);
  const api = excalidrawAPIState;


  const [createNote] = useCreateNoteMutation();

  type ToolbarSnapshot = {
    elementId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isCollapsed: boolean;
    link: string | null;
    scrollX: number;
    scrollY: number;
    zoom: number;
    offsetLeft: number;
    offsetTop: number;
  };

  const [toolbarSnapshot, setToolbarSnapshot] = useState<ToolbarSnapshot | null>(null);
  const [isAltHeld, setIsAltHeld] = useState(false);
  const knownDimsRef = useRef<Map<string, { width: number; height: number }>>(new Map());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !isAltHeld) setIsAltHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey && isAltHeld) setIsAltHeld(false);
    };
    const onBlur = () => setIsAltHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [isAltHeld]);

  const setExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setExcalidrawAPI(api);
      setExcalidrawAPIStore(api);
    },
    [setExcalidrawAPIStore]
  );

  const updateElementById = useCallback(
    (elementId: string, patch: (el: any) => Partial<any>) => {
      if (!api) return;
      const next = api.getSceneElements().map((el: any) => {
        if (el.id !== elementId) return el;
        const update = patch(el);
        return {
          ...el,
          ...update,
          version: (el.version ?? 0) + 1,
          versionNonce: Math.floor(Math.random() * 1e6),
          updated: Date.now(),
        };
      });
      api.updateScene({ elements: next as any });
    },
    []
  );

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      handleSceneChange(elements, appState, files);

      const knownDims = knownDimsRef.current;
      const liveIds = new Set<string>();
      for (const el of elements as any[]) {
        if (el.type !== "embeddable" || el.isDeleted) continue;
        const link: string = el.link ?? "";
        if (!link.startsWith(TOMO_DOC_PREFIX)) continue;
        liveIds.add(el.id);
        if (el.customData?.isCollapsed) continue;
        const known = knownDims.get(el.id);
        if (!known) continue;
        if (el.width !== known.width) {
          knownDims.set(el.id, { width: el.width, height: known.height });
          continue;
        }
        if (Math.abs(el.height - known.height) >= 2) {
          updateElementById(el.id, () => ({ height: known.height }));
        }
      }
      for (const id of Array.from(knownDims.keys())) {
        if (!liveIds.has(id)) knownDims.delete(id);
      }

      const selectedIds = appState?.selectedElementIds ?? {};
      const selectedKeys = Object.keys(selectedIds).filter((k) => selectedIds[k]);
      let nextEl: any | null = null;
      if (selectedKeys.length === 1) {
        const el = elements.find((e: any) => e.id === selectedKeys[0]);
        if (el && el.type === "embeddable" && !el.isDeleted) nextEl = el;
      }

      if (!nextEl) {
        setToolbarSnapshot((prev) => (prev === null ? prev : null));
        return;
      }

      const next: ToolbarSnapshot = {
        elementId: nextEl.id,
        x: nextEl.x,
        y: nextEl.y,
        width: nextEl.width,
        height: nextEl.height,
        isCollapsed: !!nextEl.customData?.isCollapsed,
        link: nextEl.link ?? null,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom?.value ?? 1,
        offsetLeft: appState.offsetLeft ?? 0,
        offsetTop: appState.offsetTop ?? 0,
      };

      setToolbarSnapshot((prev) => {
        if (
          prev &&
          prev.elementId === next.elementId &&
          prev.x === next.x &&
          prev.y === next.y &&
          prev.width === next.width &&
          prev.height === next.height &&
          prev.isCollapsed === next.isCollapsed &&
          prev.link === next.link &&
          prev.scrollX === next.scrollX &&
          prev.scrollY === next.scrollY &&
          prev.zoom === next.zoom &&
          prev.offsetLeft === next.offsetLeft &&
          prev.offsetTop === next.offsetTop
        ) {
          return prev;
        }
        return next;
      });
    },
    [handleSceneChange, updateElementById]
  );

  const insertEmbeddable = useCallback((link: string, dropPoint?: { clientX: number; clientY: number }) => {
    if (!api) return;

    let x = 100;
    let y = 100;

    if (dropPoint) {
      const appState = api.getAppState() as any;
      x = (dropPoint.clientX - appState.offsetLeft - appState.scrollX) / appState.zoom.value;
      y = (dropPoint.clientY - appState.offsetTop - appState.scrollY) / appState.zoom.value;
    } else {
      const appState = api.getAppState() as any;
      x = (-appState.scrollX + appState.width / 2) / appState.zoom.value - EMBED_WIDTH / 2;
      y = (-appState.scrollY + appState.height / 2) / appState.zoom.value - EMBED_HEIGHT / 2;
    }

    const newElement = {
      type: "embeddable",
      id: nanoid(),
      x,
      y,
      width: EMBED_WIDTH,
      height: EMBED_HEIGHT,
      link,
      angle: 0,
      strokeColor: "#6c6cff",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      locked: false,
      customData: { isCollapsed: false },
    };

    const currentElements = api.getSceneElements();
    api.updateScene({ elements: [...currentElements, newElement as any] });
  }, []);

  const handleInsertDoc = useCallback(
    (docId: number) => insertEmbeddable(`${TOMO_DOC_PREFIX}${docId}`),
    [insertEmbeddable]
  );

  const handleAddNote = useCallback(async () => {
    const note = await createNote({
      title: "New Note",
      content: "",
      metadata: null,
      lastSync: null,
      status: 1,
    }).unwrap();
    insertEmbeddable(`${TOMO_NOTE_PREFIX}${note.id}`);
  }, [createNote, insertEmbeddable]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DOC_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const docIdStr = e.dataTransfer.getData(DOC_DRAG_TYPE);
      if (!docIdStr) return;
      e.preventDefault();
      insertEmbeddable(`${TOMO_DOC_PREFIX}${docIdStr}`, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
    },
    [insertEmbeddable]
  );

  const renderEmbeddable = useCallback(
    (element: any) => {
      const link: string = element.link ?? "";
      const strokeColor: string = element.strokeColor ?? "#6c6cff";
      const backgroundColor: string = element.backgroundColor ?? "transparent";
      const opacity: number =
        typeof element.opacity === "number" ? element.opacity : 100;
      const strokeWidth: number =
        typeof element.strokeWidth === "number" ? element.strokeWidth : 1;
      const strokeStyle: "solid" | "dashed" | "dotted" =
        element.strokeStyle ?? "solid";
      const roundness = element.roundness ?? null;
      if (link.startsWith(TOMO_DOC_PREFIX)) {
        const docId = Number(link.slice(TOMO_DOC_PREFIX.length));
        if (!isNaN(docId)) {
          const isCollapsed = !!element.customData?.isCollapsed;
          return (
            <EmbeddedDocFrame
              docId={docId}
              elementId={element.id}
              isCollapsed={isCollapsed}
              width={element.width}
              onContentHeightChange={(height) => {
                knownDimsRef.current.set(element.id, {
                  width: element.width,
                  height,
                });
                updateElementById(element.id, (el) => {
                  if (el.customData?.isCollapsed) return {};
                  if (Math.abs((el.height ?? 0) - height) < 2) return {};
                  return { height };
                });
              }}
              strokeColor={strokeColor}
              backgroundColor={backgroundColor}
              opacity={opacity}
              strokeWidth={strokeWidth}
              strokeStyle={strokeStyle}
              roundness={roundness}
            />
          );
        }
      }
      if (link.startsWith(TOMO_NOTE_PREFIX)) {
        const noteId = Number(link.slice(TOMO_NOTE_PREFIX.length));
        if (!isNaN(noteId))
          return (
            <EmbeddedNoteFrame
              noteId={noteId}
              strokeColor={strokeColor}
              backgroundColor={backgroundColor}
              opacity={opacity}
              strokeWidth={strokeWidth}
              strokeStyle={strokeStyle}
              roundness={roundness}
            />
          );
      }
      return null;
    },
    [updateElementById]
  );

  const validateEmbeddable = useCallback((url: string) => {
    return url.startsWith("tomo://");
  }, []);

  const handleToolbarToggleCollapse = useCallback(() => {
    if (!toolbarSnapshot) return;
    const next = !toolbarSnapshot.isCollapsed;
    updateElementById(toolbarSnapshot.elementId, (el) => ({
      customData: { ...(el.customData ?? {}), isCollapsed: next },
      height: next ? EMBED_HEIGHT_COLLAPSED : EMBED_HEIGHT,
    }));
  }, [toolbarSnapshot, updateElementById]);

  const handleToolbarDelete = useCallback(() => {
    if (!toolbarSnapshot) return;
    if (!api) return;
    const next = api.getSceneElements().map((el: any) =>
      el.id === toolbarSnapshot.elementId
        ? { ...el, isDeleted: true, version: (el.version ?? 0) + 1, updated: Date.now() }
        : el
    );
    api.updateScene({ elements: next as any });
  }, [toolbarSnapshot]);

  const handleToolbarUnlink = useCallback(() => {
    if (!toolbarSnapshot) return;
    updateElementById(toolbarSnapshot.elementId, () => ({ link: null }));
  }, [toolbarSnapshot, updateElementById]);

  const selectedDocId = (() => {
    const link = toolbarSnapshot?.link ?? "";
    if (link.startsWith(TOMO_DOC_PREFIX)) {
      const n = Number(link.slice(TOMO_DOC_PREFIX.length));
      return isNaN(n) ? null : n;
    }
    return null;
  })();

  const handleToolbarOpen = useCallback(() => {
    if (selectedDocId != null) {
      if (panelMode) {
        openPanel(PANEL_TYPES.DOC_EDITOR, { id: selectedDocId }, { title: "Document" });
      } else {
        navigate(`/docs/${selectedDocId}`);
      }
    }
  }, [navigate, openPanel, panelMode, selectedDocId]);

  const [docsSidebarOpen, setDocsSidebarOpen] = useState(false);

  const handleToggleDocsSidebar = useCallback(() => {
    setDocsSidebarOpen(Boolean(open));
  }, []);

  const handleSidebarSelect = useCallback(
    (docId: number) => {
      handleInsertDoc(docId);
      setDocsSidebarOpen(false);
    },
    [handleInsertDoc]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        handleToggleDocsSidebar();
      } else if (key === "n") {
        e.preventDefault();
        handleAddNote();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleToggleDocsSidebar, handleAddNote]);

  const handlePointerUpdate = useCallback(() => {}, []);

  const renderTopRightUI = useCallback((isMobile: boolean) => (
    <div className={`tomo-toolbar ${isMobile ? "tomo-toolbar--mobile" : ""}`}>
      <button
        type="button"
        className={`tomo-toolbar__btn${docsSidebarOpen ? " tomo-toolbar__btn--active" : ""}`}
        onClick={handleToggleDocsSidebar}
        title="Add Docs"
        aria-label="Add Docs"
      >
        <FileTextOutlined className="tomo-toolbar__icon" />
        {!isMobile && <span className="tomo-toolbar__shortcut">D</span>}
      </button>
      <button
        type="button"
        className="tomo-toolbar__btn"
        onClick={handleAddNote}
        title="Add Note"
        aria-label="Add Note"
      >
        <FormOutlined className="tomo-toolbar__icon" />
        {!isMobile && <span className="tomo-toolbar__shortcut">N</span>}
      </button>
    </div>
  ), [docsSidebarOpen, handleToggleDocsSidebar, handleAddNote]);

  if (isLoading || !initialScene || isLoading) {
    const loadingContent = (
      <main className="dashboard-main canvas-editor-loading">
        <Loading label="Đang kết nối phòng vẽ thời gian thực…" />
      </main>
    );
    if (panelMode) return loadingContent;
    return (
      <div className={`dashboard-layout theme-${theme}`}>
        <AppBar variant="dashboard" />
        <div className="dashboard-body">
          <Sidebar />
          {loadingContent}
        </div>
      </div>
    );
  }

  const canvasContent = (
    <main className="dashboard-main canvas-editor-main">
          <div className="canvas-editor-header">
            <h2 className="canvas-editor-title">{canvas?.title || "Untitled Canvas"}</h2>
            <span className="canvas-editor-save-status">
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "success" && "Saved"}
              {saveStatus === "error" && "Save failed"}
            </span>
          </div>

          <div
            className={`canvas-editor-container${isAltHeld ? " is-alt-pass-through" : ""}${canvasMode === "navigate" ? " is-navigate-active" : ""}`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <Excalidraw
              key={canvasId}
              initialData={initialScene as any}
              onChange={handleChange}
              onPointerUpdate={handlePointerUpdate}
              renderEmbeddable={renderEmbeddable as any}
              validateEmbeddable={validateEmbeddable}
              renderTopRightUI={renderTopRightUI}
              viewModeEnabled={canvasMode === "navigate"}
            >
              <ExcalidrawSidebar name="docs-picker" docked={false}>
                <ExcalidrawSidebar.Header>Add Docs</ExcalidrawSidebar.Header>
                <DocsSidebarPanel onSelect={handleSidebarSelect} />
              </ExcalidrawSidebar>
            </Excalidraw>

            {isTouch && (
              <div className="canvas-mobile-mode-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${canvasMode === "navigate" ? "active" : ""}`}
                  onClick={() => setCanvasMode("navigate")}
                >
                  🧭 Di chuyển
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${canvasMode === "edit" ? "active" : ""}`}
                  onClick={() => setCanvasMode("edit")}
                >
                  ✍️ Chỉnh sửa
                </button>
              </div>
            )}

            {toolbarSnapshot && (
              <ShapeActionToolbar
                snapshot={toolbarSnapshot}
                fullPagePath={selectedDocId != null ? `/docs/${selectedDocId}` : null}
                onOpenFullPage={selectedDocId != null ? handleToolbarOpen : undefined}
                onToggleCollapse={handleToolbarToggleCollapse}
                onUnlink={toolbarSnapshot.link ? handleToolbarUnlink : undefined}
                onDelete={handleToolbarDelete}
              />
            )}
          </div>
    </main>
  );

  const wrappedCanvasContent = (
    <div className="canvas-editor-page-container" style={{ height: "100%", width: "100%" }}>
      {canvasContent}
    </div>
  );

  if (panelMode) return wrappedCanvasContent;

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {wrappedCanvasContent}
      </div>
    </div>
  );
}
