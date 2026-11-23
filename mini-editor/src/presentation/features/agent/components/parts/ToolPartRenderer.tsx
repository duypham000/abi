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

export type SupportedToolPart = AgentToolPart | DynamicToolUIPart;

export interface ToolPartRendererProps {
  part: SupportedToolPart;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
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

function ToolApprovalCard({
  part,
  toolName,
  onApproveTool,
  onDenyTool,
}: {
  part: SupportedToolPart;
  toolName: string;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
}) {
  if (!("approval" in part) || !part.approval) {
    return null;
  }

  const approval = part.approval;
  const targetSummary = summarizeApprovalTarget(part.input);

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
          onClick={() => onDenyTool(approval.id, "Denied by user")}
          variant="outline"
        >
          Deny
        </ConfirmationAction>
        <ConfirmationAction
          onClick={() => onApproveTool(approval.id, "Approved by user")}
          variant="default"
        >
          Approve &amp; Execute
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
  onApproveTool,
  onDenyTool,
}: ToolPartRendererProps) {
  const toolName = getToolName(part);
  const shouldDefaultOpen =
    part.state === "approval-requested" ||
    part.state === "input-available" ||
    part.state === "input-streaming" ||
    part.state === "output-error";

  const hasApproval = "approval" in part && Boolean(part.approval);

  return (
    <Tool className="mb-2" defaultOpen={shouldDefaultOpen}>
      {part.type === "dynamic-tool" ? (
        <ToolHeader
          state={part.state}
          title={part.title}
          toolName={part.toolName}
          type={part.type}
        />
      ) : (
        <ToolHeader state={part.state} title={part.title} type={part.type} />
      )}
      <ToolContent className="space-y-3 pt-0">
        {hasApproval && (
          <ToolApprovalCard
            onApproveTool={onApproveTool}
            onDenyTool={onDenyTool}
            part={part}
            toolName={toolName}
          />
        )}
        {part.input !== undefined && <ToolInput input={part.input} />}
        <ToolOutput
          errorText={part.state === "output-error" ? part.errorText : undefined}
          output={part.state === "output-available" ? part.output : undefined}
        />
      </ToolContent>
    </Tool>
  );
}
