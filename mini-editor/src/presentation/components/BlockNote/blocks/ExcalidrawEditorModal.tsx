import { useCallback, useRef, useState, useEffect } from "react";
import { Modal, Button, Input, Spin } from "antd";
import { Excalidraw } from "@excalidraw/excalidraw";
import { exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  useGetCanvasByIdQuery,
  useCreateCanvasMutation,
  useUpdateCanvasMutation,
} from "@/infrastructure/api/canvasApi";
import { parseCanvasMetadata, serializeCanvasMetadata } from "@/core/interfaces/canvas";
import type { CanvasScene } from "@/core/interfaces/canvas";
import { DRAFT_PREFIX } from "./excalidraw-block";

const EMPTY_SCENE: CanvasScene = { elements: [], appState: {}, files: {} };

function parseScene(raw: string | null | undefined): CanvasScene {
  if (!raw) return EMPTY_SCENE;
  try {
    const p = JSON.parse(raw) as CanvasScene;
    return { elements: p.elements ?? [], appState: p.appState ?? {}, files: p.files ?? {} };
  } catch {
    return EMPTY_SCENE;
  }
}

async function generateThumbnail(api: ExcalidrawImperativeAPI): Promise<string | null> {
  try {
    const elements = api.getSceneElements();
    if (!elements.length) return null;
    const blob = await exportToBlob({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elements: elements as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appState: { ...(api.getAppState() as any), exportBackground: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: api.getFiles() as any,
      mimeType: "image/png",
      exportPadding: 16,
    });
    // Resize to thumbnail (max 600px wide)
    return await new Promise<string>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const MAX = 600;
        const scale = Math.min(1, MAX / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(""); };
      img.src = url;
    });
  } catch {
    return null;
  }
}

interface ExcalidrawEditorModalProps {
  canvasId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called after save with (realCanvasId, thumbnailBase64) */
  onSaved: (realCanvasId: string, thumbnail: string) => void;
}

export function ExcalidrawEditorModal({
  canvasId,
  isOpen,
  onClose,
  onSaved,
}: ExcalidrawEditorModalProps) {
  const isDraft = canvasId.startsWith(DRAFT_PREFIX);
  const realId = isDraft ? undefined : Number(canvasId);

  const { data: canvasData, isLoading: isLoadingCanvas } = useGetCanvasByIdQuery(realId!, {
    skip: !realId,
  });
  const [createCanvas] = useCreateCanvasMutation();
  const [updateCanvas] = useUpdateCanvasMutation();

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [title, setTitle] = useState("Untitled Canvas");
  const [isSaving, setIsSaving] = useState(false);

  // Sync title from loaded canvas
  useEffect(() => {
    if (canvasData?.title) setTitle(canvasData.title);
  }, [canvasData?.title]);

  const initialScene = canvasData ? parseScene(canvasData.scene) : EMPTY_SCENE;

  const handleSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;

    setIsSaving(true);
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState() as Record<string, unknown>;
      const { collaborators: _, ...cleanAppState } = appState as Record<string, unknown> & { collaborators?: unknown };
      const files = api.getFiles() as Record<string, unknown>;
      const scene: CanvasScene = { elements, appState: cleanAppState, files };

      const thumbnail = await generateThumbnail(api);
      const existingMeta = parseCanvasMetadata(canvasData?.metadata ?? null);
      const newMeta = serializeCanvasMetadata({
        ...existingMeta,
        thumbnail: thumbnail || existingMeta.thumbnail,
      });

      let savedId: string;

      if (isDraft) {
        const result = await createCanvas({
          title,
          scene: JSON.stringify(scene),
          metadata: newMeta,
          lastSync: new Date().toISOString(),
          status: 1,
        }).unwrap();
        savedId = String(result.id);
      } else {
        await updateCanvas({
          id: realId!,
          body: {
            title,
            scene: JSON.stringify(scene),
            metadata: newMeta,
            lastSync: new Date().toISOString(),
            status: canvasData?.status ?? 1,
          },
        }).unwrap();
        savedId = String(realId!);
      }

      onSaved(savedId, thumbnail ?? "");
      onClose();
    } catch (e) {
      console.error("[ExcalidrawModal] save failed", e);
    } finally {
      setIsSaving(false);
    }
  }, [canvasData, createCanvas, updateCanvas, isDraft, realId, title, onSaved, onClose]);

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      width="92vw"
      style={{ top: 20, maxWidth: 1400 }}
      styles={{ body: { padding: 0, height: "80vh", display: "flex", flexDirection: "column" } }}
      title={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          variant="borderless"
          style={{ fontWeight: 600, fontSize: 16, padding: "0 4px" }}
          placeholder="Tên canvas"
        />
      }
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={isSaving} onClick={handleSave}>
            Lưu & Đóng
          </Button>
        </div>
      }
      destroyOnHidden
    >
      {!realId || !isLoadingCanvas ? (
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {isOpen && (
            <Excalidraw
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              excalidrawAPI={(api: ExcalidrawImperativeAPI) => { apiRef.current = api; }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              initialData={realId ? (initialScene as any) : undefined}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              theme={"light" as any}
            />
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin size="large" />
        </div>
      )}
    </Modal>
  );
}
