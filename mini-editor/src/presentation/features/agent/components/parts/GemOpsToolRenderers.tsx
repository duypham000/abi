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
import { getStatusBadge } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentToolPart } from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { getToolName, type DynamicToolUIPart } from "ai";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClipboardListIcon,
  FileCheck2Icon,
  FileCode2Icon,
  FileTextIcon,
  HelpCircleIcon,
  ListChecksIcon,
  Loader2Icon,
  MinusCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useAgentStore } from "../../store/agentStore";
import { AgentCodeBlock, CommandSnippetCard } from "./DevOpsPartsRenderer";

export type GemOpsSupportedToolPart = AgentToolPart | DynamicToolUIPart;

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function extractPathBasename(rawPath?: string): string {
  if (!rawPath || typeof rawPath !== "string") return "";
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function extractFirstMarkdownHeading(markdown?: string): string | null {
  if (!markdown || typeof markdown !== "string") return null;
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^#{1,3}\s+(.+)$/.exec(trimmed);
    if (match) {
      return match[1].replace(/[*_`]/g, "").trim();
    }
    break;
  }
  return null;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  mdx: "mdx",
  py: "python",
  go: "go",
  rs: "rust",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "zsh",
  ps1: "powershell",
  yml: "yaml",
  yaml: "yaml",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  toml: "toml",
  diff: "diff",
  patch: "diff",
};

export function inferLanguageFromPath(rawPath?: string): string {
  const base = extractPathBasename(rawPath);
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === base.length - 1) return "typescript";
  const ext = base.slice(dotIdx + 1).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? "typescript";
}

export function isArtifactWriteFile(input: unknown): boolean {
  const rec = asRecord(input);
  if (!rec) return false;
  if (asRecord(rec.ArtifactMetadata)) return true;
  const rawPath = typeof rec.Path === "string" ? rec.Path : typeof rec.path === "string" ? rec.path : "";
  const base = extractPathBasename(rawPath);
  return /^(implementation_plan|walkthrough|task)\.md$/i.test(base);
}

export function hasMeaningfulOutput(output: unknown): boolean {
  if (output === undefined || output === null) return false;
  if (typeof output === "string") return output.trim().length > 0;
  if (Array.isArray(output)) return output.length > 0;
  const rec = asRecord(output);
  if (!rec) return true;
  const keys = Object.keys(rec);
  if (keys.length === 0) return false;
  if (keys.length === 1 && keys[0] === "status" && rec.status === "completed") {
    return false;
  }
  return true;
}

export function formatToolDisplayInfo(
  toolName: string,
  input?: unknown,
  fallbackTitle?: string
): { title: string; badge?: string } {
  const rec = asRecord(input);
  const summary =
    rec && typeof rec.toolSummary === "string" && rec.toolSummary.trim()
      ? rec.toolSummary.trim()
      : null;

  let mcpAction: string | undefined;
  if (toolName.startsWith("mcp_")) {
    const rest = toolName.slice(4);
    const sepIdx = rest.indexOf("_");
    mcpAction = sepIdx >= 0 ? rest.slice(sepIdx + 1) : rest;
  }

  if (summary) {
    return {
      title: summary,
      badge: mcpAction ?? (toolName !== "acp_tool" ? toolName : undefined),
    };
  }

  let cleanedFallback = (fallbackTitle ?? "").trim();
  if (/^Run\s+/i.test(cleanedFallback)) {
    cleanedFallback = cleanedFallback.replace(/^Run\s+/i, "").trim();
  }

  if (mcpAction) {
    const readable = mcpAction.replace(/_/g, " ");
    return {
      title: cleanedFallback && cleanedFallback !== toolName ? cleanedFallback : readable,
      badge: mcpAction,
    };
  }

  return {
    title: cleanedFallback || toolName,
  };
}

const COMMAND_WRAPPER_RE =
  /^(?:Created At:[^\n]*\n)?(?:Completed At:[^\n]*\n)?Command exited with code -?\d+\.\s*\r?\n\r?\nCommand output:\r?\n?/i;

export function cleanCommandOutput(raw: string): string {
  return raw.replace(COMMAND_WRAPPER_RE, "").trimEnd();
}

// ---------------------------------------------------------------------------
// 1. AskQuestionCard (ask_question & ask_user)
// ---------------------------------------------------------------------------

export interface NormalizedOption {
  value: string;
  label: string;
  description?: string;
  recommended: boolean;
}

export interface NormalizedQuestion {
  prompt: string;
  description?: string;
  multiSelect: boolean;
  options: NormalizedOption[];
}

function parseRecommendedOption(raw: string): { label: string; recommended: boolean } {
  const match = /^\(Recommended\)\s*(.+)$/i.exec(raw.trim());
  if (match) {
    return { label: match[1].trim(), recommended: true };
  }
  return { label: raw.trim(), recommended: false };
}

export function normalizeQuestionList(input: unknown): NormalizedQuestion[] {
  const rec = asRecord(input);
  if (!rec) return [];

  // GemOps ask_question: { questions: [{ question, options, is_multi_select, description }] }
  if (Array.isArray(rec.questions)) {
    const out: NormalizedQuestion[] = [];
    for (const item of rec.questions) {
      const qRec = asRecord(item);
      if (!qRec || typeof qRec.question !== "string" || !qRec.question.trim()) {
        continue;
      }
      const rawOpts = Array.isArray(qRec.options) ? qRec.options : [];
      const options: NormalizedOption[] = [];
      for (const opt of rawOpts) {
        if (typeof opt === "string" && opt.trim()) {
          const parsed = parseRecommendedOption(opt);
          options.push({
            value: opt.trim(),
            label: parsed.label,
            recommended: parsed.recommended,
          });
        } else {
          const optRec = asRecord(opt);
          if (optRec && typeof optRec.label === "string") {
            const parsed = parseRecommendedOption(optRec.label);
            options.push({
              value:
                typeof optRec.value === "string" && optRec.value.trim()
                  ? optRec.value.trim()
                  : optRec.label.trim(),
              label: parsed.label,
              description:
                typeof optRec.description === "string"
                  ? optRec.description
                  : undefined,
              recommended: parsed.recommended,
            });
          }
        }
      }
      out.push({
        prompt: qRec.question.trim(),
        description:
          typeof qRec.description === "string" ? qRec.description : undefined,
        multiSelect: Boolean(qRec.is_multi_select),
        options,
      });
    }
    return out;
  }

  // Legacy ask_user: { question, description, selectionMode, options: [{ value, label, description }] }
  if (typeof rec.question === "string" && rec.question.trim()) {
    const rawOpts = Array.isArray(rec.options) ? rec.options : [];
    const options: NormalizedOption[] = [];
    for (const opt of rawOpts) {
      const optRec = asRecord(opt);
      if (optRec && typeof optRec.label === "string") {
        const parsed = parseRecommendedOption(optRec.label);
        options.push({
          value:
            typeof optRec.value === "string" && optRec.value.trim()
              ? optRec.value.trim()
              : optRec.label.trim(),
          label: parsed.label,
          description:
            typeof optRec.description === "string"
              ? optRec.description
              : undefined,
          recommended: parsed.recommended,
        });
      } else if (typeof opt === "string" && opt.trim()) {
        const parsed = parseRecommendedOption(opt);
        options.push({
          value: opt.trim(),
          label: parsed.label,
          recommended: parsed.recommended,
        });
      }
    }
    return [
      {
        prompt: rec.question.trim(),
        description:
          typeof rec.description === "string" ? rec.description : undefined,
        multiSelect: rec.selectionMode === "multiple",
        options,
      },
    ];
  }

  return [];
}

export function AskQuestionCard({
  part,
  hasFollowingUserMessage,
}: {
  part: GemOpsSupportedToolPart;
  hasFollowingUserMessage?: boolean;
}) {
  const questions = useMemo(() => normalizeQuestionList(part.input), [part.input]);

  const isAnswered =
    part.state === "output-available" ||
    part.state === "output-denied" ||
    Boolean(hasFollowingUserMessage);

  if (questions.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        <HelpCircleIcon className="size-3.5 shrink-0 text-primary" />
        <Shimmer as="span" className="text-xs" duration={1.3}>
          Preparing questions...
        </Shimmer>
      </div>
    );
  }

  const headerTitle =
    questions.length === 1
      ? questions[0].prompt
      : `Questions (${questions.length})`;

  return (
    <Collapsible
      className={cn(
        "group min-w-0 overflow-hidden rounded-lg border bg-card/60",
        !isAnswered && "border-primary/40"
      )}
      defaultOpen={false}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isAnswered ? (
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <HelpCircleIcon className="size-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {headerTitle}
          </span>
          <Badge
            className={cn(
              "shrink-0 px-1.5 py-0 text-[10px]",
              isAnswered
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-primary/15 text-primary"
            )}
            variant="secondary"
          >
            {isAnswered ? "Answered" : "Answer below ↓"}
          </Badge>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="max-h-64 space-y-3 overflow-y-auto border-t px-3 py-3">
        {questions.map((q, qIdx) => (
          <div className="space-y-1.5" key={`${qIdx}-${q.prompt}`}>
            <p className="text-xs font-medium leading-snug text-foreground">
              {questions.length > 1 ? `${qIdx + 1}. ` : ""}
              {q.prompt}
            </p>
            {q.description && (
              <p className="text-[11px] text-muted-foreground">
                {q.description}
              </p>
            )}
            {q.options.length > 0 && (
              <ul className="space-y-1 pl-1">
                {q.options.map((opt) => (
                  <li
                    className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                    key={opt.value}
                  >
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="min-w-0 flex-1 break-words">
                      {opt.label}
                      {opt.recommended ? " (Recommended)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// 2. StepsChecklistCard (update_steps)
// ---------------------------------------------------------------------------

interface NormalizedStep {
  title: string;
  status: "done" | "in_progress" | "failed" | "skipped" | "pending";
}

function normalizeStepStatus(raw: unknown): NormalizedStep["status"] {
  const val = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (val === "done" || val === "completed") return "done";
  if (val === "in_progress" || val === "running") return "in_progress";
  if (val === "failed" || val === "error" || val === "blocked") return "failed";
  if (val === "skipped") return "skipped";
  return "pending";
}

function renderStepIcon(status: NormalizedStep["status"]) {
  switch (status) {
    case "done":
      return <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />;
    case "in_progress":
      return <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin text-sky-500" />;
    case "failed":
      return <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
    case "skipped":
      return <MinusCircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />;
    default:
      return <CircleDashedIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
  }
}

export function StepsChecklistCard({
  part,
  isStreaming,
}: {
  part: GemOpsSupportedToolPart;
  isStreaming?: boolean;
}) {
  const steps = useMemo<NormalizedStep[]>(() => {
    const rec = asRecord(part.input);
    if (!rec || !Array.isArray(rec.steps)) return [];
    return rec.steps
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : "Untitled step",
        status: normalizeStepStatus(item.status),
      }));
  }, [part.input]);

  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 text-xs text-muted-foreground">
        <ListChecksIcon className="size-3.5 shrink-0 text-primary" />
        <Shimmer as="span" className="text-xs" duration={1.3}>
          Updating execution steps...
        </Shimmer>
      </div>
    );
  }

  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Collapsible
      className="group min-w-0 overflow-hidden rounded-lg border bg-card/50"
      defaultOpen
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListChecksIcon className="size-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium text-foreground">
            Execution Steps
          </span>
          <Badge className="shrink-0 font-mono text-[10px]" variant="secondary">
            {doneCount}/{steps.length}
          </Badge>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <div className="px-3 pb-1.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <CollapsibleContent className="space-y-1 px-3 pt-1 pb-2.5">
        {steps.map((step, idx) => (
          <div
            className={cn(
              "flex min-w-0 items-start gap-2 rounded-md px-2 py-1 text-xs",
              step.status === "in_progress" && "bg-sky-500/10"
            )}
            key={`${idx}-${step.title}`}
          >
            {renderStepIcon(step.status)}
            <span
              className={cn(
                "min-w-0 flex-1 break-words",
                step.status === "done"
                  ? "text-muted-foreground line-through decoration-muted-foreground/40"
                  : step.status === "in_progress"
                    ? "font-medium text-foreground"
                    : "text-foreground/90"
              )}
            >
              {step.status === "in_progress" && isStreaming ? (
                <Shimmer as="span" duration={1.3}>
                  {step.title}
                </Shimmer>
              ) : (
                step.title
              )}
            </span>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// 3. ArtifactPlanCard (write_file with ArtifactMetadata / plan / walkthrough & exit_plan_mode)
// ---------------------------------------------------------------------------

export function extractFirstPlanLine(markdown?: string): string | null {
  if (!markdown || typeof markdown !== "string") return null;
  const rawLines = markdown.split(/\r?\n/);
  let skippedFirstHeading = false;
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (!skippedFirstHeading && /^#{1,3}\s+/.test(trimmed)) {
      skippedFirstHeading = true;
      continue;
    }
    if (/^---+$/.test(trimmed)) continue;
    const cleaned = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*>]\s+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (cleaned) return cleaned;
  }
  return null;
}

export function ArtifactPlanCard({
  part,
  hasFollowingUserMessage,
  approvalNode,
  onSendFollowUp,
}: {
  part: GemOpsSupportedToolPart;
  isStreaming?: boolean;
  hasFollowingUserMessage?: boolean;
  approvalNode?: ReactNode;
  onSendFollowUp?: (prompt: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}) {
  const { openPanel } = useGoldenLayout();
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const upsertPlanDocument = useAgentStore((s) => s.upsertPlanDocument);

  const toolName = getToolName(part);
  const rec = asRecord(part.input);
  const meta = asRecord(rec?.ArtifactMetadata);

  const rawPath =
    typeof rec?.Path === "string"
      ? rec.Path
      : typeof rec?.path === "string"
        ? rec.path
        : "";
  const basename = extractPathBasename(rawPath);
  const content =
    typeof rec?.Content === "string"
      ? rec.Content
      : typeof rec?.content === "string"
        ? rec.content
        : typeof rec?.plan === "string"
          ? rec.plan
          : "";

  const requestFeedback = Boolean(meta?.RequestFeedback);
  const summary =
    typeof meta?.Summary === "string" && meta.Summary.trim()
      ? meta.Summary.trim()
      : null;

  const kind: "plan" | "walkthrough" | "artifact" =
    toolName === "exit_plan_mode" ||
    requestFeedback ||
    basename.toLowerCase().includes("plan")
      ? "plan"
      : basename.toLowerCase().includes("walkthrough")
        ? "walkthrough"
        : "artifact";

  const title =
    extractFirstMarkdownHeading(content) ??
    (kind === "plan"
      ? "Implementation Plan"
      : kind === "walkthrough"
        ? "Walkthrough"
        : basename || "Artifact");

  const firstLine = extractFirstPlanLine(content) ?? summary;

  const Icon =
    kind === "plan"
      ? ClipboardListIcon
      : kind === "walkthrough"
        ? FileCheck2Icon
        : FileTextIcon;

  const badgeLabel =
    kind === "plan" ? "Plan" : kind === "walkthrough" ? "Walkthrough" : "Artifact";

  const openPlanInTab = (openEdit = false) => {
    upsertPlanDocument({
      id: part.toolCallId,
      sessionId: activeSessionId,
      title,
      kind,
      path: rawPath || undefined,
      summary: summary ?? undefined,
      content,
      requestFeedback: requestFeedback || toolName === "exit_plan_mode",
      hasFollowingUserMessage,
      updatedAt: new Date().toISOString(),
    });
    openPanel(
      PANEL_TYPES.AGENT_PLAN,
      { id: part.toolCallId, openEdit },
      { title, singleton: true }
    );
  };

  const isActionablePlan =
    kind === "plan" && (requestFeedback || toolName === "exit_plan_mode");

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card/60 transition-colors hover:border-primary/40">
      <div
        className="cursor-pointer px-3 py-2.5 transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => openPlanInTab(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPlanInTab(false);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-xs font-semibold text-foreground">
              {title}
            </span>
            <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="secondary">
              {badgeLabel}
            </Badge>
          </div>
          <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-1 pl-5.5">
          {firstLine ? (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {firstLine}
            </p>
          ) : (
            <Shimmer as="span" className="text-[11px]" duration={1.3}>
              {`Generating ${badgeLabel.toLowerCase()}...`}
            </Shimmer>
          )}
        </div>
      </div>

      {approvalNode && <div className="border-t px-3 py-2">{approvalNode}</div>}

      <div className="flex flex-wrap items-center justify-between gap-1.5 border-t bg-muted/20 px-3 py-1.5">
        <Button
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={() => openPlanInTab(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowUpRightIcon className="size-3" />
          Mở tab
        </Button>

        {isActionablePlan && (
          <div className="flex flex-wrap items-center gap-1.5">
            {hasFollowingUserMessage ? (
              <>
                <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
                  Responded
                </Badge>
                <Button
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => openPlanInTab(true)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <RefreshCwIcon className="size-3" />
                  Replan
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => openPlanInTab(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCwIcon className="size-3" />
                  Replan
                </Button>
                {onSendFollowUp && (
                  <Button
                    className="h-6 gap-1 px-2.5 text-[11px]"
                    onClick={() => onSendFollowUp("Triển khai theo kế hoạch trên.")}
                    size="sm"
                    type="button"
                    variant="default"
                  >
                    <PlayIcon className="size-3" />
                    Process
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. FileWriteCard (non-artifact write_file & edit_file)
// ---------------------------------------------------------------------------

export function FileWriteCard({
  part,
  approvalNode,
}: {
  part: GemOpsSupportedToolPart;
  approvalNode?: ReactNode;
}) {
  const toolName = getToolName(part);
  const rec = asRecord(part.input);
  const rawPath =
    typeof rec?.Path === "string"
      ? rec.Path
      : typeof rec?.path === "string"
        ? rec.path
        : "";
  const basename = extractPathBasename(rawPath) || toolName;
  const shouldDefaultOpen =
    part.state === "approval-requested" || part.state === "output-error";

  const isEdit = toolName === "edit_file";
  const content =
    typeof rec?.Content === "string"
      ? rec.Content
      : typeof rec?.content === "string"
        ? rec.content
        : "";
  const target = typeof rec?.Target === "string" ? rec.Target : "";
  const replacement = typeof rec?.Replacement === "string" ? rec.Replacement : "";

  const diffPreview = useMemo(() => {
    if (!isEdit || (!target && !replacement)) return "";
    const removed = target
      .split(/\r?\n/)
      .map((line) => `- ${line}`)
      .join("\n");
    const added = replacement
      .split(/\r?\n/)
      .map((line) => `+ ${line}`)
      .join("\n");
    return [removed, added].filter(Boolean).join("\n");
  }, [isEdit, target, replacement]);

  return (
    <Collapsible
      className="group min-w-0 overflow-hidden rounded-lg border bg-card/50"
      defaultOpen={shouldDefaultOpen}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
          <span
            className="min-w-0 truncate font-mono text-xs font-medium text-foreground"
            title={rawPath || basename}
          >
            {basename}
          </span>
          {getStatusBadge(part.state)}
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 border-t p-3">
        {approvalNode}
        {rawPath && (
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={rawPath}>
            {rawPath}
          </div>
        )}
        {isEdit && diffPreview ? (
          <div className="max-h-72 overflow-auto rounded-md">
            <AgentCodeBlock
              allowLanguageSwitch={false}
              code={diffPreview}
              filename={basename}
              language="diff"
              showLineNumbers={false}
            />
          </div>
        ) : content ? (
          <div className="max-h-72 overflow-auto rounded-md">
            <AgentCodeBlock
              allowLanguageSwitch={false}
              code={content}
              filename={basename}
              language={inferLanguageFromPath(rawPath)}
              showLineNumbers
            />
          </div>
        ) : null}
        {part.state === "output-error" && part.errorText && (
          <div className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            {part.errorText}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// 5. CommandToolCard (run_command)
// ---------------------------------------------------------------------------

export function CommandToolCard({
  part,
  isStreaming,
  approvalNode,
}: {
  part: GemOpsSupportedToolPart;
  isStreaming?: boolean;
  approvalNode?: ReactNode;
}) {
  const inputRec = asRecord(part.input);
  const outputRec = asRecord(part.output);

  const commandLine =
    typeof inputRec?.CommandLine === "string"
      ? inputRec.CommandLine
      : typeof inputRec?.command === "string"
        ? inputRec.command
        : "";
  const summary =
    typeof inputRec?.toolSummary === "string" && inputRec.toolSummary.trim()
      ? inputRec.toolSummary.trim()
      : "";

  const exitCode =
    typeof outputRec?.exit_code === "number"
      ? outputRec.exit_code
      : typeof outputRec?.exitCode === "number"
        ? outputRec.exitCode
        : undefined;

  const rawOutput =
    typeof outputRec?.output === "string"
      ? outputRec.output
      : typeof outputRec?.stdout === "string"
        ? outputRec.stdout
        : typeof part.output === "string"
          ? part.output
          : "";

  const cleanedOutput = useMemo(
    () => (rawOutput ? cleanCommandOutput(rawOutput) : ""),
    [rawOutput]
  );

  const isRunning =
    part.state === "input-available" || part.state === "input-streaming";
  const isFailed =
    part.state === "output-error" ||
    (typeof exitCode === "number" && exitCode !== 0);
  const shouldDefaultOpen =
    part.state === "approval-requested" || isRunning || isFailed;

  const headerTitle =
    summary ||
    (commandLine.length > 64 ? `${commandLine.slice(0, 61)}...` : commandLine) ||
    "Run Command";

  return (
    <Collapsible
      className="group min-w-0 overflow-hidden rounded-lg border bg-card/50"
      defaultOpen={shouldDefaultOpen}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs font-medium text-foreground">
            {headerTitle}
          </span>
          {part.state === "output-available" && exitCode !== undefined ? (
            <Badge
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]",
                exitCode === 0
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/15 text-red-600 dark:text-red-400"
              )}
              variant="secondary"
            >
              Exit {exitCode}
            </Badge>
          ) : (
            getStatusBadge(part.state)
          )}
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 border-t p-3">
        {approvalNode}
        {commandLine && (
          <CommandSnippetCard className="h-8 text-xs" command={commandLine} prefix="$" />
        )}
        {(cleanedOutput || part.errorText) && (
          <Terminal
            isStreaming={isRunning && Boolean(isStreaming)}
            output={cleanedOutput || part.errorText || ""}
          >
            <TerminalHeader>
              <TerminalTitle className="text-xs">Output</TerminalTitle>
              <div className="flex items-center gap-2">
                <TerminalStatus>
                  <Shimmer as="span" className="text-xs" duration={1.1}>
                    Running...
                  </Shimmer>
                </TerminalStatus>
                {exitCode !== undefined && (
                  <Badge
                    className={cn(
                      "h-5 px-1.5 font-mono text-[10px]",
                      exitCode === 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    )}
                    variant="secondary"
                  >
                    exit {exitCode}
                  </Badge>
                )}
                <TerminalActions>
                  <TerminalCopyButton />
                </TerminalActions>
              </div>
            </TerminalHeader>
            <TerminalContent className="max-h-64 text-xs" />
          </Terminal>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// 6. FocusStatusPill (update_focus)
// ---------------------------------------------------------------------------

export function FocusStatusPill({ part }: { part: GemOpsSupportedToolPart }) {
  const rec = asRecord(part.input);
  const focus =
    rec && typeof rec.focus === "string" && rec.focus.trim()
      ? rec.focus.trim()
      : null;

  if (!focus) return null;

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
      <SparklesIcon className="size-3 shrink-0 text-primary" />
      <span className="truncate">{focus}</span>
    </div>
  );
}
