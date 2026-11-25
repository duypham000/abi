import {
  DEFAULT_RUNTIME_CONFIG,
  normalizeAgentMode,
  normalizeReasoningEffort,
  type AgentRuntimeConfig,
  type AgentSession,
  type CheckpointSnapshot,
  type IAgentStoragePort,
} from "@/core/interfaces/agent";
import { getItem, removeItem, setItem } from "@/infrastructure/tauri/kvStore";

export const AGENT_STORAGE_KEYS = {
  sessions: "tomo_agent_sessions_v1",
  config: "tomo_agent_config_v1",
  checkpoints: "tomo_agent_checkpoints_v1",
  activeSessionId: "tomo_agent_active_session_v1",
} as const;

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadSessions(): Promise<AgentSession[]> {
  try {
    const raw = await getItem(AGENT_STORAGE_KEYS.sessions);
    const parsed = safeJsonParse<unknown>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is AgentSession =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as AgentSession).id === "string" &&
          Array.isArray((item as AgentSession).messages)
      )
      .map((item) => ({
        ...item,
        mode: normalizeAgentMode(item.mode),
      }));
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: AgentSession[]): Promise<void> {
  try {
    await setItem(AGENT_STORAGE_KEYS.sessions, JSON.stringify(sessions));
  } catch {
    // ignore storage quota errors gracefully
  }
}

export async function loadActiveSessionId(): Promise<string | null> {
  try {
    const raw = await getItem(AGENT_STORAGE_KEYS.activeSessionId);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export async function saveActiveSessionId(
  sessionId: string | null
): Promise<void> {
  try {
    if (!sessionId) {
      await removeItem(AGENT_STORAGE_KEYS.activeSessionId);
      return;
    }
    await setItem(AGENT_STORAGE_KEYS.activeSessionId, sessionId);
  } catch {
    // ignore storage errors
  }
}

export async function loadConfig(): Promise<AgentRuntimeConfig | null> {
  try {
    const raw = await getItem(AGENT_STORAGE_KEYS.config);
    const parsed = safeJsonParse<Partial<AgentRuntimeConfig>>(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...DEFAULT_RUNTIME_CONFIG,
      ...parsed,
      mode: normalizeAgentMode(parsed.mode),
      reasoningEffort: normalizeReasoningEffort(parsed.reasoningEffort),
      toolPermissions: {
        ...DEFAULT_RUNTIME_CONFIG.toolPermissions,
        ...(parsed.toolPermissions ?? {}),
      },
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: AgentRuntimeConfig): Promise<void> {
  try {
    await setItem(AGENT_STORAGE_KEYS.config, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export async function loadCheckpoints(): Promise<CheckpointSnapshot[]> {
  try {
    const raw = await getItem(AGENT_STORAGE_KEYS.checkpoints);
    const parsed = safeJsonParse<unknown>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CheckpointSnapshot =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as CheckpointSnapshot).id === "string" &&
        Array.isArray((item as CheckpointSnapshot).messagesSnapshot)
    );
  } catch {
    return [];
  }
}

export async function saveCheckpoints(
  checkpoints: CheckpointSnapshot[]
): Promise<void> {
  try {
    await setItem(AGENT_STORAGE_KEYS.checkpoints, JSON.stringify(checkpoints));
  } catch {
    // ignore storage errors
  }
}

export async function clearAgentStorage(): Promise<void> {
  await Promise.allSettled([
    removeItem(AGENT_STORAGE_KEYS.sessions),
    removeItem(AGENT_STORAGE_KEYS.config),
    removeItem(AGENT_STORAGE_KEYS.checkpoints),
    removeItem(AGENT_STORAGE_KEYS.activeSessionId),
  ]);
}

export const agentStorage: IAgentStoragePort = {
  loadSessions,
  saveSessions,
  loadActiveSessionId,
  saveActiveSessionId,
  loadConfig,
  saveConfig,
  loadCheckpoints,
  saveCheckpoints,
  clearAll: clearAgentStorage,
};
