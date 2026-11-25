import type { AgentToolName } from "./message";

export type AgentMode =
  | "default"
  | "accept-edits"
  | "auto"
  | "plan"
  | "agent"
  | "ask"
  | "debug";

export type ApprovalPolicy = "ask" | "auto-safe" | "auto-all";

export type ReasoningEffort =
  | "off"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export function normalizeAgentMode(mode?: string | null): AgentMode {
  const trimmed = (mode ?? "").trim().toLowerCase();
  if (
    trimmed === "accept-edits" ||
    trimmed === "auto" ||
    trimmed === "plan"
  ) {
    return trimmed;
  }
  return "default";
}

export function normalizeReasoningEffort(
  effort?: string | null
): ReasoningEffort {
  const trimmed = (effort ?? "").trim().toLowerCase();
  switch (trimmed) {
    case "off":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return trimmed;
    default:
      return "medium";
  }
}

export type TransportMode = "mock" | "http";

export type MockSpeed = "instant" | "fast" | "realistic" | "slow";

export type PersonaVariant =
  | "command"
  | "glint"
  | "halo"
  | "mana"
  | "obsidian"
  | "opal";

export type AgentPersonaState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "asleep";

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  chef: string;
  contextWindow: number;
  supportsReasoning: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  badge?: string;
  description?: string;
}

export interface AgentToolDefinition {
  name: AgentToolName;
  title: string;
  description: string;
  category: "workspace" | "execution" | "git" | "media" | "orchestration";
  riskLevel: "safe" | "moderate" | "destructive";
  requiresApprovalByDefault: boolean;
  enabled: boolean;
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  systemInstructions: string;
  defaultMode: AgentMode;
  defaultModelId: string;
  personaVariant: PersonaVariant;
  voiceId: string;
  enabledTools: AgentToolName[];
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female" | "non-binary";
  accent: string;
  age: string;
  language: string;
  description: string;
  previewFrequencyHz: number;
  rate: number;
}

export interface AgentRuntimeConfig {
  transportMode: TransportMode;
  apiEndpoint: string;
  apiKey?: string;
  harnessId: string;
  systemPromptAppend: string;
  modelId: string;
  mode: AgentMode;
  approvalPolicy: ApprovalPolicy;
  reasoningEffort: ReasoningEffort;
  mockSpeed: MockSpeed;
  simulateError: boolean;
  personaVariant: PersonaVariant;
  voiceId: string;
  speechLang: string;
  autoSpeakResponses: boolean;
  autoOpenArtifact: boolean;
  showTimestamps: boolean;
  streamSmoothly: boolean;
  toolPermissions: Record<string, boolean>;
}

export const DEFAULT_MODELS: ModelOption[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    chef: "OpenAI",
    contextWindow: 128000,
    supportsReasoning: true,
    supportsVision: true,
    supportsTools: true,
    badge: "Balanced",
    description: "Fast multimodal flagship for coding, docs, and tool calls.",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    chef: "Anthropic",
    contextWindow: 200000,
    supportsReasoning: true,
    supportsVision: true,
    supportsTools: true,
    badge: "Recommended",
    description: "High-precision refactoring, architecture planning, and UI craft.",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    chef: "Google",
    contextWindow: 1000000,
    supportsReasoning: true,
    supportsVision: true,
    supportsTools: true,
    badge: "1M Context",
    description: "Deep multi-file workspace reasoning and research synthesis.",
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    chef: "OpenAI",
    contextWindow: 200000,
    supportsReasoning: true,
    supportsVision: false,
    supportsTools: true,
    badge: "Reasoning",
    description: "Dedicated step-by-step reasoning for debugging and tests.",
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "deepseek",
    chef: "DeepSeek",
    contextWindow: 128000,
    supportsReasoning: true,
    supportsVision: false,
    supportsTools: true,
    badge: "Open Weights",
    description: "Transparent chain-of-thought reasoning at low latency.",
  },
  {
    id: "qwen-2.5-coder",
    name: "Qwen 2.5 Coder 32B",
    provider: "alibaba",
    chef: "Alibaba Cloud",
    contextWindow: 128000,
    supportsReasoning: false,
    supportsVision: false,
    supportsTools: true,
    badge: "Code",
    description: "Specialized code synthesis, SQL migrations, and TypeScript.",
  },
];

export const DEFAULT_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "search_workspace",
    title: "Search Workspace",
    description: "Search Tomo Docs, Canvases, and workspace source files.",
    category: "workspace",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "read_doc",
    title: "Read Document",
    description: "Inspect full markdown, BlockNote blocks, or source files.",
    category: "workspace",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "edit_doc",
    title: "Edit Document",
    description: "Apply targeted updates or insert sections into Tomo Docs.",
    category: "workspace",
    riskLevel: "moderate",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "update_canvas",
    title: "Update Canvas",
    description: "Add or rearrange nodes on an Excalidraw Yjs canvas.",
    category: "workspace",
    riskLevel: "moderate",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "run_terminal",
    title: "Run Terminal",
    description: "Execute workspace CLI commands (pnpm, cargo, go test).",
    category: "execution",
    riskLevel: "moderate",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "run_tests",
    title: "Run Tests",
    description: "Execute unit and integration test suites with telemetry.",
    category: "execution",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "execute_sandbox",
    title: "Execute Sandbox",
    description: "Run isolated TypeScript/Node/Python snippets in sandbox.",
    category: "execution",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "inspect_api_schema",
    title: "Inspect API Schema",
    description: "Inspect Go backend REST route contracts and DTO payloads.",
    category: "workspace",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "git_commit",
    title: "Git Commit",
    description: "Stage verified changes and create a local Git commit.",
    category: "git",
    riskLevel: "moderate",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "git_push",
    title: "Git Push",
    description: "Push commits to remote branch or trigger deployment.",
    category: "git",
    riskLevel: "destructive",
    requiresApprovalByDefault: true,
    enabled: true,
  },
  {
    name: "delete_doc",
    title: "Delete Document",
    description: "Delete a Tomo document from local SQLite or remote store.",
    category: "workspace",
    riskLevel: "destructive",
    requiresApprovalByDefault: true,
    enabled: true,
  },
  {
    name: "apply_migration",
    title: "Apply Migration",
    description: "Execute SQLite/Postgres schema migrations against database.",
    category: "execution",
    riskLevel: "destructive",
    requiresApprovalByDefault: true,
    enabled: true,
  },
  {
    name: "ask_user",
    title: "Ask User",
    description: "Request structured clarification or choices from the user.",
    category: "orchestration",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "generate_image",
    title: "Generate Image",
    description: "Generate SVG/PNG diagrams, UI mockups, and visual assets.",
    category: "media",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "synthesize_speech",
    title: "Synthesize Speech",
    description: "Produce playable audio narration and timed transcript cues.",
    category: "media",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
  {
    name: "spawn_subagent",
    title: "Spawn Subagent",
    description: "Delegate parallel subtasks to specialized worker agents.",
    category: "orchestration",
    riskLevel: "safe",
    requiresApprovalByDefault: false,
    enabled: true,
  },
];

export const DEFAULT_AGENT_PROFILE: AgentProfile = {
  id: "tomo-architect",
  name: "Tomo Workspace Copilot",
  description:
    "Local-first engineering & documentation agent for mini-editor, Go backend, and Yjs CRDT workspaces.",
  systemInstructions:
    "Respect TypeScript strict mode, ProseMirror single-instance pins, local-first SQLite caching, and verify changes with tsc before committing.",
  defaultMode: "default",
  defaultModelId: "",
  personaVariant: "obsidian",
  voiceId: "nova",
  enabledTools: DEFAULT_AGENT_TOOLS.filter((tool) => tool.enabled).map(
    (tool) => tool.name
  ),
};

function createDefaultToolPermissions(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const tool of DEFAULT_AGENT_TOOLS) {
    map[tool.name] = tool.enabled;
  }
  return map;
}

export const DEFAULT_RUNTIME_CONFIG: AgentRuntimeConfig = {
  transportMode: "http",
  apiEndpoint: "/api/v1/agent/chat",
  apiKey: "",
  harnessId: "",
  systemPromptAppend: "",
  modelId: "",
  mode: "default",
  approvalPolicy: "ask",
  reasoningEffort: "medium",
  mockSpeed: "fast",
  simulateError: false,
  personaVariant: "obsidian",
  voiceId: "nova",
  speechLang: "en-US",
  autoSpeakResponses: false,
  autoOpenArtifact: false,
  showTimestamps: false,
  streamSmoothly: true,
  toolPermissions: createDefaultToolPermissions(),
};
