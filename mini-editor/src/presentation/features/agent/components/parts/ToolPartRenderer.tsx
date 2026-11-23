import { Badge } from "@/components/ui/badge";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
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
  Question,
  QuestionActions,
  QuestionDescription,
  QuestionInput,
  QuestionOption,
  QuestionOptions,
  QuestionPrompt,
  QuestionSubmit,
} from "@/components/ai-elements/question";
import {
  Sandbox,
  SandboxContent,
  SandboxHeader,
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
} from "@/components/ai-elements/sandbox";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { AgentToolPart, SandboxDataPart } from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  FileCode2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldXIcon,
} from "lucide-react";
import { toBundledLanguage } from "./DevOpsPartsRenderer";

export type SupportedToolPart = AgentToolPart | DynamicToolUIPart;

export interface ToolPartRendererProps {
  part: SupportedToolPart;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
  onSubmitQuestion: (
    toolCallId: string,
    selectedValues: string[],
    text?: string
  ) => void;
}

interface SandboxPanelProps {
  title: string;
  language: string;
  code: string;
  output: string;
  state: ToolUIPart["state"];
  error?: string;
  exitCode?: number;
  defaultTab?: "code" | "output";
}

function SandboxPanel({
  title,
  language,
  code,
  output,
  state,
  error,
  exitCode,
  defaultTab = "code",
}: SandboxPanelProps) {
  const bundledLang = toBundledLanguage(language);
  const isRunning = state === "input-streaming" || state === "input-available";
  const combinedOutput = error
    ? output
      ? `${output}\n${error}`
      : error
    : output;

  return (
    <Sandbox>
      <SandboxHeader state={state} title={title} />
      <SandboxContent>
        <SandboxTabs defaultValue={defaultTab}>
          <SandboxTabsBar className="justify-between px-2">
            <SandboxTabsList>
              <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
              <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
            </SandboxTabsList>
            <div className="flex items-center gap-1.5 pr-1">
              <Badge className="font-mono text-[10px]" variant="outline">
                {language || "typescript"}
              </Badge>
              {exitCode !== undefined && (
                <Badge
                  className={cn(
                    "font-mono text-[10px]",
                    exitCode === 0
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/15 text-red-600 dark:text-red-400"
                  )}
                  variant="secondary"
                >
                  exit {exitCode}
                </Badge>
              )}
            </div>
          </SandboxTabsBar>

          <SandboxTabContent value="code">
            <CodeBlock
              className="rounded-none border-0"
              code={code}
              language={bundledLang}
              showLineNumbers
            >
              <CodeBlockHeader>
                <CodeBlockTitle>
                  <FileCode2Icon className="size-3.5" />
                  <CodeBlockFilename>{language || "code"}</CodeBlockFilename>
                </CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton />
                </CodeBlockActions>
              </CodeBlockHeader>
            </CodeBlock>
          </SandboxTabContent>

          <SandboxTabContent value="output">
            <Terminal
              className="rounded-none border-0"
              isStreaming={isRunning}
              output={combinedOutput || (isRunning ? "" : "(no output)")}
            >
              <TerminalHeader>
                <TerminalTitle>Sandbox Output</TerminalTitle>
                <div className="flex items-center gap-2">
                  <TerminalStatus>
                    <Shimmer as="span" className="text-xs" duration={1.1}>
                      Executing...
                    </Shimmer>
                  </TerminalStatus>
                  <TerminalActions>
                    <TerminalCopyButton />
                  </TerminalActions>
                </div>
              </TerminalHeader>
              <TerminalContent className="max-h-64 text-xs" />
            </Terminal>
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  );
}

/**
 * Renders `data-sandbox` parts with paired CodeBlock + Terminal tabs.
 */
export function SandboxDataCard({ data }: { data: SandboxDataPart }) {
  const defaultTab =
    data.state === "output-available" || data.state === "output-error"
      ? "output"
      : "code";

  return (
    <SandboxPanel
      code={data.code}
      defaultTab={defaultTab}
      error={data.error}
      language={data.language}
      output={data.output}
      state={data.state}
      title={data.title}
    />
  );
}

function summarizeApprovalTarget(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (typeof record.branch === "string") {
    const remote =
      typeof record.remote === "string" ? `${record.remote}/` : "";
    return `${remote}${record.branch}`;
  }
  if (typeof record.migrationFile === "string") {
    return record.migrationFile;
  }
  if (typeof record.command === "string") {
    return record.command;
  }
  if (typeof record.docId === "string" || typeof record.docId === "number") {
    return `doc #${String(record.docId)}`;
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

function AskUserToolCard({
  part,
  onSubmitQuestion,
}: {
  part: Extract<AgentToolPart, { type: "tool-ask_user" }>;
  onSubmitQuestion: (
    toolCallId: string,
    selectedValues: string[],
    text?: string
  ) => void;
}) {
  if (part.state === "input-streaming") {
    return (
      <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <Shimmer as="span" className="text-xs font-medium" duration={1.1}>
          Preparing interactive question...
        </Shimmer>
        {part.input?.question && (
          <p className="font-medium text-foreground">{part.input.question}</p>
        )}
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <Tool defaultOpen>
        <ToolHeader state={part.state} title={part.title} type={part.type} />
        <ToolContent>
          <ToolOutput errorText={part.errorText} output={undefined} />
        </ToolContent>
      </Tool>
    );
  }

  if (part.state === "output-available") {
    const selectedLabelMap = new Map(
      part.input.options.map((opt) => [opt.value, opt.label])
    );
    const selectedDisplay = part.output.selectedValues.map(
      (val) => selectedLabelMap.get(val) ?? val
    );

    return (
      <Question
        className="bg-card/60"
        disabled
        selectionMode={part.input.selectionMode}
        value={{
          selectedValues: part.output.selectedValues,
          text: part.output.text ?? "",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <QuestionPrompt>{part.input.question}</QuestionPrompt>
            {part.input.description && (
              <QuestionDescription className="text-xs">
                {part.input.description}
              </QuestionDescription>
            )}
          </div>
          <Badge
            className="shrink-0 gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            variant="secondary"
          >
            <CheckCircle2Icon className="size-3" />
            Answered
          </Badge>
        </div>

        {part.input.options.length > 0 && (
          <QuestionOptions>
            {part.input.options.map((opt) => (
              <QuestionOption
                className="px-3 py-1.5 text-xs"
                key={opt.value}
                size="sm"
                value={opt.value}
              >
                {opt.label}
              </QuestionOption>
            ))}
          </QuestionOptions>
        )}

        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {selectedDisplay.length > 0 && (
            <div>
              Selected:{" "}
              <span className="font-medium text-foreground">
                {selectedDisplay.join(", ")}
              </span>
            </div>
          )}
          {part.output.text && (
            <div className="mt-1">
              Note:{" "}
              <span className="text-foreground">{part.output.text}</span>
            </div>
          )}
        </div>
      </Question>
    );
  }

  if (part.state === "input-available") {
    return (
      <Question
        className="border-primary/25 bg-card shadow-xs"
        onSubmit={(response) => {
          onSubmitQuestion(
            part.toolCallId,
            [...response.selectedValues],
            response.text
          );
        }}
        selectionMode={part.input.selectionMode}
      >
        <div className="space-y-1">
          <QuestionPrompt>{part.input.question}</QuestionPrompt>
          {part.input.description && (
            <QuestionDescription className="text-xs">
              {part.input.description}
            </QuestionDescription>
          )}
        </div>

        <QuestionOptions>
          {part.input.options.map((opt) => (
            <QuestionOption
              className="px-3 py-2 text-left"
              key={opt.value}
              value={opt.value}
            >
              <div className="flex flex-col items-start gap-0.5 text-left">
                <span className="text-xs font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="text-[11px] font-normal opacity-75">
                    {opt.description}
                  </span>
                )}
              </div>
            </QuestionOption>
          ))}
        </QuestionOptions>

        {part.input.allowCustomInput && (
          <QuestionInput
            className="min-h-16 text-xs"
            placeholder={
              part.input.placeholder ??
              "Add optional notes or custom response..."
            }
          />
        )}

        <QuestionActions>
          <QuestionSubmit size="sm">Submit Answer</QuestionSubmit>
        </QuestionActions>
      </Question>
    );
  }

  return (
    <Tool defaultOpen>
      <ToolHeader state={part.state} title={part.title} type={part.type} />
      <ToolContent>
        <ToolInput input={part.input} />
      </ToolContent>
    </Tool>
  );
}

function ExecuteSandboxToolCard({
  part,
  onApproveTool,
  onDenyTool,
}: {
  part: Extract<AgentToolPart, { type: "tool-execute_sandbox" }>;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
}) {
  const language = part.input?.language ?? "typescript";
  const code = part.input?.code ?? "";
  let output = "";
  let error: string | undefined;
  let exitCode: number | undefined;

  if (part.state === "output-available") {
    output = part.output.stdout;
    error = part.output.stderr;
    exitCode = part.output.exitCode;
  } else if (part.state === "output-error") {
    error = part.errorText;
  }

  return (
    <div className="space-y-2">
      <SandboxPanel
        code={code}
        defaultTab={
          part.state === "output-available" || part.state === "output-error"
            ? "output"
            : "code"
        }
        error={error}
        exitCode={exitCode}
        language={language}
        output={output}
        state={part.state}
        title={part.title ?? `Sandbox (${language})`}
      />
      <ToolApprovalCard
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        part={part}
        toolName="execute_sandbox"
      />
    </div>
  );
}

/**
 * Renders static `tool-*` and `dynamic-tool` UIMessage parts, with specialized
 * interactive experiences for `ask_user`, `execute_sandbox`, and tool approvals.
 */
export function ToolPartRenderer({
  part,
  onApproveTool,
  onDenyTool,
  onSubmitQuestion,
}: ToolPartRendererProps) {
  if (part.type === "tool-ask_user") {
    return (
      <AskUserToolCard
        onSubmitQuestion={onSubmitQuestion}
        part={part}
      />
    );
  }

  if (part.type === "tool-execute_sandbox") {
    return (
      <ExecuteSandboxToolCard
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        part={part}
      />
    );
  }

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
