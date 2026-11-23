import { Separator } from "@/components/ui/separator";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import { MessageResponse } from "@/components/ai-elements/message";
import type { AgentUIMessagePart } from "@/core/interfaces/agent";
import { isToolUIPart } from "ai";
import { ReasoningBlock } from "./ReasoningAndPlanRenderer";
import { MessageSourcesBlock } from "./RichMediaPartsRenderer";
import { ToolPartRenderer } from "./ToolPartRenderer";

export interface AgentPartRendererProps {
  part: AgentUIMessagePart;
  partIndex: number;
  messageId: string;
  isStreaming: boolean;
  suppressSources?: boolean;
  suppressFiles?: boolean;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
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
  suppressSources = true,
  suppressFiles = false,
  onApproveTool,
  onDenyTool,
}: AgentPartRendererProps) {
  if (isToolUIPart(part)) {
    return (
      <ToolPartRenderer
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
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

    default:
      return null;
  }
}
