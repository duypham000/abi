import { getAccessToken } from "@/infrastructure/tauri/authBridge";

export interface AgentBackendPendingApproval {
  id: string;
  harnessId?: string;
  sessionId: string;
  toolCallId: string;
  kind: string;
  name: string;
  title: string;
  command?: string;
  paths?: string[];
  createdAt: string;
  expiresAt: string;
}

export interface AgentBackendSessionConfig {
  model?: string;
  effort?: string;
  mode?: string;
  systemPromptId?: string;
  systemPromptAppend?: string;
  replaceDefaultRule?: boolean;
  additionalDirs?: string[];
  restartIfNeeded?: boolean;
}

export interface AgentBackendSessionInfo {
  conversationId: string;
  acpSessionId?: string;
  harnessId?: string;
  turns: number;
  estimatedChars: number;
  createdAt?: string;
  lastUsedAt?: string;
  needsNewSession?: boolean;
}

export interface AgentBackendStatus {
  instanceId?: string;
  state: "STOPPED" | "IDLE" | "BUSY" | "WAITING_APPROVAL" | "COMPACTING" | string;
  stateSeq: number;
  defaultHarnessId: string;
  activeHarnessId: string;
  activeHarnessName?: string;
  activeHarnessRevision?: string;
  activePolicyProfile?: string;
  activeConversationId?: string;
  sessionId?: string;
  sessionsCount?: number;
  sessions?: AgentBackendSessionInfo[];
  activeTurnId?: string;
  activeToolsCount: number;
  geminiPid: number;
  geminiRssMB: number;
  goAllocMB: number;
  turnCount: number;
  idleSeconds: number;
  hasSummary: boolean;
  summaryPreview?: string;
  pendingApprovals: AgentBackendPendingApproval[];
  sessionConfig: AgentBackendSessionConfig;
  lastUsage?: Record<string, unknown>;
}

export interface AgentBackendModelOption {
  id: string;
  label: string;
}

export interface AgentBackendInfo {
  binary: string;
  version: string;
  models: AgentBackendModelOption[];
  efforts: string[];
  modes: string[];
  note?: string;
}

export interface AgentHarnessSummary {
  id: string;
  name: string;
  description?: string;
  isCommon: boolean;
  enabled: boolean;
  isActive?: boolean;
  tags?: string[];
  inheritanceMode: string;
  policyProfile: string;
  revision: string;
  updatedAt?: string;
  ruleCount: number;
  mcpCount: number;
  hookCount: number;
}

export interface AgentHarnessesResponse {
  defaultHarnessId: string;
  activeHarnessId: string;
  harnessesDir?: string;
  items: AgentHarnessSummary[];
}

export function resolveAgentApiEndpoint(endpoint?: string): string {
  const trimmed = (endpoint ?? "").trim() || "/api/v1/agent/chat";
  if (import.meta.env.PROD && trimmed.startsWith("/api/")) {
    const goApiUrl = ((import.meta.env.VITE_GO_API_URL as string | undefined) ?? "").trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(goApiUrl)) {
      return `${goApiUrl}${trimmed}`;
    }
  }
  return trimmed;
}

function resolveAgentBaseUrl(apiEndpoint?: string): string {
  const resolved = resolveAgentApiEndpoint(apiEndpoint);
  if (resolved.endsWith("/chat")) {
    return resolved.slice(0, -"/chat".length) || "/api/v1/agent";
  }
  return resolved.replace(/\/+$/, "");
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    apiEndpoint?: string;
    apiKey?: string;
  } = {}
): Promise<T> {
  const base = resolveAgentBaseUrl(options.apiEndpoint);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.apiKey && options.apiKey.trim()) {
    headers["X-Agent-Api-Key"] = options.apiKey.trim();
  }

  const res = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; message?: string; error?: string }
    | null;

  if (!res.ok) {
    const errMsg =
      payload?.message || payload?.error || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(errMsg);
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }
  return payload as unknown as T;
}

export function fetchAgentStatus(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<AgentBackendStatus> {
  return requestJson<AgentBackendStatus>("/status", opts);
}

export function fetchAgentInfo(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<AgentBackendInfo> {
  return requestJson<AgentBackendInfo>("/info", opts);
}

export function fetchAgentHarnesses(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<AgentHarnessesResponse> {
  return requestJson<AgentHarnessesResponse>("/harnesses", opts);
}

export function fetchAgentSessionConfig(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<AgentBackendSessionConfig> {
  return requestJson<AgentBackendSessionConfig>("/session/config", opts);
}

export function updateAgentSessionConfig(
  cfg: AgentBackendSessionConfig,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/session/config", {
    ...opts,
    method: "POST",
    body: cfg,
  });
}

export function resolveAgentPermission(
  permId: string,
  decision: "allow" | "deny",
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/permissions/${encodeURIComponent(permId)}`,
    {
      ...opts,
      method: "POST",
      body: { decision },
    }
  );
}

export function cancelAgentTurn(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
  conversationId?: string;
}): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (opts?.conversationId && opts.conversationId.trim()) {
    headers["X-Conversation-Id"] = opts.conversationId.trim();
  }
  return requestJson<Record<string, unknown>>("/cancel", {
    ...opts,
    headers,
    method: "POST",
  });
}

export function resetAgentSession(
  compact: boolean,
  harnessId?: string,
  opts?: {
    apiEndpoint?: string;
    apiKey?: string;
    conversationId?: string;
    hard?: boolean;
  }
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (compact) params.set("compact", "1");
  if (opts?.hard) params.set("hard", "1");
  if (harnessId && harnessId.trim()) params.set("harnessId", harnessId.trim());
  if (opts?.conversationId && opts.conversationId.trim()) {
    params.set("conversationId", opts.conversationId.trim());
  }
  const qs = params.toString();
  return requestJson<Record<string, unknown>>(`/reset${qs ? `?${qs}` : ""}`, {
    ...opts,
    method: "POST",
  });
}

export function fetchAgentSessions(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<{
  activeConversationId?: string;
  count: number;
  sessions: AgentBackendSessionInfo[];
}> {
  return requestJson<{
    activeConversationId?: string;
    count: number;
    sessions: AgentBackendSessionInfo[];
  }>("/sessions", opts);
}

export function fetchAgentUsage(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/agy/usage", opts);
}

export function deleteAgentBackendSession(
  conversationId: string,
  opts?: { apiEndpoint?: string; apiKey?: string; harnessId?: string }
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (opts?.harnessId && opts.harnessId.trim()) {
    params.set("harnessId", opts.harnessId.trim());
  }
  const qs = params.toString();
  return requestJson<Record<string, unknown>>(
    `/sessions/${encodeURIComponent(conversationId)}${qs ? `?${qs}` : ""}`,
    {
      ...opts,
      method: "DELETE",
    }
  );
}
