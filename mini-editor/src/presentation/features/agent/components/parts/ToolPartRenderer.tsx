import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { AgentToolPart } from "@/core/interfaces/agent";
import { getToolName, type DynamicToolUIPart } from "ai";
import { ShieldAlertIcon, ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import {
  ArtifactPlanCard,
  AskQuestionCard,
  CommandToolCard,
  FileWriteCard,
  FocusStatusPill,
  StepsChecklistCard,
  formatToolDisplayInfo,
  hasMeaningfulOutput,
  isArtifactWriteFile,
} from "./GemOpsToolRenderers";
import {
  ToolDeeplinkButton,
  extractToolDeeplinkTarget,
} from "../AgentDeeplinkChip";

export type SupportedToolPart = AgentToolPart | DynamicToolUIPart;

export interface ToolPartRendererProps {
  part: SupportedToolPart;
  isStreaming?: boolean;
  hasFollowingUserMessage?: boolean;
  onApproveTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onDenyTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onSendFollowUp?: (prompt: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}

export function ToolApprovalCard({
  part,
  toolName,
}: {
  part: SupportedToolPart;
  toolName: string;
  onApproveTool?: (approvalId: string, reason?: string) => void | Promise<void>;
  onDenyTool?: (approvalId: string, reason?: string) => void | Promise<void>;
}) {
  if (!("approval" in part) || !part.approval) {
    return null;
  }

  const approval = part.approval;

  if (part.state === "approval-requested") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
        <ShieldAlertIcon className="size-3.5 shrink-0 text-amber-500" />
        <span className="min-w-0 flex-1 truncate">
          Awaiting approval in action bar below
        </span>
      </div>
    );
  }

  return (
    <Confirmation approval={approval} state={part.state}>
      <div className="flex items-start gap-2">
        {approval.approved ? (
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        ) : (
          <ShieldXIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        )}
        <ConfirmationTitle className="text-xs leading-relaxed">
          <ConfirmationAccepted>
            Approved{" "}
            <span className="font-mono font-medium">{toolName}</span>
            {approval.reason ? ` — ${approval.reason}` : "."}
          </ConfirmationAccepted>
          <ConfirmationRejected>
            Denied{" "}
            <span className="font-mono font-medium">{toolName}</span>
            {approval.reason ? ` — ${approval.reason}` : "."}
          </ConfirmationRejected>
        </ConfirmationTitle>
      </div>
    </Confirmation>
  );
}

/**
 * Renders static `tool-*` and `dynamic-tool` UIMessage parts with GemOps approval controls.
 */
export function ToolPartRenderer({
  part,
  isStreaming,
  hasFollowingUserMessage,
  onApproveTool,
  onDenyTool,
  onSendFollowUp,
  onInsertToDoc,
}: ToolPartRendererProps) {
  const toolName = getToolName(part);
  const hasApproval = "approval" in part && Boolean(part.approval);
  const approvalNode = hasApproval ? (
    <ToolApprovalCard
      onApproveTool={onApproveTool}
      onDenyTool={onDenyTool}
      part={part}
      toolName={toolName}
    />
  ) : null;

  if (toolName === "ask_question" || toolName === "ask_user") {
    return (
      <AskQuestionCard
        hasFollowingUserMessage={hasFollowingUserMessage}
        part={part}
      />
    );
  }

  if (toolName === "update_steps") {
    return <StepsChecklistCard isStreaming={isStreaming} part={part} />;
  }

  if (toolName === "run_command") {
    return (
      <CommandToolCard
        approvalNode={approvalNode}
        isStreaming={isStreaming}
        part={part}
      />
    );
  }

  if (
    toolName === "exit_plan_mode" ||
    (toolName === "write_file" && isArtifactWriteFile(part.input))
  ) {
    return (
      <ArtifactPlanCard
        approvalNode={approvalNode}
        hasFollowingUserMessage={hasFollowingUserMessage}
        isStreaming={isStreaming}
        onInsertToDoc={onInsertToDoc}
        onSendFollowUp={onSendFollowUp}
        part={part}
      />
    );
  }

  if (toolName === "write_file" || toolName === "edit_file") {
    return <FileWriteCard approvalNode={approvalNode} part={part} />;
  }

  if (toolName === "update_focus") {
    return <FocusStatusPill part={part} />;
  }

  const shouldDefaultOpen =
    part.state === "input-available" ||
    part.state === "input-streaming" ||
    part.state === "output-error";

  const { title: displayTitle, badge: toolBadge } = formatToolDisplayInfo(
    toolName,
    part.input,
    part.title
  );
  const resolvedHeaderTitle =
    toolBadge && displayTitle !== toolBadge
      ? `${displayTitle} · ${toolBadge}`
      : displayTitle;

  const showOutput =
    part.state === "output-error" ||
    (part.state === "output-available" && hasMeaningfulOutput(part.output));

  const deeplinkTarget = extractToolDeeplinkTarget(
    toolName,
    part.input,
    part.state === "output-available" ? part.output : undefined
  );

  return (
    <Tool className="mb-2" defaultOpen={shouldDefaultOpen}>
      {part.type === "dynamic-tool" ? (
        <ToolHeader
          state={part.state}
          title={resolvedHeaderTitle}
          toolName={part.toolName}
          type={part.type}
        />
      ) : (
        <ToolHeader
          state={part.state}
          title={resolvedHeaderTitle}
          type={part.type}
        />
      )}
      <ToolContent className="space-y-3 pt-0">
        {deeplinkTarget && (
          <div className="flex items-center justify-end px-3 pt-2">
            <ToolDeeplinkButton target={deeplinkTarget} />
          </div>
        )}
        {approvalNode}
        {part.input !== undefined && <ToolInput input={part.input} />}
        {showOutput && (
          <ToolOutput
            errorText={part.state === "output-error" ? part.errorText : undefined}
            output={part.state === "output-available" ? part.output : undefined}
          />
        )}
      </ToolContent>
    </Tool>
  );
}
