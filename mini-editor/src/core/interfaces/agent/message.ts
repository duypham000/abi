import type {
  LanguageModelUsage,
  ToolUIPart,
  UIMessage,
  UIMessageChunk,
  UIMessagePart,
} from "ai";
import type {
  ArtifactDataPart,
  AudioSpeechDataPart,
  ChainOfThoughtDataPart,
  CheckpointDataPart,
  CommitDataPart,
  EnvVarsDataPart,
  FileTreeDataPart,
  GeneratedImageDataPart,
  InlineCitationsDataPart,
  JsxPreviewDataPart,
  PackageInfoDataPart,
  PlanDataPart,
  QueueUpdateDataPart,
  SandboxDataPart,
  SchemaDisplayDataPart,
  StackTraceDataPart,
  SubagentDataPart,
  SuggestionsDataPart,
  TaskGroupDataPart,
  TerminalDataPart,
  TestResultsDataPart,
  WebPreviewDataPart,
  WorkflowGraphDataPart,
} from "./parts";

export interface QuestionOptionItem {
  value: string;
  label: string;
  description?: string;
}

export interface AskUserToolInput {
  question: string;
  description?: string;
  selectionMode: "single" | "multiple";
  options: QuestionOptionItem[];
  allowCustomInput?: boolean;
  placeholder?: string;
}

export interface AskUserToolOutput {
  selectedValues: string[];
  text?: string;
  answeredAt: string;
}

export interface AgentMessageMetadata {
  modelId?: string;
  provider?: string;
  createdAt?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
  finishReason?: string;
  stoppedByUser?: boolean;
  branchGroupId?: string;
  parentMessageId?: string;
  feedback?: "up" | "down" | null;
  scenarioTag?: string;
}

export type AgentUIDataTypes = {
  plan: PlanDataPart;
  "chain-of-thought": ChainOfThoughtDataPart;
  "task-group": TaskGroupDataPart;
  "queue-update": QueueUpdateDataPart;
  subagent: SubagentDataPart;
  terminal: TerminalDataPart;
  sandbox: SandboxDataPart;
  "test-results": TestResultsDataPart;
  "stack-trace": StackTraceDataPart;
  "file-tree": FileTreeDataPart;
  commit: CommitDataPart;
  "schema-display": SchemaDisplayDataPart;
  "env-vars": EnvVarsDataPart;
  "package-info": PackageInfoDataPart;
  artifact: ArtifactDataPart;
  "web-preview": WebPreviewDataPart;
  "jsx-preview": JsxPreviewDataPart;
  "generated-image": GeneratedImageDataPart;
  "audio-speech": AudioSpeechDataPart;
  "inline-citations": InlineCitationsDataPart;
  "workflow-graph": WorkflowGraphDataPart;
  checkpoint: CheckpointDataPart;
  suggestions: SuggestionsDataPart;
};

export type AgentUITools = {
  search_workspace: {
    input: { query: string; scope?: "docs" | "canvas" | "files" | "all"; limit?: number };
    output: { matches: { id: string; title: string; path?: string; score: number }[]; total: number };
  };
  read_doc: {
    input: { docId: string | number; section?: string };
    output: { docId: string | number; title: string; wordCount: number; excerpt: string };
  };
  edit_doc: {
    input: { docId: string | number; heading?: string; markdown: string; mode?: "append" | "replace" };
    output: { docId: string | number; updated: boolean; linesChanged: number };
  };
  update_canvas: {
    input: { canvasId: string | number; action: "add_nodes" | "connect" | "layout"; summary: string };
    output: { canvasId: string | number; elementCount: number; synced: boolean };
  };
  run_terminal: {
    input: { command: string; cwd?: string };
    output: { exitCode: number; stdout: string; durationMs: number };
  };
  run_tests: {
    input: { filter?: string; watch?: boolean };
    output: { passed: number; failed: number; skipped: number; durationMs: number };
  };
  git_commit: {
    input: { message: string; files: string[] };
    output: { hash: string; filesCommitted: number };
  };
  git_push: {
    input: { remote: string; branch: string; force?: boolean; migrationTarget?: string; commitsAhead?: number };
    output: { pushed: boolean; remote: string; branch: string; commitHash: string; status: string };
  };
  delete_doc: {
    input: { docId: string | number; permanent?: boolean };
    output: { deleted: boolean; docId: string | number };
  };
  apply_migration: {
    input: { targetDb: string; migrationFile: string; dryRun?: boolean };
    output: { applied: boolean; version: string; rowsAffected: number };
  };
  ask_user: {
    input: AskUserToolInput;
    output: AskUserToolOutput;
  };
  execute_sandbox: {
    input: { language: string; code: string; timeoutMs?: number };
    output: { stdout: string; stderr?: string; exitCode: number };
  };
  inspect_api_schema: {
    input: { method: string; path: string };
    output: { method: string; path: string; status: number; validated: boolean };
  };
  generate_image: {
    input: { prompt: string; aspectRatio?: string; style?: string };
    output: { mediaType: string; width: number; height: number; alt: string };
  };
  synthesize_speech: {
    input: { text: string; voiceId: string; format?: "wav" | "mp3" };
    output: { voiceId: string; durationSec: number; mediaType: string; segmentCount: number };
  };
  spawn_subagent: {
    input: { subagentId: string; name: string; model: string; task: string };
    output: { subagentId: string; status: "completed" | "error"; tokensUsed: number; summary: string };
  };
};

export type AgentUIMessage = UIMessage<
  AgentMessageMetadata,
  AgentUIDataTypes,
  AgentUITools
>;

export type AgentUIMessagePart = UIMessagePart<AgentUIDataTypes, AgentUITools>;
export type AgentUIMessageChunk = UIMessageChunk<
  AgentMessageMetadata,
  AgentUIDataTypes
>;
export type AgentToolPart = ToolUIPart<AgentUITools>;
export type AgentToolName = keyof AgentUITools;
