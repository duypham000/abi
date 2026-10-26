import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { AuthUser } from "@/core/interfaces/auth";
import type { AppDispatch } from "@/presentation/store";
import { canvasApi } from "@/infrastructure/api/canvasApi";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

function getDefaultWsUrl(): string {
  if (import.meta.env.VITE_YJS_SERVER_URL) {
    return import.meta.env.VITE_YJS_SERVER_URL;
  }
  if (typeof window !== "undefined" && window.location && window.location.host) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/yjs`;
  }
  return "ws://127.0.0.1:1234/ws/yjs";
}

const REFRESH_LEAD_MS = 60_000;
const MIN_REFRESH_MS = 5_000;

// Keys changed by Excalidraw on selection/focus without real visual edits.
// Ignoring these prevents selection-bump version inflation from blocking real remote updates.
const EXCALIDRAW_METADATA_KEYS = new Set([
  "version", "versionNonce", "updated", "seed",
  "boundElements", "frameId", "containerId",
]);

export function hasVisualChange(a: any, b: any): boolean {
  if (!b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (EXCALIDRAW_METADATA_KEYS.has(key)) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return true;
  }
  return false;
}

export interface CollaboratorUser {
  name: string;
  color: string;
  userId: string | number;
}

export interface YjsCanvasCollaboration {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  isConnected: boolean;
}

export interface UseCanvasYjsCollaborationResult {
  collaboration: YjsCanvasCollaboration | null;
  isResolved: boolean;
}

function hashColor(userId: string | number): string {
  const str = String(userId);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const COLORS = [
    "#e03131", "#c2255c", "#9c36b5", "#6741d9", "#3b5bdb",
    "#1971c2", "#0c8599", "#2f9e44", "#e8590c", "#f08c00",
  ];
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function useCanvasYjsCollaboration(
  canvasId: number,
  user: AuthUser | null,
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  initialElements: readonly any[]
): UseCanvasYjsCollaborationResult {
  const dispatch = useDispatch<AppDispatch>();
  const [isConnected, setIsConnected] = useState(false);
  const collabRef = useRef<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);
  const [isResolved, setIsResolved] = useState(canvasId < 0);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (canvasId < 0) {
      setIsResolved(true);
      return;
    }
    setIsResolved(false);

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
        if (res.url) serverUrl = res.url;
      } catch (e) {
        console.warn("[Yjs-Canvas] token fetch failed — falling back to solo mode", e);
        if (!cancelled) setIsResolved(true);
        return;
      }
      if (cancelled) return;

      ydoc = new Y.Doc();
      provider = new WebsocketProvider(serverUrl, `canvas-${canvasId}`, ydoc, {
        params: { yauth: token },
      });

      provider.on("status", ({ status }: { status: string }) => {
        setIsConnected(status === "connected");
      });

      const markResolved = () => {
        if (cancelled) return;
        if (syncFallbackTimer) {
          clearTimeout(syncFallbackTimer);
          syncFallbackTimer = null;
        }
        setIsResolved(true);
      };

      provider.on("sync", (isSynced: boolean) => {
        if (isSynced) {
          // If the map is empty, seed from initial scene state
          const elementsMap = ydoc!.getMap<any>("elements");
          if (elementsMap.size === 0 && initialElements && initialElements.length > 0) {
            ydoc!.transact(() => {
              initialElements.forEach((el) => {
                elementsMap.set(el.id, JSON.parse(JSON.stringify(el)));
              });
            }, "local-seed");
          }
          markResolved();
        }
      });

      if (provider.synced) {
        markResolved();
      }

      // Safety timeout: don't freeze canvas if server is cold or sync is slow
      syncFallbackTimer = setTimeout(markResolved, 4000);

      provider.on("connection-close", () => {
        refresh();
      });

      if (user) {
        const me: CollaboratorUser = {
          name: user.username,
          color: hashColor(user.userId),
          userId: user.userId,
        };
        provider.awareness.setLocalStateField("user", me);
      }

      scheduleRefresh(expiresIn);

      collabRef.current = { ydoc, provider };
      setTick((t) => t + 1);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (syncFallbackTimer) clearTimeout(syncFallbackTimer);
      if (provider) {
        provider.destroy();
      }
      if (ydoc) {
        ydoc.destroy();
      }
      collabRef.current = null;
      setIsConnected(false);
      setIsResolved(false);
    };
  }, [canvasId, user?.userId, dispatch, initialElements]);

  // Handle synchronization between Excalidraw API and Y.Doc
  useEffect(() => {
    if (!excalidrawAPI || !collabRef.current) return;
    const { ydoc, provider } = collabRef.current;
    const elementsMap = ydoc.getMap<any>("elements");
    const filesMap = ydoc.getMap<any>("files");

    // Sync remote updates from Yjs into Excalidraw
    const handleElementsChange = (event: Y.YMapEvent<any>, transaction: Y.Transaction) => {
      if (transaction.origin === "local-draw" || transaction.origin === "local-seed") return;

      const currentElements = excalidrawAPI.getSceneElements();
      const nextElements = [...currentElements];
      let changed = false;

      event.keysChanged.forEach((key) => {
        const rawVal = elementsMap.get(key);
        const newVal = rawVal && typeof rawVal.toJSON === "function" ? rawVal.toJSON() : rawVal;
        const idx = nextElements.findIndex((el) => el.id === key);

        if (newVal) {
          if (idx >= 0) {
            const local = nextElements[idx];
            const remoteWins =
              newVal.version > local.version ||
              (newVal.version >= local.version && hasVisualChange(newVal, local));
            if (remoteWins) {
              nextElements[idx] = newVal;
              changed = true;
            }
          } else {
            nextElements.push(newVal);
            changed = true;
          }
        } else {
          if (idx >= 0) {
            nextElements.splice(idx, 1);
            changed = true;
          }
        }
      });

      if (changed) {
        excalidrawAPI.updateScene({ elements: nextElements });
      }
    };

    const handleFilesChange = (_event: Y.YMapEvent<any>, transaction: Y.Transaction) => {
      if (transaction.origin === "local-draw" || transaction.origin === "local-seed") return;

      const filesObj = Object.fromEntries(
        Array.from(filesMap.entries()).map(([id, val]) => [
          id,
          val && typeof val.toJSON === "function" ? val.toJSON() : val,
        ])
      );
      excalidrawAPI.addFiles?.(Object.values(filesObj));
    };

    elementsMap.observe(handleElementsChange);
    filesMap.observe(handleFilesChange);

    // Sync remote cursors/awareness
    const handleAwarenessChange = () => {
      const localClientId = provider.awareness.clientID;
      const states = provider.awareness.getStates();
      const nextCollaborators = new Map<string, any>();

      states.forEach((state: any, clientId) => {
        if (clientId === localClientId) return;
        if (state.user) {
          nextCollaborators.set(String(clientId), {
            username: state.user.name,
            color: state.user.color,
            pointer: state.pointer,
            button: state.button,
            selectedElementIds: state.selectedElementIds,
          });
        }
      });

      excalidrawAPI.updateScene({ collaborators: nextCollaborators as any });
    };

    provider.awareness.on("change", handleAwarenessChange);

    // Initial load sync if Y.Doc already has data (e.g. from websocket stream)
    if (elementsMap.size > 0) {
      const allElems = Array.from(elementsMap.values()).map((val) =>
        val && typeof val.toJSON === "function" ? val.toJSON() : val
      );
      excalidrawAPI.updateScene({ elements: allElems });
    }
    if (filesMap.size > 0) {
      const filesList = Array.from(filesMap.values()).map((val) =>
        val && typeof val.toJSON === "function" ? val.toJSON() : val
      );
      excalidrawAPI.addFiles?.(filesList);
    }

    return () => {
      elementsMap.unobserve(handleElementsChange);
      filesMap.unobserve(handleFilesChange);
      provider.awareness.off("change", handleAwarenessChange);
    };
  }, [excalidrawAPI, isConnected]);

  const collaboration: YjsCanvasCollaboration | null = collabRef.current
    ? {
        ydoc: collabRef.current.ydoc,
        provider: collabRef.current.provider,
        isConnected,
      }
    : null;

  return { collaboration, isResolved };
}
