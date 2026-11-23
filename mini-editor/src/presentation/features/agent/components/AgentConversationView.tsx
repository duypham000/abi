import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AgentPersonaState,
  AgentScenarioId,
  AgentUIMessage,
  CheckpointSnapshot,
  PersonaVariant,
  TransportMode,
} from "@/core/interfaces/agent";
import type { ChatStatus } from "ai";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BugIcon,
  Code2Icon,
  CompassIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import type { MessageBranchInfo } from "../hooks/useAgentRuntime";
import { AgentPersonaOrb } from "./AgentErrorBoundary";
import { AgentMessageItem } from "./AgentMessageItem";

export interface AgentConversationViewProps {
  sessionTitle: string;
  messages: AgentUIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  personaState: AgentPersonaState;
  personaVariant: PersonaVariant;
  transportMode: TransportMode;
  showTimestamps: boolean;
  checkpoints: CheckpointSnapshot[];
  sessionSuggestions: string[];
  hasTourSession: boolean;
  getBranchInfoForMessage: (messageId: string) => MessageBranchInfo | null;
  onLaunchScenario: (scenarioId: AgentScenarioId) => void;
  onJumpToTour: () => void;
  onClearError: () => void;
  onRetryLast: () => void;
  onApproveTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onDenyTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onSubmitQuestion: (
    toolCallId: string,
    selectedValues: string[],
    text?: string
  ) => void | Promise<void>;
  onRegenerate: (messageId: string) => void | Promise<void>;
  onEditUserMessage: (messageId: string, newText: string) => void | Promise<void>;
  onSwitchBranch: (anchorKey: string, nextIndex: number) => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onOpenArtifact: (artifactId?: string) => void;
  onOpenWorkflowTab: () => void;
  onFeedback: (messageId: string, feedback: "up" | "down" | null) => void;
  onSendFollowUp: (text: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}

const SCENARIO_CARDS: {
  id: AgentScenarioId;
  title: string;
  slash: string;
  description: string;
  badge: string;
  icon: typeof Code2Icon;
}[] = [
  {
    id: "fullstack",
    title: "Full-Stack Code",
    slash: "/code",
    description:
      "Plans tasks, writes SQLite/React hooks, streams terminal & tests, and emits code artifacts.",
    badge: "Plan + Artifact",
    icon: Code2Icon,
  },
  {
    id: "research",
    title: "Research & Citations",
    slash: "/research",
    description:
      "Queries Tomo specs, compares CRDT architectures, and renders inline hover citations.",
    badge: "Citations",
    icon: BookOpenIcon,
  },
  {
    id: "approval",
    title: "HIL Approval & Question",
    slash: "/approval",
    description:
      "Asks structured user choices via ask_user and pauses on destructive git_push gates.",
    badge: "Human-in-Loop",
    icon: ShieldCheckIcon,
  },
  {
    id: "debug",
    title: "Debug & Diagnostics",
    slash: "/debug",
    description:
      "Captures stack traces, reproduces in sandbox, runs test suites, and yields a patch diff.",
    badge: "Trace + Diff",
    icon: BugIcon,
  },
  {
    id: "generative-media",
    title: "Generative UI & Voice",
    slash: "/preview",
    description:
      "Renders interactive Web/JSX previews, SVG diagrams, and synthesized WAV voice narration.",
    badge: "Media + Audio",
    icon: SparklesIcon,
  },
  {
    id: "workflow",
    title: "Multi-Agent Workflow",
    slash: "/workflow",
    description:
      "Coordinates Planner, Implementer, and QA subagents with a live React Flow telemetry DAG.",
    badge: "React Flow",
    icon: WorkflowIcon,
  },
];

const FALLBACK_SUGGESTIONS = [
  "/code Scaffold a Yjs offline status hook",
  "/research Compare Yjs CRDT vs OT conflict resolution",
  "/workflow Orchestrate Planner -> Builder -> QA",
  "/preview Generate telemetry UI & voice narration",
];

function buildMarkdownFilename(title: string): string {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "tomo-agent-chat"}.md`;
}

export function AgentConversationView({
  sessionTitle,
  messages,
  status,
  error,
  personaState,
  personaVariant,
  transportMode,
  showTimestamps,
  checkpoints,
  sessionSuggestions,
  hasTourSession,
  getBranchInfoForMessage,
  onLaunchScenario,
  onJumpToTour,
  onClearError,
  onRetryLast,
  onApproveTool,
  onDenyTool,
  onSubmitQuestion,
  onRegenerate,
  onEditUserMessage,
  onSwitchBranch,
  onRestoreCheckpoint,
  onOpenArtifact,
  onOpenWorkflowTab,
  onFeedback,
  onSendFollowUp,
  onInsertToDoc,
}: AgentConversationViewProps) {
  const isStreaming = status === "streaming";
  const isSubmitted = status === "submitted";
  const isBusy = isStreaming || isSubmitted;
  const effectiveSuggestions =
    sessionSuggestions.length > 0 ? sessionSuggestions : FALLBACK_SUGGESTIONS;

  return (
    <Conversation className="min-h-0 flex-1">
      {messages.length > 0 && (
        <ConversationDownload
          aria-label="Download conversation markdown"
          className="top-3 right-3 z-10 size-8 bg-background/90 shadow-xs backdrop-blur-xs"
          filename={buildMarkdownFilename(sessionTitle)}
          messages={messages}
          title="Export conversation (.md)"
        />
      )}

      <ConversationContent className="mx-auto w-full max-w-4xl min-w-0 gap-4 px-2.5 py-3">
        {messages.length === 0 ? (
          <ConversationEmptyState className="min-h-[260px] px-1 py-3">
            <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col items-center gap-3.5">
              <div className="flex flex-col items-center gap-2 text-center">
                <AgentPersonaOrb
                  size="md"
                  state={personaState}
                  variant={personaVariant}
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">
                      Tomo AI Workspace Studio
                    </h2>
                    <Badge
                      className="px-1.5 py-0 text-[10px]"
                      variant={transportMode === "http" ? "default" : "secondary"}
                    >
                      {transportMode === "http" ? "Live API" : "Mock Stream"}
                    </Badge>
                  </div>
                  <p className="mx-auto max-w-lg text-[11px] leading-relaxed text-muted-foreground">
                    Type{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      @
                    </code>{" "}
                    to pin Docs/Canvases,{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      /
                    </code>{" "}
                    for slash commands, or pick a scenario below.
                  </p>
                </div>

                {hasTourSession && (
                  <Button
                    className="h-7 gap-1.5 rounded-full px-3 text-xs"
                    onClick={onJumpToTour}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <CompassIcon className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">Open Agent Tour (23 Parts)</span>
                    <ArrowRightIcon className="size-3 shrink-0" />
                  </Button>
                )}
              </div>

              <div className="agent-scenario-grid">
                {SCENARIO_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      className="group flex min-w-0 flex-col justify-between gap-1.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-xs transition-all hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      key={card.id}
                      onClick={() => onLaunchScenario(card.id)}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icon className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground">
                              {card.title}
                            </div>
                          </div>
                        </div>
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {card.slash}
                        </code>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {card.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </ConversationEmptyState>
        ) : (
          <>
            {messages.map((message, index) => (
              <AgentMessageItem
                branchInfo={getBranchInfoForMessage(message.id)}
                checkpoints={checkpoints}
                isLastMessage={index === messages.length - 1}
                isStreaming={isStreaming && index === messages.length - 1}
                key={message.id}
                message={message}
                onApproveTool={onApproveTool}
                onDenyTool={onDenyTool}
                onEditUserMessage={onEditUserMessage}
                onFeedback={onFeedback}
                onInsertToDoc={onInsertToDoc}
                onOpenArtifact={onOpenArtifact}
                onOpenWorkflowTab={onOpenWorkflowTab}
                onRegenerate={onRegenerate}
                onRestoreCheckpoint={onRestoreCheckpoint}
                onSendFollowUp={onSendFollowUp}
                onSubmitQuestion={onSubmitQuestion}
                onSwitchBranch={onSwitchBranch}
                showTimestamp={showTimestamps}
              />
            ))}

            {isSubmitted && (
              <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <AgentPersonaOrb
                  size="xs"
                  state="thinking"
                  variant={personaVariant}
                />
                <Shimmer className="text-xs font-medium" duration={1.8}>
                  Planning steps and preparing workspace tools...
                </Shimmer>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon className="size-4" />
                <AlertTitle className="text-xs font-semibold">
                  Agent Transport Error
                </AlertTitle>
                <AlertDescription className="mt-1 flex w-full flex-col gap-2 text-xs">
                  <p>{error.message || "The agent stream encountered an error."}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="h-7 gap-1 text-xs"
                      onClick={onRetryLast}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <RotateCwIcon className="size-3" />
                      Retry
                    </Button>
                    <Button
                      className="h-7 gap-1 text-xs"
                      onClick={onClearError}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3" />
                      Clear
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {!isBusy && effectiveSuggestions.length > 0 && (
              <div className="pt-1">
                <Suggestions>
                  {effectiveSuggestions.map((item) => (
                    <Suggestion
                      key={item}
                      onClick={(suggestionText) => onSendFollowUp(suggestionText)}
                      suggestion={item}
                    />
                  ))}
                </Suggestions>
              </div>
            )}
          </>
        )}
      </ConversationContent>

      <ConversationScrollButton aria-label="Scroll to latest message" />
    </Conversation>
  );
}
