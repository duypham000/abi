import { MessageResponse } from "@/components/ai-elements/message";
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
import { Textarea } from "@/components/ui/textarea";
import type { AgentToolPart } from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import { getToolName, type DynamicToolUIPart } from "ai";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClipboardListIcon,
  CopyIcon,
  FileCheck2Icon,
  FileCode2Icon,
  FilePlus2Icon,
  FileTextIcon,
  HelpCircleIcon,
  ListChecksIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  MinusCircleIcon,
  PlayIcon,
  SendIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
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

interface NormalizedOption {
  value: string;
  label: string;
  description?: string;
  recommended: boolean;
}

interface NormalizedQuestion {
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

function normalizeQuestionList(input: unknown): NormalizedQuestion[] {
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
  onSendFollowUp,
}: {
  part: GemOpsSupportedToolPart;
  hasFollowingUserMessage?: boolean;
  onSendFollowUp?: (prompt: string) => void;
}) {
  const questions = useMemo(() => normalizeQuestionList(part.input), [part.input]);
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const [customNote, setCustomNote] = useState("");
  const [locallySubmitted, setLocallySubmitted] = useState(false);

  const isAnswered =
    part.state === "output-available" ||
    part.state === "output-denied" ||
    Boolean(hasFollowingUserMessage) ||
    locallySubmitted;

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

  const toggleOption = (qIdx: number, value: string, multiSelect: boolean) => {
    if (isAnswered) return;
    setSelections((prev) => {
      const current = prev[qIdx] ?? [];
      if (!multiSelect) {
        return {
          ...prev,
          [qIdx]: current.includes(value) ? [] : [value],
        };
      }
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [qIdx]: next };
    });
  };

  const hasAnySelection = Object.values(selections).some((arr) => arr.length > 0);
  const canSubmit =
    !isAnswered &&
    Boolean(onSendFollowUp) &&
    (hasAnySelection || customNote.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit || !onSendFollowUp) return;
    const lines: string[] = [];
    if (questions.length === 1) {
      const picked = selections[0] ?? [];
      if (picked.length > 0) {
        lines.push(picked.join(", "));
      }
    } else {
      questions.forEach((_q, idx) => {
        const picked = selections[idx] ?? [];
        if (picked.length > 0) {
          lines.push(`${idx + 1}. ${picked.join(", ")}`);
        } else {
          lines.push(`${idx + 1}. (Bỏ qua)`);
        }
      });
    }
    const trimmedNote = customNote.trim();
    if (trimmedNote) {
      lines.push(trimmedNote);
    }
    setLocallySubmitted(true);
    onSendFollowUp(lines.join("\n"));
  };

  const headerTitle =
    questions.length === 1
      ? questions[0].prompt
      : `Questions (${questions.length})`;

  return (
    <Collapsible
      className={cn(
        "group min-w-0 overflow-hidden rounded-lg border bg-card/60",
        !isAnswered && "border-primary/40 shadow-xs"
      )}
      defaultOpen={!isAnswered}
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
            {isAnswered ? "Answered" : "Needs Input"}
          </Badge>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 border-t px-3 py-3">
        {questions.map((q, qIdx) => {
          const picked = selections[qIdx] ?? [];
          return (
            <div className="space-y-2" key={`${qIdx}-${q.prompt}`}>
              <div className="space-y-0.5">
                <p className="text-xs font-medium leading-snug text-foreground">
                  {questions.length > 1 ? `${qIdx + 1}. ` : ""}
                  {q.prompt}
                </p>
                {q.description && (
                  <p className="text-[11px] text-muted-foreground">
                    {q.description}
                  </p>
                )}
              </div>

              {q.options.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {q.options.map((opt) => {
                    const selected = picked.includes(opt.value);
                    return (
                      <Button
                        className={cn(
                          "h-auto min-w-0 justify-start gap-2 px-2.5 py-2 text-left text-xs font-normal whitespace-normal",
                          selected && "border-primary bg-primary/10 text-foreground"
                        )}
                        disabled={isAnswered}
                        key={opt.value}
                        onClick={() =>
                          toggleOption(qIdx, opt.value, q.multiSelect)
                        }
                        type="button"
                        variant={selected ? "secondary" : "outline"}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-3.5 shrink-0 items-center justify-center border",
                            q.multiSelect ? "rounded-xs" : "rounded-full",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {selected && <CheckIcon className="size-2.5" />}
                        </span>
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="flex flex-wrap items-center gap-1.5 leading-snug">
                            <span className="break-words">{opt.label}</span>
                            {opt.recommended && (
                              <Badge
                                className="px-1 py-0 text-[9px]"
                                variant="secondary"
                              >
                                Recommended
                              </Badge>
                            )}
                          </span>
                          {opt.description && (
                            <span className="block text-[11px] text-muted-foreground">
                              {opt.description}
                            </span>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!isAnswered && (
          <div className="space-y-2 pt-1">
            <Textarea
              aria-label="Custom answer"
              className="min-h-14 resize-y bg-background text-xs"
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Hoặc nhập câu trả lời / ghi chú thêm..."
              value={customNote}
            />
            <div className="flex justify-end">
              <Button
                className="h-7 gap-1.5 px-3 text-xs"
                disabled={!canSubmit}
                onClick={handleSubmit}
                size="sm"
                type="button"
              >
                <SendIcon className="size-3" />
                Gửi câu trả lời
              </Button>
            </div>
          </div>
        )}
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

export function ArtifactPlanCard({
  part,
  hasFollowingUserMessage,
  approvalNode,
  onSendFollowUp,
  onInsertToDoc,
}: {
  part: GemOpsSupportedToolPart;
  isStreaming?: boolean;
  hasFollowingUserMessage?: boolean;
  approvalNode?: ReactNode;
  onSendFollowUp?: (prompt: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}) {
  const [expandedHeight, setExpandedHeight] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

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

  const Icon =
    kind === "plan"
      ? ClipboardListIcon
      : kind === "walkthrough"
        ? FileCheck2Icon
        : FileTextIcon;

  const badgeLabel =
    kind === "plan" ? "Plan" : kind === "walkthrough" ? "Walkthrough" : "Artifact";

  const isLong = content.length > 1200;

  const handleCopy = async () => {
    if (!content || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleInsert = () => {
    if (!content || !onInsertToDoc) return;
    onInsertToDoc(content);
    setInserted(true);
    window.setTimeout(() => setInserted(false), 1600);
  };

  return (
    <Collapsible
      className="group min-w-0 overflow-hidden rounded-lg border bg-card/60"
      defaultOpen={kind === "plan" || kind === "walkthrough"}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Icon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate text-xs font-semibold text-foreground">
            {title}
          </span>
          <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="secondary">
            {badgeLabel}
          </Badge>
          {basename && (
            <Badge
              className="agent-sm-only max-w-[140px] shrink-0 truncate font-mono text-[10px]"
              title={rawPath}
              variant="outline"
            >
              {basename}
            </Badge>
          )}
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t">
        {approvalNode && <div className="px-3 pt-2.5">{approvalNode}</div>}

        {summary && (
          <div className="border-b bg-muted/25 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {summary}
          </div>
        )}

        {content ? (
          <div
            className={cn(
              "overflow-y-auto px-3.5 py-3",
              !expandedHeight && "max-h-[420px]"
            )}
          >
            <MessageResponse className="text-xs leading-relaxed">
              {content}
            </MessageResponse>
          </div>
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            <Shimmer as="span" duration={1.3}>
              {`Generating ${badgeLabel.toLowerCase()}...`}
            </Shimmer>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {content && (
              <Button
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => void handleCopy()}
                size="sm"
                type="button"
                variant="ghost"
              >
                {copied ? (
                  <CheckIcon className="size-3 text-emerald-500" />
                ) : (
                  <CopyIcon className="size-3" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
            {content && onInsertToDoc && (
              <Button
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={handleInsert}
                size="sm"
                type="button"
                variant="ghost"
              >
                {inserted ? (
                  <CheckIcon className="size-3 text-emerald-500" />
                ) : (
                  <FilePlus2Icon className="size-3" />
                )}
                {inserted ? "Inserted" : "Insert Doc"}
              </Button>
            )}
            {isLong && (
              <Button
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => setExpandedHeight((v) => !v)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {expandedHeight ? (
                  <>
                    <Minimize2Icon className="size-3" />
                    Collapse
                  </>
                ) : (
                  <>
                    <Maximize2Icon className="size-3" />
                    Expand
                  </>
                )}
              </Button>
            )}
          </div>

          {kind === "plan" && (requestFeedback || toolName === "exit_plan_mode") && (
            hasFollowingUserMessage ? (
              <Badge className="px-2 py-0.5 text-[10px]" variant="secondary">
                Responded
              </Badge>
            ) : onSendFollowUp ? (
              <Button
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => onSendFollowUp("Triển khai theo kế hoạch trên.")}
                size="sm"
                type="button"
              >
                <PlayIcon className="size-3" />
                Triển khai
              </Button>
            ) : null
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
          <AgentCodeBlock
            allowLanguageSwitch={false}
            code={diffPreview}
            filename={basename}
            language="diff"
            showLineNumbers={false}
          />
        ) : content ? (
          <AgentCodeBlock
            allowLanguageSwitch={false}
            code={content}
            filename={basename}
            language={inferLanguageFromPath(rawPath)}
            showLineNumbers
          />
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
