import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
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
import { useEffect, useState } from "react";
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

function summarizeApprovalTarget(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (typeof record.command === "string" && record.command.trim()) {
    return record.command;
  }
  if (Array.isArray(record.paths) && record.paths.length > 0) {
    return record.paths.map(String).join(", ");
  }
  if (typeof record.title === "string" && record.title.trim()) {
    return record.title;
  }
  return null;
}

export function ToolApprovalCard({
  part,
  toolName,
  onApproveTool,
  onDenyTool,
}: {
  part: SupportedToolPart;
  toolName: string;
  onApproveTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onDenyTool: (approvalId: string, reason?: string) => void | Promise<void>;
}) {
  const [submittingDecision, setSubmittingDecision] = useState<
    "allow" | "deny" | null
  >(null);
  const approvalId =
    "approval" in part && part.approval ? part.approval.id : undefined;

  useEffect(() => {
    if (part.state !== "approval-requested") {
      setSubmittingDecision(null);
    }
  }, [part.state, approvalId]);

  if (!("approval" in part) || !part.approval) {
    return null;
  }

  const approval = part.approval;
  const targetSummary = summarizeApprovalTarget(part.input);

  const handleDecision = async (decision: "allow" | "deny") => {
    if (submittingDecision !== null) return;
    setSubmittingDecision(decision);
    try {
      if (decision === "allow") {
        await onApproveTool(approval.id, "Approved by user");
      } else {
        await onDenyTool(approval.id, "Denied by user");
      }
    } catch {
      setSubmittingDecision(null);
    }
  };

  return (
    <Confirmation approval={approval} state={part.state}>
      <div className="flex items-start gap-2">
        {part.state === "approval-requested" ? (
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
        ) : approval.approved ? (
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        ) : (
          <ShieldXIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        )}
        <ConfirmationTitle className="text-xs leading-relaxed">
          <ConfirmationRequest>
            Allow <span className="font-mono font-semibold">{toolName}</span>
            {targetSummary ? (
              <>
                {" "}
                on{" "}
                <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {targetSummary}
                </span>
              </>
            ) : null}
            ?
          </ConfirmationRequest>
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

      <ConfirmationActions>
        <ConfirmationAction
          disabled={submittingDecision !== null}
          onClick={() => void handleDecision("deny")}
          variant="outline"
        >
          {submittingDecision === "deny" ? "Denying…" : "Deny"}
        </ConfirmationAction>
        <ConfirmationAction
          disabled={submittingDecision !== null}
          onClick={() => void handleDecision("allow")}
          variant="default"
        >
          {submittingDecision === "allow" ? "Approving…" : "Approve & Execute"}
        </ConfirmationAction>
      </ConfirmationActions>
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
        onSendFollowUp={onSendFollowUp}
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
    part.state === "approval-requested" ||
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
