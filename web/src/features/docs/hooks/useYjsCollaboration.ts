import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { AuthUser } from "@/core/interfaces/auth";
import type { AppDispatch } from "@/store";
import { docsApi } from "@/infrastructure/api/docsApi";

const ENV_SERVER_URL = import.meta.env.VITE_YJS_SERVER_URL ?? "ws://127.0.0.1/ws/yjs";

// Refresh the yauth token this many ms before it expires.
const REFRESH_LEAD_MS = 60_000;
const MIN_REFRESH_MS = 5_000;

export interface CollaboratorUser {
  name: string;
  color: string;
  userId: number;
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
   * True once the collaboration attempt has settled — provider created, or
   * token fetch failed (offline), or draft mode. Consumers must wait for this
   * before mounting the editor, otherwise the editor may be created in solo
   * mode while collaboration is still loading (race → empty content).
   */
  isResolved: boolean;
}

function hashColor(userId: number): string {
  const COLORS = [
    "#e03131", "#c2255c", "#9c36b5", "#6741d9", "#3b5bdb",
    "#1971c2", "#0c8599", "#2f9e44", "#e8590c", "#f08c00",
  ];
  return COLORS[userId % COLORS.length];
}

export function useYjsCollaboration(docId: number, user: AuthUser | null): UseYjsCollaborationResult {
  const dispatch = useDispatch<AppDispatch>();
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorUser[]>([]);
  // Use state (not ref + tick) so useMemo deps are trackable
  const [providerState, setProviderState] = useState<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);
  // Drafts (docId < 0) have no collaboration, so they're resolved immediately.
  const [isResolved, setIsResolved] = useState(docId < 0);

  // Keep a ref so cleanup can destroy the provider without depending on state
  const providerRef = useRef<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);

  useEffect(() => {
    if (docId < 0) {
      setIsResolved(true);
      return;
    }
    // New doc: gate the editor until this attempt settles (success or failure).
    setIsResolved(false);

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

    let serverUrl = ENV_SERVER_URL;

    const scheduleRefresh = (expiresIn: number) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      const delay = Math.max(expiresIn * 1000 - REFRESH_LEAD_MS, MIN_REFRESH_MS);
      refreshTimer = setTimeout(refresh, delay);
    };

    const refresh = async () => {
      if (cancelled || refreshing || !provider) return;
      refreshing = true;
      try {
        const { token, expiresIn } = await fetchToken();
        if (cancelled || !provider) return;
        // provider.params is writable; y-websocket re-reads it on the next
        // (re)connection, so the fresh token is used without a disruptive reconnect.
        provider.params = { yauth: token };
        scheduleRefresh(expiresIn);
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
        expiresIn = res.expiresIn;
        if (res.url) serverUrl = res.url;
      } catch (e) {
        console.warn("[Yjs] token fetch failed — collaboration disabled", e);
        // Offline / token unavailable: fall back to solo mode (cached content).
        if (!cancelled) setIsResolved(true);
        return;
      }
      if (cancelled) return;

      ydoc = new Y.Doc();
      provider = new WebsocketProvider(serverUrl, `doc-${docId}`, ydoc, {
        params: { yauth: token },
      });

      provider.on("status", ({ status }: { status: string }) => {
        setIsConnected(status === "connected");
      });

      // Resolve only once the initial server state has been applied to the Y.Doc.
      // The editor mounts on `isResolved`, so gating on `sync` (not on provider
      // creation) guarantees the document content is already in the fragment when
      // BlockNote binds — otherwise it binds to an empty doc and the first open
      // shows blank content.
      const markResolved = () => {
        if (cancelled) return;
        if (syncFallbackTimer) { clearTimeout(syncFallbackTimer); syncFallbackTimer = null; }
        setIsResolved(true);
      };
      provider.on("sync", (isSynced: boolean) => {
        if (isSynced) markResolved();
      });
      if (provider.synced) markResolved();
      // Safety net: never block the editor forever if sync stalls (server down,
      // perm callback cold). Fall back to whatever is in the Y.Doc / cached seed.
      syncFallbackTimer = setTimeout(markResolved, 8000);

      // yhub may reject an expired token on reconnect — refetch eagerly.
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

      providerRef.current = { ydoc, provider };
      setProviderState({ ydoc, provider });
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
    };
  }, [docId, user?.userId, dispatch]);

  // Stable currentUser reference — only recreated when user identity changes.
  const currentUser = useMemo<CollaboratorUser | null>(() => {
    if (!user) return null;
    return { name: user.username, color: hashColor(user.userId), userId: user.userId };
  }, [user?.userId, user?.username]);

  // Stable collaboration reference — only recreated when the provider/connection
  // state or collaborator list actually changes. This prevents DocEditorBody from
  // re-rendering on every parent render just because collaboration is a new object.
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
