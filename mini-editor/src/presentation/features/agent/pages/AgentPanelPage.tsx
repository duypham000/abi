import { TooltipProvider } from "@/components/ui/tooltip";
import type { AgentScenarioId, WorkflowNodeItem } from "@/core/interfaces/agent";
import { insertMarkdownSnippet } from "@/infrastructure/agent";
import { Suspense, lazy, useCallback, useState } from "react";
import { AgentComposer } from "../components/AgentComposer";
import { AgentConversationView } from "../components/AgentConversationView";
import { AgentErrorBoundary } from "../components/AgentErrorBoundary";
import { AgentHeader } from "../components/AgentHeader";
import type { InspectorTab } from "../components/AgentInspectorDrawer";
import { AgentSessionSidebar } from "../components/AgentSessionSidebar";
import { useAgentKeyboardShortcuts, useAgentRuntime } from "../hooks";
import { useAgentStore, type AgentViewTab } from "../store/agentStore";
import "../styles/agent-panel.css";

const AgentArtifactPane = lazy(() =>
  import("../components/AgentArtifactPane").then((m) => ({
    default: m.AgentArtifactPane,
  }))
);
const AgentWorkflowView = lazy(() =>
  import("../components/AgentWorkflowView").then((m) => ({
    default: m.AgentWorkflowView,
  }))
);
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

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("profile");

  const sessions = useAgentStore((s) => s.sessions);
  const config = useAgentStore((s) => s.config);
  const profile = useAgentStore((s) => s.profile);
  const activeViewTab = useAgentStore((s) => s.activeViewTab);
  const isHistoryOpen = useAgentStore((s) => s.isHistoryOpen);
  const isArtifactDrawerOpen = useAgentStore((s) => s.isArtifactDrawerOpen);
  const activeArtifactId = useAgentStore((s) => s.activeArtifactId);
  const lastRestoreUndo = useAgentStore((s) => s.lastRestoreUndo);
  const webSearchEnabled = useAgentStore((s) => s.webSearchEnabled);
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
  const openArtifact = useAgentStore((s) => s.openArtifact);
  const closeArtifact = useAgentStore((s) => s.closeArtifact);
  const toggleTodo = useAgentStore((s) => s.toggleTodo);
  const pinContextItem = useAgentStore((s) => s.pinContextItem);
  const unpinContextItem = useAgentStore((s) => s.unpinContextItem);
  const updateConfig = useAgentStore((s) => s.updateConfig);
  const updateProfile = useAgentStore((s) => s.updateProfile);
  const toggleToolPermission = useAgentStore((s) => s.toggleToolPermission);
  const resetConfig = useAgentStore((s) => s.resetConfig);
  const setWebSearchEnabled = useAgentStore((s) => s.setWebSearchEnabled);
  const setMicDeviceId = useAgentStore((s) => s.setMicDeviceId);
  const setVoiceListening = useAgentStore((s) => s.setVoiceListening);
  const consumeAskAI = useAgentStore((s) => s.consumeAskAI);
  const resetAllToDemo = useAgentStore((s) => s.resetAllToDemo);

  const {
    messages,
    status,
    error,
    clearError,
    stop,
    regenerate,
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
    sessionArtifacts,
    sessionCheckpoints,
    sessionTodos,
    sessionQueue,
    sessionSuggestions,
    workflowGraph,
  } = useAgentRuntime();

  const isGenerating = status === "submitted" || status === "streaming";

  useAgentKeyboardShortcuts({
    isStreaming: isGenerating,
    onStop: () => {
      void stop();
    },
    enabled: true,
  });

  const handleLaunchScenario = useCallback(
    (scenarioId: AgentScenarioId) => {
      setHistoryOpen(false);
      setActiveViewTab("chat");
      void triggerScenario(scenarioId);
    },
    [setHistoryOpen, setActiveViewTab, triggerScenario]
  );

  const handleOpenInspectorTransport = useCallback(() => {
    setInspectorTab("transport");
    setActiveViewTab("inspector");
  }, [setActiveViewTab]);

  const handleSelectViewTab = useCallback(
    (tab: AgentViewTab) => {
      if (tab === "inspector") {
        setInspectorTab("profile");
      }
      setActiveViewTab(tab);
    },
    [setActiveViewTab]
  );

  const handleRetryLast = useCallback(() => {
    clearError();
    void regenerate();
  }, [clearError, regenerate]);

  const handleRerunFromNode = useCallback(
    (node: WorkflowNodeItem) => {
      setActiveViewTab("chat");
      void sendPrompt({
        text: `/workflow Re-run workflow from "${node.label}" (${node.id}) with ${node.model}.`,
        scenarioHint: "workflow",
      });
    },
    [setActiveViewTab, sendPrompt]
  );

  const handleInsertToDoc = useCallback((markdown: string) => {
    void insertMarkdownSnippet(markdown);
  }, []);

  const hasTourSession = sessions.some((s) => s.id === "session-tomo-tour");

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ai-agent-root flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <AgentHeader
          activeSession={activeSession}
          activeViewTab={activeViewTab}
          artifactCount={sessionArtifacts.length}
          config={config}
          contextUsage={contextUsage}
          isHistoryOpen={isHistoryOpen}
          messages={messages}
          onCloseDock={onCloseDock}
          onCreateSession={() => {
            createSession();
          }}
          onDockRight={onDockRight}
          onOpenInspectorTransport={handleOpenInspectorTransport}
          onRenameSession={renameSession}
          onSelectSession={selectSession}
          onSelectViewTab={handleSelectViewTab}
          onSwitchToTab={onSwitchToTab}
          onToggleHistory={() => setHistoryOpen(!isHistoryOpen)}
          personaState={personaState}
          presentationMode={resolvedPresentationMode}
          sessions={sessions}
          workflowNodeCount={workflowGraph?.nodes.length ?? 0}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AgentSessionSidebar
            activeSessionId={activeSession.id}
            canUndoRestore={lastRestoreUndo !== null}
            checkpoints={sessionCheckpoints}
            isOpen={isHistoryOpen}
            onClose={() => setHistoryOpen(false)}
            onCreateSession={() => {
              createSession();
              setHistoryOpen(false);
            }}
            onDeleteSession={deleteSession}
            onLaunchScenario={handleLaunchScenario}
            onRenameSession={renameSession}
            onResetToDemo={() => {
              void resetAllToDemo();
            }}
            onRestoreCheckpoint={(checkpointId) => {
              restoreCheckpoint(checkpointId);
            }}
            onSelectSession={(sessionId) => {
              selectSession(sessionId);
            }}
            onUndoRestore={() => {
              undoRestore();
            }}
            sessions={sessions}
          />

          <main className="relative flex min-w-0 flex-1 overflow-hidden">
            {activeViewTab === "chat" && (
              <>
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <AgentErrorBoundary>
                    <AgentConversationView
                      checkpoints={sessionCheckpoints}
                      error={error}
                      getBranchInfoForMessage={getBranchInfoForMessage}
                      hasTourSession={hasTourSession}
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
                      onJumpToTour={() => selectSession("session-tomo-tour")}
                      onLaunchScenario={handleLaunchScenario}
                      onOpenArtifact={(artifactId) => openArtifact(artifactId)}
                      onOpenWorkflowTab={() => setActiveViewTab("workflow")}
                      onRegenerate={regenerateFromMessage}
                      onRestoreCheckpoint={(checkpointId) => {
                        restoreCheckpoint(checkpointId);
                      }}
                      onRetryLast={handleRetryLast}
                      onSendFollowUp={(text) => {
                        void sendPrompt({ text });
                      }}
                      onSubmitQuestion={submitQuestionResponse}
                      onSwitchBranch={switchBranch}
                      personaState={personaState}
                      personaVariant={config.personaVariant}
                      sessionSuggestions={sessionSuggestions}
                      sessionTitle={activeSession.title}
                      showTimestamps={config.showTimestamps}
                      status={status}
                      transportMode={config.transportMode}
                    />
                  </AgentErrorBoundary>

                  <AgentComposer
                    isVoiceListening={isVoiceListening}
                    micDeviceId={micDeviceId}
                    mode={activeSession.mode}
                    modelId={activeSession.modelId || config.modelId}
                    onClearSession={() =>
                      clearSessionMessages(activeSession.id)
                    }
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
                    onToggleWebSearch={setWebSearchEnabled}
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
                    webSearchEnabled={webSearchEnabled}
                  />
                </div>

                {isArtifactDrawerOpen && (
                  <div className="agent-artifact-shell flex h-full flex-col bg-background shadow-xl">
                    <Suspense
                      fallback={
                        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                          Loading artifacts…
                        </div>
                      }
                    >
                      <AgentArtifactPane
                        activeArtifactId={activeArtifactId}
                        artifacts={sessionArtifacts}
                        isStreaming={status === "streaming"}
                        onClose={closeArtifact}
                        onLaunchScenario={handleLaunchScenario}
                        onSelectArtifact={(id) => openArtifact(id)}
                        showCloseButton
                      />
                    </Suspense>
                  </div>
                )}
              </>
            )}

            {activeViewTab === "workflow" && (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                    Loading workflow canvas…
                  </div>
                }
              >
                <AgentWorkflowView
                  isStreaming={isGenerating}
                  onRerunFromNode={handleRerunFromNode}
                  onRunWorkflow={() => {
                    void triggerScenario("workflow");
                  }}
                  workflowGraph={workflowGraph}
                />
              </Suspense>
            )}

            {activeViewTab === "artifacts" && (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                    Loading artifacts…
                  </div>
                }
              >
                <AgentArtifactPane
                  activeArtifactId={activeArtifactId}
                  artifacts={sessionArtifacts}
                  className="flex-1"
                  isStreaming={status === "streaming"}
                  onLaunchScenario={handleLaunchScenario}
                  onSelectArtifact={(id) => openArtifact(id)}
                  showCloseButton={false}
                />
              </Suspense>
            )}

            {activeViewTab === "inspector" && (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                    Loading inspector…
                  </div>
                }
              >
                <AgentInspectorDrawer
                  config={config}
                  initialTab={inspectorTab}
                  micDeviceId={micDeviceId}
                  onResetConfig={resetConfig}
                  onSetMicDeviceId={setMicDeviceId}
                  onToggleToolPermission={toggleToolPermission}
                  onUpdateConfig={updateConfig}
                  onUpdateProfile={updateProfile}
                  profile={profile}
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
