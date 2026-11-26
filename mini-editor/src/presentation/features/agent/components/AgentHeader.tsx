import { messagesToMarkdown } from "@/components/ai-elements/conversation";
import {
  OpenIn,
  OpenInChatGPT,
  OpenInClaude,
  OpenInContent,
  OpenInCursor,
  OpenInItem,
  OpenInLabel,
  OpenInScira,
  OpenInSeparator,
  OpenInT3,
  OpenInTrigger,
  OpenInv0,
} from "@/components/ai-elements/open-in-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type AgentPersonaState,
  type AgentRuntimeConfig,
  type AgentSession,
  type AgentUIMessage,
} from "@/core/interfaces/agent";
import type {
  AgentBackendInfo,
  AgentBackendStatus,
  AgentUsageResponse,
} from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import { isTextUIPart } from "ai";
import {
  ActivityIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Maximize2Icon,
  MessageSquareIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Share2Icon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { AgentContextUsage } from "../hooks/useAgentRuntime";
import type { AgentViewTab } from "../store/agentStore";
import { AgentPersonaOrb } from "./AgentErrorBoundary";

export interface AgentHeaderProps {
  activeSession: AgentSession;
  sessions: AgentSession[];
  messages: AgentUIMessage[];
  config: AgentRuntimeConfig;
  personaState: AgentPersonaState;
  contextUsage: AgentContextUsage;
  activeViewTab: AgentViewTab;
  isHistoryOpen: boolean;
  backendStatus: AgentBackendStatus | null;
  backendInfo: AgentBackendInfo | null;
  backendUsage: AgentUsageResponse | null;
  isRefreshingUsage?: boolean;
  backendError: string | null;
  presentationMode?: "dock" | "tab" | "popup";
  onToggleHistory: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSelectViewTab: (tab: AgentViewTab) => void;
  onOpenInspectorRuntime: () => void;
  onRefreshUsage?: () => void;
  onCloseDock?: () => void;
  onSwitchToTab?: () => void;
  onDockRight?: () => void;
}

function formatCompactCount(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
}

function buildConversationQuery(
  sessionTitle: string,
  messages: AgentUIMessage[]
): string {
  if (messages.length === 0) {
    return `Help me with my Tomo workspace task in "${sessionTitle}".`;
  }

  const recentStart = Math.max(0, messages.length - 6);
  const recent = messages.slice(recentStart);
  const lines = recent
    .map((msg) => {
      const text = msg.parts
        .filter(isTextUIPart)
        .map((p) => p.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return null;
      const role = msg.role === "user" ? "User" : "Assistant";
      return `${role}: ${text}`;
    })
    .filter((line): line is string => line !== null);

  const joined = lines.join("\n\n");
  if (!joined) {
    return `Continue session "${sessionTitle}" in Tomo workspace.`;
  }
  return joined.length > 1600 ? `${joined.slice(0, 1597)}...` : joined;
}

export function AgentHeader({
  activeSession,
  sessions,
  messages,
  config,
  personaState,
  contextUsage,
  activeViewTab,
  isHistoryOpen,
  backendStatus,
  backendInfo,
  backendUsage,
  isRefreshingUsage = false,
  backendError,
  presentationMode = "dock",
  onToggleHistory,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onSelectViewTab,
  onOpenInspectorRuntime,
  onRefreshUsage,
  onCloseDock,
  onSwitchToTab,
  onDockRight,
}: AgentHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(activeSession.title);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftTitle(activeSession.title);
    setIsRenaming(false);
  }, [activeSession.id, activeSession.title]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const commitRename = useCallback(() => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== activeSession.title) {
      onRenameSession(activeSession.id, trimmed);
    } else {
      setDraftTitle(activeSession.title);
    }
    setIsRenaming(false);
  }, [draftTitle, activeSession.id, activeSession.title, onRenameSession]);

  const cancelRename = useCallback(() => {
    setDraftTitle(activeSession.title);
    setIsRenaming(false);
  }, [activeSession.title]);

  const handleRenameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename]
  );

  const openInQuery = useMemo(
    () => buildConversationQuery(activeSession.title, messages),
    [activeSession.title, messages]
  );

  const handleCopyMarkdown = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      return;
    }
    try {
      const md =
        messages.length > 0
          ? messagesToMarkdown(messages)
          : `# ${activeSession.title}\n`;
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopiedMarkdown(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }, [activeSession.title, messages]);

  const selectedHarness =
    config.harnessId || backendStatus?.activeHarnessId || "common";
  const statusLabel = backendStatus
    ? `${backendStatus.state} · ${selectedHarness}`
    : backendError
      ? "GemOps Offline"
      : "GemOps";

  const quotaGroups = Array.isArray(backendUsage?.quota?.groups)
    ? backendUsage.quota.groups
    : [];
  const primaryBucketPct = (() => {
    const firstBucket = quotaGroups[0]?.buckets?.[0];
    if (typeof firstBucket?.remaining_fraction === "number") {
      return Math.max(0, Math.min(100, Math.round(firstBucket.remaining_fraction * 100)));
    }
    return null;
  })();
  const contextRatioPct =
    contextUsage.maxTokens > 0 && contextUsage.usedTokens > 0
      ? Math.min(100, (contextUsage.usedTokens / contextUsage.maxTokens) * 100)
      : null;
  const triggerLabel =
    contextRatioPct !== null
      ? `${contextRatioPct.toFixed(1)}%`
      : primaryBucketPct !== null
        ? `${primaryBucketPct}%`
        : contextUsage.hasRealTokenUsage
          ? formatCompactCount(contextUsage.usedTokens)
          : "Usage";

  const statusDotClass = !backendStatus
    ? "bg-red-500"
    : backendStatus.state === "BUSY" ||
        backendStatus.state === "WAITING_APPROVAL" ||
        backendStatus.state === "COMPACTING"
      ? "animate-pulse bg-amber-400"
      : backendStatus.state === "IDLE"
        ? "bg-emerald-400"
        : "bg-sky-400";

  const tabs: {
    id: AgentViewTab;
    label: string;
    shortLabel: string;
    icon: typeof MessageSquareIcon;
  }[] = [
    {
      id: "chat",
      label: "Chat",
      shortLabel: "Chat",
      icon: MessageSquareIcon,
    },
    {
      id: "inspector",
      label: "Runtime & Config",
      shortLabel: "Config",
      icon: SlidersHorizontalIcon,
    },
  ];

  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-background/95 backdrop-blur-xs">
      <div className="flex min-h-10 items-center justify-between gap-1.5 px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-expanded={isHistoryOpen}
                aria-label="Toggle session history"
                className={cn(
                  "size-7 shrink-0",
                  isHistoryOpen && "bg-accent text-accent-foreground"
                )}
                onClick={onToggleHistory}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <PanelLeftIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Sessions</TooltipContent>
          </Tooltip>

          <AgentPersonaOrb
            className="shrink-0"
            size="sm"
            state={personaState}
            variant={config.personaVariant}
          />

          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            {isRenaming ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Input
                  aria-label="Rename session title"
                  className="h-7 min-w-0 flex-1 px-2 text-xs font-medium"
                  onBlur={commitRename}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  ref={renameInputRef}
                  value={draftTitle}
                />
                <Button
                  aria-label="Confirm rename"
                  className="size-6 shrink-0"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitRename();
                  }}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <CheckIcon className="size-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <button
                  className="group flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent"
                  onClick={() => setIsRenaming(true)}
                  title={`${activeSession.title} (click to rename)`}
                  type="button"
                >
                  <span className="truncate text-xs font-semibold text-foreground">
                    {activeSession.title}
                  </span>
                  <PencilIcon className="agent-sm-only size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Switch active session"
                      className="size-6 shrink-0 text-muted-foreground"
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronDownIcon className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60 max-w-[90vw]">
                    <DropdownMenuLabel className="text-xs">
                      Switch Session
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {sessions.slice(0, 8).map((session) => (
                      <DropdownMenuItem
                        className={cn(
                          "flex items-center justify-between gap-2 text-xs",
                          session.id === activeSession.id && "bg-accent font-medium"
                        )}
                        key={session.id}
                        onSelect={() => onSelectSession(session.id)}
                      >
                        <span className="truncate">{session.title}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            <button
              className="agent-wide-only shrink-0 cursor-pointer items-center"
              onClick={onOpenInspectorRuntime}
              title={
                backendError ??
                `Inspect GemOps runtime & harness${(backendStatus?.sessionsCount ?? 0) > 1 ? ` (${backendStatus?.sessionsCount} warm sessions)` : ""}`
              }
              type="button"
            >
              <Badge
                className="gap-1 px-1.5 py-0 text-[10px] font-medium"
                variant={backendStatus ? "secondary" : "outline"}
              >
                <span className={cn("size-1.5 rounded-full", statusDotClass)} />
                {statusLabel}
              </Badge>
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="New agent chat"
                className="h-7 gap-1 px-1.5 text-xs"
                onClick={onCreateSession}
                size="xs"
                type="button"
                variant="outline"
              >
                <PlusIcon className="size-3.5" />
                <span className="agent-wide-only">New</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New Agent Chat</TooltipContent>
          </Tooltip>

          <HoverCard closeDelay={80} openDelay={120}>
            <HoverCardTrigger asChild>
              <Button
                aria-label="GemOps usage, quota, and session context"
                className="h-7 gap-1 px-1.5 text-xs"
                size="xs"
                type="button"
                variant="ghost"
              >
                <ActivityIcon className="size-3.5 text-primary" />
                <span className="agent-xs-hide font-mono text-[11px] font-medium text-muted-foreground">
                  {triggerLabel}
                </span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent
              align="end"
              className="w-72 max-w-[92vw] divide-y overflow-hidden p-0"
            >
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    GemOps Usage &amp; Runtime
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {backendInfo?.version
                      ? `${backendInfo.binary || "agy"} v${backendInfo.version}`
                      : backendStatus
                        ? `Harness: ${selectedHarness}`
                        : "Waiting for GemOps"}
                  </div>
                </div>
                {onRefreshUsage && (
                  <Button
                    aria-label="Refresh GemOps usage"
                    className="size-6 shrink-0"
                    disabled={isRefreshingUsage}
                    onClick={onRefreshUsage}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <RefreshCwIcon
                      className={cn(
                        "size-3",
                        isRefreshingUsage && "animate-spin"
                      )}
                    />
                  </Button>
                )}
              </div>

              <div className="space-y-1.5 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Model</span>
                  <span className="max-w-[165px] truncate font-mono font-medium">
                    {contextUsage.modelLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-mono font-medium">
                    {contextUsage.mode}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Thinking</span>
                  <span className="font-mono font-medium capitalize">
                    {contextUsage.effort || "default"}
                  </span>
                </div>
                {backendUsage?.credits?.remaining_credits !== undefined && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">AI Credits</span>
                    <span className="font-mono font-semibold text-primary">
                      {String(backendUsage.credits.remaining_credits)}
                    </span>
                  </div>
                )}
              </div>

              {contextUsage.hasRealTokenUsage && (
                <div className="space-y-1.5 p-3 text-xs">
                  <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Latest Turn Tokens
                  </div>
                  {contextUsage.maxTokens > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span>{contextRatioPct?.toFixed(1)}%</span>
                        <span className="text-muted-foreground">
                          {formatCompactCount(contextUsage.usedTokens)} /{" "}
                          {formatCompactCount(contextUsage.maxTokens)}
                        </span>
                      </div>
                      <Progress
                        className="h-1.5 bg-muted"
                        value={contextRatioPct ?? 0}
                      />
                    </div>
                  )}
                  {contextUsage.inputTokens !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Input</span>
                      <span className="font-mono">
                        {formatCompactCount(contextUsage.inputTokens)}
                      </span>
                    </div>
                  )}
                  {contextUsage.outputTokens !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Output</span>
                      <span className="font-mono">
                        {formatCompactCount(contextUsage.outputTokens)}
                      </span>
                    </div>
                  )}
                  {contextUsage.reasoningTokens !== undefined &&
                    contextUsage.reasoningTokens > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Thinking</span>
                        <span className="font-mono">
                          {formatCompactCount(contextUsage.reasoningTokens)}
                        </span>
                      </div>
                    )}
                  {contextUsage.cachedInputTokens !== undefined &&
                    contextUsage.cachedInputTokens > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cache Read</span>
                        <span className="font-mono">
                          {formatCompactCount(contextUsage.cachedInputTokens)}
                        </span>
                      </div>
                    )}
                  {contextUsage.totalTokens !== undefined && (
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-mono">
                        {formatCompactCount(contextUsage.totalTokens)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {quotaGroups.length > 0 && (
                <div className="max-h-52 space-y-2.5 overflow-y-auto p-3 text-xs">
                  <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    AGY Quota
                  </div>
                  {quotaGroups.map((group) => (
                    <div className="space-y-1.5" key={group.name}>
                      <div className="text-[11px] font-medium text-foreground">
                        {group.name}
                      </div>
                      {(group.buckets ?? []).map((bucket) => {
                        const pct =
                          typeof bucket.remaining_fraction === "number"
                            ? Math.max(
                                0,
                                Math.min(
                                  100,
                                  Math.round(bucket.remaining_fraction * 100)
                                )
                              )
                            : 0;
                        return (
                          <div className="space-y-0.5" key={bucket.id}>
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <span className="truncate text-muted-foreground">
                                {bucket.name}
                                {bucket.window ? ` (${bucket.window})` : ""}
                              </span>
                              <span className="shrink-0 font-mono font-semibold">
                                {pct}%
                              </span>
                            </div>
                            <Progress className="h-1.5 bg-muted" value={pct} />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </HoverCardContent>
          </HoverCard>

          <OpenIn query={openInQuery}>
            <OpenInTrigger>
              <Button
                aria-label="Open conversation in external AI chat"
                className="h-7 gap-1 px-1.5 text-xs"
                size="xs"
                type="button"
                variant="ghost"
              >
                <Share2Icon className="size-3.5" />
                <span className="agent-wide-only">Open In</span>
                <ChevronDownIcon className="agent-sm-only size-3 opacity-60" />
              </Button>
            </OpenInTrigger>
            <OpenInContent align="end" className="w-56 max-w-[90vw]">
              <OpenInLabel className="text-xs">Continue Externally</OpenInLabel>
              <OpenInSeparator />
              <OpenInChatGPT />
              <OpenInClaude />
              <OpenInCursor />
              <OpenInT3 />
              <OpenInv0 />
              <OpenInScira />
              <OpenInSeparator />
              <OpenInItem
                className="flex items-center gap-2 text-xs"
                onSelect={() => {
                  void handleCopyMarkdown();
                }}
              >
                {copiedMarkdown ? (
                  <CheckIcon className="size-3.5 text-emerald-500" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                <span>
                  {copiedMarkdown
                    ? "Copied Markdown"
                    : "Copy Conversation Markdown"}
                </span>
              </OpenInItem>
            </OpenInContent>
          </OpenIn>

          {presentationMode === "dock" && onSwitchToTab && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Open in full tab"
                  className="size-7"
                  onClick={onSwitchToTab}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Maximize2Icon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in Tab</TooltipContent>
            </Tooltip>
          )}

          {presentationMode === "dock" && onCloseDock && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Close AI dock"
                  className="size-7"
                  onClick={onCloseDock}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <XIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close Dock</TooltipContent>
            </Tooltip>
          )}

          {presentationMode === "tab" && onDockRight && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Dock panel to right"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={onDockRight}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  <PanelRightIcon className="size-3.5" />
                  <span className="agent-wide-only">Dock Right</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Dock Right</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div
        aria-label="Agent studio views"
        className="flex items-center justify-between gap-1.5 border-t border-border/60 bg-muted/25 px-2 py-1"
        role="tablist"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeViewTab === tab.id;
            return (
              <button
                aria-selected={isActive}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
                key={tab.id}
                onClick={() => onSelectViewTab(tab.id)}
                role="tab"
                type="button"
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="agent-wide-only">{tab.label}</span>
                <span className="agent-compact-only">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>

        <button
          className="agent-compact-only agent-xs-hide shrink-0 items-center"
          onClick={onOpenInspectorRuntime}
          title={backendError ?? "GemOps Runtime"}
          type="button"
        >
          <Badge className="gap-1 px-1.5 py-0 text-[10px]" variant="outline">
            <span className={cn("size-1.5 rounded-full", statusDotClass)} />
            {backendStatus ? backendStatus.state : "Offline"}
          </Badge>
        </button>
      </div>
    </header>
  );
}
