import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  getAttachmentLabel,
  getMediaCategory,
} from "@/components/ai-elements/attachments";
import {
  MicSelector,
  MicSelectorContent,
  MicSelectorEmpty,
  MicSelectorInput,
  MicSelectorItem,
  MicSelectorLabel,
  MicSelectorList,
  MicSelectorTrigger,
  MicSelectorValue,
} from "@/components/ai-elements/mic-selector";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorShortcut,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandInput,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputCommandSeparator,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
  PromptInputProvider,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTab,
  PromptInputTabBody,
  PromptInputTabItem,
  PromptInputTabLabel,
  PromptInputTabsList,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemDescription,
  QueueItemFile,
  QueueItemImage,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_MODELS,
  type AgentMode,
  type AgentScenarioId,
  type AskAIRequest,
  type ModelOption,
  type QueueTodoItem,
  type QueuedPromptItem,
  type ReasoningEffort,
  type SpeechDictationController,
  type WorkspaceContextItem,
} from "@/core/interfaces/agent";
import {
  isSpeechRecognitionSupported,
  listWorkspaceContextItems,
  startSpeechDictation,
} from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import {
  AtSignIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  EraserIcon,
  FileCode2Icon,
  FileTextIcon,
  GitBranchIcon,
  GlobeIcon,
  LayersIcon,
  ListTodoIcon,
  MessageSquarePlusIcon,
  MicIcon,
  PlayIcon,
  ShapesIcon,
  SlashIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { SendPromptParams } from "../hooks/useAgentRuntime";

export interface AgentComposerProps {
  status: ChatStatus;
  mode: AgentMode;
  modelId: string;
  reasoningEffort: ReasoningEffort;
  webSearchEnabled: boolean;
  speechLang: string;
  micDeviceId: string | undefined;
  isVoiceListening: boolean;
  pinnedContext: WorkspaceContextItem[];
  sessionTodos: QueueTodoItem[];
  sessionQueue: QueuedPromptItem[];
  pendingAskAI: AskAIRequest | null;
  onSendPrompt: (params: SendPromptParams) => Promise<void>;
  onStop: () => void | Promise<void>;
  onSetMode: (mode: AgentMode) => void;
  onSetModel: (modelId: string) => void;
  onCycleReasoningEffort: (next: ReasoningEffort) => void;
  onToggleWebSearch: (enabled: boolean) => void;
  onSetMicDeviceId: (deviceId: string | undefined) => void;
  onSetVoiceListening: (listening: boolean) => void;
  onPinContextItem: (item: WorkspaceContextItem) => void;
  onUnpinContextItem: (itemId: string) => void;
  onToggleTodo: (todoId: string) => void;
  onSendQueuedNow: (itemId: string) => void | Promise<void>;
  onRemoveQueued: (itemId: string) => void;
  onClearSession: () => void;
  onConsumeAskAI: () => AskAIRequest | null;
}

interface SlashCommandItem {
  command: string;
  label: string;
  description: string;
  scenarioId?: AgentScenarioId;
  action?: "clear";
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    command: "/code",
    label: "Full-Stack Code",
    description: "Plan, write code & tests, and emit versioned artifacts",
    scenarioId: "fullstack",
  },
  {
    command: "/research",
    label: "Research & Citations",
    description: "Synthesize workspace specs with inline hover citations",
    scenarioId: "research",
  },
  {
    command: "/approval",
    label: "HIL Approval & Question",
    description: "Interactive ask_user choice + tool confirmation gate",
    scenarioId: "approval",
  },
  {
    command: "/debug",
    label: "Debug & Diagnostics",
    description: "Capture stack trace, sandbox repro, and diff patch",
    scenarioId: "debug",
  },
  {
    command: "/preview",
    label: "Generative UI & Voice",
    description: "Live Web/JSX preview, SVG diagram, and WAV narration",
    scenarioId: "generative-media",
  },
  {
    command: "/workflow",
    label: "Multi-Agent Workflow",
    description: "Orchestrate subagents with React Flow telemetry graph",
    scenarioId: "workflow",
  },
  {
    command: "/clear",
    label: "Clear Conversation",
    description: "Reset messages and artifacts in the active session",
    action: "clear",
  },
];

const AGENT_MODES: { value: AgentMode; label: string; hint: string }[] = [
  { value: "agent", label: "Agent", hint: "Full tools & autonomous execution" },
  { value: "plan", label: "Plan", hint: "Structured design before edits" },
  { value: "ask", label: "Ask", hint: "Read-only Q&A and explanations" },
  { value: "debug", label: "Debug", hint: "Diagnostics, traces, and tests" },
];

const REASONING_ORDER: ReasoningEffort[] = ["off", "low", "medium", "high"];

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${Math.round(tokens / 1000000)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

function getContextIcon(kind: WorkspaceContextItem["kind"]) {
  switch (kind) {
    case "doc":
      return FileTextIcon;
    case "canvas":
      return ShapesIcon;
    case "git-diff":
      return GitBranchIcon;
    default:
      return FileCode2Icon;
  }
}

function groupModelsByChef(
  models: ModelOption[]
): { chef: string; items: ModelOption[] }[] {
  const map = new Map<string, ModelOption[]>();
  for (const model of models) {
    const existing = map.get(model.chef);
    if (existing) {
      existing.push(model);
    } else {
      map.set(model.chef, [model]);
    }
  }
  return Array.from(map.entries()).map(([chef, items]) => ({ chef, items }));
}

function ComposerInner({
  status,
  mode,
  modelId,
  reasoningEffort,
  webSearchEnabled,
  speechLang,
  micDeviceId,
  isVoiceListening,
  pinnedContext,
  sessionTodos,
  sessionQueue,
  pendingAskAI,
  onSendPrompt,
  onStop,
  onSetMode,
  onSetModel,
  onCycleReasoningEffort,
  onToggleWebSearch,
  onSetMicDeviceId,
  onSetVoiceListening,
  onPinContextItem,
  onUnpinContextItem,
  onToggleTodo,
  onSendQueuedNow,
  onRemoveQueued,
  onClearSession,
  onConsumeAskAI,
}: AgentComposerProps) {
  const controller = usePromptInputController();
  const attachments = usePromptInputAttachments();

  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [commandMode, setCommandMode] = useState<"at" | "slash" | null>(null);
  const [commandFilter, setCommandFilter] = useState("");
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceContextItem[]>(
    []
  );
  const [dictationInterim, setDictationInterim] = useState("");
  const dictationControllerRef = useRef<SpeechDictationController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const speechSupported = useMemo(() => isSpeechRecognitionSupported(), []);
  const canEnumerateMics = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.enumerateDevices),
    []
  );

  const loadWorkspaceItems = useCallback(async () => {
    try {
      const items = await listWorkspaceContextItems();
      setWorkspaceItems(items);
    } catch {
      // ignore bridge errors
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceItems();
  }, [loadWorkspaceItems]);

  useEffect(() => {
    return () => {
      dictationControllerRef.current?.abort();
      dictationControllerRef.current = null;
    };
  }, []);

  // Consume non-autoSubmit AskAI requests into composer input & pinned context
  useEffect(() => {
    if (!pendingAskAI || pendingAskAI.autoSubmit) return;
    const req = onConsumeAskAI();
    if (!req) return;

    if (req.contextItems) {
      for (const item of req.contextItems) {
        onPinContextItem(item);
      }
    }
    if (req.prompt) {
      controller.textInput.setInput(req.prompt);
    }
    textareaRef.current?.focus();
  }, [pendingAskAI, onConsumeAskAI, onPinContextItem, controller]);

  const inputValue = controller.textInput.value;

  // Detect @ mention or leading / slash triggers smoothly
  const handleInputChange = useCallback(
    (nextVal: string) => {
      const trimmedStart = nextVal.trimStart();
      if (/^\/[a-z-]*$/i.test(trimmedStart)) {
        setCommandMode("slash");
        setCommandFilter(trimmedStart.slice(1));
        return;
      }

      const atMatch = nextVal.match(/(?:^|\s)@([a-z0-9_.-]*)$/i);
      if (atMatch) {
        if (workspaceItems.length === 0) {
          void loadWorkspaceItems();
        }
        setCommandMode("at");
        setCommandFilter(atMatch[1] ?? "");
        return;
      }

      if (commandMode !== null) {
        setCommandMode(null);
        setCommandFilter("");
      }
    },
    [commandMode, workspaceItems.length, loadWorkspaceItems]
  );

  const openCommandMenu = useCallback(
    (nextMode: "at" | "slash") => {
      if (nextMode === "at") {
        void loadWorkspaceItems();
      }
      setCommandFilter("");
      setCommandMode((prev) => (prev === nextMode ? null : nextMode));
    },
    [loadWorkspaceItems]
  );

  const handleSelectWorkspaceItem = useCallback(
    (item: WorkspaceContextItem) => {
      onPinContextItem(item);
      const cleaned = controller.textInput.value.replace(
        /(^|\s)@[a-z0-9_.-]*$/i,
        "$1"
      );
      controller.textInput.setInput(cleaned);
      setCommandMode(null);
      setCommandFilter("");
      textareaRef.current?.focus();
    },
    [controller, onPinContextItem]
  );

  const handleSelectSlashCommand = useCallback(
    (item: SlashCommandItem) => {
      setCommandMode(null);
      setCommandFilter("");
      if (item.action === "clear") {
        controller.textInput.clear();
        onClearSession();
        return;
      }
      controller.textInput.setInput(`${item.command} `);
      textareaRef.current?.focus();
    },
    [controller, onClearSession]
  );

  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === "Escape" && commandMode !== null) {
        e.preventDefault();
        setCommandMode(null);
        return;
      }
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        controller.textInput.value.trim().toLowerCase() === "/clear"
      ) {
        e.preventDefault();
        controller.textInput.clear();
        setCommandMode(null);
        onClearSession();
      }
    },
    [commandMode, controller, onClearSession]
  );

  const handleSubmit = useCallback(
    async (msg: PromptInputMessage) => {
      const trimmed = msg.text.trim();
      if (trimmed.toLowerCase() === "/clear") {
        setCommandMode(null);
        onClearSession();
        return;
      }
      setCommandMode(null);
      await onSendPrompt({
        text: msg.text,
        files: msg.files,
      });
    },
    [onClearSession, onSendPrompt]
  );

  const handleFallbackDictationToggle = useCallback(() => {
    if (isVoiceListening && dictationControllerRef.current) {
      dictationControllerRef.current.stop();
      dictationControllerRef.current = null;
      onSetVoiceListening(false);
      setDictationInterim("");
      return;
    }

    onSetVoiceListening(true);
    setDictationInterim("");
    dictationControllerRef.current = startSpeechDictation({
      lang: speechLang,
      onInterim: (interim) => setDictationInterim(interim),
      onFinal: (finalText) => {
        const current = controller.textInput.value.trim();
        const next = current ? `${current} ${finalText}` : finalText;
        controller.textInput.setInput(next);
        setDictationInterim("");
      },
      onError: () => {
        onSetVoiceListening(false);
        setDictationInterim("");
        dictationControllerRef.current = null;
      },
      onEnd: () => {
        onSetVoiceListening(false);
        setDictationInterim("");
        dictationControllerRef.current = null;
      },
    });
  }, [controller, isVoiceListening, onSetVoiceListening, speechLang]);

  const activeModel = useMemo(
    () => DEFAULT_MODELS.find((m) => m.id === modelId) ?? DEFAULT_MODELS[0],
    [modelId]
  );
  const groupedModels = useMemo(() => groupModelsByChef(DEFAULT_MODELS), []);
  const uniqueProviders = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const m of DEFAULT_MODELS) {
      if (!seen.has(m.provider)) {
        seen.add(m.provider);
        list.push(m.provider);
      }
    }
    return list;
  }, []);

  const nextReasoningEffort = useMemo(() => {
    const idx = REASONING_ORDER.indexOf(reasoningEffort);
    return REASONING_ORDER[(idx + 1) % REASONING_ORDER.length];
  }, [reasoningEffort]);

  const isGenerating = status === "submitted" || status === "streaming";
  const hasPayload =
    inputValue.trim().length > 0 || attachments.files.length > 0;
  const showHeader =
    attachments.files.length > 0 || pinnedContext.length > 0;
  const showQueue = sessionTodos.length > 0 || sessionQueue.length > 0;

  return (
    <div className="shrink-0 border-t border-border bg-background/95 px-2.5 pt-2 pb-2.5 sm:px-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        {/* Queue: Active Agent Todos + Queued User Messages */}
        {showQueue && (
          <Queue className="border-border/80 bg-muted/20">
            {sessionTodos.length > 0 && (
              <QueueSection defaultOpen>
                <QueueSectionTrigger className="py-1.5 text-xs">
                  <QueueSectionLabel
                    count={
                      sessionTodos.filter((t) => t.status !== "completed")
                        .length
                    }
                    icon={<ListTodoIcon className="size-3.5 text-primary" />}
                    label="Agent Tasks"
                  />
                </QueueSectionTrigger>
                <QueueSectionContent>
                  <QueueList>
                    {sessionTodos.map((todo) => {
                      const done = todo.status === "completed";
                      return (
                        <QueueItem
                          className="cursor-pointer py-1"
                          key={todo.id}
                          onClick={() => onToggleTodo(todo.id)}
                        >
                          <div className="flex items-start gap-2">
                            <QueueItemIndicator
                              className="mt-1 shrink-0"
                              completed={done}
                            />
                            <QueueItemContent
                              className="text-xs"
                              completed={done}
                            >
                              {todo.title}
                            </QueueItemContent>
                          </div>
                          {todo.description && (
                            <QueueItemDescription completed={done}>
                              {todo.description}
                            </QueueItemDescription>
                          )}
                        </QueueItem>
                      );
                    })}
                  </QueueList>
                </QueueSectionContent>
              </QueueSection>
            )}

            {sessionQueue.length > 0 && (
              <QueueSection defaultOpen>
                <QueueSectionTrigger className="py-1.5 text-xs">
                  <QueueSectionLabel
                    count={sessionQueue.length}
                    icon={
                      <MessageSquarePlusIcon className="size-3.5 text-amber-500" />
                    }
                    label="Queued Messages"
                  />
                </QueueSectionTrigger>
                <QueueSectionContent>
                  <QueueList>
                    {sessionQueue.map((item) => (
                      <QueueItem className="py-1.5" key={item.id}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <QueueItemIndicator />
                            <QueueItemContent className="text-xs">
                              {item.text || "(Attachment prompt)"}
                            </QueueItemContent>
                          </div>
                          <QueueItemActions>
                            <QueueItemAction
                              aria-label="Send queued message now"
                              onClick={() => {
                                void onSendQueuedNow(item.id);
                              }}
                              title="Send Now"
                            >
                              <PlayIcon className="size-3" />
                            </QueueItemAction>
                            <QueueItemAction
                              aria-label="Remove queued message"
                              onClick={() => onRemoveQueued(item.id)}
                              title="Remove"
                            >
                              <Trash2Icon className="size-3" />
                            </QueueItemAction>
                          </QueueItemActions>
                        </div>

                        {item.files && item.files.length > 0 && (
                          <QueueItemAttachment className="ml-4">
                            {item.files.map((file, idx) =>
                              file.mediaType?.startsWith("image/") &&
                              file.url ? (
                                <QueueItemImage
                                  alt={file.filename ?? "Queued image"}
                                  key={`${item.id}-f-${idx}`}
                                  src={file.url}
                                />
                              ) : (
                                <QueueItemFile key={`${item.id}-f-${idx}`}>
                                  {file.filename ?? "Attachment"}
                                </QueueItemFile>
                              )
                            )}
                          </QueueItemAttachment>
                        )}
                      </QueueItem>
                    ))}
                  </QueueList>
                </QueueSectionContent>
              </QueueSection>
            )}
          </Queue>
        )}

        {/* Floating @workspace or /slash Command Popover */}
        {commandMode !== null && (
          <div
            className="relative z-20 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setCommandMode(null);
                textareaRef.current?.focus();
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                {commandMode === "at" ? (
                  <>
                    <AtSignIcon className="size-3.5 text-primary" />
                    Pin Workspace Context
                  </>
                ) : (
                  <>
                    <SlashIcon className="size-3.5 text-primary" />
                    Slash Commands &amp; Scenarios
                  </>
                )}
              </span>
              <Button
                aria-label="Close command menu"
                className="size-5"
                onClick={() => setCommandMode(null)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3" />
              </Button>
            </div>

            <PromptInputCommand className="max-h-60">
              <PromptInputCommandInput
                onValueChange={setCommandFilter}
                placeholder={
                  commandMode === "at"
                    ? "Filter Tomo Docs, Canvases, Files, Git Diff..."
                    : "Filter slash commands..."
                }
                value={commandFilter}
              />
              <PromptInputCommandList>
                <PromptInputCommandEmpty>
                  No matching items found.
                </PromptInputCommandEmpty>

                {commandMode === "at" ? (
                  <PromptInputCommandGroup heading="Workspace Items">
                    {workspaceItems.map((item) => {
                      const Icon = getContextIcon(item.kind);
                      const isPinned = pinnedContext.some(
                        (p) => p.id === item.id
                      );
                      return (
                        <PromptInputCommandItem
                          key={item.id}
                          onSelect={() => handleSelectWorkspaceItem(item)}
                          value={`${item.title} ${item.path ?? ""} ${item.kind}`}
                        >
                          <Icon className="size-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">
                              {item.title}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {item.subtitle ?? item.path}
                            </div>
                          </div>
                          {isPinned && (
                            <Badge
                              className="px-1.5 py-0 text-[10px]"
                              variant="secondary"
                            >
                              Pinned
                            </Badge>
                          )}
                        </PromptInputCommandItem>
                      );
                    })}
                  </PromptInputCommandGroup>
                ) : (
                  <>
                    <PromptInputCommandGroup heading="Scenarios">
                      {SLASH_COMMANDS.filter((c) => c.scenarioId).map(
                        (cmd) => (
                          <PromptInputCommandItem
                            key={cmd.command}
                            onSelect={() => handleSelectSlashCommand(cmd)}
                            value={`${cmd.command} ${cmd.label} ${cmd.description}`}
                          >
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                              {cmd.command}
                            </code>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium">
                                {cmd.label}
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {cmd.description}
                              </div>
                            </div>
                          </PromptInputCommandItem>
                        )
                      )}
                    </PromptInputCommandGroup>
                    <PromptInputCommandSeparator />
                    <PromptInputCommandGroup heading="Session">
                      {SLASH_COMMANDS.filter((c) => c.action === "clear").map(
                        (cmd) => (
                          <PromptInputCommandItem
                            key={cmd.command}
                            onSelect={() => handleSelectSlashCommand(cmd)}
                            value={`${cmd.command} ${cmd.label}`}
                          >
                            <EraserIcon className="size-3.5 text-muted-foreground" />
                            <code className="font-mono text-[11px] font-semibold">
                              {cmd.command}
                            </code>
                            <span className="text-xs text-muted-foreground">
                              {cmd.description}
                            </span>
                          </PromptInputCommandItem>
                        )
                      )}
                    </PromptInputCommandGroup>
                  </>
                )}
              </PromptInputCommandList>
            </PromptInputCommand>
          </div>
        )}

        {dictationInterim && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            <span className="truncate">Dictating: {dictationInterim}</span>
          </div>
        )}

        {/* Main PromptInput Composer */}
        <PromptInput multiple onSubmit={handleSubmit}>
          {showHeader && (
            <PromptInputHeader className="gap-1.5 border-b border-border/60 px-2.5 pt-2 pb-1.5">
              {pinnedContext.map((item) => {
                const Icon = getContextIcon(item.kind);
                return (
                  <div
                    className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-primary/30 bg-primary/8 px-2 text-xs text-foreground"
                    key={item.id}
                  >
                    <Icon className="size-3 shrink-0 text-primary" />
                    <span className="max-w-[160px] truncate font-medium">
                      {item.title}
                    </span>
                    <button
                      aria-label={`Remove pinned context ${item.title}`}
                      className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => onUnpinContextItem(item.id)}
                      type="button"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                );
              })}

              {attachments.files.length > 0 && (
                <Attachments variant="inline">
                  {attachments.files.map((file) => {
                    const category = getMediaCategory(file);
                    const label = getAttachmentLabel(file);
                    return (
                      <AttachmentHoverCard key={file.id}>
                        <AttachmentHoverCardTrigger asChild>
                          <Attachment
                            data={file}
                            onRemove={() => attachments.remove(file.id)}
                          >
                            <AttachmentPreview />
                            <AttachmentInfo />
                            <AttachmentRemove />
                          </Attachment>
                        </AttachmentHoverCardTrigger>
                        <AttachmentHoverCardContent className="w-60 space-y-2 p-2">
                          {category === "image" && file.url && (
                            <img
                              alt={label}
                              className="max-h-36 w-full rounded object-cover"
                              src={file.url}
                            />
                          )}
                          <div className="space-y-0.5 text-xs">
                            <div className="truncate font-medium">{label}</div>
                            {file.mediaType && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {file.mediaType}
                              </div>
                            )}
                          </div>
                        </AttachmentHoverCardContent>
                      </AttachmentHoverCard>
                    );
                  })}
                </Attachments>
              )}
            </PromptInputHeader>
          )}

          <PromptInputBody>
            <PromptInputTextarea
              aria-label="Message the Tomo workspace agent"
              className="min-h-11 px-2.5 py-2 text-xs leading-relaxed sm:text-sm"
              onChange={(e) => handleInputChange(e.currentTarget.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={
                isGenerating
                  ? "Type a message to queue, or press Stop..."
                  : "Ask Tomo Agent... (@ context, / commands)"
              }
              ref={textareaRef}
            />
          </PromptInputBody>

          <PromptInputFooter className="items-center justify-between gap-1 border-t border-border/40 px-1.5 py-1">
            <PromptInputTools className="min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto scrollbar-hide">
              {/* + Action Menu (includes quick toggles for compact mode) */}
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger
                  className="size-7 shrink-0"
                  tooltip="Attach files, context (@), commands (/), or quick toggles"
                />
                <PromptInputActionMenuContent className="w-60 max-w-[90vw]">
                  <PromptInputActionAddAttachments />
                  <PromptInputActionAddScreenshot />
                  <PromptInputActionMenuItem
                    onSelect={() => openCommandMenu("at")}
                  >
                    <AtSignIcon className="mr-2 size-4 text-primary" />
                    Pin Workspace Context (@)
                    {pinnedContext.length > 0 && (
                      <Badge className="ml-auto px-1.5 py-0 text-[10px]" variant="secondary">
                        {pinnedContext.length}
                      </Badge>
                    )}
                  </PromptInputActionMenuItem>
                  <PromptInputActionMenuItem
                    onSelect={() => openCommandMenu("slash")}
                  >
                    <SlashIcon className="mr-2 size-4 text-primary" />
                    Slash Commands (/)
                  </PromptInputActionMenuItem>
                  <PromptInputActionMenuItem
                    onSelect={() => onToggleWebSearch(!webSearchEnabled)}
                  >
                    <GlobeIcon className="mr-2 size-4 text-primary" />
                    Web Search
                    <Badge
                      className="ml-auto px-1.5 py-0 text-[10px]"
                      variant={webSearchEnabled ? "default" : "outline"}
                    >
                      {webSearchEnabled ? "On" : "Off"}
                    </Badge>
                  </PromptInputActionMenuItem>
                  <PromptInputActionMenuItem
                    onSelect={() => onCycleReasoningEffort(nextReasoningEffort)}
                  >
                    <BrainIcon className="mr-2 size-4 text-primary" />
                    Reasoning Effort
                    <Badge className="ml-auto px-1.5 py-0 text-[10px] capitalize" variant="secondary">
                      {reasoningEffort}
                    </Badge>
                  </PromptInputActionMenuItem>
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>

              {/* Model Selector Dialog */}
              <ModelSelector
                onOpenChange={setModelDialogOpen}
                open={modelDialogOpen}
              >
                <ModelSelectorTrigger asChild>
                  <PromptInputButton
                    className="h-7 max-w-[112px] min-w-0 shrink gap-1 px-1.5 text-xs"
                    size="sm"
                    tooltip={`Model: ${activeModel.name}`}
                    variant="ghost"
                  >
                    <ModelSelectorLogo provider={activeModel.provider} />
                    <span className="truncate text-[11px] font-medium">
                      {activeModel.name}
                    </span>
                    <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
                  </PromptInputButton>
                </ModelSelectorTrigger>
                <ModelSelectorContent title="Select Agent Model">
                  <ModelSelectorInput placeholder="Search OpenAI, Anthropic, Google, DeepSeek..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    {groupedModels.map((group, groupIdx) => (
                      <Fragment key={group.chef}>
                        {groupIdx > 0 && <ModelSelectorSeparator />}
                        <ModelSelectorGroup heading={group.chef}>
                          {group.items.map((model) => (
                            <ModelSelectorItem
                              key={model.id}
                              onSelect={() => {
                                onSetModel(model.id);
                                setModelDialogOpen(false);
                              }}
                              value={`${model.name} ${model.chef} ${model.id}`}
                            >
                              <ModelSelectorLogo provider={model.provider} />
                              <ModelSelectorName>{model.name}</ModelSelectorName>
                              <ModelSelectorShortcut>
                                {formatContextWindow(model.contextWindow)}
                              </ModelSelectorShortcut>
                              {model.id === modelId && (
                                <CheckIcon className="ml-1 size-3.5 text-primary" />
                              )}
                            </ModelSelectorItem>
                          ))}
                        </ModelSelectorGroup>
                      </Fragment>
                    ))}
                  </ModelSelectorList>
                  <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    <span>Supported Providers</span>
                    <ModelSelectorLogoGroup>
                      {uniqueProviders.map((provider) => (
                        <ModelSelectorLogo key={provider} provider={provider} />
                      ))}
                    </ModelSelectorLogoGroup>
                  </div>
                </ModelSelectorContent>
              </ModelSelector>

              {/* Agent Mode Selector */}
              <PromptInputSelect
                onValueChange={(val) => onSetMode(val as AgentMode)}
                value={mode}
              >
                <PromptInputSelectTrigger
                  aria-label="Agent mode"
                  className="h-7 w-auto shrink-0 gap-1 px-1.5 text-[11px]"
                  size="sm"
                >
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {AGENT_MODES.map((m) => (
                    <PromptInputSelectItem key={m.value} value={m.value}>
                      <span className="font-medium">{m.label}</span>
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>

              {/* Web Search Toggle (shown inline >= 350px; always in + menu) */}
              <span className="agent-xs-hide">
                <PromptInputButton
                  aria-pressed={webSearchEnabled}
                  className={cn(
                    "h-7 shrink-0 gap-1 px-1.5 text-[11px]",
                    webSearchEnabled && "bg-primary/12 text-primary"
                  )}
                  onClick={() => onToggleWebSearch(!webSearchEnabled)}
                  size="sm"
                  tooltip={
                    webSearchEnabled ? "Web Search: Enabled" : "Web Search: Off"
                  }
                  variant={webSearchEnabled ? "secondary" : "ghost"}
                >
                  <GlobeIcon className="size-3.5 shrink-0" />
                  <span className="agent-wide-only">Search</span>
                </PromptInputButton>
              </span>

              {/* Reasoning Effort Cycle (shown inline >= 350px; always in + menu) */}
              <span className="agent-xs-hide">
                <PromptInputButton
                  className={cn(
                    "h-7 shrink-0 gap-1 px-1.5 text-[11px]",
                    reasoningEffort !== "off" && "bg-primary/12 text-primary"
                  )}
                  onClick={() => onCycleReasoningEffort(nextReasoningEffort)}
                  size="sm"
                  tooltip={`Reasoning Effort: ${reasoningEffort} (click to cycle)`}
                  variant={reasoningEffort !== "off" ? "secondary" : "ghost"}
                >
                  <BrainIcon className="size-3.5 shrink-0" />
                  <span className="agent-wide-only capitalize">{reasoningEffort}</span>
                </PromptInputButton>
              </span>

              {/* Workspace Context Summary HoverCard (shown inline >= 430px) */}
              <span className="agent-sm-only">
                <PromptInputHoverCard>
                  <PromptInputHoverCardTrigger asChild>
                    <PromptInputButton
                      className="h-7 shrink-0 gap-1 px-1.5 text-[11px]"
                      onClick={() => openCommandMenu("at")}
                      size="sm"
                      variant="ghost"
                    >
                      <LayersIcon className="size-3.5 shrink-0" />
                      <span>{pinnedContext.length}</span>
                    </PromptInputButton>
                  </PromptInputHoverCardTrigger>
                  <PromptInputHoverCardContent className="w-64 max-w-[90vw] p-2.5">
                    <PromptInputTabsList className="space-y-2.5">
                      <PromptInputTab>
                        <PromptInputTabLabel className="mb-1 px-1">
                          Pinned Workspace Context ({pinnedContext.length})
                        </PromptInputTabLabel>
                        <PromptInputTabBody>
                          {pinnedContext.length === 0 ? (
                            <PromptInputTabItem className="rounded text-muted-foreground">
                              Type @ or click to pin Docs, Canvases, or Diffs.
                            </PromptInputTabItem>
                          ) : (
                            pinnedContext.map((item) => {
                              const Icon = getContextIcon(item.kind);
                              return (
                                <PromptInputTabItem
                                  className="justify-between rounded px-2 py-1"
                                  key={item.id}
                                >
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <Icon className="size-3.5 shrink-0 text-primary" />
                                    <span className="truncate font-medium">
                                      {item.title}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                    {item.kind}
                                  </span>
                                </PromptInputTabItem>
                              );
                            })
                          )}
                        </PromptInputTabBody>
                      </PromptInputTab>
                    </PromptInputTabsList>
                  </PromptInputHoverCardContent>
                </PromptInputHoverCard>
              </span>

              {/* Mic Selector (shown on wider containers >= 580px when mediaDevices available) */}
              {canEnumerateMics && (
                <div className="agent-wide-only shrink-0 items-center">
                  <MicSelector
                    onValueChange={onSetMicDeviceId}
                    value={micDeviceId}
                  >
                    <MicSelectorTrigger
                      className="h-7 max-w-[125px] gap-1 border-none bg-transparent px-1.5 text-[11px] font-normal text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
                      size="sm"
                    >
                      <MicIcon className="size-3.5 shrink-0" />
                      <MicSelectorValue className="truncate text-[11px]" />
                    </MicSelectorTrigger>
                    <MicSelectorContent className="w-64 max-w-[90vw]">
                      <MicSelectorInput />
                      <MicSelectorList>
                        {(devices) =>
                          devices.length === 0 ? (
                            <MicSelectorEmpty />
                          ) : (
                            devices.map((device, index) => (
                              <MicSelectorItem
                                key={device.deviceId || `mic-${index}`}
                                value={device.deviceId || `mic-${index}`}
                              >
                                <MicSelectorLabel
                                  device={
                                    device.label
                                      ? device
                                      : ({
                                          ...device,
                                          label: `Microphone ${index + 1}`,
                                        } as MediaDeviceInfo)
                                  }
                                />
                              </MicSelectorItem>
                            ))
                          )
                        }
                      </MicSelectorList>
                    </MicSelectorContent>
                  </MicSelector>
                </div>
              )}

              {/* Voice Dictation: Native SpeechInput or voiceService fallback */}
              {speechSupported ? (
                <SpeechInput
                  aria-label="Voice dictation"
                  className="size-7 shrink-0"
                  lang={speechLang}
                  onTranscriptionChange={(transcript) => {
                    const current = controller.textInput.value.trim();
                    controller.textInput.setInput(
                      current ? `${current} ${transcript}` : transcript
                    );
                  }}
                  size="icon-sm"
                />
              ) : (
                <PromptInputButton
                  aria-label={
                    isVoiceListening
                      ? "Stop voice dictation"
                      : "Start voice dictation"
                  }
                  className={cn(
                    "size-7 shrink-0 rounded-full",
                    isVoiceListening &&
                      "bg-destructive text-white hover:bg-destructive/90"
                  )}
                  onClick={handleFallbackDictationToggle}
                  size="icon-sm"
                  tooltip={
                    isVoiceListening
                      ? "Stop Dictation"
                      : `Voice Dictation (${speechLang})`
                  }
                  variant={isVoiceListening ? "destructive" : "ghost"}
                >
                  {isVoiceListening ? (
                    <SquareIcon className="size-3.5" />
                  ) : (
                    <MicIcon className="size-3.5" />
                  )}
                </PromptInputButton>
              )}
            </PromptInputTools>

            <PromptInputSubmit
              className="size-7 shrink-0"
              disabled={!isGenerating && !hasPayload}
              onStop={() => {
                void onStop();
              }}
              size="icon-sm"
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export function AgentComposer(props: AgentComposerProps) {
  return (
    <PromptInputProvider>
      <ComposerInner {...props} />
    </PromptInputProvider>
  );
}
