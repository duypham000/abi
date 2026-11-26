import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import { getGoRootUrl, isProxiedDevEnvironment } from "@/infrastructure/api/apiConfig";

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
  key?: string;
  conversationId: string;
  acpSessionId?: string;
  sessionId?: string;
  harnessId?: string;
  harnessRevision?: string;
  turnCount?: number;
  turns?: number;
  sessionConfig?: AgentBackendSessionConfig;
  estimatedChars?: number;
  createdAt?: string;
  updatedAt?: string;
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

export interface AgentQuotaBucket {
  id: string;
  name: string;
  description?: string;
  window?: string;
  remaining_fraction?: number;
  reset_time?: string;
  [key: string]: unknown;
}

export interface AgentQuotaGroup {
  name: string;
  description?: string;
  buckets?: AgentQuotaBucket[];
  [key: string]: unknown;
}

export interface AgentCreditsInfo {
  remaining_credits?: number;
  upgrade_uri?: string;
  [key: string]: unknown;
}

export interface AgentCurrentModelInfo {
  id?: string;
  label?: string;
  effort?: string;
  is_default?: boolean;
  [key: string]: unknown;
}

export interface AgentCurrentEffortInfo {
  adjustable?: boolean;
  current?: string;
  available?: string[];
  [key: string]: unknown;
}

export interface AgentUsageResponse {
  timestamp?: string;
  binary?: string;
  version?: string;
  currentModel?: AgentCurrentModelInfo;
  currentEffort?: AgentCurrentEffortInfo;
  quota?: {
    description?: string;
    groups?: AgentQuotaGroup[];
    [key: string]: unknown;
  };
  credits?: AgentCreditsInfo;
  warnings?: string[];
}

export interface AgentPromptPreset {
  id: string;
  name: string;
  path?: string;
  content: string;
  isDefault?: boolean;
  updatedAt?: string;
}

export interface AgentAgySettingsResponse {
  path: string;
  exists: boolean;
  settings: Record<string, unknown>;
  editableKeys?: string[];
}

export interface AgentCustomCommandResponse {
  harnessId?: string;
  mode: string;
  command: string;
  args?: string[];
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr?: string;
  parsedJson?: unknown;
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
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (!isProxiedDevEnvironment() && (trimmed.startsWith("/api/") || trimmed.startsWith("/go/"))) {
    const root = getGoRootUrl();
    if (root) {
      if (root.endsWith("/go") && trimmed.startsWith("/go/")) {
        return `${root}${trimmed.slice(3)}`;
      }
      return `${root}${trimmed}`;
    }
  }
  return trimmed;
}

export function resolveAgentBaseUrl(apiEndpoint?: string): string {
  const resolved = resolveAgentApiEndpoint(apiEndpoint);
  if (resolved.endsWith("/chat")) {
    return resolved.slice(0, -"/chat".length) || "/api/v1/agent";
  }
  return resolved.replace(/\/+$/, "");
}

export function resolveAgentEventsUrl(
  apiEndpoint?: string,
  lastEventId?: string
): string {
  const base = resolveAgentBaseUrl(apiEndpoint);
  if (lastEventId && lastEventId.trim()) {
    return `${base}/events?lastEventId=${encodeURIComponent(lastEventId.trim())}`;
  }
  return `${base}/events`;
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

export async function fetchAgentSessions(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<{
  activeConversationId?: string;
  count: number;
  items: AgentBackendSessionInfo[];
  sessions: AgentBackendSessionInfo[];
}> {
  const raw = await requestJson<{
    activeConversationId?: string;
    count?: number;
    items?: AgentBackendSessionInfo[];
    sessions?: AgentBackendSessionInfo[];
  }>("/sessions", opts);
  const list = Array.isArray(raw?.sessions)
    ? raw.sessions
    : Array.isArray(raw?.items)
      ? raw.items
      : [];
  return {
    activeConversationId: raw?.activeConversationId,
    count: typeof raw?.count === "number" ? raw.count : list.length,
    items: list,
    sessions: list,
  };
}

export function fetchAgentUsage(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<AgentUsageResponse> {
  return requestJson<AgentUsageResponse>("/agy/usage", opts);
}

export function deleteAgentBackendSession(
  conversationId: string,
  opts?: { apiEndpoint?: string; apiKey?: string; harnessId?: string }
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  const headers: Record<string, string> = {};
  if (opts?.harnessId && opts.harnessId.trim()) {
    params.set("harnessId", opts.harnessId.trim());
    headers["X-Harness-Id"] = opts.harnessId.trim();
  }
  const qs = params.toString();
  return requestJson<Record<string, unknown>>(
    `/sessions/${encodeURIComponent(conversationId)}${qs ? `?${qs}` : ""}`,
    {
      ...opts,
      headers,
      method: "DELETE",
    }
  );
}

export function fetchAgentHealth(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/healthz", opts);
}

export function fetchAgentMeta(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/meta", opts);
}

export function startAgentPrompt(
  body: {
    prompt: string;
    harnessId?: string;
    conversationId?: string;
    sessionConfig?: AgentBackendSessionConfig;
  },
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<{
  status: string;
  turnId: string;
  harnessId: string;
  conversationId?: string;
}> {
  const headers: Record<string, string> = {};
  if (body.harnessId && body.harnessId.trim()) {
    headers["X-Harness-Id"] = body.harnessId.trim();
  }
  if (body.conversationId && body.conversationId.trim()) {
    headers["X-Conversation-Id"] = body.conversationId.trim();
  }
  return requestJson<{
    status: string;
    turnId: string;
    harnessId: string;
    conversationId?: string;
  }>("/prompt", {
    ...opts,
    headers,
    method: "POST",
    body,
  });
}

export function fetchAgentAgyConfig(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<AgentAgySettingsResponse> {
  return requestJson<AgentAgySettingsResponse>("/agy/config", opts);
}

export function updateAgentAgyConfig(
  settings: Record<string, unknown>,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<AgentAgySettingsResponse> {
  return requestJson<AgentAgySettingsResponse>("/agy/config", {
    ...opts,
    method: "PUT",
    body: settings,
  });
}

export function fetchAgentPrompts(opts?: {
  apiEndpoint?: string;
  apiKey?: string;
}): Promise<{ items: AgentPromptPreset[] }> {
  return requestJson<{ items: AgentPromptPreset[] }>("/agy/prompts", opts);
}

export function saveAgentPrompt(
  prompt: { id: string; content: string },
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<AgentPromptPreset> {
  return requestJson<AgentPromptPreset>("/agy/prompts", {
    ...opts,
    method: "POST",
    body: prompt,
  });
}

export function deleteAgentPrompt(
  id: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/agy/prompts/${encodeURIComponent(id)}`,
    {
      ...opts,
      method: "DELETE",
    }
  );
}

export function runAgentAgyCommand(
  req: {
    mode?: "slash" | "cli";
    command: string;
    args?: string[];
    harnessId?: string;
    timeoutSec?: number;
  },
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<AgentCustomCommandResponse> {
  const headers: Record<string, string> = {};
  if (req.harnessId && req.harnessId.trim()) {
    headers["X-Harness-Id"] = req.harnessId.trim();
  }
  return requestJson<AgentCustomCommandResponse>("/agy/command", {
    ...opts,
    headers,
    method: "POST",
    body: req,
  });
}

export function triggerAgentUpdate(
  req?: { branch?: string; restart?: boolean; rebuildWeb?: boolean },
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/update", {
    ...opts,
    method: "POST",
    body: req ?? {},
  });
}

export function fetchAgentHarness(
  id: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}`,
    opts
  );
}

export function createAgentHarness(
  spec: Record<string, unknown>,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/harnesses", {
    ...opts,
    method: "POST",
    body: spec,
  });
}

export function updateAgentHarness(
  id: string,
  spec: Record<string, unknown>,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}`,
    {
      ...opts,
      method: "PUT",
      body: spec,
    }
  );
}

export function deleteAgentHarness(
  id: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}`,
    {
      ...opts,
      method: "DELETE",
    }
  );
}

export function fetchAgentResolvedHarness(
  id: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/resolved`,
    opts
  );
}

export function validateAgentHarness(
  id: string,
  spec?: Record<string, unknown>,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/validate`,
    {
      ...opts,
      method: "POST",
      body: spec,
    }
  );
}

export function evaluateAgentHarness(
  id: string,
  body?: Record<string, unknown>,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/evaluate`,
    {
      ...opts,
      method: "POST",
      body,
    }
  );
}

export function cloneAgentHarness(
  id: string,
  req: { targetId: string; name?: string },
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/clone`,
    {
      ...opts,
      method: "POST",
      body: req,
    }
  );
}

export function fetchAgentHarnessSkill(
  id: string,
  skillName: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillName)}`,
    opts
  );
}

export function saveAgentHarnessSkill(
  id: string,
  skillName: string,
  content: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillName)}`,
    {
      ...opts,
      method: "PUT",
      body: { content },
    }
  );
}

export function deleteAgentHarnessSkill(
  id: string,
  skillName: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/harnesses/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillName)}`,
    {
      ...opts,
      method: "DELETE",
    }
  );
}

export function fetchAgentSecrets(
  scope?: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  const qs =
    scope && scope.trim() ? `?scope=${encodeURIComponent(scope.trim())}` : "";
  return requestJson<Record<string, unknown>>(`/secrets${qs}`, opts);
}

export function saveAgentSecret(
  secret: {
    scope: string;
    key: string;
    value: string;
    description?: string;
  },
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/secrets", {
    ...opts,
    method: "PUT",
    body: secret,
  });
}

export function deleteAgentSecret(
  scope: string,
  key: string,
  opts?: { apiEndpoint?: string; apiKey?: string }
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/secrets/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`,
    {
      ...opts,
      method: "DELETE",
    }
  );
}
