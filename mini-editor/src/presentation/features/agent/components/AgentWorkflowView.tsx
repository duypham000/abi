import { Canvas } from "@/components/ai-elements/canvas";
import { Connection } from "@/components/ai-elements/connection";
import { Controls } from "@/components/ai-elements/controls";
import { Edge } from "@/components/ai-elements/edge";
import {
  Node,
  NodeAction,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from "@/components/ai-elements/node";
import { Panel } from "@/components/ai-elements/panel";
import { Toolbar } from "@/components/ai-elements/toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  WorkflowGraphDataPart,
  WorkflowNodeItem,
} from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import {
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection as RFConnection,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  Loader2Icon,
  PlayIcon,
  RotateCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentErrorBoundary } from "./AgentErrorBoundary";

export interface AgentWorkflowViewProps {
  workflowGraph: WorkflowGraphDataPart | null;
  isStreaming?: boolean;
  onRunWorkflow: () => void;
  onRerunFromNode: (node: WorkflowNodeItem) => void;
}

interface WorkflowFlowNodeData extends Record<string, unknown> {
  workflowNode: WorkflowNodeItem;
  hasTarget: boolean;
  hasSource: boolean;
  isPreview: boolean;
  onInspect: (node: WorkflowNodeItem) => void;
  onRerun: (node: WorkflowNodeItem) => void;
}

const STARTER_PREVIEW_GRAPH: WorkflowGraphDataPart = {
  runId: "starter-preview",
  title: "Multi-Agent Workspace Orchestration (Preview)",
  nodes: [
    {
      id: "starter-planner",
      label: "Planner Architect",
      description: "Decomposes tasks across Docs, Canvas & Go API",
      model: "claude-sonnet-4-5",
      status: "completed",
      tokens: 1120,
      latencyMs: 520,
      outputSummary:
        "Ready to map workspace contracts, SQLite tables, and strict ES2020 tasks.",
      position: { x: 40, y: 110 },
    },
    {
      id: "starter-implementer",
      label: "Code & Canvas Implementer",
      description: "Synthesizes typed interfaces and Yjs bindings",
      model: "gpt-4o",
      status: "pending",
      tokens: 0,
      latencyMs: 0,
      outputSummary: "Awaiting Planner handoff to synthesize code & diffs.",
      position: { x: 420, y: 20 },
    },
    {
      id: "starter-qa",
      label: "QA & Security Reviewer",
      description: "Runs tsc --noEmit, unit suites & approval gates",
      model: "o3-mini",
      status: "pending",
      tokens: 0,
      latencyMs: 0,
      outputSummary: "Awaiting implementation verification run.",
      position: { x: 420, y: 200 },
    },
  ],
  edges: [
    {
      id: "starter-e-1",
      source: "starter-planner",
      target: "starter-implementer",
      animated: true,
    },
    {
      id: "starter-e-2",
      source: "starter-planner",
      target: "starter-qa",
      temporary: true,
    },
  ],
};

function getStatusBadge(status: WorkflowNodeItem["status"]) {
  switch (status) {
    case "completed":
      return (
        <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="secondary">
          <CheckCircle2Icon className="size-3" />
          Done
        </Badge>
      );
    case "running":
      return (
        <Badge className="gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-300" variant="secondary">
          <Loader2Icon className="size-3 animate-spin" />
          Running
        </Badge>
      );
    case "error":
      return (
        <Badge className="gap-1" variant="destructive">
          <AlertTriangleIcon className="size-3" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge className="gap-1" variant="outline">
          <ClockIcon className="size-3" />
          Pending
        </Badge>
      );
  }
}

function WorkflowAgentNode({ data, selected }: NodeProps) {
  const { workflowNode, hasTarget, hasSource, isPreview, onInspect, onRerun } =
    data as WorkflowFlowNodeData;

  return (
    <Node
      className={cn(
        "w-72 border border-border bg-card shadow-sm transition-all",
        selected && "border-primary ring-2 ring-primary/30",
        workflowNode.status === "running" && "border-sky-500/60",
        workflowNode.status === "error" && "border-destructive/60"
      )}
      handles={{ target: hasTarget, source: hasSource }}
    >
      <Toolbar isVisible={Boolean(selected)}>
        <Button
          className="h-7 gap-1 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(workflowNode);
          }}
          size="xs"
          type="button"
          variant="ghost"
        >
          <EyeIcon className="size-3.5" />
          Inspect Node
        </Button>
        <Button
          className="h-7 gap-1 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onRerun(workflowNode);
          }}
          size="xs"
          type="button"
          variant="default"
        >
          <RotateCwIcon className="size-3.5" />
          Re-run from Node
        </Button>
      </Toolbar>

      <NodeHeader className="p-3">
        <div className="min-w-0">
          <NodeTitle className="truncate text-xs font-semibold">
            {workflowNode.label}
          </NodeTitle>
          <NodeDescription className="line-clamp-1 text-[11px]">
            {workflowNode.description}
          </NodeDescription>
        </div>
        <NodeAction>{getStatusBadge(workflowNode.status)}</NodeAction>
      </NodeHeader>

      <NodeContent className="space-y-2 p-3 text-xs">
        <p className="line-clamp-2 leading-relaxed text-muted-foreground">
          {workflowNode.outputSummary}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Badge className="font-mono text-[10px]" variant="outline">
            {workflowNode.model}
          </Badge>
          {isPreview && (
            <span className="text-[10px] text-muted-foreground">Preview</span>
          )}
        </div>
      </NodeContent>

      <NodeFooter className="justify-between px-3 py-2 text-[11px] text-muted-foreground">
        <span>{workflowNode.tokens.toLocaleString()} tok</span>
        <span>{workflowNode.latencyMs}ms</span>
      </NodeFooter>
    </Node>
  );
}

const NODE_TYPES = {
  workflowNode: WorkflowAgentNode,
};

const EDGE_TYPES = {
  animated: Edge.Animated,
  temporary: Edge.Temporary,
};

function WorkflowCanvasInner({
  workflowGraph,
  isStreaming = false,
  onRunWorkflow,
  onRerunFromNode,
}: AgentWorkflowViewProps) {
  const isStarterPreview = workflowGraph === null;
  const effectiveGraph = workflowGraph ?? STARTER_PREVIEW_GRAPH;

  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);

  const handleInspectNode = useCallback((node: WorkflowNodeItem) => {
    setInspectedNodeId(node.id);
  }, []);

  const computedNodes = useMemo<RFNode[]>(() => {
    const incomingTargets = new Set(effectiveGraph.edges.map((e) => e.target));
    return effectiveGraph.nodes.map((wfNode, idx) => ({
      id: wfNode.id,
      type: "workflowNode",
      position: wfNode.position,
      selected: wfNode.id === inspectedNodeId,
      data: {
        workflowNode: wfNode,
        hasTarget: incomingTargets.has(wfNode.id) || idx > 0,
        hasSource: true,
        isPreview: isStarterPreview,
        onInspect: handleInspectNode,
        onRerun: onRerunFromNode,
      } satisfies WorkflowFlowNodeData,
    }));
  }, [
    effectiveGraph,
    inspectedNodeId,
    isStarterPreview,
    handleInspectNode,
    onRerunFromNode,
  ]);

  const computedEdges = useMemo<RFEdge[]>(() => {
    return effectiveGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.temporary ? "temporary" : "animated",
    }));
  }, [effectiveGraph.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes, setNodes]);

  useEffect(() => {
    setEdges(computedEdges);
  }, [computedEdges, setEdges]);

  const onConnect = useCallback(
    (connection: RFConnection) => {
      setEdges((eds) =>
        addEdge({ ...connection, type: "temporary" }, eds)
      );
    },
    [setEdges]
  );

  const statusCounts = useMemo(() => {
    let completed = 0;
    let running = 0;
    let pending = 0;
    let error = 0;
    for (const node of effectiveGraph.nodes) {
      if (node.status === "completed") completed += 1;
      else if (node.status === "running") running += 1;
      else if (node.status === "error") error += 1;
      else pending += 1;
    }
    return { completed, running, pending, error };
  }, [effectiveGraph.nodes]);

  const inspectedNode = useMemo(
    () =>
      inspectedNodeId
        ? effectiveGraph.nodes.find((n) => n.id === inspectedNodeId) ?? null
        : null,
    [effectiveGraph.nodes, inspectedNodeId]
  );

  return (
    <div className="relative h-full min-h-[380px] w-full flex-1 overflow-hidden bg-sidebar">
      <Canvas
        connectionLineComponent={Connection}
        edgeTypes={EDGE_TYPES}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodes={nodes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => setInspectedNodeId(node.id)}
        onNodesChange={onNodesChange}
        onPaneClick={() => setInspectedNodeId(null)}
        panOnDrag
      >
        <Controls />

        {/* Top-Left Summary & Run Panel */}
        <Panel
          className="flex max-w-[calc(100%-1.5rem)] flex-col gap-1.5 p-2 shadow-sm"
          position="top-left"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <SparklesIcon className="size-3.5 shrink-0 text-primary" />
              <span className="truncate text-xs font-semibold text-foreground">
                {effectiveGraph.title}
              </span>
              {isStarterPreview && (
                <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="outline">
                  Starter
                </Badge>
              )}
            </div>

            <Button
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              disabled={isStreaming}
              onClick={onRunWorkflow}
              size="xs"
              type="button"
              variant="default"
            >
              <PlayIcon className="size-3 shrink-0" />
              <span>{isStarterPreview ? "Run Workflow" : "Re-run"}</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
              {statusCounts.completed} Done
            </Badge>
            <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
              {statusCounts.running} Run
            </Badge>
            <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
              {statusCounts.pending} Wait
            </Badge>
            {statusCounts.error > 0 && (
              <Badge className="px-1.5 py-0 text-[10px]" variant="destructive">
                {statusCounts.error} Err
              </Badge>
            )}
          </div>
        </Panel>

        {/* Bottom-Right Legend & Selected Node Inspector */}
        <Panel
          className="max-w-[calc(100%-4rem)] space-y-1.5 p-2 shadow-sm"
          position="bottom-right"
        >
          {inspectedNode ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {inspectedNode.label}
                </span>
                <Button
                  aria-label="Close node inspector"
                  className="size-5"
                  onClick={() => setInspectedNodeId(null)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {inspectedNode.outputSummary}
              </p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="font-mono">{inspectedNode.model}</span>
                <span>
                  {inspectedNode.tokens} tok · {inspectedNode.latencyMs}ms
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-primary" />
                Active handoff
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 border-t border-dashed border-ring" />
                Pending route
              </span>
              <span>Click any node to inspect</span>
            </div>
          )}
        </Panel>
      </Canvas>
    </div>
  );
}

export function AgentWorkflowView(props: AgentWorkflowViewProps) {
  return (
    <AgentErrorBoundary>
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} />
      </ReactFlowProvider>
    </AgentErrorBoundary>
  );
}
