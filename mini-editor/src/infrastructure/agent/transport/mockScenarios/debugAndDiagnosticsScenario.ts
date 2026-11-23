import type { ArtifactDataPart } from "@/core/interfaces/agent";
import {
  createMockUsage,
  getProviderForModel,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

const FIX_PATCH_DIFF = `diff --git a/src/infrastructure/tauri/syncEngine.ts b/src/infrastructure/tauri/syncEngine.ts
index 4b912c0..f81c309 100644
--- a/src/infrastructure/tauri/syncEngine.ts
+++ b/src/infrastructure/tauri/syncEngine.ts
@@ -78,7 +78,10 @@ export async function reconcileDocSnapshot(docId: number, remoteHash: string) {
   const snapshot = await getDocSyncSnapshot(docId);
-  if (snapshot.syncedHash !== remoteHash) {
+  if (!snapshot) return { status: "missing" as const };
+  // Guard local-only documents (backendUuid === null) from spurious conflict loops
+  if (!snapshot.backendUuid) {
+    return { status: "local-only" as const, localHash: snapshot.localHash };
+  }
+  if (snapshot.syncedHash && snapshot.syncedHash !== remoteHash) {
     return { status: "conflict" as const, snapshot };
   }
   return { status: "clean" as const };
`;

export async function runDebugAndDiagnosticsScenario(
  ctx: StreamScenarioContext,
  builder: MockStreamBuilder
): Promise<void> {
  const { config, prompt } = ctx;
  const nowIso = new Date().toISOString();
  const provider = getProviderForModel(config.modelId);

  builder.start(undefined, {
    modelId: config.modelId,
    provider,
    createdAt: nowIso,
    scenarioTag: "debug",
  });

  await builder.step(async () => {
    await builder.reasoning(
      `Investigating diagnostic query: "${prompt.slice(0, 80)}".\nRunning failing test filter, capturing stack trace, reproducing inside isolated sandbox, and validating fix patch.`
    );

    if (builder.isToolEnabled("run_tests")) {
      await builder.toolError(
        "run_tests",
        { filter: "reconcileDocSnapshot", watch: false },
        "TypeError: Cannot read properties of null (reading 'syncedHash') at reconcileDocSnapshot (src/infrastructure/tauri/syncEngine.ts:81:17)",
        "Run Diagnostic Test Filter"
      );
    }

    builder.data("stack-trace", {
      errorType: "TypeError",
      message: "Cannot read properties of null (reading 'syncedHash')",
      filePath: "src/infrastructure/tauri/syncEngine.ts",
      line: 81,
      fixPrompt:
        "Add null guard on getDocSyncSnapshot(docId) and short-circuit local-only docs when backendUuid is null.",
      rawTrace: `TypeError: Cannot read properties of null (reading 'syncedHash')
    at reconcileDocSnapshot (src/infrastructure/tauri/syncEngine.ts:81:17)
    at flushDirtyDocs (src/infrastructure/tauri/outboxService.ts:112:24)
    at async SyncCoordinator.tick (src/infrastructure/tauri/syncEngine.ts:154:9)
    at async runMicrotasks (node:internal/process/task_queues:105:5)`,
    });

    builder.data(
      "terminal",
      {
        title: "Diagnostics & Reproduction Runner",
        command: "pnpm --dir mini-editor test -- syncEngine",
        ansiOutput:
          "\u001b[36m$ pnpm --dir mini-editor test -- syncEngine\u001b[0m\n\u001b[31mFAIL\u001b[0m  src/infrastructure/tauri/syncEngine.spec.ts\n  \u001b[31m✕\u001b[0m returns clean status when snapshot is null (9ms)\n",
        isStreaming: true,
      },
      "term-debug-diag"
    );

    await builder.delay(3);

    builder.data("sandbox", {
      title: "Sandbox Reproduction & Patch Verification",
      language: "typescript",
      code: `const snapshot = null;\nconst safeStatus = !snapshot ? "missing" : snapshot.backendUuid ? "synced" : "local-only";\nconsole.log({ safeStatus });`,
      output: `{ safeStatus: "missing" }`,
      state: "output-available",
    });

    builder.data(
      "terminal",
      {
        title: "Diagnostics & Reproduction Runner",
        command: "pnpm --dir mini-editor test -- syncEngine",
        ansiOutput:
          "\u001b[36m$ pnpm --dir mini-editor test -- syncEngine\u001b[0m\n\u001b[31mFAIL\u001b[0m  src/infrastructure/tauri/syncEngine.spec.ts (initial)\n\u001b[33m→ Applying null & backendUuid guard in syncEngine.ts...\u001b[0m\n\u001b[32mPASS\u001b[0m  src/infrastructure/tauri/syncEngine.spec.ts (12/12 passed in 28ms)\n\u001b[32m✓\u001b[0m  tsc --noEmit exited with code 0\n",
        isStreaming: false,
        exitCode: 0,
        durationMs: 490,
      },
      "term-debug-diag"
    );

    builder.data("test-results", {
      summary: {
        passed: 11,
        failed: 1,
        skipped: 0,
        total: 12,
        duration: 490,
      },
      suites: [
        {
          id: "suite-diag-1",
          name: "syncEngine.spec.ts (Pre-Fix Snapshot)",
          status: "failed",
          passed: 3,
          failed: 1,
          skipped: 0,
          tests: [
            {
              id: "td-1",
              name: "handles missing snapshot gracefully",
              status: "failed",
              duration: 9,
              errorMessage: "TypeError: Cannot read properties of null (reading 'syncedHash')",
              errorStack: "at reconcileDocSnapshot (src/infrastructure/tauri/syncEngine.ts:81:17)",
            },
            {
              id: "td-2",
              name: "skips conflict loop for local-only drafts",
              status: "passed",
              duration: 6,
            },
          ],
        },
        {
          id: "suite-diag-2",
          name: "syncEngine.spec.ts (Post-Patch Verified)",
          status: "passed",
          passed: 8,
          failed: 0,
          skipped: 0,
          tests: [
            {
              id: "td-3",
              name: "returns 'missing' when snapshot is null",
              status: "passed",
              duration: 4,
            },
            {
              id: "td-4",
              name: "returns 'local-only' when backendUuid is null",
              status: "passed",
              duration: 5,
            },
          ],
        },
      ],
    });

    const fixArtifact: ArtifactDataPart = {
      id: `art-fix-${Date.now().toString(36)}`,
      version: 1,
      title: "syncEngine-null-guard.diff",
      description: "Verified patch fixing null snapshot dereference in syncEngine.ts.",
      kind: "diff",
      language: "diff",
      content: FIX_PATCH_DIFF,
      updatedAt: nowIso,
    };
    builder.data("artifact", fixArtifact, fixArtifact.id);

    builder.data("checkpoint", {
      checkpointId: `chk-dbg-${Date.now().toString(36)}`,
      label: "Diagnosed & Patched syncEngine Null Guard",
      timestampIso: nowIso,
      affectedFiles: ["src/infrastructure/tauri/syncEngine.ts"],
    });

    await builder.text(
      `### Root Cause & Fix Summary\n\n**Root Cause:** \`reconcileDocSnapshot\` read \`snapshot.syncedHash\` without checking whether \`getDocSyncSnapshot(docId)\` returned \`null\` or if \`backendUuid\` was still unset on a local-only draft.\n\n**Applied Patch:**\n\`\`\`diff\n${FIX_PATCH_DIFF}\`\`\`\n\nAll post-patch checks and \`tsc --noEmit\` now pass cleanly.`
    );

    builder.data("suggestions", {
      items: [
        "/code Write regression unit tests for outboxService.ts too",
        "/approval Commit and push this diagnostic fix",
      ],
    });
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(1540, 820, 310, 240),
      finishReason: "stop",
    },
    "stop"
  );
}
