import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { AuthUser } from "@/core/interfaces/auth";
import type { AppDispatch } from "@/store";
import { canvasApi } from "@/infrastructure/api/canvasApi";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  cloneCanvasValue,
  collectElementsToPush,
  getActiveLocalElementIds,
  hashCollaboratorColor,
  hasVisualChange,
  isNewerElement,
  normalizeCollaboratorColor,
  reconcileRemoteElements,
  sortElementsByIndex,
  type CollaboratorColor,
} from "./canvasYjsSync";

export { hasVisualChange, isNewerElement };
export type { CollaboratorColor };

function getDefaultWsUrl(): string {
  if (import.meta.env.VITE_YJS_SERVER_URL) {
    return import.meta.env.VITE_YJS_SERVER_URL;
  }
  if (import.meta.env.VITE_NODE_WS_URL) {
    const wsBase = (import.meta.env.VITE_NODE_WS_URL as string).replace(/\/+$/, "");
    return `${wsBase}/ws/yjs`;
  }
  if (typeof window !== "undefined" && window.location?.host) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/yjs`;
  }
  return "ws://127.0.0.1:1234/ws/yjs";
}

const REFRESH_LEAD_MS = 60_000;
const MIN_REFRESH_MS = 5_000;
const POINTER_THROTTLE_MS = 33;

export interface CollaboratorUser {
  name: string;
  color: CollaboratorColor;
  userId: string | number;
}

export interface InitialCanvasSceneInput {
  elements?: readonly any[];
  files?: Record<string, any>;
}

export interface YjsCanvasCollaboration {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  isConnected: boolean;
  syncLocalScene: (elements: readonly any[], appState: any, files: any) => void;
  updateLocalPointer: (payload: { pointer?: any; button?: string }) => void;
}

export interface UseCanvasYjsCollaborationResult {
  collaboration: YjsCanvasCollaboration | null;
  isResolved: boolean;
}

export function useCanvasYjsCollaboration(
  canvasId: number,
  user: AuthUser | null,
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  initialScene: InitialCanvasSceneInput | null
): UseCanvasYjsCollaborationResult {
  const dispatch = useDispatch<AppDispatch>();
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [providerState, setProviderState] = useState<{
    ydoc: Y.Doc;
    provider: WebsocketProvider;
  } | null>(null);

  const isInvalidCanvasId = !canvasId || canvasId <= 0;
  const attemptKey = `${canvasId}|${user?.userId ?? ""}`;
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const isResolved = isInvalidCanvasId || resolvedKey === attemptKey;

  const providerStateRef = useRef<{
    ydoc: Y.Doc;
    provider: WebsocketProvider;
  } | null>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(excalidrawAPI);
  excalidrawAPIRef.current = excalidrawAPI;
  const initialSceneRef = useRef<InitialCanvasSceneInput | null>(initialScene);
  initialSceneRef.current = initialScene;

  const isApplyingRemoteRef = useRef(false);
  const hydratedPairRef = useRef<{ api: ExcalidrawImperativeAPI; ydoc: Y.Doc } | null>(null);
  const seededDocRef = useRef<Y.Doc | null>(null);
  const deferredRemoteKeysRef = useRef<Set<string>>(new Set());
  const lastSelectionKeyRef = useRef<string>("");

  const pointerThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerSentAtRef = useRef<number>(0);
  const lastPointerButtonRef = useRef<string | undefined>(undefined);
  const pendingPointerRef = useRef<{ pointer?: any; button?: string } | null>(null);

  const seedInitialSceneIfNeeded = useCallback((ydoc: Y.Doc) => {
    if (seededDocRef.current === ydoc) return;
    const scene = initialSceneRef.current;
    if (!scene) return;
    seededDocRef.current = ydoc;

    const elementsMap = ydoc.getMap<any>("elements");
    const filesMap = ydoc.getMap<any>("files");
    const initElements = scene.elements ?? [];
    const initFiles = scene.files ?? {};
    const fileEntries = Object.entries(initFiles);

    if (elementsMap.size === 0 && (initElements.length > 0 || fileEntries.length > 0)) {
      ydoc.transact(() => {
        for (const el of initElements) {
          if (el?.id) {
            elementsMap.set(el.id, cloneCanvasValue(el));
          }
        }
        for (const [id, file] of fileEntries) {
          if (file && !filesMap.has(id)) {
            filesMap.set(id, cloneCanvasValue(file));
          }
        }
      }, "local-seed");
    }
  }, []);

  // Effect 1: Websocket/Yjs connection lifecycle (independent of initialScene updates)
  useEffect(() => {
    if (isInvalidCanvasId) {
      return;
    }

    let cancelled = false;
    let ydoc: Y.Doc | null = null;
    let provider: WebsocketProvider | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let syncFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;

    const fetchToken = () =>
      dispatch(
        canvasApi.endpoints.getYjsCanvasToken.initiate(canvasId, { forceRefetch: true })
      ).unwrap();

    let serverUrl = getDefaultWsUrl();

    const scheduleRefresh = (expiresIn: number) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      const delay = Math.max(expiresIn * 1000 - REFRESH_LEAD_MS, MIN_REFRESH_MS);
      refreshTimer = setTimeout(refresh, delay);
    };

    const refresh = async () => {
      if (cancelled || refreshing || !provider) return;
      refreshing = true;
      try {
        const res = await fetchToken();
        if (cancelled || !provider) return;
        provider.params = { yauth: res.token };
        scheduleRefresh(res.expiresIn || 86400);
      } catch (e) {
        console.warn("[Yjs-Canvas] token refresh failed", e);
      } finally {
        refreshing = false;
      }
    };

    (async () => {
      let token: string;
      let expiresIn: number;
      try {
        const res = await fetchToken();
        token = res.token;
        expiresIn = res.expiresIn || 86400;
        // Only let backend override if client has no explicit WS URL configured in .env
        if (res.url && !import.meta.env.VITE_NODE_WS_URL && !import.meta.env.VITE_YJS_SERVER_URL) {
          serverUrl = res.url;
        }
      } catch (e) {
        console.warn("[Yjs-Canvas] token fetch failed — falling back to solo mode", e);
        if (!cancelled) setResolvedKey(attemptKey);
        return;
      }
      if (cancelled) return;

      ydoc = new Y.Doc();
      provider = new WebsocketProvider(serverUrl, `canvas-${canvasId}`, ydoc, {
        params: { yauth: token },
      });

      const nextState = { ydoc, provider };
      providerStateRef.current = nextState;
      setProviderState(nextState);

      provider.on("status", ({ status }: { status: string }) => {
        if (!cancelled) {
          setIsConnected(status === "connected");
        }
      });

      const markResolved = () => {
        if (cancelled) return;
        if (syncFallbackTimer) {
          clearTimeout(syncFallbackTimer);
          syncFallbackTimer = null;
        }
        setResolvedKey(attemptKey);
      };

      const handleSynced = () => {
        if (cancelled || !ydoc) return;
        seedInitialSceneIfNeeded(ydoc);
        setIsSynced(true);
        markResolved();
      };

      provider.on("sync", (synced: boolean) => {
        if (synced) handleSynced();
      });

      if (provider.synced) {
        handleSynced();
      }

      // Safety timeout: don't freeze canvas if server is cold or sync is slow
      syncFallbackTimer = setTimeout(markResolved, 4000);

      provider.on("connection-close", () => {
        refresh();
      });

      scheduleRefresh(expiresIn);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (syncFallbackTimer) clearTimeout(syncFallbackTimer);
      if (pointerThrottleTimerRef.current) {
        clearTimeout(pointerThrottleTimerRef.current);
        pointerThrottleTimerRef.current = null;
      }
      pendingPointerRef.current = null;
      lastPointerSentAtRef.current = 0;
      lastPointerButtonRef.current = undefined;
      if (provider) {
        provider.destroy();
      }
      if (ydoc) {
        ydoc.destroy();
      }
      providerStateRef.current = null;
      hydratedPairRef.current = null;
      seededDocRef.current = null;
      deferredRemoteKeysRef.current.clear();
      lastSelectionKeyRef.current = "";
      setProviderState(null);
      setIsConnected(false);
      setIsSynced(false);
      setResolvedKey(null);
    };
  }, [canvasId, user?.userId, dispatch, isInvalidCanvasId, attemptKey, seedInitialSceneIfNeeded]);

  // Effect 1b: Seed initialScene if Yjs synced before initialScene finished loading
  const hasInitialScene = initialScene !== null;
  useEffect(() => {
    if (!providerState || !isSynced || !hasInitialScene) return;
    seedInitialSceneIfNeeded(providerState.ydoc);
  }, [providerState, isSynced, hasInitialScene, seedInitialSceneIfNeeded]);

  // Effect 1c: Publish local awareness user identity
  const userId = user?.userId;
  const username = user?.username;
  useEffect(() => {
    if (!providerState) return;
    const { awareness } = providerState.provider;
    const me: CollaboratorUser =
      userId != null
        ? {
            name: username || "User",
            color: hashCollaboratorColor(userId),
            userId,
          }
        : {
            name: "Guest",
            color: hashCollaboratorColor(awareness.clientID),
            userId: awareness.clientID,
          };
    awareness.setLocalStateField("user", me);
  }, [providerState, userId, username]);

  // Effect 2: Bind Yjs observers & perform initial hydration once per (excalidrawAPI, providerState)
  useEffect(() => {
    if (!excalidrawAPI || !providerState) return;
    const { ydoc, provider } = providerState;
    const elementsMap = ydoc.getMap<any>("elements");
    const filesMap = ydoc.getMap<any>("files");

    const getLocalSceneElements = () =>
      excalidrawAPI.getSceneElementsIncludingDeleted?.() ??
      excalidrawAPI.getSceneElements();

    const applyRemoteElements = (nextElements: any[]) => {
      isApplyingRemoteRef.current = true;
      try {
        excalidrawAPI.updateScene({
          elements: nextElements as any,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } finally {
        queueMicrotask(() => {
          isApplyingRemoteRef.current = false;
        });
      }
    };

    const handleElementsChange = (event: Y.YMapEvent<any>, transaction: Y.Transaction) => {
      if (transaction.origin === "local-draw" || transaction.origin === "local-seed") return;

      const activeLocalIds = getActiveLocalElementIds(excalidrawAPI.getAppState());
      const { nextElements, changed, deferredKeys, localWinnersToPush } =
        reconcileRemoteElements(
          getLocalSceneElements(),
          elementsMap,
          event.keysChanged,
          activeLocalIds
        );

      for (const key of deferredKeys) {
        deferredRemoteKeysRef.current.add(key);
      }

      if (changed) {
        applyRemoteElements(nextElements);
      }

      if (localWinnersToPush.length > 0) {
        queueMicrotask(() => {
          if (providerStateRef.current?.ydoc !== ydoc) return;
          ydoc.transact(() => {
            for (const el of localWinnersToPush) {
              if (el?.id && isNewerElement(el, elementsMap.get(el.id))) {
                elementsMap.set(el.id, cloneCanvasValue(el));
              }
            }
          }, "local-draw");
        });
      }
    };

    const handleFilesChange = (event: Y.YMapEvent<any>, transaction: Y.Transaction) => {
      if (transaction.origin === "local-draw" || transaction.origin === "local-seed") return;

      const addedFiles: any[] = [];
      event.keysChanged.forEach((key) => {
        const rawFile = filesMap.get(key);
        if (rawFile !== undefined) {
          addedFiles.push(cloneCanvasValue(rawFile));
        }
      });
      if (addedFiles.length > 0) {
        excalidrawAPI.addFiles?.(addedFiles);
      }
    };

    const handleAwarenessChange = () => {
      const localClientId = provider.awareness.clientID;
      const states = provider.awareness.getStates();
      const nextCollaborators = new Map<string, any>();

      states.forEach((state: any, clientId) => {
        if (clientId === localClientId) return;
        if (state?.user || state?.pointer) {
          nextCollaborators.set(String(clientId), {
            username: state.user?.name ?? "Guest",
            color: normalizeCollaboratorColor(
              state.user?.color,
              state.user?.userId ?? clientId
            ),
            pointer: state.pointer,
            button: state.button,
            selectedElementIds: state.selectedElementIds,
          });
        }
      });

      excalidrawAPI.updateScene({ collaborators: nextCollaborators as any });
    };

    elementsMap.observe(handleElementsChange);
    filesMap.observe(handleFilesChange);
    provider.awareness.on("change", handleAwarenessChange);

    // One-time initial hydration for this (excalidrawAPI, ydoc) pair
    if (elementsMap.size > 0) {
      const allElems = sortElementsByIndex(
        Array.from(elementsMap.values()).map((val) => cloneCanvasValue(val))
      );
      applyRemoteElements(allElems);
    }
    if (filesMap.size > 0) {
      const filesList = Array.from(filesMap.values()).map((val) => cloneCanvasValue(val));
      excalidrawAPI.addFiles?.(filesList);
    }
    handleAwarenessChange();
    hydratedPairRef.current = { api: excalidrawAPI, ydoc };

    return () => {
      elementsMap.unobserve(handleElementsChange);
      filesMap.unobserve(handleFilesChange);
      provider.awareness.off("change", handleAwarenessChange);
      if (hydratedPairRef.current?.ydoc === ydoc && hydratedPairRef.current?.api === excalidrawAPI) {
        hydratedPairRef.current = null;
      }
    };
  }, [excalidrawAPI, providerState]);

  const syncLocalScene = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      const current = providerStateRef.current;
      if (!current) return;
      const { ydoc, provider } = current;

      const selectedIds = appState?.selectedElementIds ?? {};
      const selectedKey = Object.keys(selectedIds)
        .filter((k) => selectedIds[k])
        .sort()
        .join(",");
      if (selectedKey !== lastSelectionKeyRef.current) {
        lastSelectionKeyRef.current = selectedKey;
        provider.awareness.setLocalStateField("selectedElementIds", { ...selectedIds });
      }

      if (isApplyingRemoteRef.current) return;
      if (hydratedPairRef.current?.ydoc !== ydoc) return;

      const elementsMap = ydoc.getMap<any>("elements");
      const filesMap = ydoc.getMap<any>("files");

      const toPush = collectElementsToPush(elements, elementsMap);
      const newFiles: Array<[string, any]> = [];
      if (files) {
        for (const [id, file] of Object.entries(files)) {
          if (file && !filesMap.has(id)) {
            newFiles.push([id, cloneCanvasValue(file)]);
          }
        }
      }

      if (toPush.length > 0 || newFiles.length > 0) {
        ydoc.transact(() => {
          for (const el of toPush) {
            elementsMap.set(el.id, el);
          }
          for (const [id, file] of newFiles) {
            filesMap.set(id, file);
          }
        }, "local-draw");
      }

      if (deferredRemoteKeysRef.current.size > 0) {
        const activeLocalIds = getActiveLocalElementIds(appState);
        const readyKeys: string[] = [];
        for (const key of deferredRemoteKeysRef.current) {
          if (!activeLocalIds.has(key)) {
            readyKeys.push(key);
          }
        }
        if (readyKeys.length > 0) {
          for (const key of readyKeys) {
            deferredRemoteKeysRef.current.delete(key);
          }
          const { nextElements, changed } = reconcileRemoteElements(
            elements,
            elementsMap,
            readyKeys,
            activeLocalIds
          );
          if (changed && excalidrawAPIRef.current) {
            isApplyingRemoteRef.current = true;
            try {
              excalidrawAPIRef.current.updateScene({
                elements: nextElements as any,
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            } finally {
              queueMicrotask(() => {
                isApplyingRemoteRef.current = false;
              });
            }
          }
        }
      }
    },
    []
  );

  const updateLocalPointer = useCallback(
    (payload: { pointer?: any; button?: string }) => {
      const provider = providerStateRef.current?.provider;
      if (!provider) return;

      const send = (p: { pointer?: any; button?: string }) => {
        const currentProvider = providerStateRef.current?.provider;
        if (!currentProvider) return;
        const prev = currentProvider.awareness.getLocalState() ?? {};
        currentProvider.awareness.setLocalState({
          ...prev,
          pointer: p.pointer,
          button: p.button,
        });
        lastPointerSentAtRef.current = Date.now();
        lastPointerButtonRef.current = p.button;
      };

      const now = Date.now();
      const elapsed = now - lastPointerSentAtRef.current;
      const buttonChanged = payload.button !== lastPointerButtonRef.current;

      if (buttonChanged || elapsed >= POINTER_THROTTLE_MS) {
        if (pointerThrottleTimerRef.current) {
          clearTimeout(pointerThrottleTimerRef.current);
          pointerThrottleTimerRef.current = null;
        }
        pendingPointerRef.current = null;
        send(payload);
        return;
      }

      pendingPointerRef.current = payload;
      if (!pointerThrottleTimerRef.current) {
        const remaining = Math.max(1, POINTER_THROTTLE_MS - elapsed);
        pointerThrottleTimerRef.current = setTimeout(() => {
          pointerThrottleTimerRef.current = null;
          const pending = pendingPointerRef.current;
          pendingPointerRef.current = null;
          if (pending) {
            send(pending);
          }
        }, remaining);
      }
    },
    []
  );

  const collaboration = useMemo<YjsCanvasCollaboration | null>(() => {
    if (!providerState) return null;
    return {
      ydoc: providerState.ydoc,
      provider: providerState.provider,
      isConnected,
      syncLocalScene,
      updateLocalPointer,
    };
  }, [providerState, isConnected, syncLocalScene, updateLocalPointer]);

  return { collaboration, isResolved };
}
