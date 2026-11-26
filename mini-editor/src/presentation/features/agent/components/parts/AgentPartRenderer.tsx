import { Separator } from "@/components/ui/separator";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import type { AgentUIMessagePart } from "@/core/interfaces/agent";
import { isToolUIPart } from "ai";
import { AgentMarkdownResponse } from "../AgentDeeplinkChip";
import {
  CommitCard,
  EnvVarsCard,
  FileTreeCard,
  SchemaDisplayCard,
  StackTraceCard,
  TerminalCard,
  TestResultsCard,
} from "./DevOpsPartsRenderer";
import {
  ChainOfThoughtCard,
  PlanCard,
  ReasoningBlock,
  TaskGroupCard,
} from "./ReasoningAndPlanRenderer";
import { MessageSourcesBlock } from "./RichMediaPartsRenderer";
import { ToolPartRenderer } from "./ToolPartRenderer";

export interface AgentPartRendererProps {
  part: AgentUIMessagePart;
  partIndex: number;
  messageId: string;
  isStreaming: boolean;
  hasFollowingUserMessage?: boolean;
  suppressSources?: boolean;
  suppressFiles?: boolean;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
  onSendFollowUp?: (prompt: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}

/**
 * Dispatches supported `AgentUIMessagePart`s (text, reasoning, step-start,
 * sources, files, and dynamic/static tool parts with GemOps approvals).
 */
export function AgentPartRenderer({
  part,
  partIndex,
  messageId,
  isStreaming,
  hasFollowingUserMessage,
  suppressSources = true,
  suppressFiles = false,
  onApproveTool,
  onDenyTool,
  onSendFollowUp,
  onInsertToDoc,
}: AgentPartRendererProps) {
  if (isToolUIPart(part)) {
    return (
      <ToolPartRenderer
        hasFollowingUserMessage={hasFollowingUserMessage}
        isStreaming={isStreaming}
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        onInsertToDoc={onInsertToDoc}
        onSendFollowUp={onSendFollowUp}
        part={part}
      />
    );
  }

  switch (part.type) {
    case "text":
      return (
        <AgentMarkdownResponse
          className="text-sm leading-relaxed"
          isAnimating={isStreaming && part.state !== "done"}
        >
          {part.text}
        </AgentMarkdownResponse>
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

    case "data-task-group":
      return <TaskGroupCard data={part.data} />;

    case "data-chain-of-thought":
      return <ChainOfThoughtCard data={part.data} />;

    case "data-terminal":
      return <TerminalCard data={part.data} />;

    case "data-test-results":
      return <TestResultsCard data={part.data} />;

    case "data-stack-trace":
      return <StackTraceCard data={part.data} onSendFollowUp={onSendFollowUp} />;

    case "data-file-tree":
      return <FileTreeCard data={part.data} />;

    case "data-commit":
      return <CommitCard data={part.data} />;

    case "data-schema-display":
      return <SchemaDisplayCard data={part.data} />;

    case "data-env-vars":
      return <EnvVarsCard data={part.data} />;

    default:
      return null;
  }
}
