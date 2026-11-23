import type { WorkflowGraphDataPart } from "@/core/interfaces/agent";
import {
  createMockUsage,
  getProviderForModel,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

function buildWorkflowState(
  runId: string,
  stage: 1 | 2 | 3 | 4
): WorkflowGraphDataPart {
  return {
    runId,
    title: "Multi-Agent Workspace Orchestration DAG",
    nodes: [
      {
        id: "wf-planner",
        label: "Planner Architect",
        description: "Decomposes requirements across Docs, Canvas, and Go API",
        model: "claude-sonnet-4-5",
        status: stage === 1 ? "running" : "completed",
        tokens: stage === 1 ? 420 : 1280,
        latencyMs: stage === 1 ? 180 : 610,
        outputSummary:
          stage === 1
            ? "Analyzing workspace boundaries..."
            : "Scoped 3 modules with strict ES2020 & Yjs invariants.",
        position: { x: 40, y: 90 },
      },
      {
        id: "wf-builder",
        label: "Code & Canvas Implementer",
        description: "Synthesizes typed interfaces and Yjs bindings",
        model: "gpt-4o",
        status:
          stage === 1
            ? "pending"
            : stage === 2
              ? "running"
              : "completed",
        tokens: stage < 2 ? 0 : stage === 2 ? 840 : 2140,
        latencyMs: stage < 2 ? 0 : stage === 2 ? 320 : 880,
        outputSummary:
          stage < 2
            ? "Waiting on Planner Architect"
            : stage === 2
              ? "Streaming TypeScript contracts..."
              : "Implemented typed transport & workspace bridge.",
        position: { x: 460, y: 10 },
      },
      {
        id: "wf-qa",
        label: "QA & Security Reviewer",
        description: "Validates tsc --noEmit, unit suites, and approval gates",
        model: "o3-mini",
        status:
          stage < 3 ? "pending" : stage === 3 ? "running" : "completed",
        tokens: stage < 3 ? 0 : stage === 3 ? 510 : 1090,
        latencyMs: stage < 3 ? 0 : stage === 3 ? 290 : 540,
        outputSummary:
          stage < 3
            ? "Waiting on Implementer"
            : stage === 3
              ? "Running strict TypeScript verification..."
              : "Zero TS errors; 24/24 assertions passed.",
        position: { x: 460, y: 190 },
      },
    ],
    edges: [
      {
        id: "e-plan-build",
        source: "wf-planner",
        target: "wf-builder",
        animated: stage === 2,
        temporary: stage === 1,
      },
      {
        id: "e-plan-qa",
        source: "wf-planner",
        target: "wf-qa",
        animated: stage === 3,
        temporary: stage < 3,
      },
    ],
  };
}

export async function runMultiAgentWorkflowScenario(
  ctx: StreamScenarioContext,
  builder: MockStreamBuilder
): Promise<void> {
  const { config, prompt } = ctx;
  const nowIso = new Date().toISOString();
  const provider = getProviderForModel(config.modelId);
  const runId = `wf-${Date.now().toString(36)}`;

  builder.start(undefined, {
    modelId: config.modelId,
    provider,
    createdAt: nowIso,
    scenarioTag: "workflow",
  });

  await builder.step(async () => {
    await builder.reasoning(
      `Orchestrating 3 specialized subagents for "${prompt.slice(0, 80)}":\n1. Planner Architect (claude-sonnet-4-5)\n2. Code & Canvas Implementer (gpt-4o)\n3. QA & Security Reviewer (o3-mini)`
    );

    builder.data(
      "queue-update",
      {
        todos: [
          {
            id: "q-wf-1",
            title: "Planner Architect: Map module boundaries",
            status: "pending",
          },
          {
            id: "q-wf-2",
            title: "Implementer: Synthesize contracts & bindings",
            status: "pending",
          },
          {
            id: "q-wf-3",
            title: "QA Reviewer: Verify tsc & test suites",
            status: "pending",
          },
        ],
      },
      "queue-wf"
    );

    // Stage 1: Planner running
    builder.data("workflow-graph", buildWorkflowState(runId, 1), "workflow-main");
    await builder.delay(3);

    if (builder.isToolEnabled("spawn_subagent")) {
      await builder.toolCompleted(
        "spawn_subagent",
        {
          subagentId: "wf-planner",
          name: "Planner Architect",
          model: "claude-sonnet-4-5",
          task: "Map module boundaries and Yjs/SQLite invariants",
        },
        {
          subagentId: "wf-planner",
          status: "completed",
          tokensUsed: 1280,
          summary: "Scoped 3 modules and ES2020 invariants.",
        },
        "Spawn Planner Architect"
      );
    }

    builder.data("subagent", {
      id: "wf-planner",
      name: "Planner Architect",
      model: "claude-sonnet-4-5",
      role: "Architecture & Boundary Lead",
      status: "completed",
      instructions:
        "Audit workspace interfaces, preserve ProseMirror pins, and output a clear implementation spec.",
      tools: [
        {
          name: "search_workspace",
          description: "Search docs and TypeScript interfaces",
          inputSchemaJson: JSON.stringify(
            { type: "object", properties: { query: { type: "string" } } },
            null,
            2
          ),
        },
      ],
      outputSchemaJson:
        "interface PlanSpec { modules: string[]; invariants: string[] }",
      summary: "Scoped 3 modules with strict ES2020 & Yjs invariants.",
    });

    // Stage 2: Implementer running
    builder.data(
      "queue-update",
      {
        todos: [
          {
            id: "q-wf-1",
            title: "Planner Architect: Map module boundaries",
            status: "completed",
          },
          {
            id: "q-wf-2",
            title: "Implementer: Synthesize contracts & bindings",
            status: "pending",
          },
          {
            id: "q-wf-3",
            title: "QA Reviewer: Verify tsc & test suites",
            status: "pending",
          },
        ],
      },
      "queue-wf"
    );
    builder.data("workflow-graph", buildWorkflowState(runId, 2), "workflow-main");
    await builder.delay(3);

    if (builder.isToolEnabled("spawn_subagent")) {
      await builder.toolCompleted(
        "spawn_subagent",
        {
          subagentId: "wf-builder",
          name: "Code & Canvas Implementer",
          model: "gpt-4o",
          task: "Synthesize typed contracts and workspace bindings",
        },
        {
          subagentId: "wf-builder",
          status: "completed",
          tokensUsed: 2140,
          summary: "Implemented typed transport & workspace bridge.",
        },
        "Spawn Implementer"
      );
    }

    builder.data("subagent", {
      id: "wf-builder",
      name: "Code & Canvas Implementer",
      model: "gpt-4o",
      role: "Implementation Specialist",
      status: "completed",
      instructions:
        "Generate strict ES2020 TypeScript code with zero unused symbols and clean port abstractions.",
      tools: [
        {
          name: "edit_doc",
          description: "Update workspace documentation and specs",
          inputSchemaJson: JSON.stringify(
            { type: "object", properties: { docId: { type: "number" } } },
            null,
            2
          ),
        },
      ],
      outputSchemaJson:
        "interface BuildOutput { filesUpdated: string[]; compiled: boolean }",
      summary: "Implemented typed transport & workspace bridge.",
    });

    // Stage 3: QA running
    builder.data(
      "queue-update",
      {
        todos: [
          {
            id: "q-wf-1",
            title: "Planner Architect: Map module boundaries",
            status: "completed",
          },
          {
            id: "q-wf-2",
            title: "Implementer: Synthesize contracts & bindings",
            status: "completed",
          },
          {
            id: "q-wf-3",
            title: "QA Reviewer: Verify tsc & test suites",
            status: "pending",
          },
        ],
      },
      "queue-wf"
    );
    builder.data("workflow-graph", buildWorkflowState(runId, 3), "workflow-main");
    await builder.delay(3);

    if (builder.isToolEnabled("spawn_subagent")) {
      await builder.toolCompleted(
        "spawn_subagent",
        {
          subagentId: "wf-qa",
          name: "QA & Security Reviewer",
          model: "o3-mini",
          task: "Run tsc --noEmit and test suite verification",
        },
        {
          subagentId: "wf-qa",
          status: "completed",
          tokensUsed: 1090,
          summary: "Zero TS errors; 24/24 assertions passed.",
        },
        "Spawn QA Reviewer"
      );
    }

    builder.data("subagent", {
      id: "wf-qa",
      name: "QA & Security Reviewer",
      model: "o3-mini",
      role: "Verification & Security Lead",
      status: "completed",
      instructions:
        "Verify TypeScript strict compilation, permission boundaries, and test coverage.",
      tools: [
        {
          name: "run_tests",
          description: "Execute workspace test suite",
          inputSchemaJson: JSON.stringify(
            { type: "object", properties: { filter: { type: "string" } } },
            null,
            2
          ),
        },
      ],
      outputSchemaJson:
        "interface VerificationReport { tscErrors: number; passed: number }",
      summary: "Zero TS errors; 24/24 assertions passed.",
    });

    // Stage 4: All completed
    builder.data(
      "queue-update",
      {
        todos: [
          {
            id: "q-wf-1",
            title: "Planner Architect: Map module boundaries",
            status: "completed",
          },
          {
            id: "q-wf-2",
            title: "Implementer: Synthesize contracts & bindings",
            status: "completed",
          },
          {
            id: "q-wf-3",
            title: "QA Reviewer: Verify tsc & test suites",
            status: "completed",
          },
        ],
      },
      "queue-wf"
    );
    builder.data("workflow-graph", buildWorkflowState(runId, 4), "workflow-main");

    builder.data("checkpoint", {
      checkpointId: `chk-wf-${Date.now().toString(36)}`,
      label: "Multi-Agent Workflow Completed",
      timestampIso: nowIso,
      affectedFiles: [
        "src/core/interfaces/agent/message.ts",
        "src/infrastructure/agent/transport/mockAgentTransport.ts",
      ],
    });

    await builder.text(
      `Multi-agent orchestration **completed** across 3 specialized agents (**4,510 total tokens**, **2,030ms** aggregate compute).\n\nOpen the **Workflow** tab in the inspector drawer to zoom, pan, and inspect each agent node's telemetry.`
    );

    builder.data("suggestions", {
      items: [
        "/approval Push the verified workflow output to staging",
        "/preview Render a visual dashboard of this agent run",
      ],
    });
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(2240, 1290, 410, 600),
      finishReason: "stop",
    },
    "stop"
  );
}
