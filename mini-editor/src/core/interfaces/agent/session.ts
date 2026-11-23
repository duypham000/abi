import type { FileUIPart } from "ai";
import type { AgentMode } from "./config";
import type {
  AgentUIMessage,
  AskUserToolInput,
  AskUserToolOutput,
  QuestionOptionItem,
} from "./message";
import type {
  ArtifactDataPart,
  QueueTodoItem,
  WorkflowGraphDataPart,
} from "./parts";

export type { AskUserToolInput, AskUserToolOutput, QuestionOptionItem };

export type AgentScenarioId =
  | "fullstack"
  | "research"
  | "approval"
  | "debug"
  | "generative-media"
  | "workflow";

export interface WorkspaceContextItem {
  id: string;
  kind: "doc" | "canvas" | "file" | "git-diff" | "series";
  title: string;
  path?: string;
  subtitle?: string;
  excerpt?: string;
  language?: string;
  updatedAt?: string;
  sourceId?: number | string;
}

export interface QueuedPromptItem {
  id: string;
  text: string;
  createdAt: string;
  files?: FileUIPart[];
  contextItems?: WorkspaceContextItem[];
  scenarioHint?: AgentScenarioId;
}

export interface CheckpointSnapshot {
  id: string;
  sessionId: string;
  messageId: string;
  label: string;
  createdAt: string;
  affectedFiles: string[];
  messagesSnapshot: AgentUIMessage[];
  artifactsSnapshot?: ArtifactDataPart[];
}

export type BranchSelectionMap = Record<string, number>;

export interface AskAIRequest {
  id?: string;
  prompt: string;
  scenarioHint?: AgentScenarioId;
  contextItems?: WorkspaceContextItem[];
  files?: FileUIPart[];
  autoSubmit?: boolean;
  sourceView?: "doc" | "canvas" | "workspace" | "shortcut";
}

export interface AgentSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: AgentMode;
  modelId: string;
  messages: AgentUIMessage[];
  artifacts: ArtifactDataPart[];
  activeArtifactId?: string | null;
  workflowGraph?: WorkflowGraphDataPart | null;
  todos: QueueTodoItem[];
  queuedPrompts: QueuedPromptItem[];
  pinnedContext: WorkspaceContextItem[];
  branchSelections: BranchSelectionMap;
  isSeedTour?: boolean;
  summary?: string;
}
