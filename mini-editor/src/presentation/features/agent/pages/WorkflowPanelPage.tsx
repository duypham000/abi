import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WorkflowNodeItem } from "@/core/interfaces/agent";
import { SparklesIcon, WorkflowIcon } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { AgentWorkflowView } from "../components/AgentWorkflowView";
import { useAgentStore } from "../store/agentStore";
import "../styles/agent-panel.css";

export interface WorkflowPanelPageProps {
  panelMode?: boolean;
}

export function WorkflowPanelPage(_props: WorkflowPanelPageProps) {
  const hydrate = useAgentStore((s) => s.hydrate);
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const selectSession = useAgentStore((s) => s.selectSession);
  const requestAskAI = useAgentStore((s) => s.requestAskAI);
  const setDockOpen = useAgentStore((s) => s.setDockOpen);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );

  const workflowGraph = activeSession?.workflowGraph ?? null;

  const handleRunWorkflow = useCallback(() => {
    requestAskAI({
      prompt: "/workflow Orchestrate multi-agent workspace pipeline",
      autoSubmit: true,
      scenarioHint: "workflow",
      sourceView: "workflow",
    });
  }, [requestAskAI]);

  const handleRerunFromNode = useCallback(
    (node: WorkflowNodeItem) => {
      requestAskAI({
        prompt: `/workflow Re-run workflow from "${node.label}" (${node.id}) with ${node.model}.`,
        autoSubmit: true,
        scenarioHint: "workflow",
        sourceView: "workflow",
      });
    },
    [requestAskAI]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ai-agent-root flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <header className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur-xs">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <WorkflowIcon className="size-3.5" />
            </span>
            <span className="shrink-0 text-xs font-semibold tracking-tight text-foreground sm:text-sm">
              Agent Workflow
            </span>

            {sessions.length > 0 && activeSession && (
              <Select
                onValueChange={(id) => selectSession(id)}
                value={activeSession.id}
              >
                <SelectTrigger
                  aria-label="Select workflow session"
                  className="h-7 max-w-[230px] min-w-[130px] gap-1.5 px-2 text-xs"
                  size="sm"
                >
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent align="start" className="max-w-[300px]">
                  {sessions.map((session) => {
                    const hasGraph = Boolean(session.workflowGraph);
                    return (
                      <SelectItem key={session.id} value={session.id}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={
                              hasGraph
                                ? "size-1.5 shrink-0 rounded-full bg-emerald-500"
                                : "size-1.5 shrink-0 rounded-full bg-muted-foreground/35"
                            }
                          />
                          <span className="truncate">{session.title}</span>
                          {hasGraph && (
                            <Badge
                              className="ml-1 px-1 py-0 text-[9px]"
                              variant="secondary"
                            >
                              DAG
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setDockOpen(true)}
              size="xs"
              type="button"
              variant="outline"
            >
              <SparklesIcon className="size-3.5 text-primary" />
              <span className="agent-xs-hide">Open Agent Chat</span>
            </Button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AgentWorkflowView
            onRerunFromNode={handleRerunFromNode}
            onRunWorkflow={handleRunWorkflow}
            workflowGraph={workflowGraph}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

export default WorkflowPanelPage;
