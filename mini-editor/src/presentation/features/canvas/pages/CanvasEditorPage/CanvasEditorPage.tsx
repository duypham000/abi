import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { useSelector } from "react-redux";
import { Excalidraw, Sidebar as ExcalidrawSidebar } from "@excalidraw/excalidraw";
import {
  FileTextOutlined,
  FormOutlined,
  SaveOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { Button, Tooltip, message } from "antd";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { nanoid } from "nanoid";
import { type RootState } from "@/presentation/store";
import { AppBar } from "@/presentation/components/AppBar";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { useCreateNoteMutation } from "@/infrastructure/api/notesApi";
import { useTouchDevice } from "@/presentation/hooks/useTouchDevice";
import {
  useSaveGitFileMutation,
  useCheckFileStatusMutation,
  usePullRepoMutation,
  useGetWorkspaceManifestQuery,
  useGetFileHistoryQuery,
  useGetGithubUserQuery,
} from "@/infrastructure/api/githubApi";
import type { CanvasScene } from "@/core/interfaces/canvas";
import { useCanvasEditor, sanitizeAppState } from "../../hooks/useCanvasEditor";
import { useCanvasUiStore } from "../../store/canvasUiStore";
import { useCanvasYjsCollaboration, hasVisualChange as hasVisualChangePush } from "../../hooks/useCanvasYjsCollaboration";
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

  const {
    canvas,
    isLoading,
    saveStatus,
    initialScene,
    handleSceneChange,
    triggerSave,
    getLatestScene,
  } = useCanvasEditor(canvasId);
  const isTouch = useTouchDevice();
  const [canvasMode, setCanvasMode] = useState<"navigate" | "edit">(isTouch ? "navigate" : "edit");

  useEffect(() => {
    setCanvasMode(isTouch ? "navigate" : "edit");
  }, [isTouch]);

  const setExcalidrawAPIStore = useCanvasUiStore((s) => s.setExcalidrawAPI);
  const [excalidrawAPIState, _setExcalidrawAPIState] = useState<ExcalidrawImperativeAPI | null>(null);
  const api = excalidrawAPIState;

  const authUser = useSelector((state: RootState) => state.auth.user);
  const { collaboration, isResolved } = useCanvasYjsCollaboration(
    canvasId,
    authUser,
    api,
    initialScene?.elements ?? []
  );

  const { data: user } = useGetGithubUserQuery();
  const [saveGitFile, { isLoading: isSavingGit }] = useSaveGitFileMutation();
  const [checkFileStatus] = useCheckFileStatusMutation();
  const [pullRepo] = usePullRepoMutation();

  const [gitFileStatus, setGitFileStatus] = useState<"clean" | "modified" | "untracked" | "conflict" | "behind">("clean");
  const [hasGitChanges, setHasGitChanges] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [remoteUpdated, setRemoteUpdated] = useState(false);

  const checkStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gitFilePath = `canvases/canvas-${canvasId}.json`;

  const { data: manifest } = useGetWorkspaceManifestQuery();
  const { data: fileHistory } = useGetFileHistoryQuery(gitFilePath, { skip: !canvasId });

  const isCanvasOnGit = useMemo(() => {
    if (!canvasId) return false;
    const inManifest = manifest?.items?.some(
      (item) => item.id === `canvas-${canvasId}` || item.path === gitFilePath
    );
    const hasHistory = Array.isArray(fileHistory) && fileHistory.length > 0;
    return Boolean(inManifest || hasHistory || gitFileStatus !== "untracked");
  }, [manifest, fileHistory, canvasId, gitFilePath, gitFileStatus]);

  const getCurrentScene = useCallback((): CanvasScene => {
    if (api) {
      const elements = api.getSceneElements();
      const appState = api.getAppState() as Record<string, unknown>;
      const files = api.getFiles() as Record<string, unknown>;
      return {
        elements,
        appState: sanitizeAppState(appState),
        files,
      };
    }
    return getLatestScene();
  }, [api, getLatestScene]);

  const checkCurrentFileStatus = useCallback(
    async (currentScene?: CanvasScene, currentTitle?: string) => {
      if (!canvasId) return;
      try {
        const sceneData = currentScene ?? getCurrentScene();
        const payload = {
          id: canvas?.id ?? canvasId,
          title: currentTitle ?? canvas?.title ?? "Untitled Canvas",
          slug: `canvas-${canvasId}`,
          status: canvas?.status ?? 1,
          metadata: canvas?.metadata ?? null,
          scene: sceneData,
        };
        const res = await checkFileStatus({
          file_path: gitFilePath,
          content: JSON.stringify(payload),
        }).unwrap();

        setGitFileStatus(res.status);
        setHasGitChanges(Boolean(res.has_changes));
        setHasConflict(Boolean(res.has_conflict));
        setRemoteUpdated(Boolean(res.remote_updated));
      } catch (err) {
        console.warn("[CanvasEditor] checkFileStatus error:", err);
      }
    },
    [canvasId, canvas?.id, canvas?.title, canvas?.status, canvas?.metadata, getCurrentScene, gitFilePath, checkFileStatus]
  );

  useEffect(() => {
    if (canvas?.id) {
      checkCurrentFileStatus();
    }
    return () => {
      if (checkStatusTimerRef.current) clearTimeout(checkStatusTimerRef.current);
    };
  }, [canvas?.id]);

  const handleSaveShortcut = useCallback(async () => {
    const currentScene = getCurrentScene();
    await triggerSave(currentScene);
  }, [getCurrentScene, triggerSave]);

  const handlePullGit = useCallback(async () => {
    try {
      const res = await pullRepo().unwrap();
      if (res.has_conflict || res.hasConflicts) {
        message.warning("Có xung đột khi pull từ GitHub — Kiểm tra Source Control.");
      } else {
        message.success("Đã đồng bộ nội dung mới nhất từ Git!");
        checkCurrentFileStatus();
      }
    } catch (err: unknown) {
      const errMsg = (err as { data?: { message?: string } })?.data?.message;
      message.error(errMsg ? `Pull từ Git thất bại: ${errMsg}` : "Pull từ Git thất bại");
    }
  }, [pullRepo, checkCurrentFileStatus]);

  const handleSaveToGit = useCallback(async () => {
    if (!canvas) return;
    try {
      const currentScene = getCurrentScene();
      await triggerSave(currentScene);

      const payload = {
        id: canvas.id,
        title: canvas.title || "Untitled Canvas",
        slug: `canvas-${canvas.id}`,
        status: canvas.status ?? 1,
        metadata: canvas.metadata ?? null,
        scene: currentScene,
        saved_at: new Date().toISOString(),
      };

      const commitMsg = isCanvasOnGit
        ? `Update ${canvas.title || `canvas-${canvas.id}`}`
        : `Add ${canvas.title || `canvas-${canvas.id}`} to Git workspace`;

      await saveGitFile({
        path: gitFilePath,
        content: payload,
        auto_commit: true,
        auto_push: true,
        message: commitMsg,
      }).unwrap();

      message.success(
        isCanvasOnGit
          ? `Đã lưu và commit lên GitHub: ${gitFilePath}`
          : `Đã lưu và đẩy lên GitHub: ${gitFilePath}`
      );
      checkCurrentFileStatus(currentScene, canvas.title);
    } catch (err) {
      const errMsg = (err as { data?: { message?: string } })?.data?.message;
      message.error(errMsg ? `Failed to push to GitHub: ${errMsg}` : "Failed to push to GitHub");
    }
  }, [canvas, getCurrentScene, triggerSave, isCanvasOnGit, gitFilePath, saveGitFile, checkCurrentFileStatus]);

  const isGitConnected = Boolean(user?.connected && (user?.activeRepoName || user?.active_repo_name));

  const handleSaveAndCommitShortcut = useCallback(async () => {
    if (!isGitConnected) {
      message.warning("Vui lòng kết nối GitHub và chọn repository trong Settings trước khi lưu Git.");
      return;
    }
    if (hasConflict || gitFileStatus === "conflict") {
      message.warning("Phát hiện xung đột Git trên canvas này — Kiểm tra Source Control.");
      return;
    }
    if (remoteUpdated || gitFileStatus === "behind") {
      message.info("Nội dung trên Git đã được cập nhật — Đang kéo (pull) về...");
      await handlePullGit();
      return;
    }
    if (gitFileStatus === "clean" && !hasGitChanges && saveStatus !== "saving") {
      message.info("Canvas đã được lưu và đồng bộ với Git (không có thay đổi mới).");
      return;
    }
    await handleSaveToGit();
  }, [isGitConnected, hasConflict, gitFileStatus, remoteUpdated, hasGitChanges, saveStatus, handleSaveToGit, handlePullGit]);

  const gitTooltip = useMemo(() => {
    if (hasConflict || gitFileStatus === "conflict") return "Phát hiện xung đột Git";
    if (remoteUpdated || gitFileStatus === "behind") return "Có cập nhật mới trên Git — click để kéo về";
    if (isCanvasOnGit) {
      return hasGitChanges
        ? "Save and Push lên GitHub (Ctrl+Shift+S)"
        : "Save and Commit (Ctrl+Shift+S) — Đã đồng bộ với Git";
    }
    return "Save and Commit lên Git (Ctrl+Shift+S)";
  }, [hasConflict, gitFileStatus, remoteUpdated, isCanvasOnGit, hasGitChanges]);

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
    (excalidrawApi: ExcalidrawImperativeAPI) => {
      _setExcalidrawAPIState(excalidrawApi);
      setExcalidrawAPIStore(excalidrawApi);
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

      // Sync local drawing changes to Yjs map
      if (collaboration && collaboration.isConnected) {
        const elementsMap = collaboration.ydoc.getMap<any>("elements");
        const filesMap = collaboration.ydoc.getMap<any>("files");
        collaboration.ydoc.transact(() => {
          elements.forEach((el) => {
            const remoteRaw = elementsMap.get(el.id);
            const remote = remoteRaw && typeof remoteRaw.toJSON === "function" ? remoteRaw.toJSON() : remoteRaw;
            const shouldPush = !remote ||
              el.version > remote.version ||
              (el.version >= remote.version && hasVisualChangePush(el, remote));
            if (shouldPush) {
              elementsMap.set(el.id, JSON.parse(JSON.stringify(el)));
            }
          });
          if (files) {
            Object.entries(files).forEach(([id, file]) => {
              if (!filesMap.has(id)) {
                filesMap.set(id, file);
              }
            });
          }
        }, "local-draw");
      }

      if (checkStatusTimerRef.current) clearTimeout(checkStatusTimerRef.current);
      checkStatusTimerRef.current = setTimeout(() => {
        checkCurrentFileStatus({
          elements,
          appState: sanitizeAppState(appState),
          files,
        });
      }, 1000);

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
    [handleSceneChange, updateElementById, checkCurrentFileStatus, collaboration]
  );

  const handlePointerUpdate = useCallback(
    (payload: any) => {
      if (collaboration?.provider?.awareness) {
        collaboration.provider.awareness.setLocalStateField("pointer", payload.pointer);
        collaboration.provider.awareness.setLocalStateField("button", payload.button);
      }
    },
    [collaboration]
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
    setDocsSidebarOpen((prev) => !prev);
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
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const isKeyS = e.key === "s" || e.key === "S" || e.code === "KeyS";

      if (isCtrlOrMeta && isKeyS) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (e.shiftKey) {
          handleSaveAndCommitShortcut();
        } else {
          handleSaveShortcut();
        }
        return;
      }

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
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleToggleDocsSidebar, handleAddNote, handleSaveShortcut, handleSaveAndCommitShortcut]);

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

  if (isLoading || !initialScene || !isResolved) {
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
            <div className="canvas-editor-header-right">
              {collaboration?.isConnected && (
                <span style={{ fontSize: 12, color: "#52c41a", display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#52c41a" }} />
                  Live
                </span>
              )}
              <span className="canvas-editor-save-status">
                {saveStatus === "saving" && "Saving…"}
                {saveStatus === "success" && "Saved"}
                {saveStatus === "error" && "Save failed"}
              </span>
              <Tooltip title="Lưu (Ctrl+S)">
                <Button
                  size="small"
                  type="text"
                  icon={<SaveOutlined />}
                  loading={saveStatus === "saving"}
                  onClick={handleSaveShortcut}
                />
              </Tooltip>
              <Tooltip title={gitTooltip}>
                <Button
                  size="small"
                  type="text"
                  icon={<CloudUploadOutlined />}
                  loading={isSavingGit}
                  onClick={handleSaveAndCommitShortcut}
                />
              </Tooltip>
            </div>
          </div>

          <div
            className={`canvas-editor-container${isAltHeld ? " is-alt-pass-through" : ""}${canvasMode === "navigate" ? " is-navigate-active" : ""}`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <Excalidraw
              key={canvasId}
              excalidrawAPI={setExcalidrawAPI}
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
