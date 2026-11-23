import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
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
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_MODELS,
  type AgentPersonaState,
  type AgentRuntimeConfig,
  type AgentSession,
  type AgentUIMessage,
} from "@/core/interfaces/agent";
import type { AgentBackendStatus } from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import { isTextUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Maximize2Icon,
  MessageSquareIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilIcon,
  PlusIcon,
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
  backendError: string | null;
  presentationMode?: "dock" | "tab" | "popup";
  onToggleHistory: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSelectViewTab: (tab: AgentViewTab) => void;
  onOpenInspectorRuntime: () => void;
  onCloseDock?: () => void;
  onSwitchToTab?: () => void;
  onDockRight?: () => void;
}

const TOKENLENS_MODEL_MAP: Record<string, string> = {
  "gpt-4o": "gpt-4o",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "o3-mini": "o3-mini",
  "deepseek-r1": "deepseek/deepseek-r1",
  "qwen-2.5-coder": "qwen/qwen-2.5-coder-32b-instruct",
};

function mapModelIdForTokenLens(modelId: string): string {
  return TOKENLENS_MODEL_MAP[modelId] ?? modelId;
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
  backendError,
  presentationMode = "dock",
  onToggleHistory,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onSelectViewTab,
  onOpenInspectorRuntime,
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

  const activeModelMeta = useMemo(
    () => DEFAULT_MODELS.find((m) => m.id === contextUsage.modelId),
    [contextUsage.modelId]
  );
  const mappedTokenLensModel = useMemo(
    () => mapModelIdForTokenLens(contextUsage.modelId),
    [contextUsage.modelId]
  );

  const selectedHarness =
    config.harnessId || backendStatus?.activeHarnessId || "common";
  const statusLabel = backendStatus
    ? `${backendStatus.state} · ${selectedHarness}`
    : backendError
      ? "GemOps Offline"
      : "GemOps";

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
              title={backendError ?? "Inspect GemOps runtime & harness"}
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

          <Context
            maxTokens={contextUsage.maxTokens}
            modelId={mappedTokenLensModel}
            usage={contextUsage.usage}
            usedTokens={contextUsage.usedTokens}
          >
            <ContextTrigger className="h-7 gap-1 px-1 text-xs" />
            <ContextContent align="end" className="w-60 max-w-[90vw]">
              <ContextContentHeader />
              <ContextContentBody className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-mono font-medium">
                    {activeModelMeta?.name ?? contextUsage.modelId}
                  </span>
                </div>
                <ContextInputUsage />
                <ContextOutputUsage />
                <ContextReasoningUsage />
                <ContextCacheUsage />
              </ContextContentBody>
              {contextUsage.usedTokens === 0 ? (
                <ContextContentFooter>
                  <span className="text-muted-foreground">Context ready</span>
                  <span className="font-mono text-muted-foreground">
                    GemOps
                  </span>
                </ContextContentFooter>
              ) : (
                <ContextContentFooter />
              )}
            </ContextContent>
          </Context>

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
