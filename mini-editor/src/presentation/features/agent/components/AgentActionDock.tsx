import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentUIMessage } from "@/core/interfaces/agent";
import type { AgentBackendPendingApproval } from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import { getToolName, isToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  HelpCircleIcon,
  SendIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  asRecord,
  formatToolDisplayInfo,
  normalizeQuestionList,
  type NormalizedQuestion,
} from "./parts/GemOpsToolRenderers";

export interface AgentActionDockProps {
  sessionId: string;
  messages: AgentUIMessage[];
  pendingBackendApprovals?: AgentBackendPendingApproval[];
  onApproveTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onDenyTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onSendFollowUp: (prompt: string) => void;
}

interface PendingApprovalItem {
  id: string;
  toolName: string;
  displayTitle: string;
  targetSummary: string | null;
}

interface PendingQuestionItem {
  toolCallId: string;
  questions: NormalizedQuestion[];
}

function summarizeTarget(input: unknown): string | null {
  const rec = asRecord(input);
  if (!rec) return null;
  if (typeof rec.CommandLine === "string" && rec.CommandLine.trim()) {
    return rec.CommandLine.trim();
  }
  if (typeof rec.command === "string" && rec.command.trim()) {
    return rec.command.trim();
  }
  if (Array.isArray(rec.paths) && rec.paths.length > 0) {
    return rec.paths.map(String).join(", ");
  }
  if (typeof rec.Path === "string" && rec.Path.trim()) {
    return rec.Path.trim();
  }
  if (typeof rec.path === "string" && rec.path.trim()) {
    return rec.path.trim();
  }
  if (typeof rec.title === "string" && rec.title.trim()) {
    return rec.title.trim();
  }
  return null;
}

export function AgentActionDock({
  sessionId,
  messages,
  pendingBackendApprovals,
  onApproveTool,
  onDenyTool,
  onSendFollowUp,
}: AgentActionDockProps) {
  const [approvalIdx, setApprovalIdx] = useState(0);
  const [submittingDecisions, setSubmittingDecisions] = useState<
    Record<string, "allow" | "deny">
  >({});

  const [questionStep, setQuestionStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const [customNote, setCustomNote] = useState("");
  const [isQuestionCollapsed, setIsQuestionCollapsed] = useState(false);
  const [submittedToolCallIds, setSubmittedToolCallIds] = useState<
    Record<string, boolean>
  >({});

  const pendingApprovals = useMemo<PendingApprovalItem[]>(() => {
    const items: PendingApprovalItem[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.state !== "approval-requested") continue;
        if (!("approval" in part) || !part.approval?.id) continue;
        const id = part.approval.id;
        if (seen.has(id)) continue;
        seen.add(id);

        const toolName = getToolName(part);
        const { title } = formatToolDisplayInfo(toolName, part.input, part.title);
        items.push({
          id,
          toolName,
          displayTitle: title,
          targetSummary: summarizeTarget(part.input),
        });
      }
    }

    for (const backendItem of pendingBackendApprovals ?? []) {
      if (!backendItem?.id || seen.has(backendItem.id)) continue;
      seen.add(backendItem.id);
      const toolName = backendItem.name || backendItem.kind || "tool";
      const target =
        backendItem.command?.trim() ||
        (backendItem.paths && backendItem.paths.length > 0
          ? backendItem.paths.join(", ")
          : null);
      items.push({
        id: backendItem.id,
        toolName,
        displayTitle: backendItem.title || toolName,
        targetSummary: target,
      });
    }

    return items;
  }, [messages, pendingBackendApprovals]);

  const pendingQuestion = useMemo<PendingQuestionItem | null>(() => {
    if (messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return null;

    for (let i = lastMsg.parts.length - 1; i >= 0; i -= 1) {
      const part = lastMsg.parts[i];
      if (!isToolUIPart(part)) continue;
      const toolName = getToolName(part);
      if (toolName !== "ask_question" && toolName !== "ask_user") continue;
      if (
        part.state === "output-available" ||
        part.state === "output-denied" ||
        submittedToolCallIds[part.toolCallId]
      ) {
        return null;
      }
      const questions = normalizeQuestionList(part.input);
      if (questions.length === 0) return null;
      return {
        toolCallId: part.toolCallId,
        questions,
      };
    }

    return null;
  }, [messages, submittedToolCallIds]);

  const activeQuestionKey = pendingQuestion?.toolCallId ?? "";

  useEffect(() => {
    setApprovalIdx(0);
    setSubmittingDecisions({});
    setQuestionStep(0);
    setSelections({});
    setCustomNote("");
    setIsQuestionCollapsed(false);
    setSubmittedToolCallIds({});
  }, [sessionId]);

  useEffect(() => {
    setQuestionStep(0);
    setSelections({});
    setCustomNote("");
    setIsQuestionCollapsed(false);
  }, [activeQuestionKey]);

  useEffect(() => {
    if (approvalIdx >= pendingApprovals.length && pendingApprovals.length > 0) {
      setApprovalIdx(pendingApprovals.length - 1);
    }
  }, [approvalIdx, pendingApprovals.length]);

  if (pendingApprovals.length === 0 && !pendingQuestion) {
    return null;
  }

  const currentApproval =
    pendingApprovals.length > 0
      ? pendingApprovals[Math.min(approvalIdx, pendingApprovals.length - 1)]
      : null;

  const handleApprovalDecision = async (
    item: PendingApprovalItem,
    decision: "allow" | "deny"
  ) => {
    if (submittingDecisions[item.id]) return;
    setSubmittingDecisions((prev) => ({ ...prev, [item.id]: decision }));
    try {
      if (decision === "allow") {
        await onApproveTool(item.id, "Approved by user");
      } else {
        await onDenyTool(item.id, "Denied by user");
      }
    } catch {
      setSubmittingDecisions((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const toggleQuestionOption = (
    qIdx: number,
    value: string,
    multiSelect: boolean
  ) => {
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

  const handleQuestionSubmit = () => {
    if (!pendingQuestion) return;
    const { questions, toolCallId } = pendingQuestion;
    const hasAnySelection = Object.values(selections).some(
      (arr) => arr.length > 0
    );
    const trimmedNote = customNote.trim();
    if (!hasAnySelection && !trimmedNote) return;

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
    if (trimmedNote) {
      lines.push(trimmedNote);
    }

    setSubmittedToolCallIds((prev) => ({ ...prev, [toolCallId]: true }));
    onSendFollowUp(lines.join("\n"));
  };

  const hasAnyQuestionInput =
    Object.values(selections).some((arr) => arr.length > 0) ||
    customNote.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-border/80 bg-card/95 px-2.5 py-2 backdrop-blur-xs">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-2">
        {currentApproval && (
          <div className="min-w-0 rounded-lg border border-amber-500/35 bg-amber-500/5 p-2.5">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <ShieldAlertIcon className="size-4 shrink-0 text-amber-500" />
                <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                  {currentApproval.displayTitle}
                </span>
                <Badge
                  className="shrink-0 font-mono text-[10px]"
                  variant="outline"
                >
                  {currentApproval.toolName}
                </Badge>
              </div>

              {pendingApprovals.length > 1 && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label="Previous approval"
                    className="size-6"
                    disabled={approvalIdx === 0}
                    onClick={() => setApprovalIdx((i) => Math.max(0, i - 1))}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronLeftIcon className="size-3.5" />
                  </Button>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {approvalIdx + 1}/{pendingApprovals.length}
                  </span>
                  <Button
                    aria-label="Next approval"
                    className="size-6"
                    disabled={approvalIdx >= pendingApprovals.length - 1}
                    onClick={() =>
                      setApprovalIdx((i) =>
                        Math.min(pendingApprovals.length - 1, i + 1)
                      )
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRightIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {currentApproval.targetSummary && (
              <div className="mt-2 max-h-20 overflow-y-auto rounded bg-muted/60 px-2 py-1 font-mono text-[11px] break-all text-foreground/90">
                {currentApproval.targetSummary}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <Button
                className="h-7 px-2.5 text-xs"
                disabled={Boolean(submittingDecisions[currentApproval.id])}
                onClick={() => void handleApprovalDecision(currentApproval, "deny")}
                size="sm"
                type="button"
                variant="outline"
              >
                {submittingDecisions[currentApproval.id] === "deny"
                  ? "Denying…"
                  : "Deny"}
              </Button>
              <Button
                className="h-7 px-3 text-xs"
                disabled={Boolean(submittingDecisions[currentApproval.id])}
                onClick={() =>
                  void handleApprovalDecision(currentApproval, "allow")
                }
                size="sm"
                type="button"
                variant="default"
              >
                {submittingDecisions[currentApproval.id] === "allow"
                  ? "Approving…"
                  : "Approve & Execute"}
              </Button>
            </div>
          </div>
        )}

        {pendingQuestion && !currentApproval && (() => {
          const { questions } = pendingQuestion;
          const safeIdx = Math.min(questionStep, questions.length - 1);
          const activeQ = questions[safeIdx];
          const picked = selections[safeIdx] ?? [];

          return (
            <div className="min-w-0 rounded-lg border border-primary/35 bg-background/95 p-2.5 shadow-xs">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <HelpCircleIcon className="size-4 shrink-0 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {questions.length > 1
                      ? `Question ${safeIdx + 1} of ${questions.length}`
                      : "Question"}
                  </span>
                  {questions.length > 1 && (
                    <div className="flex items-center gap-1">
                      {questions.map((_q, idx) => {
                        const isCurrent = idx === safeIdx;
                        const isDone = (selections[idx]?.length ?? 0) > 0;
                        return (
                          <button
                            className={cn(
                              "flex size-5 items-center justify-center rounded-full border font-mono text-[10px] transition-colors",
                              isCurrent
                                ? "border-primary bg-primary text-primary-foreground"
                                : isDone
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                            )}
                            key={idx}
                            onClick={() => {
                              setQuestionStep(idx);
                              setIsQuestionCollapsed(false);
                            }}
                            type="button"
                          >
                            {isDone && !isCurrent ? (
                              <CheckIcon className="size-2.5" />
                            ) : (
                              idx + 1
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button
                  aria-label={
                    isQuestionCollapsed ? "Expand question" : "Minimize question"
                  }
                  className="size-6 shrink-0"
                  onClick={() => setIsQuestionCollapsed((v) => !v)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {isQuestionCollapsed ? (
                    <ChevronUpIcon className="size-3.5" />
                  ) : (
                    <ChevronDownIcon className="size-3.5" />
                  )}
                </Button>
              </div>

              {!isQuestionCollapsed && (
                <>
                  <div className="mt-2 max-h-[34vh] space-y-2.5 overflow-y-auto pr-0.5">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium leading-snug text-foreground">
                        {activeQ.prompt}
                      </p>
                      {activeQ.description && (
                        <p className="text-[11px] text-muted-foreground">
                          {activeQ.description}
                        </p>
                      )}
                    </div>

                    {activeQ.options.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {activeQ.options.map((opt) => {
                          const selected = picked.includes(opt.value);
                          return (
                            <Button
                              className={cn(
                                "h-auto min-w-0 justify-start gap-2 px-2.5 py-1.5 text-left text-xs font-normal whitespace-normal",
                                selected &&
                                  "border-primary bg-primary/10 text-foreground"
                              )}
                              key={opt.value}
                              onClick={() =>
                                toggleQuestionOption(
                                  safeIdx,
                                  opt.value,
                                  activeQ.multiSelect
                                )
                              }
                              type="button"
                              variant={selected ? "secondary" : "outline"}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 flex size-3.5 shrink-0 items-center justify-center border",
                                  activeQ.multiSelect
                                    ? "rounded-xs"
                                    : "rounded-full",
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

                    <Textarea
                      aria-label="Custom answer"
                      className="min-h-12 max-h-24 resize-none bg-background text-xs"
                      onChange={(e) => setCustomNote(e.target.value)}
                      placeholder="Hoặc nhập câu trả lời / ghi chú thêm..."
                      value={customNote}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                    <div className="flex items-center gap-1">
                      {questions.length > 1 && (
                        <>
                          <Button
                            className="h-7 px-2 text-xs"
                            disabled={safeIdx === 0}
                            onClick={() =>
                              setQuestionStep((s) => Math.max(0, s - 1))
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Prev
                          </Button>
                          <Button
                            className="h-7 px-2 text-xs"
                            disabled={safeIdx >= questions.length - 1}
                            onClick={() =>
                              setQuestionStep((s) =>
                                Math.min(questions.length - 1, s + 1)
                              )
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Next
                          </Button>
                        </>
                      )}
                    </div>

                    <Button
                      className="h-7 gap-1.5 px-3 text-xs"
                      disabled={!hasAnyQuestionInput}
                      onClick={handleQuestionSubmit}
                      size="sm"
                      type="button"
                    >
                      <SendIcon className="size-3" />
                      Gửi câu trả lời
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
