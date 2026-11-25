import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  isTextUIPart,
  type FileUIPart,
  type LanguageModelUsage,
} from "ai";
import {
  DEFAULT_MODELS,
  type AgentPersonaState,
  type AgentScenarioId,
  type AgentSession,
  type AgentUIMessage,
  type CheckpointSnapshot,
  type QueueTodoItem,
  type QueuedPromptItem,
  type WorkspaceContextItem,
} from "@/core/interfaces/agent";
import {
  cancelAgentTurn,
  createAgentTransport,
  fetchAgentHarnesses,
  fetchAgentInfo,
  fetchAgentStatus,
  resetAgentSession,
  resolveAgentPermission,
  speakText,
  stopSpeaking,
  updateAgentSessionConfig,
  type AgentBackendInfo,
  type AgentBackendSessionConfig,
  type AgentBackendStatus,
  type AgentHarnessSummary,
} from "@/infrastructure/agent";
import { useAgentStore } from "../store/agentStore";

export interface SendPromptParams {
  text: string;
  files?: FileUIPart[];
  contextItems?: WorkspaceContextItem[];
  scenarioHint?: AgentScenarioId;
}

export interface AgentContextUsage {
  usedTokens: number;
  maxTokens: number;
  usage: LanguageModelUsage | undefined;
  modelId: string;
}

export interface MessageBranchInfo {
  anchorKey: string;
  count: number;
  currentIndex: number;
}

interface PendingBranchRecord {
  anchorKey: string;
  anchorMessageId: string;
  sessionId: string;
  startIndex: number;
}

let queueItemCounter = 0;

function createQueueItemId(): string {
  queueItemCounter += 1;
  return `q-${Date.now().toString(36)}-${queueItemCounter}`;
}

function cloneDeep<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // fallback for environments without full structuredClone support
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractMessageText(message: AgentUIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function mergeContextItems(
  pinned?: WorkspaceContextItem[],
  explicit?: WorkspaceContextItem[]
): WorkspaceContextItem[] {
  const combined = [...(pinned ?? []), ...(explicit ?? [])];
  if (combined.length === 0) return [];
  const seen = new Set<string>();
  const deduped: WorkspaceContextItem[] = [];
  for (const item of combined) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }
  return deduped;
}

function computeContextUsage(
  messages: AgentUIMessage[],
  modelId: string
): AgentContextUsage {
  const matchedModel = DEFAULT_MODELS.find((m) => m.id === modelId);
  const maxTokens = matchedModel?.contextWindow ?? 128000;

  let hasUsage = false;
  let inputTokens = 0;
  let noCacheTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let textTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const u = msg.metadata?.usage;
    if (!u) continue;
    hasUsage = true;

    const msgInput = u.inputTokens ?? 0;
    const msgOutput = u.outputTokens ?? 0;
    const msgCacheRead =
      u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens ?? 0;
    const msgCacheWrite = u.inputTokenDetails?.cacheWriteTokens ?? 0;
    const msgNoCache =
      u.inputTokenDetails?.noCacheTokens ?? Math.max(0, msgInput - msgCacheRead);
    const msgReasoning =
      u.outputTokenDetails?.reasoningTokens ?? u.reasoningTokens ?? 0;
    const msgText =
      u.outputTokenDetails?.textTokens ?? Math.max(0, msgOutput - msgReasoning);
    const msgTotal = u.totalTokens ?? msgInput + msgOutput;

    inputTokens += msgInput;
    noCacheTokens += msgNoCache;
    cacheReadTokens += msgCacheRead;
    cacheWriteTokens += msgCacheWrite;
    outputTokens += msgOutput;
    textTokens += msgText;
    reasoningTokens += msgReasoning;
    totalTokens += msgTotal;
  }

  const aggregatedUsage: LanguageModelUsage | undefined = hasUsage
    ? {
      inputTokens,
      inputTokenDetails: {
        noCacheTokens,
        cacheReadTokens,
        cacheWriteTokens,
      },
      outputTokens,
      outputTokenDetails: {
        textTokens,
        reasoningTokens,
      },
      totalTokens,
      cachedInputTokens: cacheReadTokens,
      reasoningTokens,
    }
    : undefined;

  return {
    usedTokens: totalTokens,
    maxTokens,
    usage: aggregatedUsage,
    modelId,
  };
}

function resolveAnchorMessageId(
  anchorKey: string,
  sessionId: string
): string {
  const prefix = `${sessionId}:`;
  if (anchorKey.startsWith(prefix)) {
    return anchorKey.slice(prefix.length);
  }
  const colonIdx = anchorKey.indexOf(":");
  return colonIdx >= 0 ? anchorKey.slice(colonIdx + 1) : anchorKey;
}

export function useAgentRuntime() {
  const hydrated = useAgentStore((s) => s.hydrated);
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const config = useAgentStore((s) => s.config);
  const branchesByAnchor = useAgentStore((s) => s.branchesByAnchor);
  const activeBranchIndex = useAgentStore((s) => s.activeBranchIndex);
  const suggestionsBySession = useAgentStore((s) => s.suggestionsBySession);
  const isVoiceListening = useAgentStore((s) => s.isVoiceListening);
  const isAudioSpeaking = useAgentStore((s) => s.isAudioSpeaking);
  const isDockOpen = useAgentStore((s) => s.isDockOpen);
  const pendingAskAI = useAgentStore((s) => s.pendingAskAI);
  const hydrate = useAgentStore((s) => s.hydrate);

  const activeSession: AgentSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );

  // Hydrate persisted store state once on mount
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Memoize dynamic transport reading live store config
  const transport = useMemo(
    () => createAgentTransport(() => useAgentStore.getState().config),
    []
  );

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const activeStreamSessionRef = useRef<string | null>(null);
  const suppressNextAbortSyncRef = useRef(false);
  const pendingBranchRecordRef = useRef<PendingBranchRecord | null>(null);
  const pendingCheckpointIdsRef = useRef<string[]>([]);
  const isDrainingQueueRef = useRef(false);
  const lastSyncedToStoreRef = useRef<AgentUIMessage[] | null>(null);
  const setMessagesRef = useRef<
    | ((
      messages:
        | AgentUIMessage[]
        | ((messages: AgentUIMessage[]) => AgentUIMessage[])
    ) => void)
    | null
  >(null);

  const messagesRef = useRef<AgentUIMessage[]>(activeSession.messages);

  const [backendStatus, setBackendStatus] = useState<AgentBackendStatus | null>(null);
  const [backendInfo, setBackendInfo] = useState<AgentBackendInfo | null>(null);
  const [harnesses, setHarnesses] = useState<AgentHarnessSummary[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isRefreshingMeta, setIsRefreshingMeta] = useState(false);

  const refreshBackendMeta = useCallback(async () => {
    const currentCfg = useAgentStore.getState().config;
    const opts = {
      apiEndpoint: currentCfg.apiEndpoint,
      apiKey: currentCfg.apiKey,
    };
    setIsRefreshingMeta(true);
    try {
      const [statusRes, infoRes, harnessesRes] = await Promise.allSettled([
        fetchAgentStatus(opts),
        fetchAgentInfo(opts),
        fetchAgentHarnesses(opts),
      ]);

      let firstErr: string | null = null;
      if (statusRes.status === "fulfilled") {
        setBackendStatus(statusRes.value);
      } else {
        firstErr = statusRes.reason instanceof Error ? statusRes.reason.message : "Status unavailable";
      }
      if (infoRes.status === "fulfilled") {
        setBackendInfo(infoRes.value);
        const liveModels = infoRes.value.models ?? [];
        if (
          liveModels.length > 0 &&
          currentCfg.modelId &&
          !liveModels.some((m) => m.id === currentCfg.modelId)
        ) {
          const store = useAgentStore.getState();
          store.updateConfig({ modelId: "" });
          store.setSessionModel(activeSessionIdRef.current, "");
        }
      } else if (!firstErr) {
        firstErr = infoRes.reason instanceof Error ? infoRes.reason.message : "Info unavailable";
      }
      if (harnessesRes.status === "fulfilled") {
        setHarnesses(harnessesRes.value.items ?? []);
      } else if (!firstErr) {
        firstErr = harnessesRes.reason instanceof Error ? harnessesRes.reason.message : "Harnesses unavailable";
      }
      setBackendError(firstErr);
    } finally {
      setIsRefreshingMeta(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshBackendMeta();
  }, [hydrated, config.apiEndpoint, refreshBackendMeta]);

  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    stop,
    error,
    clearError,
    status,
    addToolOutput,
    addToolApprovalResponse,
  } = useChat<AgentUIMessage>({
    id: activeSessionId,
    messages: activeSession.messages,
    transport,
    // gemops keeps the active SSE turn stream open while waiting for POST /permissions/:id
    sendAutomaticallyWhen: () => false,
    onFinish: ({ message, messages: finalMessages, isAbort, isDisconnect, isError }) => {
      const originSessionId =
        activeStreamSessionRef.current ?? activeSessionIdRef.current;
      activeStreamSessionRef.current = null;

      if (isAbort && suppressNextAbortSyncRef.current) {
        suppressNextAbortSyncRef.current = false;
        pendingBranchRecordRef.current = null;
        pendingCheckpointIdsRef.current = [];
        return;
      }

      const store = useAgentStore.getState();
      let syncedMessages = finalMessages;

      // Record newly generated branch if this turn came from regenerate / user edit
      const pendingBranch = pendingBranchRecordRef.current;
      if (pendingBranch && pendingBranch.sessionId === originSessionId) {
        pendingBranchRecordRef.current = null;
        if (!isError && finalMessages.length > pendingBranch.startIndex) {
          let mutated = false;
          const taggedMessages = finalMessages.map((msg, idx) => {
            if (idx >= pendingBranch.startIndex && msg.role === "assistant") {
              mutated = true;
              return {
                ...msg,
                metadata: {
                  ...(msg.metadata ?? {}),
                  branchGroupId: pendingBranch.anchorKey,
                  parentMessageId: pendingBranch.anchorMessageId,
                },
              };
            }
            return msg;
          });
          if (mutated) {
            syncedMessages = taggedMessages;
            if (originSessionId === activeSessionIdRef.current) {
              setMessagesRef.current?.(taggedMessages);
            }
          }
          store.recordBranch(
            pendingBranch.anchorKey,
            syncedMessages.slice(pendingBranch.startIndex)
          );
        }
      }

      // Finalize checkpoints emitted during this turn so fast/instant streams capture full snapshot
      const emittedCheckpointIds = pendingCheckpointIdsRef.current;
      pendingCheckpointIdsRef.current = [];
      if (emittedCheckpointIds.length > 0 && !isError) {
        const latestArtifacts =
          store.sessions.find((s) => s.id === originSessionId)?.artifacts ?? [];
        for (const chkId of emittedCheckpointIds) {
          store.updateCheckpointSnapshot(chkId, {
            messageId: message.id,
            messagesSnapshot: syncedMessages,
            artifactsSnapshot: latestArtifacts,
          });
        }
      }

      if (originSessionId === activeSessionIdRef.current) {
        lastSyncedToStoreRef.current = syncedMessages;
      }
      store.syncSessionMessages(originSessionId, syncedMessages);
      void refreshBackendMeta();

      if (
        !isAbort &&
        !isDisconnect &&
        !isError &&
        store.config.autoSpeakResponses
      ) {
        const spokenText = extractMessageText(message);
        if (spokenText) {
          store.setAudioSpeaking(true);
          void speakText(spokenText, store.config.voiceId).finally(() => {
            useAgentStore.getState().setAudioSpeaking(false);
          });
        }
      }
    },
    onError: (err) => {
      activeStreamSessionRef.current = null;
      pendingBranchRecordRef.current = null;
      pendingCheckpointIdsRef.current = [];
      if (err.name !== "AbortError") {
        console.error("[AgentRuntime] Stream error:", err);
      }
    },
  });

  messagesRef.current = messages;
  setMessagesRef.current = setMessages;

  // Guard against stale sync overwrites & abort departing stream on session switch
  const prevSessionIdRef = useRef(activeSessionId);
  const prevHydratedRef = useRef(hydrated);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    const currentStop = stopRef.current;
    return () => {
      void currentStop();
    };
  }, [activeSessionId]);

  useEffect(() => {
    const sessionChanged = prevSessionIdRef.current !== activeSessionId;
    const justHydrated = !prevHydratedRef.current && hydrated;

    if (sessionChanged) {
      prevSessionIdRef.current = activeSessionId;
      pendingBranchRecordRef.current = null;
      pendingCheckpointIdsRef.current = [];
      lastSyncedToStoreRef.current = activeSession.messages;
      setMessages(activeSession.messages);
      return;
    }

    if (justHydrated) {
      prevHydratedRef.current = true;
      if (
        status === "ready" &&
        activeSession.messages !== lastSyncedToStoreRef.current
      ) {
        lastSyncedToStoreRef.current = activeSession.messages;
        setMessages(activeSession.messages);
      }
      return;
    }

    // Sync external store mutations (clear, restore, undo, feedback, reset) back into useChat
    if (
      status === "ready" &&
      activeSession.messages !== lastSyncedToStoreRef.current
    ) {
      lastSyncedToStoreRef.current = activeSession.messages;
      setMessages(activeSession.messages);
    }
  }, [activeSessionId, hydrated, activeSession.messages, status, setMessages]);

  // Auto-drain prompt queue when chat returns to ready
  useEffect(() => {
    if (status !== "ready" || activeSession.queuedPrompts.length === 0) {
      return;
    }
    if (isDrainingQueueRef.current) {
      return;
    }

    isDrainingQueueRef.current = true;
    const nextItem = useAgentStore.getState().shiftQueuedPrompt(activeSessionId);
    if (!nextItem) {
      isDrainingQueueRef.current = false;
      return;
    }

    activeStreamSessionRef.current = activeSessionId;
    const currentConfig = useAgentStore.getState().config;
    const metadata = {
      createdAt: new Date().toISOString(),
      modelId: currentConfig.modelId,
      ...(nextItem.scenarioHint ? { scenarioTag: nextItem.scenarioHint } : {}),
    };
    const requestOptions = {
      body: {
        ...(nextItem.contextItems && nextItem.contextItems.length > 0
          ? { contextItems: nextItem.contextItems }
          : {}),
        ...(nextItem.scenarioHint
          ? { scenarioHint: nextItem.scenarioHint }
          : {}),
      },
    };

    const sendPromise =
      nextItem.files && nextItem.files.length > 0 && !nextItem.text.trim()
        ? sendMessage({ files: nextItem.files, metadata }, requestOptions)
        : sendMessage(
          {
            text: nextItem.text,
            ...(nextItem.files && nextItem.files.length > 0
              ? { files: nextItem.files }
              : {}),
            metadata,
          },
          requestOptions
        );

    void sendPromise.finally(() => {
      isDrainingQueueRef.current = false;
    });
  }, [status, activeSessionId, activeSession.queuedPrompts.length, sendMessage]);

  const sendPrompt = useCallback(
    async (params: SendPromptParams) => {
      const trimmed = params.text.trim();
      const files =
        params.files && params.files.length > 0 ? params.files : undefined;
      if (!trimmed && !files) return;

      const store = useAgentStore.getState();
      const sessionId = activeSessionIdRef.current;
      const session = store.sessions.find((s) => s.id === sessionId);
      const mergedContext = mergeContextItems(
        session?.pinnedContext,
        params.contextItems
      );

      if (status === "streaming" || status === "submitted") {
        store.enqueuePrompt(sessionId, {
          id: createQueueItemId(),
          text: trimmed,
          createdAt: new Date().toISOString(),
          ...(files ? { files } : {}),
          ...(mergedContext.length > 0 ? { contextItems: mergedContext } : {}),
          ...(params.scenarioHint ? { scenarioHint: params.scenarioHint } : {}),
        });
        return;
      }

      if (error) {
        clearError();
      }

      activeStreamSessionRef.current = sessionId;
      const metadata = {
        createdAt: new Date().toISOString(),
        modelId: store.config.modelId,
        ...(params.scenarioHint ? { scenarioTag: params.scenarioHint } : {}),
      };
      const requestOptions = {
        body: {
          ...(mergedContext.length > 0
            ? { contextItems: mergedContext }
            : {}),
          ...(params.scenarioHint ? { scenarioHint: params.scenarioHint } : {}),
        },
      };

      if (files && !trimmed) {
        await sendMessage({ files, metadata }, requestOptions);
        return;
      }

      await sendMessage(
        {
          text: trimmed,
          ...(files ? { files } : {}),
          metadata,
        },
        requestOptions
      );
    },
    [status, error, clearError, sendMessage]
  );

  // Automatically execute pending AskAI requests marked autoSubmit once dock is open & hydrated
  useEffect(() => {
    if (!hydrated || !isDockOpen || !pendingAskAI?.autoSubmit) return;
    if (status === "streaming" || status === "submitted") return;

    const req = useAgentStore.getState().consumeAskAI();
    if (!req) return;

    void sendPrompt({
      text: req.prompt,
      files: req.files,
      contextItems: req.contextItems,
      scenarioHint: req.scenarioHint,
    });
  }, [hydrated, isDockOpen, pendingAskAI, status, sendPrompt]);

  const triggerScenario = useCallback(
    async (_scenarioId: AgentScenarioId, customPrompt?: string) => {
      if (customPrompt?.trim()) {
        await sendPrompt({ text: customPrompt.trim() });
      }
    },
    [sendPrompt]
  );

  const approveTool = useCallback(
    async (approvalId: string, reason?: string) => {
      activeStreamSessionRef.current = activeSessionIdRef.current;
      const currentCfg = useAgentStore.getState().config;
      await resolveAgentPermission(approvalId, "allow", {
        apiEndpoint: currentCfg.apiEndpoint,
        apiKey: currentCfg.apiKey,
      });
      await addToolApprovalResponse({
        id: approvalId,
        approved: true,
        ...(reason !== undefined ? { reason } : {}),
      });
    },
    [addToolApprovalResponse]
  );

  const denyTool = useCallback(
    async (approvalId: string, reason?: string) => {
      activeStreamSessionRef.current = activeSessionIdRef.current;
      const currentCfg = useAgentStore.getState().config;
      await resolveAgentPermission(approvalId, "deny", {
        apiEndpoint: currentCfg.apiEndpoint,
        apiKey: currentCfg.apiKey,
      });
      await addToolApprovalResponse({
        id: approvalId,
        approved: false,
        ...(reason !== undefined ? { reason } : {}),
      });
    },
    [addToolApprovalResponse]
  );

  const submitQuestionResponse = useCallback(
    async (toolCallId: string, selectedValues: string[], text?: string) => {
      activeStreamSessionRef.current = activeSessionIdRef.current;
      await addToolOutput({
        tool: "ask_user",
        toolCallId,
        output: {
          selectedValues,
          ...(text !== undefined && text.trim().length > 0
            ? { text: text.trim() }
            : {}),
          answeredAt: new Date().toISOString(),
        },
      });
    },
    [addToolOutput]
  );

  const regenerateFromMessage = useCallback(
    async (messageId: string) => {
      const currentMessages = messagesRef.current;
      const idx = currentMessages.findIndex((msg) => msg.id === messageId);
      if (idx === -1) return;

      const targetMsg = currentMessages[idx];
      const sessionId = activeSessionIdRef.current;
      const store = useAgentStore.getState();

      if (targetMsg.role === "assistant") {
        const prevUser =
          idx > 0 && currentMessages[idx - 1].role === "user"
            ? currentMessages[idx - 1]
            : undefined;
        const anchorMessageId =
          targetMsg.metadata?.parentMessageId ?? prevUser?.id ?? targetMsg.id;
        const anchorKey =
          targetMsg.metadata?.branchGroupId ?? `${sessionId}:${anchorMessageId}`;

        const existingBranches = store.branchesByAnchor[anchorKey];
        const isUserHeaded = existingBranches?.[0]?.[0]?.role === "user";
        const startIndex = isUserHeaded && prevUser ? idx - 1 : idx;

        const tail = currentMessages.slice(startIndex).map((msg, offset) =>
          offset === (isUserHeaded && prevUser ? 1 : 0) &&
            msg.role === "assistant"
            ? {
              ...msg,
              metadata: {
                ...(msg.metadata ?? {}),
                branchGroupId: anchorKey,
                parentMessageId: anchorMessageId,
              },
            }
            : msg
        );

        if (tail.length > 0) {
          store.recordBranch(anchorKey, tail);
        }

        pendingBranchRecordRef.current = {
          anchorKey,
          anchorMessageId,
          sessionId,
          startIndex,
        };
      } else {
        const anchorKey = `${sessionId}:${targetMsg.id}`;
        const existingBranches = store.branchesByAnchor[anchorKey];
        const isUserHeaded = existingBranches?.[0]?.[0]?.role === "user";
        const startIndex = isUserHeaded ? idx : idx + 1;
        const tail = currentMessages.slice(startIndex);

        if (tail.length > 0) {
          store.recordBranch(anchorKey, tail);
        }

        pendingBranchRecordRef.current = {
          anchorKey,
          anchorMessageId: targetMsg.id,
          sessionId,
          startIndex,
        };
      }

      if (error) {
        clearError();
      }
      activeStreamSessionRef.current = sessionId;
      await regenerate({ messageId });
    },
    [error, clearError, regenerate]
  );

  const editUserMessage = useCallback(
    async (messageId: string, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed) return;

      const currentMessages = messagesRef.current;
      const userIdx = currentMessages.findIndex((msg) => msg.id === messageId);
      if (userIdx === -1 || currentMessages[userIdx].role !== "user") return;

      const targetUser = currentMessages[userIdx];
      const sessionId = activeSessionIdRef.current;
      const anchorKey = `${sessionId}:${targetUser.id}`;
      const store = useAgentStore.getState();

      if (currentMessages.length > userIdx + 1) {
        store.normalizeUserBranches(anchorKey, targetUser);
        store.recordBranch(anchorKey, currentMessages.slice(userIdx));
      }

      const nonTextParts = targetUser.parts.filter(
        (part) => part.type !== "text"
      );
      const updatedUserMsg: AgentUIMessage = {
        ...targetUser,
        metadata: {
          ...(targetUser.metadata ?? {}),
          createdAt: new Date().toISOString(),
        },
        parts: [...nonTextParts, { type: "text", text: trimmed }],
      };

      const truncatedMessages = [
        ...currentMessages.slice(0, userIdx),
        updatedUserMsg,
      ];

      lastSyncedToStoreRef.current = truncatedMessages;
      setMessages(truncatedMessages);
      store.syncSessionMessages(sessionId, truncatedMessages);

      pendingBranchRecordRef.current = {
        anchorKey,
        anchorMessageId: targetUser.id,
        sessionId,
        startIndex: userIdx,
      };

      if (error) {
        clearError();
      }
      activeStreamSessionRef.current = sessionId;
      await regenerate({ messageId: targetUser.id });
    },
    [error, clearError, setMessages, regenerate]
  );

  const switchBranch = useCallback(
    (anchorKey: string, nextIndex: number) => {
      const store = useAgentStore.getState();
      const branches = store.branchesByAnchor[anchorKey];
      if (!branches || nextIndex < 0 || nextIndex >= branches.length) return;

      const targetBranch = branches[nextIndex];
      if (!targetBranch || targetBranch.length === 0) return;

      const sessionId = activeSessionIdRef.current;
      const anchorMessageId = resolveAnchorMessageId(anchorKey, sessionId);
      const currentMessages = messagesRef.current;
      let nextMessages: AgentUIMessage[] | null = null;

      if (targetBranch[0].role === "user") {
        const anchorIdx = currentMessages.findIndex(
          (msg) => msg.id === anchorMessageId
        );
        if (anchorIdx >= 0) {
          nextMessages = [
            ...currentMessages.slice(0, anchorIdx),
            ...cloneDeep(targetBranch),
          ];
        }
      } else {
        const anchorIdx = currentMessages.findIndex(
          (msg) => msg.id === anchorMessageId
        );
        if (anchorIdx >= 0) {
          const cutIndex =
            currentMessages[anchorIdx].role === "user"
              ? anchorIdx + 1
              : anchorIdx;
          nextMessages = [
            ...currentMessages.slice(0, cutIndex),
            ...cloneDeep(targetBranch),
          ];
        } else {
          const branchIds = new Set(
            branches.map((branch) => branch[0]?.id).filter(Boolean)
          );
          const groupIdx = currentMessages.findIndex(
            (msg) =>
              msg.metadata?.branchGroupId === anchorKey ||
              branchIds.has(msg.id)
          );
          if (groupIdx >= 0) {
            nextMessages = [
              ...currentMessages.slice(0, groupIdx),
              ...cloneDeep(targetBranch),
            ];
          }
        }
      }

      if (!nextMessages) return;

      store.setBranchIndex(anchorKey, nextIndex);
      lastSyncedToStoreRef.current = nextMessages;
      setMessages(nextMessages);
      store.syncSessionMessages(sessionId, nextMessages);
    },
    [setMessages]
  );

  const restoreCheckpoint = useCallback(
    (checkpointId: string): CheckpointSnapshot | null => {
      if (status === "streaming" || status === "submitted") {
        suppressNextAbortSyncRef.current = true;
        void stop();
      }
      const snapshot = useAgentStore.getState().restoreCheckpoint(checkpointId);
      if (!snapshot) return null;

      if (snapshot.sessionId === activeSessionIdRef.current) {
        lastSyncedToStoreRef.current = snapshot.messagesSnapshot;
        setMessages(snapshot.messagesSnapshot);
      }
      return snapshot;
    },
    [status, stop, setMessages]
  );

  const undoRestore = useCallback((): boolean => {
    const store = useAgentStore.getState();
    const undo = store.lastRestoreUndo;
    const restored = store.undoLastRestore();
    if (!restored || !undo) return false;

    if (undo.sessionId === activeSessionIdRef.current) {
      const updated = useAgentStore
        .getState()
        .sessions.find((s) => s.id === undo.sessionId);
      if (updated) {
        lastSyncedToStoreRef.current = updated.messages;
        setMessages(updated.messages);
      }
    }
    return true;
  }, [setMessages]);

  const sendQueuedNow = useCallback(
    async (itemId: string) => {
      const sessionId = activeSessionIdRef.current;
      const store = useAgentStore.getState();
      const session = store.sessions.find((s) => s.id === sessionId);
      const item = session?.queuedPrompts.find((q) => q.id === itemId);
      if (!item) return;

      isDrainingQueueRef.current = true;
      store.removeQueuedPrompt(sessionId, itemId);

      try {
        if (status === "streaming" || status === "submitted") {
          await stop();
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 25);
          });
        }

        if (error) {
          clearError();
        }

        activeStreamSessionRef.current = sessionId;
        const metadata = {
          createdAt: new Date().toISOString(),
          modelId: useAgentStore.getState().config.modelId,
          ...(item.scenarioHint ? { scenarioTag: item.scenarioHint } : {}),
        };
        const requestOptions = {
          body: {
            ...(item.contextItems && item.contextItems.length > 0
              ? { contextItems: item.contextItems }
              : {}),
            ...(item.scenarioHint ? { scenarioHint: item.scenarioHint } : {}),
          },
        };

        if (item.files && item.files.length > 0 && !item.text.trim()) {
          await sendMessage({ files: item.files, metadata }, requestOptions);
          return;
        }

        await sendMessage(
          {
            text: item.text,
            ...(item.files && item.files.length > 0
              ? { files: item.files }
              : {}),
            metadata,
          },
          requestOptions
        );
      } finally {
        isDrainingQueueRef.current = false;
      }
    },
    [status, error, stop, clearError, sendMessage]
  );

  const removeQueued = useCallback((itemId: string) => {
    useAgentStore
      .getState()
      .removeQueuedPrompt(activeSessionIdRef.current, itemId);
  }, []);

  const stopGeneration = useCallback(async () => {
    if (isAudioSpeaking) {
      stopSpeaking();
      useAgentStore.getState().setAudioSpeaking(false);
    }
    const currentCfg = useAgentStore.getState().config;
    void cancelAgentTurn({
      apiEndpoint: currentCfg.apiEndpoint,
      apiKey: currentCfg.apiKey,
    }).catch(() => undefined);
    await stop();
  }, [isAudioSpeaking, stop]);

  const resetBackendSession = useCallback(
    async (compact: boolean) => {
      const currentCfg = useAgentStore.getState().config;
      await resetAgentSession(compact, currentCfg.harnessId, {
        apiEndpoint: currentCfg.apiEndpoint,
        apiKey: currentCfg.apiKey,
        conversationId: activeSessionIdRef.current,
      });
      await refreshBackendMeta();
    },
    [refreshBackendMeta]
  );

  const applySessionConfig = useCallback(
    async (patch: AgentBackendSessionConfig) => {
      const currentCfg = useAgentStore.getState().config;
      await updateAgentSessionConfig(patch, {
        apiEndpoint: currentCfg.apiEndpoint,
        apiKey: currentCfg.apiKey,
      });
      await refreshBackendMeta();
    },
    [refreshBackendMeta]
  );

  const getBranchInfoForMessage = useCallback(
    (messageId: string): MessageBranchInfo | null => {
      const idx = messages.findIndex((msg) => msg.id === messageId);
      if (idx === -1) return null;
      const msg = messages[idx];

      const candidates: string[] = [];
      if (msg.metadata?.branchGroupId) {
        candidates.push(msg.metadata.branchGroupId);
      }
      candidates.push(`${activeSessionId}:${msg.id}`);
      if (
        msg.role === "assistant" &&
        idx > 0 &&
        messages[idx - 1].role === "user"
      ) {
        candidates.push(`${activeSessionId}:${messages[idx - 1].id}`);
      }

      for (const key of candidates) {
        const branches = branchesByAnchor[key];
        if (!branches || branches.length <= 1) continue;
        const firstRole = branches[0]?.[0]?.role;
        if (msg.role === "user" && firstRole === "assistant") continue;
        return {
          anchorKey: key,
          count: branches.length,
          currentIndex: activeBranchIndex[key] ?? branches.length - 1,
        };
      }
      return null;
    },
    [messages, activeSessionId, branchesByAnchor, activeBranchIndex]
  );

  const personaState: AgentPersonaState = useMemo(() => {
    if (isVoiceListening) return "listening";
    if (isAudioSpeaking) return "speaking";
    if (status === "submitted" || status === "streaming") return "thinking";
    return "idle";
  }, [isVoiceListening, isAudioSpeaking, status]);

  const effectiveModelId = activeSession.modelId || config.modelId;
  const contextUsage = useMemo(
    () => computeContextUsage(messages, effectiveModelId),
    [messages, effectiveModelId]
  );

  const sessionTodos: QueueTodoItem[] = activeSession.todos;
  const sessionQueue: QueuedPromptItem[] = activeSession.queuedPrompts;
  const sessionSuggestions: string[] =
    suggestionsBySession[activeSession.id] ?? [];

  return {
    messages,
    status,
    error,
    clearError,
    stop: stopGeneration,
    regenerate,
    setMessages,
    sendPrompt,
    triggerScenario,
    approveTool,
    denyTool,
    submitQuestionResponse,
    regenerateFromMessage,
    editUserMessage,
    switchBranch,
    restoreCheckpoint,
    undoRestore,
    sendQueuedNow,
    removeQueued,
    getBranchInfoForMessage,
    personaState,
    contextUsage,
    activeSession,
    sessionArtifacts: [] as never[],
    sessionCheckpoints: [] as CheckpointSnapshot[],
    sessionTodos,
    sessionQueue,
    sessionSuggestions,
    workflowGraph: null,
    backendStatus,
    backendInfo,
    harnesses,
    backendError,
    isRefreshingMeta,
    refreshBackendMeta,
    resetBackendSession,
    applySessionConfig,
  };
}
