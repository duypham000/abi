import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useGetCanvasByIdQuery, useCreateCanvasMutation, useUpdateCanvasMutation } from "@/infrastructure/api/canvasApi";
import { setPageTitle } from "@/presentation/store/appSlice";
import type { AppDispatch } from "@/presentation/store";
import type { CanvasScene } from "@/core/interfaces/canvas";

export type SaveStatus = "idle" | "saving" | "success" | "error";

const SUCCESS_RESET_DELAY = 500;
const SCENE_DEBOUNCE_MS = 1500;

export const EMPTY_SCENE: CanvasScene = {
  elements: [],
  appState: {},
  files: {},
};

function sanitizeAppState(
  appState: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!appState) return {};
  const { collaborators: _collaborators, ...rest } = appState as Record<string, unknown>;
  return rest;
}

function parseScene(raw: string | null | undefined): CanvasScene {
  if (!raw) return EMPTY_SCENE;
  try {
    const parsed = JSON.parse(raw) as CanvasScene;
    return {
      elements: parsed.elements ?? [],
      appState: sanitizeAppState(parsed.appState),
      files: parsed.files ?? {},
    };
  } catch {
    return EMPTY_SCENE;
  }
}

export function useCanvasEditor(id: number, autoSave = true) {
  const dispatch = useDispatch<AppDispatch>();
  const { data, isLoading } = useGetCanvasByIdQuery(id);
  const [updateCanvas] = useUpdateCanvasMutation();
  const [createCanvas] = useCreateCanvasMutation();

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const canvas = data ?? null;
  const lastSavedRef = useRef<string>("");
  const latestSceneRef = useRef<CanvasScene>(EMPTY_SCENE);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialScene = useMemo<CanvasScene | null>(() => {
    if (!canvas) {
      if (!isLoading) {
        latestSceneRef.current = EMPTY_SCENE;
        lastSavedRef.current = JSON.stringify(EMPTY_SCENE);
        return EMPTY_SCENE;
      }
      return null;
    }
    const parsed = parseScene(canvas.scene);
    latestSceneRef.current = parsed;
    lastSavedRef.current = canvas.scene ?? "";
    return parsed;
  }, [canvas?.id, isLoading]);

  useEffect(() => {
    if (!canvas) return;
    dispatch(setPageTitle(canvas.title || "Untitled Canvas"));
  }, [dispatch, canvas?.title]);

  const performSave = useCallback(
    async (sceneToSave: CanvasScene) => {
      if (!canvas) return;
      const serialized = JSON.stringify(sceneToSave);
      if (serialized === lastSavedRef.current) return;

      setSaveStatus("saving");
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }

      const payload = {
        title: canvas?.title ?? "Untitled Canvas",
        scene: serialized,
        metadata: canvas?.metadata ?? null,
        lastSync: new Date().toISOString(),
        status: (canvas?.status ?? 1) as 0 | 1,
      };

      const result = canvas
        ? await updateCanvas({ id, body: payload })
        : await createCanvas(payload);

      if ("error" in result) {
        setSaveStatus("error");
      } else {
        lastSavedRef.current = serialized;
        setSaveStatus("success");
        successTimerRef.current = setTimeout(() => setSaveStatus("idle"), SUCCESS_RESET_DELAY);
      }
    },
    [canvas, id, updateCanvas]
  );

  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
      const newScene: CanvasScene = {
        elements,
        appState: sanitizeAppState(appState),
        files,
      };
      latestSceneRef.current = newScene;
      if (!autoSaveRef.current) return;
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
      sceneTimerRef.current = setTimeout(() => performSave(latestSceneRef.current), SCENE_DEBOUNCE_MS);
    },
    [performSave]
  );

  const triggerSave = useCallback(async () => {
    if (sceneTimerRef.current) {
      clearTimeout(sceneTimerRef.current);
      sceneTimerRef.current = null;
    }
    await performSave(latestSceneRef.current);
  }, [performSave]);

  useEffect(() => {
    return () => {
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  return { canvas, isLoading, saveStatus, initialScene, handleSceneChange, triggerSave };
}
