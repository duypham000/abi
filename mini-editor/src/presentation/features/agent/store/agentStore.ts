import { create } from "zustand";
import {
  DEFAULT_AGENT_PROFILE,
  DEFAULT_RUNTIME_CONFIG,
  type AgentMode,
  type AgentProfile,
  type AgentRuntimeConfig,
  type AgentSession,
  type AgentUIMessage,
  type ArtifactDataPart,
  type AskAIRequest,
  type CheckpointSnapshot,
  type QueueTodoItem,
  type QueuedPromptItem,
  type WorkflowGraphDataPart,
  type WorkspaceContextItem,
} from "@/core/interfaces/agent";
import { agentStorage } from "@/infrastructure/agent";
import {
  fetchAgentAgyConfig,
  fetchAgentHarnesses,
  fetchAgentHealth,
  fetchAgentInfo,
  fetchAgentPrompts,
  fetchAgentStatus,
  fetchAgentUsage,
  type AgentAgySettingsResponse,
  type AgentBackendInfo,
  type AgentBackendStatus,
  type AgentHarnessSummary,
  type AgentPromptPreset,
  type AgentUsageResponse,
} from "@/infrastructure/agent/api/agentBackendApi";
import {
  getCachedResource,
  getCachedResourceSync,
  RESOURCE_CACHE_KEYS,
  RESOURCE_CACHE_TTLS,
  setCachedResource,
} from "@/infrastructure/tauri/resourceCacheService";

export interface AgentBackendMetaCache {
  backendStatus: AgentBackendStatus | null;
  backendInfo: AgentBackendInfo | null;
  backendUsage: AgentUsageResponse | null;
  backendPrompts: AgentPromptPreset[];
  backendAgyConfig: AgentAgySettingsResponse | null;
  harnesses: AgentHarnessSummary[];
}

export type AgentViewTab = "chat" | "artifacts" | "inspector";

export interface RestoreUndoSnapshot {
  sessionId: string;
  messages: AgentUIMessage[];
  artifacts: ArtifactDataPart[];
  activeArtifactId: string | null;
}

export interface CreateSessionOptions {
  title?: string;
  mode?: AgentMode;
  modelId?: string;
}

export interface AgentPlanDocument {
  id: string;
  sessionId: string;
  title: string;
  kind: "plan" | "walkthrough" | "artifact";
  path?: string;
  summary?: string;
  content: string;
  requestFeedback: boolean;
  hasFollowingUserMessage?: boolean;
  updatedAt: string;
}

export interface AgentStoreState {
  hydrated: boolean;
  isHydrating: boolean;
  sessions: AgentSession[];
  activeSessionId: string;
  config: AgentRuntimeConfig;
  profile: AgentProfile;
  isDockOpen: boolean;
  dockWidth: number;
  activeViewTab: AgentViewTab;
  isHistoryOpen: boolean;
  isArtifactDrawerOpen: boolean;
  activeArtifactId: string | null;
  checkpoints: CheckpointSnapshot[];
  lastRestoreUndo: RestoreUndoSnapshot | null;
  branchesByAnchor: Record<string, AgentUIMessage[][]>;
  activeBranchIndex: Record<string, number>;
  webSearchEnabled: boolean;
  micDeviceId: string | undefined;
  isVoiceListening: boolean;
  isAudioSpeaking: boolean;
  suggestionsBySession: Record<string, string[]>;
  pendingAskAI: AskAIRequest | null;
  planDocuments: Record<string, AgentPlanDocument>;

  // Cached & preloaded backend metadata
  backendStatus: AgentBackendStatus | null;
  backendInfo: AgentBackendInfo | null;
  backendUsage: AgentUsageResponse | null;
  backendPrompts: AgentPromptPreset[];
  backendAgyConfig: AgentAgySettingsResponse | null;
  harnesses: AgentHarnessSummary[];
  backendError: string | null;
  backendMetaLoadedAt: number | null;
  isRefreshingMeta: boolean;
  isRefreshingUsage: boolean;

  hydrate: () => Promise<void>;
  refreshBackendMeta: (opts?: { force?: boolean }) => Promise<boolean>;
  refreshAgentUsage: () => Promise<void>;
  setBackendAgyConfig: (cfg: AgentAgySettingsResponse | null) => void;
  createSession: (opts?: CreateSessionOptions) => AgentSession;
  selectSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  deleteSession: (sessionId: string) => void;
  clearSessionMessages: (sessionId: string) => void;
  syncSessionMessages: (sessionId: string, messages: AgentUIMessage[]) => void;
  setSessionMode: (sessionId: string, mode: AgentMode) => void;
  setSessionModel: (sessionId: string, modelId: string) => void;
  updateMessageFeedback: (
    sessionId: string,
    messageId: string,
    feedback: "up" | "down" | null
  ) => void;
  setDockOpen: (open: boolean) => void;
  toggleDock: () => void;
  setDockWidth: (width: number) => void;
  setActiveViewTab: (tab: AgentViewTab) => void;
  setHistoryOpen: (open: boolean) => void;
  openArtifact: (artifactId?: string) => void;
  closeArtifact: () => void;
  upsertArtifact: (sessionId: string, artifact: ArtifactDataPart) => void;
  setWorkflowGraph: (
    sessionId: string,
    graph: WorkflowGraphDataPart | null
  ) => void;
  setTodos: (sessionId: string, todos: QueueTodoItem[]) => void;
  toggleTodo: (sessionId: string, todoId: string) => void;
  enqueuePrompt: (sessionId: string, item: QueuedPromptItem) => void;
  removeQueuedPrompt: (sessionId: string, itemId: string) => void;
  shiftQueuedPrompt: (sessionId: string) => QueuedPromptItem | null;
  pinContextItem: (sessionId: string, item: WorkspaceContextItem) => void;
  unpinContextItem: (sessionId: string, itemId: string) => void;
  addCheckpoint: (snapshot: CheckpointSnapshot) => void;
  updateCheckpointSnapshot: (
    checkpointId: string,
    patch: {
      messageId?: string;
      messagesSnapshot: AgentUIMessage[];
      artifactsSnapshot?: ArtifactDataPart[];
    }
  ) => void;
  restoreCheckpoint: (checkpointId: string) => CheckpointSnapshot | null;
  undoLastRestore: () => boolean;
  recordBranch: (anchorKey: string, branchMessages: AgentUIMessage[]) => void;
  normalizeUserBranches: (
    anchorKey: string,
    userMessage: AgentUIMessage
  ) => void;
  setBranchIndex: (anchorKey: string, index: number) => void;
  updateConfig: (partial: Partial<AgentRuntimeConfig>) => void;
  updateProfile: (partial: Partial<AgentProfile>) => void;
  toggleToolPermission: (toolName: string) => void;
  resetConfig: () => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setMicDeviceId: (deviceId: string | undefined) => void;
  setVoiceListening: (listening: boolean) => void;
  setAudioSpeaking: (speaking: boolean) => void;
  setSessionSuggestions: (sessionId: string, items: string[]) => void;
  requestAskAI: (req: AskAIRequest) => void;
  consumeAskAI: () => AskAIRequest | null;
  upsertPlanDocument: (doc: AgentPlanDocument) => void;
  resetAllToDemo: () => Promise<void>;
}

const MIN_DOCK_WIDTH = 280;
const MAX_DOCK_WIDTH = 780;
const DEFAULT_DOCK_WIDTH = 440;
const DEFAULT_NEW_CHAT_TITLE = "New Agent Chat";
const SESSIONS_SAVE_DEBOUNCE_MS = 220;

let idCounter = 0;
let sessionsSaveTimer: ReturnType<typeof setTimeout> | null = null;
let hydrationInFlight: Promise<void> | null = null;

function createUniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_DOCK_WIDTH;
  return Math.max(MIN_DOCK_WIDTH, Math.min(MAX_DOCK_WIDTH, Math.round(width)));
}

function cloneDeep<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // fallback to JSON deep copy for non-cloneable edge values
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createFreshDefaultConfig(): AgentRuntimeConfig {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    toolPermissions: { ...DEFAULT_RUNTIME_CONFIG.toolPermissions },
  };
}

function createFreshDefaultProfile(): AgentProfile {
  return {
    ...DEFAULT_AGENT_PROFILE,
    enabledTools: [...DEFAULT_AGENT_PROFILE.enabledTools],
  };
}

function buildBlankSession(opts?: CreateSessionOptions): AgentSession {
  const nowIso = new Date().toISOString();
  return {
    id: createUniqueId("session"),
    title: opts?.title?.trim() || DEFAULT_NEW_CHAT_TITLE,
    createdAt: nowIso,
    updatedAt: nowIso,
    mode: opts?.mode ?? DEFAULT_RUNTIME_CONFIG.mode,
    modelId: opts?.modelId ?? DEFAULT_RUNTIME_CONFIG.modelId,
    messages: [],
    artifacts: [],
    activeArtifactId: null,
    workflowGraph: null,
    todos: [],
    queuedPrompts: [],
    pinnedContext: [],
    branchSelections: {},
    summary: "Fresh workspace session",
  };
}

function extractFirstUserTitle(messages: AgentUIMessage[]): string | null {
  const firstUser = messages.find((msg) => msg.role === "user");
  if (!firstUser) return null;

  const text = firstUser.parts
    .filter((part): part is Extract<AgentUIMessage["parts"][number], { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;
  if (text.length <= 56) return text;
  return `${text.slice(0, 53).trim()}...`;
}

function extractSuggestionsFromSessions(
  sessions: AgentSession[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const session of sessions) {
    for (let i = session.messages.length - 1; i >= 0; i -= 1) {
      const msg = session.messages[i];
      if (msg.role !== "assistant") continue;
      for (let j = msg.parts.length - 1; j >= 0; j -= 1) {
        const part = msg.parts[j];
        if (part.type === "data-suggestions" && Array.isArray(part.data.items)) {
          map[session.id] = [...part.data.items];
          break;
        }
      }
      if (map[session.id]) break;
    }
  }
  return map;
}

function normalizeSession(
  raw: AgentSession,
  seedTour?: AgentSession
): AgentSession {
  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  const activeArtifactId =
    raw.activeArtifactId !== undefined
      ? raw.activeArtifactId
      : artifacts[0]?.id ?? null;

  return {
    ...raw,
    title: raw.title?.trim() || DEFAULT_NEW_CHAT_TITLE,
    mode: raw.mode ?? DEFAULT_RUNTIME_CONFIG.mode,
    modelId: raw.modelId ?? DEFAULT_RUNTIME_CONFIG.modelId,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    artifacts,
    activeArtifactId,
    workflowGraph:
      raw.workflowGraph !== undefined
        ? raw.workflowGraph
        : seedTour?.workflowGraph ?? null,
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    queuedPrompts: Array.isArray(raw.queuedPrompts) ? raw.queuedPrompts : [],
    pinnedContext: Array.isArray(raw.pinnedContext) ? raw.pinnedContext : [],
    branchSelections:
      raw.branchSelections && typeof raw.branchSelections === "object"
        ? raw.branchSelections
        : {},
    ...(raw.id === "session-tomo-tour" ? { isSeedTour: true } : {}),
  };
}

function cancelPendingSessionsSave(): void {
  if (sessionsSaveTimer !== null) {
    clearTimeout(sessionsSaveTimer);
    sessionsSaveTimer = null;
  }
}

function scheduleSessionsSave(getSessions: () => AgentSession[]): void {
  cancelPendingSessionsSave();
  sessionsSaveTimer = setTimeout(() => {
    sessionsSaveTimer = null;
    void agentStorage.saveSessions(getSessions());
  }, SESSIONS_SAVE_DEBOUNCE_MS);
}

function saveSessionsNow(sessions: AgentSession[]): void {
  cancelPendingSessionsSave();
  void agentStorage.saveSessions(sessions);
}

function getBranchSignature(branchMessages: AgentUIMessage[]): string {
  return branchMessages
    .map((msg) => {
      const text = msg.parts
        .filter((p): p is Extract<AgentUIMessage["parts"][number], { type: "text" }> =>
          p.type === "text"
        )
        .map((p) => p.text)
        .join("\n");
      return `${msg.id}:${msg.role}:${text}`;
    })
    .join("|");
}

function filterRecordBySessionPrefix<T>(
  record: Record<string, T>,
  sessionId: string
): Record<string, T> {
  const prefix = `${sessionId}:`;
  const next: Record<string, T> = {};
  for (const key of Object.keys(record)) {
    if (!key.startsWith(prefix)) {
      next[key] = record[key];
    }
  }
  return next;
}

function createMinimalBootstrapSessions(): AgentSession[] {
  const nowIso = new Date().toISOString();
  return [
    {
      id: "session-new-chat",
      title: DEFAULT_NEW_CHAT_TITLE,
      createdAt: nowIso,
      updatedAt: nowIso,
      mode: DEFAULT_RUNTIME_CONFIG.mode,
      modelId: DEFAULT_RUNTIME_CONFIG.modelId,
      messages: [],
      artifacts: [],
      activeArtifactId: null,
      workflowGraph: null,
      todos: [],
      queuedPrompts: [],
      pinnedContext: [],
      branchSelections: {},
      summary: "Fresh workspace session",
    },
  ];
}

const initialBootstrapSessions = createMinimalBootstrapSessions();
let metaRefreshInFlight: Promise<boolean> | null = null;
let usageRefreshInFlight: Promise<void> | null = null;

function persistBackendMetaSnapshot(state: AgentStoreState): void {
  const snapshot: AgentBackendMetaCache = {
    backendStatus: state.backendStatus,
    backendInfo: state.backendInfo,
    backendUsage: state.backendUsage,
    backendPrompts: state.backendPrompts,
    backendAgyConfig: state.backendAgyConfig,
    harnesses: state.harnesses,
  };
  void setCachedResource(
    RESOURCE_CACHE_KEYS.AGENT_BACKEND_META,
    snapshot,
    RESOURCE_CACHE_TTLS.AGENT_BACKEND_META
  );
}

const initialCachedMeta = getCachedResourceSync<AgentBackendMetaCache>(
  RESOURCE_CACHE_KEYS.AGENT_BACKEND_META
);

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  hydrated: false,
  isHydrating: false,
  sessions: initialBootstrapSessions,
  activeSessionId: initialBootstrapSessions[0]?.id ?? "session-new-chat",
  config: createFreshDefaultConfig(),
  profile: createFreshDefaultProfile(),
  isDockOpen: false,
  dockWidth: DEFAULT_DOCK_WIDTH,
  activeViewTab: "chat",
  isHistoryOpen: false,
  isArtifactDrawerOpen: false,
  activeArtifactId: null,
  checkpoints: [],
  lastRestoreUndo: null,
  planDocuments: {},
  branchesByAnchor: {},
  activeBranchIndex: {},
  webSearchEnabled: true,
  micDeviceId: undefined,
  isVoiceListening: false,
  isAudioSpeaking: false,
  suggestionsBySession: {},
  pendingAskAI: null,

  backendStatus: initialCachedMeta?.data.backendStatus ?? null,
  backendInfo: initialCachedMeta?.data.backendInfo ?? null,
  backendUsage: initialCachedMeta?.data.backendUsage ?? null,
  backendPrompts: initialCachedMeta?.data.backendPrompts ?? [],
  backendAgyConfig: initialCachedMeta?.data.backendAgyConfig ?? null,
  harnesses: initialCachedMeta?.data.harnesses ?? [],
  backendError: null,
  backendMetaLoadedAt: initialCachedMeta?.updatedAt ?? null,
  isRefreshingMeta: false,
  isRefreshingUsage: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydrationInFlight) return hydrationInFlight;

    set({ isHydrating: true });

    hydrationInFlight = (async () => {
      try {
        const [
          persistedConfig,
          persistedSessions,
          persistedActiveId,
          cachedMeta,
        ] = await Promise.all([
          agentStorage.loadConfig(),
          agentStorage.loadSessions(),
          agentStorage.loadActiveSessionId(),
          getCachedResource<AgentBackendMetaCache>(RESOURCE_CACHE_KEYS.AGENT_BACKEND_META),
        ]);

        const cleanedPersisted = persistedSessions.filter(
          (session) => session.id !== "session-tomo-tour"
        );
        const mergedSessions =
          cleanedPersisted.length > 0
            ? cleanedPersisted.map((session) => normalizeSession(session))
            : createMinimalBootstrapSessions();

        const currentState = get();

        const nextConfig: AgentRuntimeConfig = persistedConfig
          ? {
            ...DEFAULT_RUNTIME_CONFIG,
            ...persistedConfig,
            transportMode: "http",
            autoOpenArtifact: false,
            toolPermissions: {
              ...DEFAULT_RUNTIME_CONFIG.toolPermissions,
              ...(persistedConfig.toolPermissions ?? {}),
            },
          }
          : currentState.config;

        const resolvedActiveSession =
          (persistedActiveId
            ? mergedSessions.find((s) => s.id === persistedActiveId)
            : undefined) ??
          mergedSessions.find((s) => s.id === currentState.activeSessionId) ??
          mergedSessions[0];

        const nextActiveSessionId =
          resolvedActiveSession?.id ?? "session-new-chat";

        const syncedConfig: AgentRuntimeConfig = resolvedActiveSession
          ? {
            ...nextConfig,
            mode: resolvedActiveSession.mode,
            modelId: resolvedActiveSession.modelId,
          }
          : nextConfig;

        const nextCheckpoints: CheckpointSnapshot[] = [];

        const derivedSuggestions = extractSuggestionsFromSessions(mergedSessions);
        const mergedSuggestions = {
          ...derivedSuggestions,
          ...currentState.suggestionsBySession,
        };

        set({
          hydrated: true,
          isHydrating: false,
          sessions: mergedSessions,
          activeSessionId: nextActiveSessionId,
          config: syncedConfig,
          checkpoints: nextCheckpoints,
          activeArtifactId:
            resolvedActiveSession?.activeArtifactId ??
            resolvedActiveSession?.artifacts[0]?.id ??
            null,
          suggestionsBySession: mergedSuggestions,
          ...(cachedMeta?.data
            ? {
                backendStatus: currentState.backendStatus ?? cachedMeta.data.backendStatus ?? null,
                backendInfo: currentState.backendInfo ?? cachedMeta.data.backendInfo ?? null,
                backendUsage: currentState.backendUsage ?? cachedMeta.data.backendUsage ?? null,
                backendPrompts:
                  currentState.backendPrompts.length > 0
                    ? currentState.backendPrompts
                    : Array.isArray(cachedMeta.data.backendPrompts)
                      ? cachedMeta.data.backendPrompts
                      : [],
                backendAgyConfig:
                  currentState.backendAgyConfig ?? cachedMeta.data.backendAgyConfig ?? null,
                harnesses:
                  currentState.harnesses.length > 0
                    ? currentState.harnesses
                    : Array.isArray(cachedMeta.data.harnesses)
                      ? cachedMeta.data.harnesses
                      : [],
                backendMetaLoadedAt: currentState.backendMetaLoadedAt ?? cachedMeta.updatedAt ?? null,
              }
            : {}),
        });
      } catch {
        set({ hydrated: true, isHydrating: false });
      } finally {
        hydrationInFlight = null;
      }
    })();

    return hydrationInFlight;
  },

  setBackendAgyConfig: (cfg) => {
    set({ backendAgyConfig: cfg });
    persistBackendMetaSnapshot(get());
  },

  refreshAgentUsage: async () => {
    if (usageRefreshInFlight) return usageRefreshInFlight;
    usageRefreshInFlight = (async () => {
      const currentCfg = get().config;
      const opts = {
        apiEndpoint: currentCfg.apiEndpoint,
        apiKey: currentCfg.apiKey,
      };
      set({ isRefreshingUsage: true });
      try {
        if (!get().backendStatus) {
          const health = await fetchAgentHealth(opts).catch(() => null);
          if (health && health.agentReachable === false) {
            set({
              backendError: health.agentError || "GemOps agent service is offline on server.",
            });
            return;
          }
        }
        const usageRes = await fetchAgentUsage(opts);
        set({ backendUsage: usageRes });
        persistBackendMetaSnapshot(get());
      } catch {
        // keep cached usage if /agy/usage fails transiently
      } finally {
        set({ isRefreshingUsage: false });
        usageRefreshInFlight = null;
      }
    })();
    return usageRefreshInFlight;
  },

  refreshBackendMeta: async (metaOpts) => {
    if (metaRefreshInFlight && !metaOpts?.force) return metaRefreshInFlight;
    metaRefreshInFlight = (async () => {
      const currentState = get();
      const currentCfg = currentState.config;
      const opts = {
        apiEndpoint: currentCfg.apiEndpoint,
        apiKey: currentCfg.apiKey,
      };
      set({ isRefreshingMeta: true });
      try {
        const health = await fetchAgentHealth(opts).catch(() => null);
        if (health && health.agentReachable === false) {
          set({
            backendError: health.agentError || "GemOps agent service is offline on server.",
          });
          return false;
        }

        const [statusRes, infoRes, harnessesRes, promptsRes, agyCfgRes] =
          await Promise.allSettled([
            fetchAgentStatus(opts),
            fetchAgentInfo(opts),
            fetchAgentHarnesses(opts),
            fetchAgentPrompts(opts),
            fetchAgentAgyConfig(opts),
          ]);

        let firstErr: string | null = null;
        const patch: Partial<AgentStoreState> = {};

        if (statusRes.status === "fulfilled") {
          patch.backendStatus = statusRes.value;
        } else {
          firstErr =
            statusRes.reason instanceof Error
              ? statusRes.reason.message
              : "Status unavailable";
        }

        if (infoRes.status === "fulfilled") {
          patch.backendInfo = infoRes.value;
          const liveModels = infoRes.value.models ?? [];
          if (
            liveModels.length > 0 &&
            currentCfg.modelId &&
            !liveModels.some((m) => m.id === currentCfg.modelId)
          ) {
            get().updateConfig({ modelId: "" });
            get().setSessionModel(get().activeSessionId, "");
          }
        } else if (!firstErr) {
          firstErr =
            infoRes.reason instanceof Error
              ? infoRes.reason.message
              : "Info unavailable";
        }

        if (harnessesRes.status === "fulfilled") {
          patch.harnesses = harnessesRes.value.items ?? [];
        } else if (!firstErr) {
          firstErr =
            harnessesRes.reason instanceof Error
              ? harnessesRes.reason.message
              : "Harnesses unavailable";
        }

        if (promptsRes.status === "fulfilled") {
          patch.backendPrompts = Array.isArray(promptsRes.value?.items)
            ? promptsRes.value.items
            : [];
        }
        if (agyCfgRes.status === "fulfilled") {
          patch.backendAgyConfig = agyCfgRes.value;
        }

        const anyOk =
          statusRes.status === "fulfilled" ||
          infoRes.status === "fulfilled" ||
          harnessesRes.status === "fulfilled";

        set({
          ...patch,
          backendError: anyOk ? null : firstErr,
          ...(anyOk ? { backendMetaLoadedAt: Date.now() } : {}),
        });

        if (anyOk) {
          persistBackendMetaSnapshot(get());
        }
        return statusRes.status === "fulfilled";
      } finally {
        set({ isRefreshingMeta: false });
        metaRefreshInFlight = null;
      }
    })();
    return metaRefreshInFlight;
  },

  createSession: (opts) => {
    const state = get();
    const newSession = buildBlankSession({
      title: opts?.title,
      mode: opts?.mode ?? state.config.mode,
      modelId: opts?.modelId ?? state.config.modelId,
    });
    const nextSessions = [newSession, ...state.sessions];
    const nextConfig: AgentRuntimeConfig = {
      ...state.config,
      mode: newSession.mode,
      modelId: newSession.modelId,
    };

    set({
      sessions: nextSessions,
      activeSessionId: newSession.id,
      activeViewTab: "chat",
      activeArtifactId: null,
      config: nextConfig,
    });

    saveSessionsNow(nextSessions);
    void agentStorage.saveActiveSessionId(newSession.id);
    if (
      nextConfig.mode !== state.config.mode ||
      nextConfig.modelId !== state.config.modelId
    ) {
      void agentStorage.saveConfig(nextConfig);
    }

    return newSession;
  },

  selectSession: (sessionId) => {
    const state = get();
    const target = state.sessions.find((s) => s.id === sessionId);
    if (!target) return;

    const nextActiveArtifactId =
      target.activeArtifactId ?? target.artifacts[0]?.id ?? null;

    const configChanged =
      state.config.mode !== target.mode ||
      state.config.modelId !== target.modelId;

    const nextConfig: AgentRuntimeConfig = configChanged
      ? {
        ...state.config,
        mode: target.mode,
        modelId: target.modelId,
      }
      : state.config;

    set({
      activeSessionId: target.id,
      activeArtifactId: nextActiveArtifactId,
      config: nextConfig,
    });

    void agentStorage.saveActiveSessionId(target.id);
    if (configChanged) {
      void agentStorage.saveConfig(nextConfig);
    }
  },

  renameSession: (sessionId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, title: trimmed, updatedAt: nowIso }
          : session
      ),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  deleteSession: (sessionId) => {
    const state = get();
    const remaining = state.sessions.filter((s) => s.id !== sessionId);
    const nextSessions =
      remaining.length > 0
        ? remaining
        : [
          buildBlankSession({
            mode: state.config.mode,
            modelId: state.config.modelId,
          }),
        ];

    const deletingActive = state.activeSessionId === sessionId;
    const nextActiveSession = deletingActive
      ? nextSessions[0]
      : nextSessions.find((s) => s.id === state.activeSessionId) ??
      nextSessions[0];

    const nextCheckpoints = state.checkpoints.filter(
      (cp) => cp.sessionId !== sessionId
    );
    const checkpointsChanged =
      nextCheckpoints.length !== state.checkpoints.length;

    const nextSuggestions = { ...state.suggestionsBySession };
    delete nextSuggestions[sessionId];

    const nextConfig: AgentRuntimeConfig = deletingActive
      ? {
        ...state.config,
        mode: nextActiveSession.mode,
        modelId: nextActiveSession.modelId,
      }
      : state.config;

    set({
      sessions: nextSessions,
      activeSessionId: nextActiveSession.id,
      activeArtifactId: deletingActive
        ? nextActiveSession.activeArtifactId ??
        nextActiveSession.artifacts[0]?.id ??
        null
        : state.activeArtifactId,
      checkpoints: nextCheckpoints,
      lastRestoreUndo:
        state.lastRestoreUndo?.sessionId === sessionId
          ? null
          : state.lastRestoreUndo,
      branchesByAnchor: filterRecordBySessionPrefix(
        state.branchesByAnchor,
        sessionId
      ),
      activeBranchIndex: filterRecordBySessionPrefix(
        state.activeBranchIndex,
        sessionId
      ),
      suggestionsBySession: nextSuggestions,
      config: nextConfig,
    });

    saveSessionsNow(nextSessions);
    void agentStorage.saveActiveSessionId(nextActiveSession.id);
    if (checkpointsChanged) {
      void agentStorage.saveCheckpoints(nextCheckpoints);
    }
    if (deletingActive) {
      void agentStorage.saveConfig(nextConfig);
    }
  },

  clearSessionMessages: (sessionId) => {
    const nowIso = new Date().toISOString();
    const state = get();

    const nextSessions = state.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      return {
        ...session,
        title: session.isSeedTour ? session.title : DEFAULT_NEW_CHAT_TITLE,
        messages: [],
        artifacts: [],
        activeArtifactId: null,
        workflowGraph: null,
        todos: [],
        queuedPrompts: [],
        branchSelections: {},
        updatedAt: nowIso,
      };
    });

    const nextSuggestions = { ...state.suggestionsBySession };
    delete nextSuggestions[sessionId];

    set({
      sessions: nextSessions,
      activeArtifactId:
        state.activeSessionId === sessionId ? null : state.activeArtifactId,
      suggestionsBySession: nextSuggestions,
      branchesByAnchor: filterRecordBySessionPrefix(
        state.branchesByAnchor,
        sessionId
      ),
      activeBranchIndex: filterRecordBySessionPrefix(
        state.activeBranchIndex,
        sessionId
      ),
    });

    saveSessionsNow(nextSessions);
  },

  syncSessionMessages: (sessionId, messages) => {
    const nowIso = new Date().toISOString();

    set((state) => {
      let changed = false;
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        changed = true;
        const nextTitle =
          session.title === DEFAULT_NEW_CHAT_TITLE
            ? extractFirstUserTitle(messages) ?? session.title
            : session.title;
        return {
          ...session,
          title: nextTitle,
          messages,
          updatedAt: nowIso,
        };
      });
      return changed ? { sessions: nextSessions } : state;
    });

    scheduleSessionsSave(() => get().sessions);
  },

  setSessionMode: (sessionId, mode) => {
    const nowIso = new Date().toISOString();
    const state = get();
    const isActive = state.activeSessionId === sessionId;

    const nextSessions = state.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, mode, updatedAt: nowIso }
        : session
    );
    const nextConfig: AgentRuntimeConfig = isActive
      ? { ...state.config, mode }
      : state.config;

    set({
      sessions: nextSessions,
      config: nextConfig,
    });

    scheduleSessionsSave(() => get().sessions);
    if (isActive && state.config.mode !== mode) {
      void agentStorage.saveConfig(nextConfig);
    }
  },

  setSessionModel: (sessionId, modelId) => {
    const nowIso = new Date().toISOString();
    const state = get();
    const isActive = state.activeSessionId === sessionId;

    const nextSessions = state.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, modelId, updatedAt: nowIso }
        : session
    );
    const nextConfig: AgentRuntimeConfig = isActive
      ? { ...state.config, modelId }
      : state.config;

    set({
      sessions: nextSessions,
      config: nextConfig,
    });

    scheduleSessionsSave(() => get().sessions);
    if (isActive && state.config.modelId !== modelId) {
      void agentStorage.saveConfig(nextConfig);
    }
  },

  updateMessageFeedback: (sessionId, messageId, feedback) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          updatedAt: nowIso,
          messages: session.messages.map((msg) =>
            msg.id === messageId
              ? {
                ...msg,
                metadata: {
                  ...(msg.metadata ?? {}),
                  feedback,
                },
              }
              : msg
          ),
        };
      }),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  setDockOpen: (open) => {
    set({ isDockOpen: open });
  },

  toggleDock: () => {
    set((state) => ({ isDockOpen: !state.isDockOpen }));
  },

  setDockWidth: (width) => {
    set({ dockWidth: clampDockWidth(width) });
  },

  setActiveViewTab: (tab) => {
    set({ activeViewTab: tab });
  },

  setHistoryOpen: (open) => {
    set({ isHistoryOpen: open });
  },

  openArtifact: (artifactId) => {
    const state = get();
    const activeSession = state.sessions.find(
      (s) => s.id === state.activeSessionId
    );
    const resolvedId =
      artifactId ??
      state.activeArtifactId ??
      activeSession?.activeArtifactId ??
      activeSession?.artifacts[0]?.id ??
      null;

    set({
      isArtifactDrawerOpen: true,
      activeArtifactId: resolvedId,
      sessions:
        activeSession && resolvedId
          ? state.sessions.map((session) =>
            session.id === activeSession.id
              ? { ...session, activeArtifactId: resolvedId }
              : session
          )
          : state.sessions,
    });
  },

  closeArtifact: () => {
    set({ isArtifactDrawerOpen: false });
  },

  upsertArtifact: (sessionId, artifact) => {
    const nowIso = new Date().toISOString();

    set((state) => {
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const idx = session.artifacts.findIndex((a) => a.id === artifact.id);
        const nextArtifacts =
          idx >= 0
            ? session.artifacts.map((a, i) =>
              i === idx ? { ...a, ...artifact } : a
            )
            : [...session.artifacts, artifact];
        return {
          ...session,
          artifacts: nextArtifacts,
          activeArtifactId: artifact.id,
          updatedAt: nowIso,
        };
      });

      return {
        sessions: nextSessions,
        activeArtifactId:
          state.activeSessionId === sessionId
            ? artifact.id
            : state.activeArtifactId,
      };
    });

    scheduleSessionsSave(() => get().sessions);
  },

  setWorkflowGraph: (sessionId, graph) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, workflowGraph: graph, updatedAt: nowIso }
          : session
      ),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  setTodos: (sessionId, todos) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, todos: [...todos], updatedAt: nowIso }
          : session
      ),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  toggleTodo: (sessionId, todoId) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          updatedAt: nowIso,
          todos: session.todos.map((todo) =>
            todo.id === todoId
              ? {
                ...todo,
                status:
                  todo.status === "completed" ? "pending" : "completed",
              }
              : todo
          ),
        };
      }),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  enqueuePrompt: (sessionId, item) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        if (session.queuedPrompts.some((q) => q.id === item.id)) {
          return session;
        }
        return {
          ...session,
          queuedPrompts: [...session.queuedPrompts, item],
          updatedAt: nowIso,
        };
      }),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  removeQueuedPrompt: (sessionId, itemId) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          queuedPrompts: session.queuedPrompts.filter((q) => q.id !== itemId),
          updatedAt: nowIso,
        };
      }),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  shiftQueuedPrompt: (sessionId) => {
    const state = get();
    const target = state.sessions.find((s) => s.id === sessionId);
    if (!target || target.queuedPrompts.length === 0) return null;

    const [first, ...rest] = target.queuedPrompts;
    const nowIso = new Date().toISOString();

    set({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, queuedPrompts: rest, updatedAt: nowIso }
          : session
      ),
    });

    scheduleSessionsSave(() => get().sessions);
    return first;
  },

  pinContextItem: (sessionId, item) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        if (session.pinnedContext.some((c) => c.id === item.id)) {
          return session;
        }
        return {
          ...session,
          pinnedContext: [...session.pinnedContext, item],
          updatedAt: nowIso,
        };
      }),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  unpinContextItem: (sessionId, itemId) => {
    const nowIso = new Date().toISOString();

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          pinnedContext: session.pinnedContext.filter((c) => c.id !== itemId),
          updatedAt: nowIso,
        };
      }),
    }));

    scheduleSessionsSave(() => get().sessions);
  },

  addCheckpoint: (snapshot) => {
    const clonedSnapshot: CheckpointSnapshot = {
      ...snapshot,
      affectedFiles: [...snapshot.affectedFiles],
      messagesSnapshot: cloneDeep(snapshot.messagesSnapshot),
      artifactsSnapshot: snapshot.artifactsSnapshot
        ? cloneDeep(snapshot.artifactsSnapshot)
        : undefined,
    };

    const state = get();
    const existsIdx = state.checkpoints.findIndex(
      (cp) => cp.id === clonedSnapshot.id
    );
    const nextCheckpoints =
      existsIdx >= 0
        ? state.checkpoints.map((cp, i) =>
          i === existsIdx ? clonedSnapshot : cp
        )
        : [...state.checkpoints, clonedSnapshot];

    set({ checkpoints: nextCheckpoints });
    void agentStorage.saveCheckpoints(nextCheckpoints);
  },

  updateCheckpointSnapshot: (checkpointId, patch) => {
    const state = get();
    const idx = state.checkpoints.findIndex((cp) => cp.id === checkpointId);
    if (idx === -1) return;

    const nextCheckpoints = state.checkpoints.map((cp, i) => {
      if (i !== idx) return cp;
      return {
        ...cp,
        ...(patch.messageId !== undefined ? { messageId: patch.messageId } : {}),
        messagesSnapshot: cloneDeep(patch.messagesSnapshot),
        ...(patch.artifactsSnapshot !== undefined
          ? { artifactsSnapshot: cloneDeep(patch.artifactsSnapshot) }
          : {}),
      };
    });

    set({ checkpoints: nextCheckpoints });
    void agentStorage.saveCheckpoints(nextCheckpoints);
  },

  restoreCheckpoint: (checkpointId) => {
    const state = get();
    const checkpoint = state.checkpoints.find((cp) => cp.id === checkpointId);
    if (!checkpoint) return null;

    const targetSession = state.sessions.find(
      (s) => s.id === checkpoint.sessionId
    );
    if (!targetSession) return null;

    const undoSnapshot: RestoreUndoSnapshot = {
      sessionId: targetSession.id,
      messages: cloneDeep(targetSession.messages),
      artifacts: cloneDeep(targetSession.artifacts),
      activeArtifactId: targetSession.activeArtifactId ?? null,
    };

    const restoredMessages = cloneDeep(checkpoint.messagesSnapshot);
    const restoredArtifacts = checkpoint.artifactsSnapshot
      ? cloneDeep(checkpoint.artifactsSnapshot)
      : targetSession.artifacts;

    const preservedArtifactId =
      targetSession.activeArtifactId &&
        restoredArtifacts.some((a) => a.id === targetSession.activeArtifactId)
        ? targetSession.activeArtifactId
        : restoredArtifacts[0]?.id ?? null;

    const nowIso = new Date().toISOString();
    const nextSessions = state.sessions.map((session) =>
      session.id === targetSession.id
        ? {
          ...session,
          messages: restoredMessages,
          artifacts: restoredArtifacts,
          activeArtifactId: preservedArtifactId,
          updatedAt: nowIso,
        }
        : session
    );

    set({
      sessions: nextSessions,
      lastRestoreUndo: undoSnapshot,
      activeArtifactId:
        state.activeSessionId === targetSession.id
          ? preservedArtifactId
          : state.activeArtifactId,
    });

    saveSessionsNow(nextSessions);
    return {
      ...checkpoint,
      messagesSnapshot: cloneDeep(restoredMessages),
      artifactsSnapshot: cloneDeep(restoredArtifacts),
    };
  },

  undoLastRestore: () => {
    const state = get();
    const undo = state.lastRestoreUndo;
    if (!undo) return false;

    const exists = state.sessions.some((s) => s.id === undo.sessionId);
    if (!exists) {
      set({ lastRestoreUndo: null });
      return false;
    }

    const nowIso = new Date().toISOString();
    const restoredMessages = cloneDeep(undo.messages);
    const restoredArtifacts = cloneDeep(undo.artifacts);

    const nextSessions = state.sessions.map((session) =>
      session.id === undo.sessionId
        ? {
          ...session,
          messages: restoredMessages,
          artifacts: restoredArtifacts,
          activeArtifactId: undo.activeArtifactId,
          updatedAt: nowIso,
        }
        : session
    );

    set({
      sessions: nextSessions,
      lastRestoreUndo: null,
      activeArtifactId:
        state.activeSessionId === undo.sessionId
          ? undo.activeArtifactId
          : state.activeArtifactId,
    });

    saveSessionsNow(nextSessions);
    return true;
  },

  recordBranch: (anchorKey, branchMessages) => {
    if (branchMessages.length === 0) return;
    const cloned = cloneDeep(branchMessages);
    const signature = getBranchSignature(cloned);

    set((state) => {
      const existing = state.branchesByAnchor[anchorKey] ?? [];
      const existingIdx = existing.findIndex(
        (branch) => getBranchSignature(branch) === signature
      );

      if (existingIdx >= 0) {
        return {
          activeBranchIndex: {
            ...state.activeBranchIndex,
            [anchorKey]: existingIdx,
          },
        };
      }

      const nextList = [...existing, cloned];
      return {
        branchesByAnchor: {
          ...state.branchesByAnchor,
          [anchorKey]: nextList,
        },
        activeBranchIndex: {
          ...state.activeBranchIndex,
          [anchorKey]: nextList.length - 1,
        },
      };
    });
  },

  normalizeUserBranches: (anchorKey, userMessage) => {
    set((state) => {
      const existing = state.branchesByAnchor[anchorKey];
      if (!existing || existing.length === 0) return state;

      let changed = false;
      const normalized = existing.map((branch) => {
        if (branch.length > 0 && branch[0].role === "assistant") {
          changed = true;
          return [cloneDeep(userMessage), ...branch];
        }
        return branch;
      });

      if (!changed) return state;
      return {
        branchesByAnchor: {
          ...state.branchesByAnchor,
          [anchorKey]: normalized,
        },
      };
    });
  },

  setBranchIndex: (anchorKey, index) => {
    set((state) => {
      const branches = state.branchesByAnchor[anchorKey];
      if (!branches || branches.length === 0) return state;
      const clamped = Math.max(0, Math.min(branches.length - 1, index));
      return {
        activeBranchIndex: {
          ...state.activeBranchIndex,
          [anchorKey]: clamped,
        },
      };
    });
  },

  updateConfig: (partial) => {
    const state = get();
    const nextConfig: AgentRuntimeConfig = {
      ...state.config,
      ...partial,
      toolPermissions: partial.toolPermissions
        ? {
          ...state.config.toolPermissions,
          ...partial.toolPermissions,
        }
        : state.config.toolPermissions,
    };

    const modeOrModelChanged =
      nextConfig.mode !== state.config.mode ||
      nextConfig.modelId !== state.config.modelId;

    const nowIso = new Date().toISOString();
    const nextSessions = modeOrModelChanged
      ? state.sessions.map((session) =>
        session.id === state.activeSessionId
          ? {
            ...session,
            mode: nextConfig.mode,
            modelId: nextConfig.modelId,
            updatedAt: nowIso,
          }
          : session
      )
      : state.sessions;

    set({
      config: nextConfig,
      sessions: nextSessions,
    });

    void agentStorage.saveConfig(nextConfig);
    if (modeOrModelChanged) {
      scheduleSessionsSave(() => get().sessions);
    }
  },

  updateProfile: (partial) => {
    set((state) => ({
      profile: {
        ...state.profile,
        ...partial,
        enabledTools: partial.enabledTools
          ? [...partial.enabledTools]
          : state.profile.enabledTools,
      },
    }));
  },

  toggleToolPermission: (toolName) => {
    const state = get();
    const current = state.config.toolPermissions[toolName] ?? true;
    const nextConfig: AgentRuntimeConfig = {
      ...state.config,
      toolPermissions: {
        ...state.config.toolPermissions,
        [toolName]: !current,
      },
    };

    set({ config: nextConfig });
    void agentStorage.saveConfig(nextConfig);
  },

  resetConfig: () => {
    const freshConfig = createFreshDefaultConfig();
    const freshProfile = createFreshDefaultProfile();
    const state = get();
    const nowIso = new Date().toISOString();
    const nextSessions = state.sessions.map((session) =>
      session.id === state.activeSessionId
        ? {
          ...session,
          mode: freshConfig.mode,
          modelId: freshConfig.modelId,
          updatedAt: nowIso,
        }
        : session
    );

    set({
      config: freshConfig,
      profile: freshProfile,
      sessions: nextSessions,
    });

    void agentStorage.saveConfig(freshConfig);
    scheduleSessionsSave(() => get().sessions);
  },

  setWebSearchEnabled: (enabled) => {
    set({ webSearchEnabled: enabled });
  },

  setMicDeviceId: (deviceId) => {
    set({ micDeviceId: deviceId });
  },

  setVoiceListening: (listening) => {
    set({ isVoiceListening: listening });
  },

  setAudioSpeaking: (speaking) => {
    set({ isAudioSpeaking: speaking });
  },

  setSessionSuggestions: (sessionId, items) => {
    set((state) => ({
      suggestionsBySession: {
        ...state.suggestionsBySession,
        [sessionId]: [...items],
      },
    }));
  },

  requestAskAI: (req) => {
    set({
      isDockOpen: true,
      activeViewTab: "chat",
      pendingAskAI: {
        ...req,
        id: req.id ?? createUniqueId("askai"),
      },
    });
  },

  consumeAskAI: () => {
    const current = get().pendingAskAI;
    if (!current) return null;
    set({ pendingAskAI: null });
    return current;
  },

  upsertPlanDocument: (doc) => {
    set((state) => ({
      planDocuments: {
        ...state.planDocuments,
        [doc.id]: doc,
      },
    }));
  },

  resetAllToDemo: async () => {
    cancelPendingSessionsSave();

    const freshSessions = createMinimalBootstrapSessions();
    const freshConfig = createFreshDefaultConfig();
    const freshProfile = createFreshDefaultProfile();
    const activeId = freshSessions[0]?.id ?? "session-new-chat";

    set({
      hydrated: true,
      isHydrating: false,
      sessions: freshSessions,
      activeSessionId: activeId,
      config: freshConfig,
      profile: freshProfile,
      activeArtifactId: null,
      isArtifactDrawerOpen: false,
      checkpoints: [],
      lastRestoreUndo: null,
      branchesByAnchor: {},
      activeBranchIndex: {},
      suggestionsBySession: {},
      pendingAskAI: null,
    });

    await agentStorage.clearAll();
    await Promise.all([
      agentStorage.saveSessions(freshSessions),
      agentStorage.saveActiveSessionId(activeId),
      agentStorage.saveConfig(freshConfig),
    ]);
  },
}));
