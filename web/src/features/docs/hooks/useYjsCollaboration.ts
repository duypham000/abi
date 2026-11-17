import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { AuthUser } from "@/core/interfaces/auth";
import type { AppDispatch } from "@/store";
import { docsApi } from "@/infrastructure/api/docsApi";

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

// Refresh the yauth token this many ms before it expires.
const REFRESH_LEAD_MS = 60_000;
const MIN_REFRESH_MS = 5_000;

export interface CollaboratorUser {
  name: string;
  color: string;
  userId: string | number;
}

export interface YjsCollaboration {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  isConnected: boolean;
  collaborators: CollaboratorUser[];
  currentUser: CollaboratorUser | null;
}

export interface UseYjsCollaborationResult {
  /** Null until the provider is built; stays null when offline/draft (solo mode). */
  collaboration: YjsCollaboration | null;
  /**
   * True once the collaboration attempt has settled — provider created and synced,
   * or token fetch failed (offline/solo), or draft mode. Consumers must wait for this
   * before mounting the editor, otherwise the editor may be created in solo
   * mode while collaboration is still loading (race → empty content).
   */
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

function isInvalidDocId(id: number | string): boolean {
  if (typeof id === "number") return id < 0;
  return !id || id === "-1" || id === "0";
}

export function useYjsCollaboration(
  docId: number | string,
  user: AuthUser | null,
  enabled: boolean = true
): UseYjsCollaborationResult {
  const dispatch = useDispatch<AppDispatch>();
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorUser[]>([]);
  const [providerState, setProviderState] = useState<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);

  const skip = !enabled || isInvalidDocId(docId);
  const attemptKey = `${docId}|${user?.userId ?? ""}`;
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const isResolved = skip || resolvedKey === attemptKey;

  const providerRef = useRef<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);

  useEffect(() => {
    if (skip) {
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
        docsApi.endpoints.getYjsToken.initiate(docId, { forceRefetch: true })
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
        console.warn("[Yjs] token refresh failed", e);
      } finally {
        refreshing = false;
      }
    };

    const updateCollaborators = () => {
      if (!provider) return;
      const localClientId = provider.awareness.clientID;
      const others = Array.from(provider.awareness.getStates().entries())
        .filter(([id]) => id !== localClientId)
        .map(([, state]) => (state as { user?: CollaboratorUser }).user)
        .filter((u): u is CollaboratorUser => !!u);
      setCollaborators(others);
    };

    (async () => {
      let token: string;
      let expiresIn: number;
      try {
        const res = await fetchToken();
        token = res.token;
        expiresIn = res.expiresIn || 86400;
        if (res.url && !import.meta.env.VITE_NODE_WS_URL && !import.meta.env.VITE_YJS_SERVER_URL) {
          serverUrl = res.url;
        }
      } catch (e) {
        console.warn("[Yjs] token fetch failed — staying in solo/local mode", e);
        if (!cancelled) setResolvedKey(attemptKey);
        return;
      }
      if (cancelled) return;

      ydoc = new Y.Doc();
      const roomName = String(docId).startsWith("doc-") ? String(docId) : `doc-${docId}`;
      provider = new WebsocketProvider(serverUrl, roomName, ydoc, {
        params: { yauth: token },
      });
      providerRef.current = { ydoc, provider };

      provider.on("status", ({ status }: { status: string }) => {
        setIsConnected(status === "connected");
      });

      const markResolved = () => {
        if (cancelled) return;
        if (syncFallbackTimer) {
          clearTimeout(syncFallbackTimer);
          syncFallbackTimer = null;
        }
        setResolvedKey(attemptKey);
      };

      const activateCollab = () => {
        if (cancelled || !ydoc || !provider) return;
        setProviderState({ ydoc, provider });
        markResolved();
      };

      provider.on("sync", (isSynced: boolean) => {
        if (isSynced) activateCollab();
      });
      if (provider.synced) activateCollab();

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

      provider.awareness.on("change", updateCollaborators);
      scheduleRefresh(expiresIn);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (syncFallbackTimer) clearTimeout(syncFallbackTimer);
      if (provider) {
        provider.awareness.off("change", updateCollaborators);
        provider.destroy();
      }
      if (ydoc) ydoc.destroy();
      providerRef.current = null;
      setProviderState(null);
      setIsConnected(false);
      setCollaborators([]);
      setResolvedKey(null);
    };
  }, [docId, user?.userId, dispatch, enabled, skip, attemptKey]);

  const currentUser = useMemo<CollaboratorUser | null>(() => {
    if (!user) return null;
    return { name: user.username, color: hashColor(user.userId), userId: user.userId };
  }, [user?.userId, user?.username]);

  const collaboration = useMemo<YjsCollaboration | null>(() => {
    if (!providerState) return null;
    return {
      ydoc: providerState.ydoc,
      provider: providerState.provider,
      isConnected,
      collaborators,
      currentUser,
    };
  }, [providerState, isConnected, collaborators, currentUser]);

  return { collaboration, isResolved };
}
