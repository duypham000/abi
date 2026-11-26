import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { insertMarkdownSnippet, isAgentDeeplinkHref, openAgentDeeplinkFromHref } from "@/infrastructure/agent";
import { AgentDeeplinkChip } from "../components/AgentDeeplinkChip";
import { cn } from "@/lib/utils";
import { getToolName, isToolUIPart } from "ai";
import {
  CheckIcon,
  ClipboardListIcon,
  CopyIcon,
  FileCheck2Icon,
  FilePlus2Icon,
  FileTextIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PencilLineIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  asRecord,
  extractFirstMarkdownHeading,
  extractPathBasename,
} from "../components/parts/GemOpsToolRenderers";
import { useAgentStore, type AgentPlanDocument } from "../store/agentStore";

export interface AgentPlanPageProps {
  panelMode?: boolean;
  planIdProp?: string;
  initialEditOpen?: boolean;
}

interface PlanLineComment {
  id: string;
  startLine: number;
  endLine: number;
  text: string;
  createdAt: string;
}

interface ActiveDraftComment {
  draftKey: string;
  anchorLine: number;
  startLine: number;
  endLine: number;
  startInput: string;
  endInput: string;
  text: string;
  editingId?: string;
}

interface LineMeta {
  inCodeBlock: boolean;
  isFenceLine: boolean;
  isCodeStart?: boolean;
  isCodeEnd?: boolean;
  codeLang?: string;
  isTableHeader?: boolean;
  isTableSeparator?: boolean;
  isTableRow?: boolean;
  tableCells?: string[];
}

let commentSeq = 0;

function nextCommentId(prefix = "plc"): string {
  commentSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${commentSeq}`;
}

function formatLineRangeLabel(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}–L${endLine}`;
}

function clampLine(val: number, maxLine: number): number {
  if (!Number.isFinite(val)) return 1;
  return Math.max(1, Math.min(Math.max(1, maxLine), Math.round(val)));
}

function parseDraftRange(
  draft: ActiveDraftComment,
  maxLine: number
): { startLine: number; endLine: number } {
  const parsedStart = Number.parseInt(draft.startInput, 10);
  const parsedEnd = Number.parseInt(draft.endInput, 10);
  const rawStart = Number.isFinite(parsedStart) ? parsedStart : draft.startLine;
  const rawEnd = Number.isFinite(parsedEnd) ? parsedEnd : draft.endLine;
  const a = clampLine(rawStart, maxLine);
  const b = clampLine(rawEnd, maxLine);
  return {
    startLine: Math.min(a, b),
    endLine: Math.max(a, b),
  };
}

function isTableSeparatorLine(trimmed: string): boolean {
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
}

function parseTableCells(trimmed: string): string[] {
  const stripped = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return stripped.split("|").map((cell) => cell.trim());
}

function computeLineMetas(lines: string[]): LineMeta[] {
  let inFence = false;
  const metas: LineMeta[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) {
      if (!inFence) {
        inFence = true;
        metas.push({
          inCodeBlock: true,
          isFenceLine: true,
          isCodeStart: true,
          codeLang: trimmed.slice(3).trim() || undefined,
        });
      } else {
        inFence = false;
        metas.push({
          inCodeBlock: true,
          isFenceLine: true,
          isCodeEnd: true,
        });
      }
      continue;
    }

    if (inFence) {
      metas.push({ inCodeBlock: true, isFenceLine: false });
      continue;
    }

    if (trimmed.includes("|") && trimmed.startsWith("|")) {
      if (isTableSeparatorLine(trimmed)) {
        metas.push({
          inCodeBlock: false,
          isFenceLine: false,
          isTableSeparator: true,
        });
        continue;
      }
      const nextTrimmed = lines[i + 1]?.trim() ?? "";
      const isHeader = isTableSeparatorLine(nextTrimmed);
      metas.push({
        inCodeBlock: false,
        isFenceLine: false,
        isTableHeader: isHeader,
        isTableRow: !isHeader,
        tableCells: parseTableCells(trimmed),
      });
      continue;
    }

    metas.push({ inCodeBlock: false, isFenceLine: false });
  }

  return metas;
}

function renderInlineMarkdown(text: string): ReactNode {
  if (!text) return "\u00A0";
  const tokenRe =
    /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    keyIdx += 1;
    if (token.startsWith("`") && token.endsWith("`")) {
      const inner = token.slice(1, -1);
      const codeRefMatch = /^(?:docs\/)?(doc-\d+)(?:#L(\d+)(?:-L?(\d+))?)?$|^(?:canvases\/)?(canvas-\d+)(?:#([A-Za-z0-9_-]+))?$/i.exec(inner.trim());
      if (codeRefMatch) {
        const href = codeRefMatch[1]
          ? `tomo://doc/${codeRefMatch[1]}${codeRefMatch[2] ? `?line=${codeRefMatch[2]}${codeRefMatch[3] ? `-${codeRefMatch[3]}` : ""}` : ""}`
          : `tomo://canvas/${codeRefMatch[4]}${codeRefMatch[5] ? `?element=${codeRefMatch[5]}` : ""}`;
        parts.push(
          <AgentDeeplinkChip className="font-mono text-[12px]" href={href} key={keyIdx}>
            {inner}
          </AgentDeeplinkChip>
        );
      } else {
        parts.push(
          <code
            className="rounded-sm border border-border/50 bg-muted/75 px-1.5 py-0.5 font-mono text-[12.5px] text-primary"
            key={keyIdx}
          >
            {inner}
          </code>
        );
      }
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong className="font-semibold text-foreground" key={keyIdx}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push(
        <del className="text-muted-foreground line-through" key={keyIdx}>
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em className="italic" key={keyIdx}>
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const href = linkMatch[2].trim();
        if (isAgentDeeplinkHref(href)) {
          parts.push(
            <AgentDeeplinkChip href={href} key={keyIdx}>
              {linkMatch[1]}
            </AgentDeeplinkChip>
          );
        } else {
          parts.push(
            <button
              className="cursor-pointer font-medium text-primary underline decoration-primary/40 underline-offset-3"
              key={keyIdx}
              onClick={() => {
                if (/^https?:\/\//i.test(href) && typeof window !== "undefined") {
                  window.open(href, "_blank", "noopener,noreferrer");
                } else {
                  void openAgentDeeplinkFromHref(href);
                }
              }}
              title={href}
              type="button"
            >
              {linkMatch[1]}
            </button>
          );
        }
      } else {
        parts.push(token);
      }
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? parts : text;
}

function renderFormattedLine(line: string, meta: LineMeta): ReactNode {
  if (meta.isCodeStart) {
    return (
      <div className="mt-1.5 flex items-center justify-between rounded-t-lg border-x border-t bg-muted/60 px-3 py-1 font-mono text-[11px] text-muted-foreground">
        <span>{meta.codeLang ?? "code"}</span>
      </div>
    );
  }
  if (meta.isCodeEnd) {
    return (
      <div className="mb-1.5 h-2 rounded-b-lg border-x border-b bg-muted/35" />
    );
  }
  if (meta.inCodeBlock) {
    return (
      <div className="border-x bg-muted/35 px-3 py-0.5 font-mono text-[12.5px] leading-6 text-foreground/90 whitespace-pre-wrap break-words">
        {line || "\u00A0"}
      </div>
    );
  }

  if (meta.isTableSeparator) {
    return <div className="border-b border-border/70" />;
  }
  if ((meta.isTableHeader || meta.isTableRow) && meta.tableCells) {
    return (
      <div
        className={cn(
          "grid grid-flow-col auto-cols-fr border-x border-b text-[13px] leading-6",
          meta.isTableHeader
            ? "rounded-t-md border-t bg-muted/50 font-semibold text-foreground"
            : "bg-background/50 text-foreground/90"
        )}
      >
        {meta.tableCells.map((cell, cIdx) => (
          <div
            className={cn(
              "min-w-0 px-3 py-1.5 break-words",
              cIdx > 0 && "border-l border-border/60"
            )}
            key={cIdx}
          >
            {renderInlineMarkdown(cell)}
          </div>
        ))}
      </div>
    );
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return <div className="h-3" />;
  }

  if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
    return <hr className="my-3 border-border/60" />;
  }

  const h1 = /^#\s+(.+)$/.exec(trimmed);
  if (h1) {
    return (
      <h1 className="pt-3 pb-1 text-2xl font-bold tracking-tight text-foreground">
        {renderInlineMarkdown(h1[1])}
      </h1>
    );
  }

  const h2 = /^##\s+(.+)$/.exec(trimmed);
  if (h2) {
    return (
      <h2 className="mt-2 border-b border-border/50 pt-2.5 pb-1 text-lg font-semibold tracking-tight text-foreground">
        {renderInlineMarkdown(h2[1])}
      </h2>
    );
  }

  const h3 = /^###\s+(.+)$/.exec(trimmed);
  if (h3) {
    return (
      <h3 className="pt-2 pb-0.5 text-base font-semibold text-foreground">
        {renderInlineMarkdown(h3[1])}
      </h3>
    );
  }

  const h4 = /^#{4,6}\s+(.+)$/.exec(trimmed);
  if (h4) {
    return (
      <h4 className="pt-1.5 text-sm font-semibold text-foreground/90">
        {renderInlineMarkdown(h4[1])}
      </h4>
    );
  }

  const bq = /^>\s?(.*)$/.exec(trimmed);
  if (bq) {
    return (
      <blockquote className="rounded-r-md border-l-3 border-primary/50 bg-muted/30 px-3.5 py-1 text-[14px] leading-6 italic text-muted-foreground">
        {renderInlineMarkdown(bq[1])}
      </blockquote>
    );
  }

  const taskMatch = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line);
  if (taskMatch) {
    const indentPx = Math.min(40, Math.floor(taskMatch[1].length / 2) * 18);
    const checked = taskMatch[2].toLowerCase() === "x";
    return (
      <div
        className="flex items-start gap-2.5 text-[15px] leading-7 text-foreground/95"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <span
          className={cn(
            "mt-1.5 flex size-4 shrink-0 items-center justify-center rounded-xs border",
            checked
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground/45 bg-background"
          )}
        >
          {checked && <CheckIcon className="size-3" />}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 break-words",
            checked && "text-muted-foreground line-through"
          )}
        >
          {renderInlineMarkdown(taskMatch[3])}
        </span>
      </div>
    );
  }

  const ulMatch = /^(\s*)[-*+]\s+(.+)$/.exec(line);
  if (ulMatch) {
    const indentPx = Math.min(40, Math.floor(ulMatch[1].length / 2) * 18);
    return (
      <div
        className="flex items-start gap-2.5 text-[15px] leading-7 text-foreground/95"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <span className="mt-3 size-1.5 shrink-0 rounded-full bg-foreground/55" />
        <span className="min-w-0 flex-1 break-words">
          {renderInlineMarkdown(ulMatch[2])}
        </span>
      </div>
    );
  }

  const olMatch = /^(\s*)(\d+\.)\s+(.+)$/.exec(line);
  if (olMatch) {
    const indentPx = Math.min(40, Math.floor(olMatch[1].length / 2) * 18);
    return (
      <div
        className="flex items-start gap-2.5 text-[15px] leading-7 text-foreground/95"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <span className="min-w-5 shrink-0 font-medium text-muted-foreground">
          {olMatch[2]}
        </span>
        <span className="min-w-0 flex-1 break-words">
          {renderInlineMarkdown(olMatch[3])}
        </span>
      </div>
    );
  }

  return (
    <p className="text-[15px] leading-7 text-foreground/95 break-words">
      {renderInlineMarkdown(line)}
    </p>
  );
}

export function AgentPlanPage({
  planIdProp,
  initialEditOpen = false,
}: AgentPlanPageProps) {
  const storedPlan = useAgentStore((s) =>
    planIdProp ? s.planDocuments[planIdProp] : undefined
  );
  const sessions = useAgentStore((s) => s.sessions);

  const planDoc = useMemo<AgentPlanDocument | null>(() => {
    if (storedPlan) return storedPlan;
    if (!planIdProp) return null;

    for (const session of sessions) {
      for (let mIdx = session.messages.length - 1; mIdx >= 0; mIdx -= 1) {
        const msg = session.messages[mIdx];
        if (msg.role !== "assistant") continue;
        const hasFollowingUser = session.messages
          .slice(mIdx + 1)
          .some((m) => m.role === "user");

        for (const part of msg.parts) {
          if (!isToolUIPart(part)) continue;
          if (part.toolCallId !== planIdProp) continue;
          const toolName = getToolName(part);
          if (toolName !== "write_file" && toolName !== "exit_plan_mode") {
            continue;
          }
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
          const requestFeedback =
            Boolean(meta?.RequestFeedback) || toolName === "exit_plan_mode";
          const kind: AgentPlanDocument["kind"] =
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

          return {
            id: planIdProp,
            sessionId: session.id,
            title,
            kind,
            path: rawPath || undefined,
            summary:
              typeof meta?.Summary === "string" && meta.Summary.trim()
                ? meta.Summary.trim()
                : undefined,
            content,
            requestFeedback,
            hasFollowingUserMessage: hasFollowingUser,
            updatedAt: session.updatedAt,
          };
        }
      }
    }
    return null;
  }, [storedPlan, planIdProp, sessions]);

  const [comments, setComments] = useState<PlanLineComment[]>([]);
  const [activeDraft, setActiveDraft] = useState<ActiveDraftComment | null>(
    null
  );
  const [dragAnchorLine, setDragAnchorLine] = useState<number | null>(null);
  const [dragHoverLine, setDragHoverLine] = useState<number | null>(null);
  const [lastClickedLine, setLastClickedLine] = useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(Boolean(initialEditOpen));
  const [editFeedback, setEditFeedback] = useState("");
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [actionSent, setActionSent] = useState<"process" | "replan" | null>(
    null
  );

  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const generalFeedbackRef = useRef<HTMLTextAreaElement | null>(null);

  const lines = useMemo(
    () => (planDoc?.content ? planDoc.content.split(/\r?\n/) : []),
    [planDoc?.content]
  );

  const lineMetas = useMemo(() => computeLineMetas(lines), [lines]);

  useEffect(() => {
    setComments([]);
    setActiveDraft(null);
    setDragAnchorLine(null);
    setDragHoverLine(null);
    setLastClickedLine(null);
    setEditFeedback("");
    setIsEditOpen(Boolean(initialEditOpen));
  }, [planIdProp, initialEditOpen]);

  // Focus textarea ONLY when opening a new draft (draftKey changes), never while editing line inputs
  useEffect(() => {
    if (activeDraft?.draftKey) {
      window.setTimeout(() => draftTextareaRef.current?.focus(), 30);
    }
  }, [activeDraft?.draftKey]);

  useEffect(() => {
    if (isEditOpen) {
      window.setTimeout(() => generalFeedbackRef.current?.focus(), 30);
    }
  }, [isEditOpen]);

  // Finalize mouse drag selection across line numbers
  useEffect(() => {
    if (dragAnchorLine === null) return;
    const handleMouseUp = () => {
      const anchor = dragAnchorLine;
      const hover = dragHoverLine ?? anchor;
      const startLine = Math.min(anchor, hover);
      const endLine = Math.max(anchor, hover);
      setDragAnchorLine(null);
      setDragHoverLine(null);
      setLastClickedLine(endLine);
      setActiveDraft((prev) => ({
        draftKey: prev?.draftKey ?? nextCommentId("draft"),
        anchorLine: endLine,
        startLine,
        endLine,
        startInput: String(startLine),
        endInput: String(endLine),
        text: prev?.editingId ? "" : (prev?.text ?? ""),
      }));
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragAnchorLine, dragHoverLine]);

  if (!planDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <ClipboardListIcon className="size-8 opacity-40" />
        <p className="text-sm font-medium text-foreground">
          Không tìm thấy nội dung Plan
        </p>
        <p className="max-w-sm text-xs">
          Plan này có thể đã bị xóa hoặc phiên làm việc chưa được tải.
        </p>
      </div>
    );
  }

  const basename = extractPathBasename(planDoc.path);
  const Icon =
    planDoc.kind === "plan"
      ? ClipboardListIcon
      : planDoc.kind === "walkthrough"
        ? FileCheck2Icon
        : FileTextIcon;

  const badgeLabel =
    planDoc.kind === "plan"
      ? "Plan"
      : planDoc.kind === "walkthrough"
        ? "Walkthrough"
        : "Artifact";

  const openDraftForRange = (
    start: number,
    end: number,
    initialText = "",
    editingId?: string
  ) => {
    const s = clampLine(Math.min(start, end), Math.max(1, lines.length));
    const e = clampLine(Math.max(start, end), Math.max(1, lines.length));
    setActiveDraft({
      draftKey: nextCommentId("draft"),
      anchorLine: e,
      startLine: s,
      endLine: e,
      startInput: String(s),
      endInput: String(e),
      text: initialText,
      editingId,
    });
  };

  const commitDraftLineInputs = () => {
    setActiveDraft((prev) => {
      if (!prev) return null;
      const { startLine, endLine } = parseDraftRange(prev, lines.length);
      return {
        ...prev,
        anchorLine: endLine,
        startLine,
        endLine,
        startInput: String(startLine),
        endInput: String(endLine),
      };
    });
  };

  const handleSaveDraft = () => {
    if (!activeDraft) return;
    const trimmed = activeDraft.text.trim();
    if (!trimmed) return;
    const { startLine, endLine } = parseDraftRange(activeDraft, lines.length);

    if (activeDraft.editingId) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === activeDraft.editingId
            ? { ...c, startLine, endLine, text: trimmed }
            : c
        )
      );
    } else {
      setComments((prev) => [
        ...prev,
        {
          id: nextCommentId("plc"),
          startLine,
          endLine,
          text: trimmed,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    setActiveDraft(null);
  };

  const handleLineNumberMouseDown = (
    lineNum: number,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    if (e.shiftKey && lastClickedLine !== null) {
      openDraftForRange(lastClickedLine, lineNum);
      setLastClickedLine(lineNum);
      return;
    }
    setDragAnchorLine(lineNum);
    setDragHoverLine(lineNum);
  };

  const dragRange =
    dragAnchorLine !== null
      ? {
          start: Math.min(dragAnchorLine, dragHoverLine ?? dragAnchorLine),
          end: Math.max(dragAnchorLine, dragHoverLine ?? dragAnchorLine),
        }
      : null;

  const activeDraftPreviewRange = activeDraft
    ? parseDraftRange(activeDraft, lines.length)
    : null;

  const isLineInActiveRange = (lineNum: number) => {
    if (dragRange && lineNum >= dragRange.start && lineNum <= dragRange.end) {
      return true;
    }
    if (
      activeDraftPreviewRange &&
      lineNum >= activeDraftPreviewRange.startLine &&
      lineNum <= activeDraftPreviewRange.endLine
    ) {
      return true;
    }
    return false;
  };

  const isLineCoveredByComment = (lineNum: number) =>
    comments.some((c) => lineNum >= c.startLine && lineNum <= c.endLine);

  const collectAllCommentsForSubmit = (): PlanLineComment[] => {
    const all = [...comments];
    if (activeDraft && activeDraft.text.trim()) {
      const { startLine, endLine } = parseDraftRange(activeDraft, lines.length);
      if (activeDraft.editingId) {
        const idx = all.findIndex((c) => c.id === activeDraft.editingId);
        if (idx >= 0) {
          all[idx] = {
            ...all[idx],
            startLine,
            endLine,
            text: activeDraft.text.trim(),
          };
        }
      } else {
        all.push({
          id: nextCommentId("plc"),
          startLine,
          endLine,
          text: activeDraft.text.trim(),
          createdAt: new Date().toISOString(),
        });
      }
    }
    return all.sort(
      (a, b) => a.startLine - b.startLine || a.endLine - b.endLine
    );
  };

  const formatCommentsSection = (items: PlanLineComment[]): string => {
    return items
      .map((c, idx) => {
        const label = formatLineRangeLabel(c.startLine, c.endLine);
        if (c.startLine === c.endLine) {
          const lineText = (lines[c.startLine - 1] ?? "").trim();
          return `${idx + 1}. [${label}] "${lineText}"\n   -> ${c.text}`;
        }
        const snippet = lines
          .slice(c.startLine - 1, c.endLine)
          .map((l, offset) => `   > L${c.startLine + offset}: ${l}`)
          .join("\n");
        return `${idx + 1}. [${label}]:\n${snippet}\n   -> ${c.text}`;
      })
      .join("\n\n");
  };

  const dispatchToAgent = (prompt: string, kind: "process" | "replan") => {
    const store = useAgentStore.getState();
    if (
      planDoc.sessionId &&
      store.sessions.some((s) => s.id === planDoc.sessionId)
    ) {
      store.selectSession(planDoc.sessionId);
    }
    store.requestAskAI({
      prompt,
      autoSubmit: true,
      sourceView: "doc",
    });
    setActionSent(kind);
    window.setTimeout(() => setActionSent(null), 2400);
  };

  const handleReplan = () => {
    const allComments = collectAllCommentsForSubmit();
    const trimmedGeneral = editFeedback.trim();

    if (allComments.length === 0 && !trimmedGeneral) {
      setIsEditOpen(true);
      return;
    }

    const parts: string[] = [`Cập nhật lại plan "${planDoc.title}":`];
    if (allComments.length > 0) {
      parts.push(
        `Danh sách comment theo dòng (${allComments.length}):\n\n${formatCommentsSection(allComments)}`
      );
    }
    if (trimmedGeneral) {
      parts.push(`Ghi chú chung:\n${trimmedGeneral}`);
    }

    dispatchToAgent(parts.join("\n\n"), "replan");
    setComments([]);
    setActiveDraft(null);
    setEditFeedback("");
    setIsEditOpen(false);
  };

  const handleProcess = () => {
    const allComments = collectAllCommentsForSubmit();
    const trimmedGeneral = editFeedback.trim();

    if (allComments.length > 0 || trimmedGeneral) {
      const parts: string[] = [
        `Triển khai kế hoạch "${planDoc.title}" với các lưu ý sau:`,
      ];
      if (allComments.length > 0) {
        parts.push(formatCommentsSection(allComments));
      }
      if (trimmedGeneral) {
        parts.push(`Ghi chú chung:\n${trimmedGeneral}`);
      }
      dispatchToAgent(parts.join("\n\n"), "process");
      setComments([]);
      setActiveDraft(null);
      setEditFeedback("");
      setIsEditOpen(false);
      return;
    }

    dispatchToAgent("Triển khai theo kế hoạch trên.", "process");
  };

  const handleCopy = async () => {
    if (
      !planDoc.content ||
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(planDoc.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleInsertToDoc = async () => {
    if (!planDoc.content) return;
    await insertMarkdownSnippet(planDoc.content);
    setInserted(true);
    window.setTimeout(() => setInserted(false), 1600);
  };

  const totalPendingComments =
    comments.length + (activeDraft?.text.trim() && !activeDraft.editingId ? 1 : 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Compact Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate text-xs font-semibold text-foreground">
            {planDoc.title}
          </span>
          <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="secondary">
            {badgeLabel}
          </Badge>
          {basename && (
            <Badge
              className="hidden max-w-[180px] shrink-0 truncate font-mono text-[10px] sm:inline-flex"
              title={planDoc.path}
              variant="outline"
            >
              {basename}
            </Badge>
          )}
          <Badge
            className="shrink-0 font-mono text-[10px] text-muted-foreground"
            variant="outline"
          >
            {lines.length} lines
          </Badge>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => void handleCopy()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {copied ? (
              <CheckIcon className="size-3.5 text-emerald-500" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {copied ? "Copied" : "Copy"}
            </span>
          </Button>

          <Button
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => void handleInsertToDoc()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {inserted ? (
              <CheckIcon className="size-3.5 text-emerald-500" />
            ) : (
              <FilePlus2Icon className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {inserted ? "Inserted" : "Insert Doc"}
            </span>
          </Button>
        </div>
      </header>

      {/* Docs-Style Document Canvas */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-[820px] px-4 py-6 sm:px-8">
          {/* Document Hero Header */}
          <div className="mb-5 space-y-2.5 border-b border-border/60 pb-4 pl-14">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {planDoc.title}
            </h1>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                Hover vào dòng để nhấn <strong>+</strong> thêm comment, hoặc kéo / giữ{" "}
                <kbd className="rounded border px-1">Shift</kbd> + click số dòng để chọn nhiều dòng.
              </span>
              {comments.length > 0 && (
                <span className="font-medium text-primary">
                  {comments.length} comment sẵn sàng gửi
                </span>
              )}
            </div>
            {planDoc.summary && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-[13px] leading-relaxed text-foreground/85">
                {planDoc.summary}
              </div>
            )}
          </div>

          {/* Document Lines with Subtle Docs Margin Gutter */}
          <div className="space-y-0">
            {lines.map((line, idx) => {
              const lineNum = idx + 1;
              const meta = lineMetas[idx] ?? {
                inCodeBlock: false,
                isFenceLine: false,
              };
              const inSelection = isLineInActiveRange(lineNum);
              const hasComment = isLineCoveredByComment(lineNum);
              const endingComments = comments.filter(
                (c) => c.endLine === lineNum
              );
              const showDraftHere =
                activeDraft !== null && activeDraft.anchorLine === lineNum;

              return (
                <div key={lineNum}>
                  <div
                    className={cn(
                      "group flex items-start rounded-r-md border-l-2 transition-colors",
                      inSelection
                        ? "border-primary bg-primary/10"
                        : hasComment
                          ? "border-amber-500/70 bg-amber-500/8"
                          : "border-transparent hover:bg-muted/30"
                    )}
                    onMouseEnter={() => {
                      if (dragAnchorLine !== null) {
                        setDragHoverLine(lineNum);
                      }
                    }}
                  >
                    {/* Hover + Add Comment Button + Subtle Line Number */}
                    <div className="flex w-14 shrink-0 items-center justify-end gap-1 py-1 pr-2.5 pl-0.5 select-none">
                      <button
                        aria-label={`Add comment on line ${lineNum}`}
                        className="flex size-4 items-center justify-center rounded bg-primary text-primary-foreground opacity-0 shadow-xs transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDraftForRange(lineNum, lineNum);
                        }}
                        title={`Thêm comment cho dòng ${lineNum}`}
                        type="button"
                      >
                        <PlusIcon className="size-3" />
                      </button>
                      <button
                        className={cn(
                          "min-w-6 cursor-pointer text-right font-mono text-[11px] transition-colors group-hover:text-muted-foreground/80 hover:text-primary",
                          inSelection
                            ? "font-semibold text-primary"
                            : hasComment
                              ? "font-medium text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground/35"
                        )}
                        onMouseDown={(e) => handleLineNumberMouseDown(lineNum, e)}
                        title="Click hoặc kéo để chọn nhiều dòng"
                        type="button"
                      >
                        {lineNum}
                      </button>
                    </div>

                    {/* Docs-Styled Line Content */}
                    <div className="min-w-0 flex-1 pr-2">
                      {renderFormattedLine(line, meta)}
                    </div>
                  </div>

                  {/* Saved Inline Comments ending on this line */}
                  {endingComments.length > 0 && (
                    <div className="my-2 ml-14 space-y-2 rounded-lg border bg-muted/25 p-3">
                      {endingComments.map((c) => (
                        <div
                          className="flex items-start justify-between gap-2 rounded-md border bg-card p-3 shadow-xs"
                          key={c.id}
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                className="px-1.5 py-0 font-mono text-[10px]"
                                variant="secondary"
                              >
                                {formatLineRangeLabel(c.startLine, c.endLine)}
                              </Badge>
                            </div>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                              {c.text}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              aria-label="Edit comment"
                              className="size-6"
                              onClick={() =>
                                openDraftForRange(
                                  c.startLine,
                                  c.endLine,
                                  c.text,
                                  c.id
                                )
                              }
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <PencilIcon className="size-3" />
                            </Button>
                            <Button
                              aria-label="Delete comment"
                              className="size-6 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setComments((prev) =>
                                  prev.filter((item) => item.id !== c.id)
                                )
                              }
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2Icon className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {!showDraftHere && (
                        <div className="flex justify-start">
                          <Button
                            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                            onClick={() =>
                              openDraftForRange(
                                endingComments[0].startLine,
                                endingComments[0].endLine
                              )
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <MessageSquarePlusIcon className="size-3" />
                            Thêm comment nữa cho{" "}
                            {formatLineRangeLabel(
                              endingComments[0].startLine,
                              endingComments[0].endLine
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Active Inline Comment Draft Box */}
                  {showDraftHere && activeDraft && activeDraftPreviewRange && (
                    <div className="my-2 ml-14 rounded-lg border border-primary/35 bg-card p-3 shadow-xs">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <MessageSquarePlusIcon className="size-3.5 text-primary" />
                            <span>
                              {activeDraft.editingId
                                ? "Chỉnh sửa comment"
                                : "Comment cho"}{" "}
                              <span className="font-mono text-primary">
                                {formatLineRangeLabel(
                                  activeDraftPreviewRange.startLine,
                                  activeDraftPreviewRange.endLine
                                )}
                              </span>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>Từ dòng</span>
                            <Input
                              aria-label="Start line"
                              className="h-6 w-14 px-1.5 font-mono text-[11px]"
                              inputMode="numeric"
                              onBlur={commitDraftLineInputs}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, "");
                                setActiveDraft((prev) =>
                                  prev ? { ...prev, startInput: raw } : null
                                );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitDraftLineInputs();
                                }
                              }}
                              type="text"
                              value={activeDraft.startInput}
                            />
                            <span>đến</span>
                            <Input
                              aria-label="End line"
                              className="h-6 w-14 px-1.5 font-mono text-[11px]"
                              inputMode="numeric"
                              onBlur={commitDraftLineInputs}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, "");
                                setActiveDraft((prev) =>
                                  prev ? { ...prev, endInput: raw } : null
                                );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitDraftLineInputs();
                                }
                              }}
                              type="text"
                              value={activeDraft.endInput}
                            />
                          </div>
                        </div>

                        <Textarea
                          aria-label="Line comment"
                          className="min-h-16 max-h-36 resize-y bg-background text-xs"
                          onChange={(e) =>
                            setActiveDraft((prev) =>
                              prev ? { ...prev, text: e.target.value } : null
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setActiveDraft(null);
                            } else if (
                              e.key === "Enter" &&
                              (e.ctrlKey || e.metaKey)
                            ) {
                              e.preventDefault();
                              handleSaveDraft();
                            }
                          }}
                          placeholder="Nhập nội dung góp ý / chỉnh sửa cho dòng này (Ctrl/Cmd + Enter để lưu)..."
                          ref={draftTextareaRef}
                          value={activeDraft.text}
                        />

                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            className="h-7 px-2.5 text-xs"
                            onClick={() => setActiveDraft(null)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Hủy
                          </Button>
                          <Button
                            className="h-7 px-3 text-xs"
                            disabled={!activeDraft.text.trim()}
                            onClick={handleSaveDraft}
                            size="sm"
                            type="button"
                          >
                            {activeDraft.editingId ? "Cập nhật" : "Lưu comment"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* General Plan-Level Feedback Drawer */}
      {isEditOpen && (
        <div className="shrink-0 border-t bg-card/95 px-4 py-3">
          <div className="mx-auto max-w-[820px] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <PencilLineIcon className="size-3.5 text-primary" />
                <span>Ghi chú chỉnh sửa chung cho toàn bộ Plan</span>
              </div>
              <Button
                aria-label="Close general feedback"
                className="size-6"
                onClick={() => setIsEditOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
            <Textarea
              aria-label="General plan revision notes"
              className="min-h-16 max-h-36 resize-y bg-background text-xs"
              onChange={(e) => setEditFeedback(e.target.value)}
              placeholder="Nhập yêu cầu chỉnh sửa tổng thể (sẽ gửi kèm cùng toàn bộ comment theo dòng khi nhấn Replan hoặc Process)..."
              ref={generalFeedbackRef}
              value={editFeedback}
            />
          </div>
        </div>
      )}

      {/* Sticky Footer */}
      <footer className="shrink-0 border-t bg-card/80 px-4 py-2.5">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setIsEditOpen((v) => !v)}
              size="sm"
              type="button"
              variant={isEditOpen ? "secondary" : "outline"}
            >
              <PencilLineIcon className="size-3.5" />
              Nhập chỉnh sửa
            </Button>

            {totalPendingComments > 0 && (
              <div className="flex items-center gap-1">
                <Badge className="px-2 py-0.5 text-[11px]" variant="secondary">
                  {totalPendingComments} comment
                </Badge>
                {comments.length > 0 && (
                  <Button
                    className="h-6 px-1.5 text-[11px] text-muted-foreground"
                    onClick={() => setComments([])}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Xóa hết
                  </Button>
                )}
              </div>
            )}

            {actionSent && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                {actionSent === "replan"
                  ? "Đã gửi yêu cầu Replan tới Agent"
                  : "Đã gửi lệnh Process tới Agent"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={handleReplan}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCwIcon className="size-3.5" />
              Replan
              {totalPendingComments > 0 ? ` (${totalPendingComments})` : ""}
            </Button>
            <Button
              className="h-8 gap-1.5 px-3.5 text-xs"
              onClick={handleProcess}
              size="sm"
              type="button"
              variant="default"
            >
              <PlayIcon className="size-3.5" />
              Process
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AgentPlanPage;
