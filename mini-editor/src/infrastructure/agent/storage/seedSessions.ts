import type {
  AgentSession,
  AgentUIMessage,
  ArtifactDataPart,
  CheckpointSnapshot,
  WorkflowGraphDataPart,
} from "@/core/interfaces/agent";
import { generateSynthesizedWavBase64 } from "../voice/voiceService";

function utf8ToBase64(text: string): string {
  if (typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return btoa(text);
}

const TOUR_ARCHITECTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="360" viewBox="0 0 760 360">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
  </defs>
  <rect width="760" height="360" rx="16" fill="url(#bg)"/>
  <text x="32" y="42" fill="#f8fafc" font-family="ui-sans-serif,system-ui,sans-serif" font-size="18" font-weight="700">Tomo Local-First Sync + AI Agent Pipeline</text>
  <text x="32" y="64" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">BlockNote Yjs CRDT • SQLite app_kv • DynamicAgentTransport</text>
  <rect x="32" y="100" width="190" height="110" rx="12" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="50" y="132" fill="#38bdf8" font-family="ui-monospace,monospace" font-size="13" font-weight="700">Tauri / Web UI</text>
  <text x="50" y="156" fill="#cbd5e1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">React 19 + useChat</text>
  <text x="50" y="176" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">23 Typed Data Parts</text>
  <rect x="285" y="100" width="190" height="110" rx="12" fill="#1e293b" stroke="#818cf8" stroke-width="1.5"/>
  <text x="303" y="132" fill="#a5b4fc" font-family="ui-monospace,monospace" font-size="13" font-weight="700">SQLite + Yjs Hub</text>
  <text x="303" y="156" fill="#cbd5e1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">tomo-docs.db + :1234</text>
  <text x="303" y="176" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">hash-verified outbox</text>
  <rect x="538" y="100" width="190" height="110" rx="12" fill="#1e293b" stroke="#34d399" stroke-width="1.5"/>
  <text x="556" y="132" fill="#34d399" font-family="ui-monospace,monospace" font-size="13" font-weight="700">Go + Redis API</text>
  <text x="556" y="156" fill="#cbd5e1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">Gin :8080 + Worker</text>
  <text x="556" y="176" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">Snapshots &amp; Git Sync</text>
  <path d="M222 155 L285 155" stroke="url(#card)" stroke-width="2.5" stroke-dasharray="5 4"/>
  <path d="M475 155 L538 155" stroke="url(#card)" stroke-width="2.5" stroke-dasharray="5 4"/>
  <rect x="32" y="246" width="696" height="76" rx="12" fill="#0b1220" stroke="#334155"/>
  <text x="50" y="276" fill="#e2e8f0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" font-weight="600">Offline-Ready Telemetry: 14/14 Checks Passing • Zero ProseMirror Drift • 100% Typed Stream</text>
  <text x="50" y="300" fill="#34d399" font-family="ui-monospace,monospace" font-size="12">PASS  core/interfaces/agent • infrastructure/agent • voice/wav-synth • transport/mock</text>
</svg>`;

const TOUR_HTML_PREVIEW = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #f4f4f5; padding: 18px; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 16px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; background: rgba(16,185,129,.15); color: #34d399; font-size: 12px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
  .stat { background: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 10px; }
  .stat strong { display: block; font-size: 18px; margin-top: 4px; }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">Sync Engine Healthy</span>
    <h3 style="margin:10px 0 4px;">Tomo Workspace Telemetry</h3>
    <p style="margin:0;color:#a1a1aa;font-size:13px;">Real-time Yjs CRDT + SQLite cache reconciliation monitor</p>
    <div class="grid">
      <div class="stat"><span style="font-size:11px;color:#a1a1aa;">Dirty Docs</span><strong>0</strong></div>
      <div class="stat"><span style="font-size:11px;color:#a1a1aa;">Yjs Latency</span><strong>14ms</strong></div>
      <div class="stat"><span style="font-size:11px;color:#a1a1aa;">Tests Passed</span><strong>24/24</strong></div>
    </div>
  </div>
  <script>
    console.log("Tomo telemetry preview hydrated in sandbox");
  </script>
</body>
</html>`;

export function createDefaultArtifactsForTour(): ArtifactDataPart[] {
  return [
    {
      id: "artifact-tour-sync-panel",
      version: 2,
      title: "SyncHealthWidget.tsx",
      description:
        "Interactive workspace telemetry widget generated during the Tomo Agent Tour.",
      kind: "web",
      language: "html",
      content: TOUR_HTML_PREVIEW,
      previewUrl: "https://tomo.local/preview/sync-health",
      consoleLogs: [
        {
          level: "log",
          message: "[TomoPreview] Mounted SyncHealthWidget v2 (0 dirty docs)",
          timestampIso: "2026-11-23T06:30:05.000Z",
        },
        {
          level: "log",
          message: "[Yjs] Subscribed to room doc-101 state vector",
          timestampIso: "2026-11-23T06:30:06.000Z",
        },
      ],
      updatedAt: "2026-11-23T06:30:08.000Z",
    },
    {
      id: "artifact-tour-reconcile-ts",
      version: 1,
      title: "reconcileSyncHash.ts",
      description: "Type-safe ES2020 sync hash verifier for SQLite docCacheService.",
      kind: "code",
      language: "typescript",
      content: `export interface SyncVerificationResult {\n  docId: number;\n  inSync: boolean;\n  localHash: string;\n  remoteHash: string;\n}\n\nexport function verifyDocSyncHash(\n  docId: number,\n  localHash: string,\n  remoteHash: string\n): SyncVerificationResult {\n  return {\n    docId,\n    inSync: localHash === remoteHash,\n    localHash,\n    remoteHash,\n  };\n}\n`,
      updatedAt: "2026-11-23T06:28:12.000Z",
    },
  ];
}

export function createTourWorkflowGraph(): WorkflowGraphDataPart {
  return {
    runId: "wf-tour-01",
    title: "Tomo Agent Multi-Agent Verification Graph",
    nodes: [
      {
        id: "node-architect",
        label: "Planner Architect",
        description: "Maps Yjs rooms, SQLite hashes, and API contracts",
        model: "claude-sonnet-4-5",
        status: "completed",
        tokens: 1420,
        latencyMs: 680,
        outputSummary: "Scoped 3 affected modules and verified ES2020 constraints.",
        position: { x: 40, y: 80 },
      },
      {
        id: "node-builder",
        label: "Fullstack Implementer",
        description: "Generates typed contracts and telemetry widgets",
        model: "gpt-4o",
        status: "completed",
        tokens: 2180,
        latencyMs: 920,
        outputSummary: "Emitted SyncHealthWidget + verifyDocSyncHash patch.",
        position: { x: 460, y: 20 },
      },
      {
        id: "node-auditor",
        label: "QA & Security Auditor",
        description: "Runs vitest suite, tsc --noEmit, and stack trace check",
        model: "o3-mini",
        status: "completed",
        tokens: 960,
        latencyMs: 540,
        outputSummary: "24/24 assertions passed with zero type regressions.",
        position: { x: 460, y: 180 },
      },
    ],
    edges: [
      {
        id: "edge-arch-builder",
        source: "node-architect",
        target: "node-builder",
        animated: true,
      },
      {
        id: "edge-arch-auditor",
        source: "node-architect",
        target: "node-auditor",
        animated: true,
      },
    ],
  };
}

let cachedTourWavBase64: string | null = null;
let cachedTourSvgBase64: string | null = null;

function getTourWavBase64(): string {
  if (!cachedTourWavBase64) {
    cachedTourWavBase64 = generateSynthesizedWavBase64(1.2, 392);
  }
  return cachedTourWavBase64;
}

function getTourSvgBase64(): string {
  if (!cachedTourSvgBase64) {
    cachedTourSvgBase64 = utf8ToBase64(TOUR_ARCHITECTURE_SVG);
  }
  return cachedTourSvgBase64;
}

function createTourMessages(): AgentUIMessage[] {
  const artifacts = createDefaultArtifactsForTour();
  const workflowGraph = createTourWorkflowGraph();
  const wavBase64 = getTourWavBase64();
  const svgBase64 = getTourSvgBase64();

  return [
    {
      id: "tour-user-1",
      role: "user",
      metadata: {
        createdAt: "2026-11-23T06:25:00.000Z",
      },
      parts: [
        {
          type: "text",
          text: "Audit mini-editor's offline SQLite sync pipeline, fix any failing hash checks, verify with tests, and push the patch after confirming deployment target.",
        },
      ],
    },
    {
      id: "tour-assistant-1",
      role: "assistant",
      metadata: {
        modelId: "claude-sonnet-4-5",
        provider: "anthropic",
        createdAt: "2026-11-23T06:25:02.000Z",
        durationMs: 2840,
        finishReason: "stop",
        scenarioTag: "tour-engineering",
        usage: {
          inputTokens: 1850,
          inputTokenDetails: {
            noCacheTokens: 1250,
            cacheReadTokens: 600,
            cacheWriteTokens: 0,
          },
          outputTokens: 1120,
          outputTokenDetails: {
            textTokens: 780,
            reasoningTokens: 340,
          },
          totalTokens: 2970,
          cachedInputTokens: 600,
          reasoningTokens: 340,
        },
      },
      parts: [
        {
          type: "reasoning",
          state: "done",
          text: "Inspected `docCacheService.ts` and `syncEngine.ts`. First test run detected a stale `synced_hash` mismatch when `backend_uuid` was null; verifying fix and confirming push target before committing.",
        },
        {
          type: "data-chain-of-thought",
          id: "cot-tour-1",
          data: {
            title: "Workspace Analysis & Root Cause Discovery",
            defaultOpen: false,
            steps: [
              {
                id: "cot-1",
                label: "Scanned SQLite doc cache & sync engine contracts",
                description:
                  "Located `computeDocRemoteHashSync` and `synced_hash` drift edge case.",
                status: "complete",
                icon: "search",
                searchResults: [
                  "docCacheService.ts",
                  "syncEngine.ts",
                  "contentHash.ts",
                ],
              },
              {
                id: "cot-2",
                label: "Isolated failing test assertion in offline outbox suite",
                description: "Reproduced hash mismatch on unsynced local-only drafts.",
                status: "complete",
                icon: "code",
              },
              {
                id: "cot-3",
                label: "Applied fix, verified 24/24 tests, and pushed to main",
                status: "complete",
                icon: "check",
              },
            ],
          },
        },
        {
          type: "data-plan",
          id: "plan-tour-1",
          data: {
            title: "Offline Sync Hardening Plan",
            description:
              "Eliminate false dirty flags when reconciling local SQLite drafts with Go backend snapshots.",
            estimatedDuration: "~2 min",
            footerNote: "All 3 implementation steps verified cleanly.",
            steps: [
              {
                id: "p-1",
                title: "Audit hash derivation in docCacheService",
                description: "Check localHash vs remoteHash normalization.",
                status: "completed",
                files: ["src/infrastructure/tauri/docCacheService.ts"],
              },
              {
                id: "p-2",
                title: "Add strict verifyDocSyncHash utility & unit tests",
                description: "Cover local-only, pending, and merged states.",
                status: "completed",
                files: ["src/core/utils/contentHash.ts"],
              },
              {
                id: "p-3",
                title: "Validate Go API route schema and push commit",
                status: "completed",
                files: ["src/infrastructure/api/docsApi.ts"],
              },
            ],
          },
        },
        {
          type: "data-task-group",
          id: "task-tour-1",
          data: {
            title: "Completed Workspace File Operations",
            defaultOpen: false,
            items: [
              {
                id: "t-1",
                text: "Read local doc cache schema and hash comparison",
                status: "completed",
                files: [
                  {
                    name: "docCacheService.ts",
                    path: "src/infrastructure/tauri/docCacheService.ts",
                    language: "typescript",
                  },
                ],
              },
              {
                id: "t-2",
                text: "Updated sync verification helper and added test coverage",
                status: "completed",
                files: [
                  {
                    name: "reconcileSyncHash.ts",
                    path: "src/core/utils/reconcileSyncHash.ts",
                    language: "typescript",
                  },
                ],
              },
            ],
          },
        },
        {
          type: "data-queue-update",
          id: "queue-tour-1",
          data: {
            todos: [
              {
                id: "todo-1",
                title: "Inspect SQLite docCacheService & outbox queue",
                description: "Check dirty flag transitions",
                status: "completed",
              },
              {
                id: "todo-2",
                title: "Patch hash comparison and re-run test suite",
                description: "Zero regressions under tsc --noEmit",
                status: "completed",
              },
            ],
          },
        },
        {
          type: "tool-search_workspace",
          toolCallId: "tc-tour-search",
          state: "output-available",
          title: "Search Workspace",
          input: { query: "synced_hash", scope: "files", limit: 5 },
          output: {
            total: 2,
            matches: [
              {
                id: "file-sync-engine",
                title: "syncEngine.ts",
                path: "src/infrastructure/tauri/syncEngine.ts",
                score: 0.96,
              },
              {
                id: "doc-mock-102",
                title: "Local-First SQLite Offline Outbox Plan",
                path: "docs/local-first-outbox.md",
                score: 0.89,
              },
            ],
          },
        },
        {
          type: "tool-run_tests",
          toolCallId: "tc-tour-test-err",
          state: "output-error",
          title: "Initial Test Run (Pre-Fix)",
          input: { filter: "syncEngine", watch: false },
          errorText:
            "AssertionError: expected syncedHash 'a8f10c' to equal remoteHash 'a8f10c' when backendUuid is null",
        },
        {
          type: "data-stack-trace",
          id: "stack-tour-1",
          data: {
            errorType: "AssertionError",
            message:
              "syncedHash check treated unsynced local-only doc as remote conflict",
            filePath: "src/infrastructure/tauri/docCacheService.ts",
            line: 133,
            fixPrompt:
              "Guard computeRowSyncState against null backend_uuid before flagging remote conflict.",
            rawTrace: `AssertionError: expected syncedHash to remain null for local-only doc
    at computeRowSyncState (src/infrastructure/tauri/docCacheService.ts:133:11)
    at reconcileDocSnapshot (src/infrastructure/tauri/syncEngine.ts:84:22)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
          },
        },
        {
          type: "tool-ask_user",
          toolCallId: "tc-tour-question",
          state: "output-available",
          title: "Clarify Deployment Target",
          input: {
            question: "Which branch should receive the verified sync patch?",
            description: "All local unit tests now pass cleanly.",
            selectionMode: "single",
            options: [
              {
                value: "main",
                label: "main (Production branch)",
                description: "Commit and push directly after approval",
              },
              {
                value: "fix/sync-hash",
                label: "fix/sync-hash (Feature PR branch)",
                description: "Create an isolated pull request branch",
              },
            ],
            allowCustomInput: true,
          },
          output: {
            selectedValues: ["fix/sync-hash"],
            text: "Use PR branch and run full schema check first",
            answeredAt: "2026-11-23T06:26:10.000Z",
          },
        },
        {
          type: "tool-git_push",
          toolCallId: "tc-tour-push",
          state: "output-available",
          title: "Push Verified Patch",
          input: {
            remote: "origin",
            branch: "fix/sync-hash",
            force: false,
            commitsAhead: 1,
          },
          approval: {
            id: "apr-tour-1",
            approved: true,
            reason: "Approved after 24/24 tests passed",
          },
          output: {
            pushed: true,
            remote: "origin",
            branch: "fix/sync-hash",
            commitHash: "e41b9c2",
            status: "up-to-date",
          },
        },
        {
          type: "data-file-tree",
          id: "tree-tour-1",
          data: {
            rootLabel: "mini-editor",
            selectedPath: "src/core/utils/reconcileSyncHash.ts",
            nodes: [
              {
                path: "src",
                name: "src",
                kind: "folder",
                children: [
                  {
                    path: "src/core/utils/reconcileSyncHash.ts",
                    name: "reconcileSyncHash.ts",
                    kind: "file",
                    status: "added",
                    language: "typescript",
                    content: artifacts[1].content,
                  },
                  {
                    path: "src/infrastructure/tauri/docCacheService.ts",
                    name: "docCacheService.ts",
                    kind: "file",
                    status: "modified",
                    language: "typescript",
                  },
                ],
              },
            ],
          },
        },
        {
          type: "data-terminal",
          id: "term-tour-1",
          data: {
            title: "pnpm --dir mini-editor exec tsc --noEmit",
            command: "pnpm --dir mini-editor exec tsc --noEmit && pnpm test",
            ansiOutput:
              "\u001b[36m$ pnpm --dir mini-editor exec tsc --noEmit\u001b[0m\n\u001b[32m✓\u001b[0m TypeScript strict check passed (0 errors)\n\u001b[32m✓\u001b[0m 24 tests passed across 3 suites in 410ms\n",
            isStreaming: false,
            exitCode: 0,
            durationMs: 410,
          },
        },
        {
          type: "data-test-results",
          id: "tests-tour-1",
          data: {
            summary: {
              passed: 24,
              failed: 0,
              skipped: 0,
              total: 24,
              duration: 410,
            },
            suites: [
              {
                id: "suite-sync",
                name: "syncEngine.spec.ts",
                status: "passed",
                passed: 14,
                failed: 0,
                skipped: 0,
                tests: [
                  {
                    id: "tst-1",
                    name: "handles null backend_uuid cleanly",
                    status: "passed",
                    duration: 18,
                  },
                  {
                    id: "tst-2",
                    name: "reconciles 3-way merge without data loss",
                    status: "passed",
                    duration: 24,
                  },
                ],
              },
              {
                id: "suite-api",
                name: "docsApiContract.spec.ts",
                status: "passed",
                passed: 10,
                failed: 0,
                skipped: 0,
                tests: [
                  {
                    id: "tst-3",
                    name: "normalizes /api/v1/docs pagination envelope",
                    status: "passed",
                    duration: 15,
                  },
                ],
              },
            ],
          },
        },
        {
          type: "data-commit",
          id: "commit-tour-1",
          data: {
            hash: "e41b9c2",
            message: "fix(sync): guard null backendUuid during SQLite hash reconciliation",
            author: { name: "Tomo Agent", initials: "TA" },
            timestamp: "2026-11-23T06:26:45.000Z",
            files: [
              {
                path: "src/core/utils/reconcileSyncHash.ts",
                status: "added",
                additions: 22,
                deletions: 0,
              },
              {
                path: "src/infrastructure/tauri/docCacheService.ts",
                status: "modified",
                additions: 6,
                deletions: 2,
              },
            ],
          },
        },
        {
          type: "data-schema-display",
          id: "schema-tour-1",
          data: {
            method: "PUT",
            path: "/api/v1/docs/{id}",
            description: "Updates document content and returns confirmed remote hash.",
            parameters: [
              {
                name: "id",
                type: "string",
                required: true,
                location: "path",
                description: "Backend UUID or numeric local doc ID",
              },
            ],
            requestBody: [
              { name: "title", type: "string", required: true },
              { name: "content", type: "string", required: false },
              { name: "status", type: "number", required: true },
            ],
            responseBody: [
              { name: "id", type: "string", required: true },
              { name: "syncedHash", type: "string", required: true },
            ],
          },
        },
        {
          type: "data-env-vars",
          id: "env-tour-1",
          data: {
            title: "Verified Sync Runtime Variables",
            variables: [
              { name: "VITE_GO_API_URL", value: "http://127.0.0.1:8080/go", required: true },
              { name: "VITE_YJS_WS_URL", value: "ws://127.0.0.1:1234", required: true },
            ],
          },
        },
        {
          type: "data-package-info",
          id: "pkg-tour-1",
          data: {
            name: "ai",
            currentVersion: "6.0.100",
            newVersion: "6.0.105",
            changeType: "patch",
            description: "AI SDK v6 UIMessageChunk and ChatTransport runtime",
            dependencies: [
              { name: "@ai-sdk/react", version: "3.0.105" },
              { name: "zod", version: "4.3.6" },
            ],
          },
        },
        {
          type: "source-url",
          sourceId: "src-ai-sdk",
          url: "https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat",
          title: "AI SDK v6 UIMessage & ChatTransport Reference",
        },
        {
          type: "source-document",
          sourceId: "src-local-spec",
          mediaType: "text/markdown",
          title: "Local-First SQLite Offline Outbox Plan",
          filename: "docs/local-first-outbox.md",
        },
        {
          type: "data-inline-citations",
          id: "cit-tour-1",
          data: {
            paragraphs: [
              {
                id: "p-cit-1",
                leadText: "Local edits remain authoritative because ",
                claimText:
                  "Tomo computes deterministic content hashes before queuing remote sync",
                tailText: " without blocking the BlockNote editor.",
                citations: [
                  {
                    title: "Local-First SQLite Offline Outbox Plan",
                    url: "https://tomo.local/docs/local-first-outbox",
                    description: "Hash-verified dirty state machine in docCacheService.ts",
                    quote: "hasUnsyncedRemoteChanges = !backend_uuid || remoteHash !== syncedHash",
                  },
                ],
              },
            ],
          },
        },
        {
          type: "text",
          state: "done",
          text: "I resolved the `syncedHash` mismatch, verified all **24 tests**, and pushed commit `e41b9c2` to `fix/sync-hash`.\n\nQuick verification command:\n\n```bash\npnpm --dir mini-editor exec tsc --noEmit\n```\n\nAnd the typed helper snippet:\n\n```typescript\nimport { verifyDocSyncHash } from \"@/core/utils/reconcileSyncHash\";\n\nconst check = verifyDocSyncHash(101, localHash, remoteHash);\n```",
        },
      ],
    },
    {
      id: "tour-user-2",
      role: "user",
      metadata: {
        createdAt: "2026-11-23T06:29:00.000Z",
      },
      parts: [
        {
          type: "text",
          text: "Now generate the live UI preview, architecture diagram, voice narration with synced transcript, and multi-agent workflow graph.",
        },
      ],
    },
    {
      id: "tour-assistant-2",
      role: "assistant",
      metadata: {
        modelId: "gemini-2.5-pro",
        provider: "google",
        createdAt: "2026-11-23T06:29:02.000Z",
        durationMs: 3120,
        finishReason: "stop",
        scenarioTag: "tour-multimodal",
        usage: {
          inputTokens: 1420,
          inputTokenDetails: {
            noCacheTokens: 1420,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 1340,
          outputTokenDetails: {
            textTokens: 990,
            reasoningTokens: 350,
          },
          totalTokens: 2760,
          reasoningTokens: 350,
        },
      },
      parts: [
        {
          type: "data-subagent",
          id: "subagent-tour-1",
          data: {
            id: "sub-arch-1",
            name: "Planner Architect",
            model: "claude-sonnet-4-5",
            role: "System & Schema Lead",
            status: "completed",
            instructions:
              "Validate Yjs CRDT topology and produce a crisp component architecture.",
            tools: [
              {
                name: "search_workspace",
                description: "Search docs and source files in mini-editor",
                inputSchemaJson: JSON.stringify(
                  { type: "object", properties: { query: { type: "string" } } },
                  null,
                  2
                ),
              },
            ],
            outputSchemaJson:
              "interface TopologyResult { nodes: number; verified: boolean }",
            summary: "Verified 3-tier Tauri -> Yjs Hub -> Go API architecture.",
          },
        },
        {
          type: "data-workflow-graph",
          id: "workflow-tour-1",
          data: workflowGraph,
        },
        {
          type: "data-sandbox",
          id: "sandbox-tour-1",
          data: {
            title: "Sandbox: Sync Hash Benchmark",
            language: "typescript",
            code: `const started = performance.now();\nconst ok = "a8f10c" === "a8f10c";\nconsole.log({ ok, elapsedMs: +(performance.now() - started).toFixed(2) });`,
            output: `{ ok: true, elapsedMs: 0.08 }`,
            state: "output-available",
          },
        },
        {
          type: "data-jsx-preview",
          id: "jsx-tour-1",
          data: {
            title: "Live JSX Component Preview",
            isStreaming: false,
            jsx: `<div className="rounded-lg border bg-card p-4 space-y-2">\n  <div className="flex items-center justify-between">\n    <span className="font-semibold text-sm">Sync Health Monitor</span>\n    <span className="text-xs text-emerald-500 font-mono">24/24 PASS</span>\n  </div>\n  <p className="text-xs text-muted-foreground">SQLite app_kv + Yjs Room doc-101 synchronized cleanly.</p>\n</div>`,
          },
        },
        {
          type: "data-web-preview",
          id: "web-tour-1",
          data: {
            title: "SyncHealthWidget Live Preview",
            defaultUrl: "https://tomo.local/preview/sync-health",
            htmlSrcDoc: TOUR_HTML_PREVIEW,
            consoleLogs: artifacts[0].consoleLogs ?? [],
          },
        },
        {
          type: "data-generated-image",
          id: "img-tour-1",
          data: {
            prompt:
              "Tomo local-first sync pipeline diagram connecting Tauri UI, SQLite/Yjs Hub, and Go API",
            base64: svgBase64,
            mediaType: "image/svg+xml",
            alt: "Tomo Local-First Sync + AI Agent Pipeline Architecture",
          },
        },
        {
          type: "data-audio-speech",
          id: "audio-tour-1",
          data: {
            title: "Executive Summary Narration (Nova)",
            voiceId: "nova",
            durationSec: 3.2,
            base64Audio: wavBase64,
            mediaType: "audio/wav",
            segments: [
              {
                text: "All twenty-four workspace tests pass.",
                startSecond: 0,
                endSecond: 1.1,
              },
              {
                text: "SQLite sync hashes are verified",
                startSecond: 1.1,
                endSecond: 2.2,
              },
              {
                text: "and SyncHealthWidget is ready to inspect.",
                startSecond: 2.2,
                endSecond: 3.2,
              },
            ],
          },
        },
        {
          type: "data-artifact",
          id: artifacts[0].id,
          data: artifacts[0],
        },
        {
          type: "data-checkpoint",
          id: "cp-tour-1",
          data: {
            checkpointId: "chk-tour-01",
            label: "Verified Sync Fix & Multimodal Preview",
            timestampIso: "2026-11-23T06:30:10.000Z",
            affectedFiles: [
              "src/core/utils/reconcileSyncHash.ts",
              "src/infrastructure/tauri/docCacheService.ts",
            ],
          },
        },
        {
          type: "text",
          state: "done",
          text: "Everything is ready to explore: play the synthesized narration with synchronized transcript cues, inspect `SyncHealthWidget.tsx` in the Artifact Drawer, or restore from checkpoint `chk-tour-01` anytime.",
        },
        {
          type: "data-suggestions",
          id: "sugg-tour-1",
          data: {
            items: [
              "/workflow Orchestrate a full docs + canvas release pipeline",
              "/approval Test interactive Question + Confirmation flow",
              "/debug Reproduce and patch a TypeScript build regression",
            ],
          },
        },
      ],
    },
  ];
}

export function createDefaultCheckpointsForTour(): CheckpointSnapshot[] {
  const messages = createTourMessages();
  const artifacts = createDefaultArtifactsForTour();
  return [
    {
      id: "chk-tour-01",
      sessionId: "session-tomo-tour",
      messageId: "tour-assistant-2",
      label: "Verified Sync Fix & Multimodal Preview",
      createdAt: "2026-11-23T06:30:10.000Z",
      affectedFiles: [
        "src/core/utils/reconcileSyncHash.ts",
        "src/infrastructure/tauri/docCacheService.ts",
      ],
      messagesSnapshot: messages,
      artifactsSnapshot: artifacts,
    },
  ];
}

export function createInitialSessions(): AgentSession[] {
  const nowIso = new Date().toISOString();
  const tourMessages = createTourMessages();
  const tourArtifacts = createDefaultArtifactsForTour();

  return [
    {
      id: "session-new-chat",
      title: "New Agent Chat",
      createdAt: nowIso,
      updatedAt: nowIso,
      mode: "agent",
      modelId: "claude-sonnet-4-5",
      messages: [],
      artifacts: [],
      activeArtifactId: null,
      workflowGraph: null,
      todos: [],
      queuedPrompts: [],
      pinnedContext: [],
      branchSelections: {},
      summary: "Fresh workspace session",
    },
    {
      id: "session-tomo-tour",
      title: "Tomo Agent Tour (All Capabilities)",
      createdAt: "2026-11-23T06:25:00.000Z",
      updatedAt: "2026-11-23T06:30:10.000Z",
      mode: "agent",
      modelId: "claude-sonnet-4-5",
      messages: tourMessages,
      artifacts: tourArtifacts,
      activeArtifactId: tourArtifacts[0].id,
      workflowGraph: createTourWorkflowGraph(),
      todos: [
        {
          id: "todo-1",
          title: "Inspect SQLite docCacheService & outbox queue",
          description: "Check dirty flag transitions",
          status: "completed",
        },
        {
          id: "todo-2",
          title: "Patch hash comparison and re-run test suite",
          description: "Zero regressions under tsc --noEmit",
          status: "completed",
        },
      ],
      queuedPrompts: [],
      pinnedContext: [],
      branchSelections: {},
      isSeedTour: true,
      summary:
        "Interactive tour showcasing all 23 typed data parts, tools, approvals, audio, and workflows.",
    },
  ];
}
