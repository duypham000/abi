import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import type {
  AgentUIMessagePart,
  QueueUpdateDataPart,
  SuggestionsDataPart,
  WorkflowGraphDataPart,
} from "@/core/interfaces/agent";
import { isToolUIPart } from "ai";
import {
  GitForkIcon,
  ListTodoIcon,
  NetworkIcon,
  SparklesIcon,
} from "lucide-react";
import {
  CommitCard,
  EnvVarsCard,
  FileTreeCard,
  PackageInfoCard,
  SchemaDisplayCard,
  StackTraceCard,
  TerminalCard,
  TestResultsCard,
} from "./DevOpsPartsRenderer";
import {
  ChainOfThoughtCard,
  PlanCard,
  ReasoningBlock,
  SubagentCard,
  TaskGroupCard,
} from "./ReasoningAndPlanRenderer";
import {
  AudioSpeechCard,
  CheckpointCard,
  GeneratedImageCard,
  InlineArtifactCard,
  InlineCitationsCard,
  JsxPreviewCard,
  MessageSourcesBlock,
  WebPreviewCard,
} from "./RichMediaPartsRenderer";
import { SandboxDataCard, ToolPartRenderer } from "./ToolPartRenderer";

export interface AgentPartRendererProps {
  part: AgentUIMessagePart;
  partIndex: number;
  messageId: string;
  isStreaming: boolean;
  suppressSources?: boolean;
  suppressFiles?: boolean;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
  onSubmitQuestion: (
    toolCallId: string,
    selectedValues: string[],
    text?: string
  ) => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onOpenWorkflowTab: () => void;
  onSendFollowUp: (prompt: string) => void;
}

function WorkflowGraphSummaryCard({
  data,
  onOpenWorkflowTab,
}: {
  data: WorkflowGraphDataPart;
  onOpenWorkflowTab: () => void;
}) {
  const completedCount = data.nodes.filter(
    (node) => node.status === "completed"
  ).length;
  const runningCount = data.nodes.filter(
    (node) => node.status === "running"
  ).length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 px-3.5 py-2.5 text-xs">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <GitForkIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {data.title}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>
              {completedCount}/{data.nodes.length} nodes completed
            </span>
            {runningCount > 0 && (
              <Badge className="h-4 px-1.5 text-[10px]" variant="secondary">
                {runningCount} active
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Button
        className="h-7 shrink-0 gap-1.5 text-xs"
        onClick={onOpenWorkflowTab}
        size="sm"
        type="button"
        variant="outline"
      >
        <NetworkIcon className="size-3.5" />
        View Live Graph
      </Button>
    </div>
  );
}

function QueueUpdateSummaryCard({ data }: { data: QueueUpdateDataPart }) {
  const completedCount = data.todos.filter(
    (todo) => todo.status === "completed"
  ).length;

  return (
    <Queue className="rounded-lg px-2.5 py-2 shadow-none">
      <QueueSection defaultOpen={false}>
        <QueueSectionTrigger className="px-2 py-1.5 text-xs">
          <QueueSectionLabel
            count={data.todos.length}
            icon={<ListTodoIcon className="size-3.5 text-muted-foreground" />}
            label={`Agent Tasks (${completedCount}/${data.todos.length} done)`}
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList className="mt-1.5">
            {data.todos.map((todo) => {
              const completed = todo.status === "completed";
              return (
                <QueueItem className="px-2 py-1 text-xs" key={todo.id}>
                  <div className="flex items-start gap-2">
                    <QueueItemIndicator completed={completed} />
                    <QueueItemContent completed={completed}>
                      {todo.title}
                    </QueueItemContent>
                  </div>
                  {todo.description && (
                    <QueueItemDescription completed={completed}>
                      {todo.description}
                    </QueueItemDescription>
                  )}
                </QueueItem>
              );
            })}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

function SuggestionsSummaryCard({
  data,
  onSendFollowUp,
}: {
  data: SuggestionsDataPart;
  onSendFollowUp: (prompt: string) => void;
}) {
  if (data.items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <SparklesIcon className="size-3 text-primary" />
        <span>Suggested follow-ups</span>
      </div>
      <Suggestions>
        {data.items.map((item) => (
          <Suggestion
            key={item}
            onClick={onSendFollowUp}
            suggestion={item}
          />
        ))}
      </Suggestions>
    </div>
  );
}

/**
 * Dispatches any `AgentUIMessagePart` (text, reasoning, step, source, file,
 * static/dynamic tool, or any of the 23 typed `data-*` parts) to its renderer.
 */
export function AgentPartRenderer({
  part,
  partIndex,
  messageId,
  isStreaming,
  suppressSources = true,
  suppressFiles = false,
  onApproveTool,
  onDenyTool,
  onSubmitQuestion,
  onRestoreCheckpoint,
  onOpenArtifact,
  onOpenWorkflowTab,
  onSendFollowUp,
}: AgentPartRendererProps) {
  if (isToolUIPart(part)) {
    return (
      <ToolPartRenderer
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        onSubmitQuestion={onSubmitQuestion}
        part={part}
      />
    );
  }

  switch (part.type) {
    case "text":
      return (
        <MessageResponse
          className="text-sm leading-relaxed"
          isAnimating={isStreaming && part.state !== "done"}
        >
          {part.text}
        </MessageResponse>
      );

    case "reasoning":
      return <ReasoningBlock part={part} />;

    case "step-start":
      if (partIndex === 0) return null;
      return (
        <div className="my-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <Separator className="flex-1" />
          <span>Step</span>
          <Separator className="flex-1" />
        </div>
      );

    case "source-url":
    case "source-document":
      if (suppressSources) return null;
      return <MessageSourcesBlock sources={[part]} />;

    case "file":
      if (suppressFiles) return null;
      return (
        <Attachments variant="inline">
          <Attachment data={{ ...part, id: `${messageId}-file-${partIndex}` }}>
            <AttachmentPreview />
            <AttachmentInfo showMediaType />
          </Attachment>
        </Attachments>
      );

    case "data-plan":
      return <PlanCard data={part.data} onSendFollowUp={onSendFollowUp} />;

    case "data-chain-of-thought":
      return <ChainOfThoughtCard data={part.data} />;

    case "data-task-group":
      return <TaskGroupCard data={part.data} />;

    case "data-subagent":
      return <SubagentCard data={part.data} />;

    case "data-terminal":
      return <TerminalCard data={part.data} />;

    case "data-sandbox":
      return <SandboxDataCard data={part.data} />;

    case "data-test-results":
      return <TestResultsCard data={part.data} />;

    case "data-stack-trace":
      return (
        <StackTraceCard data={part.data} onSendFollowUp={onSendFollowUp} />
      );

    case "data-file-tree":
      return <FileTreeCard data={part.data} />;

    case "data-commit":
      return <CommitCard data={part.data} />;

    case "data-schema-display":
      return <SchemaDisplayCard data={part.data} />;

    case "data-env-vars":
      return <EnvVarsCard data={part.data} />;

    case "data-package-info":
      return <PackageInfoCard data={part.data} />;

    case "data-artifact":
      return (
        <InlineArtifactCard
          data={part.data}
          onOpenArtifact={onOpenArtifact}
        />
      );

    case "data-web-preview":
      return <WebPreviewCard data={part.data} />;

    case "data-jsx-preview":
      return <JsxPreviewCard data={part.data} />;

    case "data-generated-image":
      return <GeneratedImageCard data={part.data} />;

    case "data-audio-speech":
      return <AudioSpeechCard data={part.data} />;

    case "data-inline-citations":
      return <InlineCitationsCard data={part.data} />;

    case "data-checkpoint":
      return (
        <CheckpointCard
          affectedFiles={part.data.affectedFiles}
          checkpointId={part.data.checkpointId}
          label={part.data.label}
          onRestoreCheckpoint={onRestoreCheckpoint}
          timestampIso={part.data.timestampIso}
        />
      );

    case "data-workflow-graph":
      return (
        <WorkflowGraphSummaryCard
          data={part.data}
          onOpenWorkflowTab={onOpenWorkflowTab}
        />
      );

    case "data-queue-update":
      return <QueueUpdateSummaryCard data={part.data} />;

    case "data-suggestions":
      return (
        <SuggestionsSummaryCard
          data={part.data}
          onSendFollowUp={onSendFollowUp}
        />
      );

    default:
      return null;
  }
}
