import type { Experimental_TranscriptionResult, ToolUIPart } from "ai";

export type AgentTranscriptionSegment =
  Experimental_TranscriptionResult["segments"][number];

// 1. Plan
export interface PlanStepItem {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  files?: string[];
}

export interface PlanDataPart {
  title: string;
  description: string;
  isStreaming?: boolean;
  steps: PlanStepItem[];
  estimatedDuration?: string;
  footerNote?: string;
}

// 2. Chain of Thought
export interface ChainOfThoughtStepItem {
  id: string;
  label: string;
  description?: string;
  status: "complete" | "active" | "pending";
  icon?: "brain" | "search" | "code" | "file" | "terminal" | "check";
  searchResults?: string[];
  caption?: string;
}

export interface ChainOfThoughtDataPart {
  title: string;
  defaultOpen?: boolean;
  steps: ChainOfThoughtStepItem[];
}

// 3. Task Group
export interface TaskFileRef {
  name: string;
  path: string;
  language?: string;
}

export interface TaskGroupItem {
  id: string;
  text: string;
  status?: "pending" | "running" | "completed" | "error";
  files?: TaskFileRef[];
}

export interface TaskGroupDataPart {
  title: string;
  defaultOpen?: boolean;
  items: TaskGroupItem[];
}

// 4. Queue Update (structurally aligned with QueueTodo from @/components/ai-elements/queue)
export interface QueueTodoItem {
  id: string;
  title: string;
  description?: string;
  status?: "pending" | "completed";
}

export interface QueueUpdateDataPart {
  todos: QueueTodoItem[];
}

// 5. Subagent
export interface SubagentToolSchemaRef {
  name: string;
  description: string;
  inputSchemaJson: string;
}

export interface SubagentDataPart {
  id: string;
  name: string;
  model: string;
  role: string;
  status: "idle" | "running" | "completed" | "error";
  instructions: string;
  tools: SubagentToolSchemaRef[];
  outputSchemaJson: string;
  summary: string;
}

// 6. Terminal
export interface TerminalDataPart {
  title: string;
  command: string;
  ansiOutput: string;
  isStreaming: boolean;
  exitCode?: number;
  durationMs?: number;
}

// 7. Sandbox
export interface SandboxDataPart {
  title: string;
  language: string;
  code: string;
  output: string;
  state: ToolUIPart["state"];
  error?: string;
}

// 8. Test Results
export type TestCaseStatus = "passed" | "failed" | "skipped" | "running";

export interface TestCaseItem {
  id: string;
  name: string;
  status: TestCaseStatus;
  duration?: number;
  errorMessage?: string;
  errorStack?: string;
}

export interface TestSuiteItem {
  id: string;
  name: string;
  status: TestCaseStatus;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestCaseItem[];
}

export interface TestResultsSummaryData {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration?: number;
}

export interface TestResultsDataPart {
  summary: TestResultsSummaryData;
  suites: TestSuiteItem[];
}

// 9. Stack Trace
export interface StackTraceDataPart {
  errorType: string;
  message: string;
  rawTrace: string;
  filePath?: string;
  line?: number;
  fixPrompt?: string;
}

// 10. File Tree
export interface FileTreeNode {
  path: string;
  name: string;
  kind: "file" | "folder";
  status?: "added" | "modified" | "deleted" | "unchanged";
  content?: string;
  language?: string;
  children?: FileTreeNode[];
}

export interface FileTreeDataPart {
  rootLabel: string;
  selectedPath?: string;
  nodes: FileTreeNode[];
}

// 11. Commit
export interface CommitAuthorInfo {
  name: string;
  initials: string;
  avatarUrl?: string;
}

export interface CommitFileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

export interface CommitDataPart {
  hash: string;
  message: string;
  author: CommitAuthorInfo;
  timestamp: string;
  files: CommitFileChange[];
}

// 12. Schema Display
export interface SchemaParameterItem {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  location?: "path" | "query" | "header";
}

export interface SchemaPropertyItem {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  properties?: SchemaPropertyItem[];
  items?: SchemaPropertyItem;
}

export interface SchemaDisplayDataPart {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description?: string;
  parameters?: SchemaParameterItem[];
  requestBody?: SchemaPropertyItem[];
  responseBody?: SchemaPropertyItem[];
  exampleRequest?: string;
  exampleResponse?: string;
}

// 13. Environment Variables
export interface EnvVarItem {
  name: string;
  value: string;
  required?: boolean;
}

export interface EnvVarsDataPart {
  title: string;
  variables: EnvVarItem[];
}

// 14. Package Info
export interface PackageDependencyItem {
  name: string;
  version: string;
}

export interface PackageInfoDataPart {
  name: string;
  currentVersion?: string;
  newVersion?: string;
  changeType?: "major" | "minor" | "patch" | "added" | "removed";
  description?: string;
  dependencies?: PackageDependencyItem[];
}

// 15. Web Preview Console Log (shared by WebPreviewDataPart & ArtifactDataPart)
export interface WebPreviewConsoleLogItem {
  level: "log" | "warn" | "error";
  message: string;
  timestampIso: string;
}

// 16. Artifact
export interface ArtifactDataPart {
  id: string;
  version: number;
  title: string;
  description?: string;
  kind: "code" | "markdown" | "web" | "jsx" | "file-tree" | "diff";
  language?: string;
  content: string;
  previewUrl?: string;
  consoleLogs?: WebPreviewConsoleLogItem[];
  files?: FileTreeNode[];
  updatedAt: string;
}

// 17. Web Preview
export interface WebPreviewDataPart {
  title: string;
  defaultUrl: string;
  htmlSrcDoc: string;
  consoleLogs: WebPreviewConsoleLogItem[];
}

// 18. JSX Preview
export interface JsxPreviewDataPart {
  title: string;
  jsx: string;
  isStreaming: boolean;
}

// 19. Generated Image
export interface GeneratedImageDataPart {
  prompt: string;
  base64: string;
  mediaType: string;
  alt: string;
}

// 20. Audio Speech
export interface AudioSpeechDataPart {
  title: string;
  voiceId: string;
  durationSec: number;
  base64Audio: string;
  mediaType: string;
  segments: AgentTranscriptionSegment[];
}

// 21. Inline Citations
export interface InlineCitationSourceItem {
  title: string;
  url: string;
  description?: string;
  quote?: string;
}

export interface InlineCitationParagraph {
  id: string;
  leadText: string;
  claimText: string;
  tailText?: string;
  citations: InlineCitationSourceItem[];
}

export interface InlineCitationsDataPart {
  paragraphs: InlineCitationParagraph[];
}

// 22. Workflow Graph
export interface WorkflowNodeItem {
  id: string;
  label: string;
  description: string;
  model: string;
  status: "pending" | "running" | "completed" | "error";
  tokens: number;
  latencyMs: number;
  outputSummary: string;
  position: { x: number; y: number };
}

export interface WorkflowEdgeItem {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  temporary?: boolean;
}

export interface WorkflowGraphDataPart {
  runId: string;
  title: string;
  nodes: WorkflowNodeItem[];
  edges: WorkflowEdgeItem[];
}

// 23. Checkpoint
export interface CheckpointDataPart {
  checkpointId: string;
  label: string;
  timestampIso: string;
  affectedFiles: string[];
}

// 24. Suggestions
export interface SuggestionsDataPart {
  items: string[];
}
