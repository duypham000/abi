import { TooltipProvider } from "@/components/ui/tooltip";
import {
  deleteAgentBackendSession,
  insertMarkdownSnippet,
  resetAgentSession,
} from "@/infrastructure/agent";
import { Suspense, lazy, useCallback, useState } from "react";
import { AgentActionDock } from "../components/AgentActionDock";
import { AgentComposer } from "../components/AgentComposer";
import { AgentConversationView } from "../components/AgentConversationView";
import { AgentErrorBoundary } from "../components/AgentErrorBoundary";
import { AgentHeader } from "../components/AgentHeader";
import type { InspectorTab } from "../components/AgentInspectorDrawer";
import { AgentSessionSidebar } from "../components/AgentSessionSidebar";
import { useAgentKeyboardShortcuts, useAgentRuntime } from "../hooks";
import { useAgentStore, type AgentViewTab } from "../store/agentStore";
import "../styles/agent-panel.css";

const AgentInspectorDrawer = lazy(() =>
  import("../components/AgentInspectorDrawer").then((m) => ({
    default: m.AgentInspectorDrawer,
  }))
);

export interface AgentPanelPageProps {
  panelMode?: boolean;
  presentationMode?: "dock" | "tab" | "popup";
  onCloseDock?: () => void;
  onSwitchToTab?: () => void;
  onDockRight?: () => void;
}

export function AgentPanelPage({
  panelMode = false,
  presentationMode,
  onCloseDock,
  onSwitchToTab,
  onDockRight,
}: AgentPanelPageProps) {
  const resolvedPresentationMode =
    presentationMode ?? (panelMode ? "dock" : "tab");

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("runtime");

  const sessions = useAgentStore((s) => s.sessions);
  const config = useAgentStore((s) => s.config);
  const activeViewTab = useAgentStore((s) => s.activeViewTab);
  const isHistoryOpen = useAgentStore((s) => s.isHistoryOpen);
  const micDeviceId = useAgentStore((s) => s.micDeviceId);
  const isVoiceListening = useAgentStore((s) => s.isVoiceListening);
  const pendingAskAI = useAgentStore((s) => s.pendingAskAI);

  const createSession = useAgentStore((s) => s.createSession);
  const selectSession = useAgentStore((s) => s.selectSession);
  const renameSession = useAgentStore((s) => s.renameSession);
  const deleteSession = useAgentStore((s) => s.deleteSession);
  const clearSessionMessages = useAgentStore((s) => s.clearSessionMessages);
  const setSessionMode = useAgentStore((s) => s.setSessionMode);
  const setSessionModel = useAgentStore((s) => s.setSessionModel);
  const updateMessageFeedback = useAgentStore((s) => s.updateMessageFeedback);
  const setActiveViewTab = useAgentStore((s) => s.setActiveViewTab);
  const setHistoryOpen = useAgentStore((s) => s.setHistoryOpen);
  const toggleTodo = useAgentStore((s) => s.toggleTodo);
  const pinContextItem = useAgentStore((s) => s.pinContextItem);
  const unpinContextItem = useAgentStore((s) => s.unpinContextItem);
  const updateConfig = useAgentStore((s) => s.updateConfig);
  const resetConfig = useAgentStore((s) => s.resetConfig);
  const setMicDeviceId = useAgentStore((s) => s.setMicDeviceId);
  const setVoiceListening = useAgentStore((s) => s.setVoiceListening);
  const consumeAskAI = useAgentStore((s) => s.consumeAskAI);

  const {
    messages,
    status,
    error,
    clearError,
    stop,
    regenerate,
    sendPrompt,
    approveTool,
    denyTool,
    regenerateFromMessage,
    editUserMessage,
    switchBranch,
    sendQueuedNow,
    removeQueued,
    getBranchInfoForMessage,
    personaState,
    contextUsage,
    activeSession,
    sessionTodos,
    sessionQueue,
    backendStatus,
    backendInfo,
    backendUsage,
    backendPrompts,
    backendAgyConfig,
    harnesses,
    backendError,
    isRefreshingMeta,
    isRefreshingUsage,
    refreshBackendMeta,
    refreshAgentUsage,
    resetBackendSession,
    applySessionConfig,
    saveAgyConfig,
    executeAgyCommand,
  } = useAgentRuntime();

  const isGenerating = status === "submitted" || status === "streaming";

  useAgentKeyboardShortcuts({
    isStreaming: isGenerating,
    onStop: () => {
      void stop();
    },
    enabled: true,
  });

  const handleOpenInspectorRuntime = useCallback(() => {
    setInspectorTab("runtime");
    setActiveViewTab("inspector");
  }, [setActiveViewTab]);

  const handleSelectViewTab = useCallback(
    (tab: AgentViewTab) => {
      if (tab === "inspector") {
        setInspectorTab("runtime");
      } else if (tab === "artifacts") {
        setActiveViewTab("chat");
        return;
      }
      setActiveViewTab(tab);
    },
    [setActiveViewTab]
  );

  const handleRetryLast = useCallback(() => {
    clearError();
    void regenerate();
  }, [clearError, regenerate]);

  const handleInsertToDoc = useCallback((markdown: string) => {
    void insertMarkdownSnippet(markdown);
  }, []);

  const effectiveTab: AgentViewTab =
    activeViewTab === "artifacts" ? "chat" : activeViewTab;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ai-agent-root flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <AgentHeader
          activeSession={activeSession}
          activeViewTab={effectiveTab}
          backendError={backendError}
          backendInfo={backendInfo}
          backendStatus={backendStatus}
          backendUsage={backendUsage}
          config={config}
          contextUsage={contextUsage}
          isHistoryOpen={isHistoryOpen}
          isRefreshingUsage={isRefreshingUsage}
          messages={messages}
          onCloseDock={onCloseDock}
          onCreateSession={() => {
            createSession();
          }}
          onDockRight={onDockRight}
          onOpenInspectorRuntime={handleOpenInspectorRuntime}
          onRefreshUsage={() => {
            void refreshAgentUsage();
          }}
          onRenameSession={renameSession}
          onSelectSession={selectSession}
          onSelectViewTab={handleSelectViewTab}
          onSwitchToTab={onSwitchToTab}
          onToggleHistory={() => setHistoryOpen(!isHistoryOpen)}
          personaState={personaState}
          presentationMode={resolvedPresentationMode}
          sessions={sessions}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AgentSessionSidebar
            activeSessionId={activeSession.id}
            isOpen={isHistoryOpen}
            onClose={() => setHistoryOpen(false)}
            onCreateSession={() => {
              createSession();
              setHistoryOpen(false);
            }}
            onDeleteSession={(sessionId) => {
              deleteSession(sessionId);
              void deleteAgentBackendSession(sessionId, {
                apiEndpoint: config.apiEndpoint,
                apiKey: config.apiKey,
                harnessId: config.harnessId,
              }).catch(() => undefined);
            }}
            onRenameSession={renameSession}
            onSelectSession={(sessionId) => {
              selectSession(sessionId);
            }}
            sessions={sessions}
          />

          <main className="relative flex min-w-0 flex-1 overflow-hidden">
            {effectiveTab === "chat" && (
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AgentErrorBoundary>
                  <AgentConversationView
                    backendError={backendError}
                    backendStatus={backendStatus}
                    error={error}
                    getBranchInfoForMessage={getBranchInfoForMessage}
                    messages={messages}
                    onApproveTool={approveTool}
                    onClearError={clearError}
                    onDenyTool={denyTool}
                    onEditUserMessage={editUserMessage}
                    onFeedback={(messageId, feedback) =>
                      updateMessageFeedback(
                        activeSession.id,
                        messageId,
                        feedback
                      )
                    }
                    onInsertToDoc={handleInsertToDoc}
                    onRegenerate={regenerateFromMessage}
                    onRetryLast={handleRetryLast}
                    onSendFollowUp={(text) => {
                      void sendPrompt({ text });
                    }}
                    onSwitchBranch={switchBranch}
                    personaState={personaState}
                    personaVariant={config.personaVariant}
                    sessionTitle={activeSession.title}
                    showTimestamps={config.showTimestamps}
                    status={status}
                  />
                </AgentErrorBoundary>

                <AgentActionDock
                  messages={messages}
                  onApproveTool={approveTool}
                  onDenyTool={denyTool}
                  onSendFollowUp={(text) => {
                    void sendPrompt({ text });
                  }}
                  pendingBackendApprovals={backendStatus?.pendingApprovals}
                  sessionId={activeSession.id}
                />

                <AgentComposer
                  backendInfo={backendInfo}
                  backendStatus={backendStatus}
                  backendUsage={backendUsage}
                  isVoiceListening={isVoiceListening}
                  micDeviceId={micDeviceId}
                  mode={activeSession.mode}
                  modelId={activeSession.modelId || config.modelId}
                  onClearSession={() => {
                    clearSessionMessages(activeSession.id);
                    void resetAgentSession(false, config.harnessId, {
                      apiEndpoint: config.apiEndpoint,
                      apiKey: config.apiKey,
                      conversationId: activeSession.id,
                    }).catch(() => undefined);
                  }}
                  onCompactSession={() => {
                    void resetBackendSession(true);
                  }}
                  onConsumeAskAI={consumeAskAI}
                  onCycleReasoningEffort={(nextEffort) =>
                    updateConfig({ reasoningEffort: nextEffort })
                  }
                  onPinContextItem={(item) =>
                    pinContextItem(activeSession.id, item)
                  }
                  onRemoveQueued={removeQueued}
                  onSendPrompt={sendPrompt}
                  onSendQueuedNow={sendQueuedNow}
                  onSetMicDeviceId={setMicDeviceId}
                  onSetMode={(nextMode) =>
                    setSessionMode(activeSession.id, nextMode)
                  }
                  onSetModel={(nextModel) =>
                    setSessionModel(activeSession.id, nextModel)
                  }
                  onSetVoiceListening={setVoiceListening}
                  onStop={stop}
                  onToggleTodo={(todoId) =>
                    toggleTodo(activeSession.id, todoId)
                  }
                  onUnpinContextItem={(itemId) =>
                    unpinContextItem(activeSession.id, itemId)
                  }
                  pendingAskAI={pendingAskAI}
                  pinnedContext={activeSession.pinnedContext}
                  reasoningEffort={config.reasoningEffort}
                  sessionQueue={sessionQueue}
                  sessionTodos={sessionTodos}
                  speechLang={config.speechLang}
                  status={status}
                />
              </div>
            )}

            {effectiveTab === "inspector" && (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                    Loading inspector…
                  </div>
                }
              >
                <AgentInspectorDrawer
                  backendAgyConfig={backendAgyConfig}
                  backendError={backendError}
                  backendInfo={backendInfo}
                  backendPrompts={backendPrompts}
                  backendStatus={backendStatus}
                  backendUsage={backendUsage}
                  config={config}
                  harnesses={harnesses}
                  initialTab={inspectorTab}
                  isRefreshingMeta={isRefreshingMeta}
                  isRefreshingUsage={isRefreshingUsage}
                  onApplySessionConfig={applySessionConfig}
                  onRefreshAgentUsage={refreshAgentUsage}
                  onRefreshBackendMeta={refreshBackendMeta}
                  onResetBackendSession={resetBackendSession}
                  onResetConfig={resetConfig}
                  onRunAgyCommand={executeAgyCommand}
                  onSaveAgyConfig={saveAgyConfig}
                  onUpdateConfig={updateConfig}
                />
              </Suspense>
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default AgentPanelPage;
