import type { CanvasScene } from "@/core/interfaces/canvas";

const MAX_THUMB_WIDTH = 360;
const MAX_THUMB_HEIGHT = 240;

const memoryThumbnailCache = new Map<number, string>();

export function getCachedCanvasThumbnail(id: number): string | null {
  return memoryThumbnailCache.get(id) ?? null;
}

export function setCachedCanvasThumbnail(id: number, dataUrl: string): void {
  if (dataUrl) {
    memoryThumbnailCache.set(id, dataUrl);
  }
}

function parseSceneInput(sceneInput: CanvasScene | string | null | undefined): CanvasScene | null {
  if (!sceneInput) return null;
  if (typeof sceneInput === "string") {
    try {
      const parsed = JSON.parse(sceneInput) as CanvasScene;
      return {
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        appState: parsed.appState ?? {},
        files: parsed.files ?? {},
      };
    } catch {
      return null;
    }
  }
  return {
    elements: Array.isArray(sceneInput.elements) ? sceneInput.elements : [],
    appState: sceneInput.appState ?? {},
    files: sceneInput.files ?? {},
  };
}

/**
 * Render a lightweight low-resolution WebP/JPEG thumbnail data URL from an Excalidraw scene
 * so canvas gallery cards load fast without parsing full scenes on every render.
 */
export async function generateLowResCanvasThumbnail(
  sceneInput: CanvasScene | string | null | undefined
): Promise<string | null> {
  try {
    const scene = parseSceneInput(sceneInput);
    if (!scene) return null;

    const activeElements = scene.elements.filter(
      (el) => !(el as { isDeleted?: boolean } | null | undefined)?.isDeleted
    );
    if (activeElements.length === 0) return null;

    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const blob = await exportToBlob({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elements: activeElements as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appState: { ...(scene.appState ?? {}), exportBackground: true } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: (scene.files ?? {}) as any,
      mimeType: "image/png",
      exportPadding: 16,
    });

    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_THUMB_WIDTH / img.width, MAX_THUMB_HEIGHT / img.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const webp = canvas.toDataURL("image/webp", 0.6);
          if (webp.startsWith("data:image/webp")) {
            resolve(webp);
          } else {
            resolve(canvas.toDataURL("image/jpeg", 0.65));
          }
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}
