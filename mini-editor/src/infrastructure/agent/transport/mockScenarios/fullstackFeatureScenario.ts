import type { ArtifactDataPart } from "@/core/interfaces/agent";
import {
  createMockUsage,
  getProviderForModel,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

const FEATURE_HOOK_CODE = `import { useCallback, useEffect, useState } from "react";
import { getDocFromSqlite, saveDocLocally } from "@/infrastructure/tauri/docCacheService";

export interface OfflineSyncBannerState {
  pendingCount: number;
  lastSyncedAt: string | null;
  isReconciling: boolean;
}

export function useOfflineSyncBanner(docId: number) {
  const [state, setState] = useState<OfflineSyncBannerState>({
    pendingCount: 0,
    lastSyncedAt: null,
    isReconciling: false,
  });

  const syncNow = useCallback(async () => {
    setState((prev) => ({ ...prev, isReconciling: true }));
    const doc = await getDocFromSqlite(docId);
    if (doc) {
      await saveDocLocally(docId, { title: doc.title, content: doc.content }, false);
    }
    setState({
      pendingCount: 0,
      lastSyncedAt: new Date().toISOString(),
      isReconciling: false,
    });
  }, [docId]);

  useEffect(() => {
    void syncNow();
  }, [syncNow]);

  return { ...state, syncNow };
}
`;

export async function runFullstackFeatureScenario(
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
    scenarioTag: "fullstack",
  });

  await builder.step(async () => {
    await builder.reasoning(
      `Decomposing feature request "${prompt.slice(0, 80)}".\n1. Inspect existing SQLite docCacheService & Go /api/v1/docs endpoints.\n2. Scaffold ES2020-compliant TypeScript hook, API contract, and tests.\n3. Verify strict typechecking (noUnusedLocals / noUnusedParameters) and stage an atomic commit.`
    );

    builder.data(
      "plan",
      {
        title: "Offline Sync Banner & API Telemetry Feature",
        description:
          "Add real-time dirty-state tracking across SQLite cache, Go sync endpoint, and unit tests.",
        isStreaming: true,
        estimatedDuration: "~45s",
        steps: [
          {
            id: "step-1",
            title: "Inspect workspace docs & SQLite cache",
            status: "in_progress",
            files: ["src/infrastructure/tauri/docCacheService.ts"],
          },
          {
            id: "step-2",
            title: "Implement useOfflineSyncBanner hook & route schema",
            status: "pending",
            files: ["src/presentation/hooks/useOfflineSyncBanner.ts"],
          },
          {
            id: "step-3",
            title: "Run unit tests and stage verified commit",
            status: "pending",
          },
        ],
      },
      "plan-fullstack"
    );

    await builder.delay(2);

    builder.data(
      "chain-of-thought",
      {
        title: "Exploring Tomo Workspace Contracts",
        defaultOpen: true,
        steps: [
          {
            id: "cot-fs-1",
            label: "Located local SQLite doc cache and hash utilities",
            description: "Matched docCacheService.ts and contentHash.ts.",
            status: "complete",
            icon: "search",
            searchResults: [
              "docCacheService.ts",
              "contentHash.ts",
              "docsApi.ts",
            ],
          },
          {
            id: "cot-fs-2",
            label: "Verified Go /api/v1/docs/sync-status contract",
            status: "complete",
            icon: "code",
          },
          {
            id: "cot-fs-3",
            label: "Generating ES2020 hook, tests, and package verification",
            status: "active",
            icon: "terminal",
          },
        ],
      },
      "cot-fullstack"
    );

    if (builder.isToolEnabled("search_workspace")) {
      await builder.toolCompleted(
        "search_workspace",
        { query: "getDocSyncSnapshot", scope: "files", limit: 6 },
        {
          total: 2,
          matches: [
            {
              id: "file-doc-cache",
              title: "docCacheService.ts",
              path: "src/infrastructure/tauri/docCacheService.ts",
              score: 0.98,
            },
            {
              id: "file-sync-engine",
              title: "syncEngine.ts",
              path: "src/infrastructure/tauri/syncEngine.ts",
              score: 0.91,
            },
          ],
        },
        "Search Workspace"
      );
    }

    if (builder.isToolEnabled("read_doc")) {
      await builder.toolCompleted(
        "read_doc",
        { docId: 102, section: "Outbox Conflict Detection" },
        {
          docId: 102,
          title: "Local-First SQLite Offline Outbox Plan",
          wordCount: 412,
          excerpt:
            "Compare localHash vs syncedHash and surface pending dirty doc counts without blocking editing.",
        },
        "Read Architecture Spec"
      );
    }

    builder.data(
      "task-group",
      {
        title: "Workspace Files Created & Updated",
        defaultOpen: true,
        items: [
          {
            id: "task-fs-1",
            text: "Created React hook useOfflineSyncBanner.ts",
            status: "completed",
            files: [
              {
                name: "useOfflineSyncBanner.ts",
                path: "src/presentation/hooks/useOfflineSyncBanner.ts",
                language: "typescript",
              },
            ],
          },
          {
            id: "task-fs-2",
            text: "Registered Go sync status DTO contract",
            status: "completed",
            files: [
              {
                name: "docsApi.ts",
                path: "src/infrastructure/api/docsApi.ts",
                language: "typescript",
              },
            ],
          },
        ],
      },
      "tasks-fullstack"
    );

    if (builder.isToolEnabled("edit_doc")) {
      await builder.toolCompleted(
        "edit_doc",
        {
          docId: 102,
          heading: "Sync Banner Telemetry",
          markdown:
            "- Added `useOfflineSyncBanner(docId)` polling SQLite dirty hashes cleanly.",
          mode: "append",
        },
        { docId: 102, updated: true, linesChanged: 4 },
        "Update Spec Doc"
      );
    }

    builder.data("file-tree", {
      rootLabel: "mini-editor",
      selectedPath: "src/presentation/hooks/useOfflineSyncBanner.ts",
      nodes: [
        {
          path: "src",
          name: "src",
          kind: "folder",
          children: [
            {
              path: "src/presentation/hooks/useOfflineSyncBanner.ts",
              name: "useOfflineSyncBanner.ts",
              kind: "file",
              status: "added",
              language: "typescript",
              content: FEATURE_HOOK_CODE,
            },
            {
              path: "src/infrastructure/api/docsApi.ts",
              name: "docsApi.ts",
              kind: "file",
              status: "modified",
              language: "typescript",
            },
            {
              path: "src/infrastructure/tauri/syncEngine.ts",
              name: "syncEngine.ts",
              kind: "file",
              status: "modified",
              language: "typescript",
            },
          ],
        },
      ],
    });

    builder.data("schema-display", {
      method: "POST",
      path: "/api/v1/docs/{id}/sync-status",
      description:
        "Verifies local content hash against Go backend snapshot and returns dirty diff metadata.",
      parameters: [
        {
          name: "id",
          type: "string",
          required: true,
          location: "path",
          description: "Document numeric ID or UUID",
        },
      ],
      requestBody: [
        { name: "localHash", type: "string", required: true },
        { name: "syncedHash", type: "string", required: false },
      ],
      responseBody: [
        { name: "inSync", type: "boolean", required: true },
        { name: "remoteHash", type: "string", required: true },
        { name: "lastSyncedAt", type: "string", required: true },
      ],
      exampleRequest: JSON.stringify(
        { localHash: "9c4a12", syncedHash: "9c4a12" },
        null,
        2
      ),
      exampleResponse: JSON.stringify(
        { inSync: true, remoteHash: "9c4a12", lastSyncedAt: nowIso },
        null,
        2
      ),
    });

    builder.data("env-vars", {
      title: "Feature Environment Configuration",
      variables: [
        {
          name: "VITE_GO_API_URL",
          value: "http://127.0.0.1:8080/go",
          required: true,
        },
        {
          name: "TOMO_SYNC_INTERVAL_MS",
          value: "15000",
          required: false,
        },
      ],
    });

    builder.data("package-info", {
      name: "@tanstack/react-sync-utils",
      currentVersion: "1.2.0",
      newVersion: "1.3.1",
      changeType: "minor",
      description: "Lightweight retry/backoff helpers for offline outbox flush",
      dependencies: [
        { name: "async-mutex", version: "0.5.0" },
        { name: "nanoid", version: "5.1.11" },
      ],
    });

    if (builder.isToolEnabled("run_tests")) {
      await builder.toolCompleted(
        "run_tests",
        { filter: "offlineSyncBanner", watch: false },
        { passed: 16, failed: 0, skipped: 0, durationMs: 320 },
        "Run Feature Test Suite"
      );
    }

    builder.data("test-results", {
      summary: {
        passed: 16,
        failed: 0,
        skipped: 0,
        total: 16,
        duration: 320,
      },
      suites: [
        {
          id: "suite-banner",
          name: "useOfflineSyncBanner.spec.ts",
          status: "passed",
          passed: 9,
          failed: 0,
          skipped: 0,
          tests: [
            {
              id: "tb-1",
              name: "clears pending count after SQLite reconciliation",
              status: "passed",
              duration: 14,
            },
            {
              id: "tb-2",
              name: "falls back cleanly when running in Web mode",
              status: "passed",
              duration: 11,
            },
          ],
        },
        {
          id: "suite-contract",
          name: "syncStatusContract.spec.ts",
          status: "passed",
          passed: 7,
          failed: 0,
          skipped: 0,
          tests: [
            {
              id: "tb-3",
              name: "validates POST /api/v1/docs/{id}/sync-status payload",
              status: "passed",
              duration: 19,
            },
          ],
        },
      ],
    });

    builder.data(
      "plan",
      {
        title: "Offline Sync Banner & API Telemetry Feature",
        description:
          "Add real-time dirty-state tracking across SQLite cache, Go sync endpoint, and unit tests.",
        isStreaming: false,
        estimatedDuration: "45s",
        footerNote: "Completed all 3 steps • 16/16 tests passed",
        steps: [
          {
            id: "step-1",
            title: "Inspect workspace docs & SQLite cache",
            status: "completed",
            files: ["src/infrastructure/tauri/docCacheService.ts"],
          },
          {
            id: "step-2",
            title: "Implement useOfflineSyncBanner hook & route schema",
            status: "completed",
            files: ["src/presentation/hooks/useOfflineSyncBanner.ts"],
          },
          {
            id: "step-3",
            title: "Run unit tests and stage verified commit",
            status: "completed",
          },
        ],
      },
      "plan-fullstack"
    );

    builder.data("commit", {
      hash: "7b2e91f",
      message: "feat(sync): add useOfflineSyncBanner hook and sync-status DTO",
      author: { name: "Tomo Agent", initials: "TA" },
      timestamp: nowIso,
      files: [
        {
          path: "src/presentation/hooks/useOfflineSyncBanner.ts",
          status: "added",
          additions: 36,
          deletions: 0,
        },
        {
          path: "src/infrastructure/api/docsApi.ts",
          status: "modified",
          additions: 14,
          deletions: 2,
        },
      ],
    });

    const artifact: ArtifactDataPart = {
      id: `art-fs-${Date.now().toString(36)}`,
      version: 1,
      title: "useOfflineSyncBanner.ts",
      description: "ES2020 React hook for local SQLite sync state verification.",
      kind: "code",
      language: "typescript",
      content: FEATURE_HOOK_CODE,
      updatedAt: nowIso,
    };
    builder.data("artifact", artifact, artifact.id);

    builder.data("checkpoint", {
      checkpointId: `chk-fs-${Date.now().toString(36)}`,
      label: "Implemented Offline Sync Banner Feature",
      timestampIso: nowIso,
      affectedFiles: [
        "src/presentation/hooks/useOfflineSyncBanner.ts",
        "src/infrastructure/api/docsApi.ts",
      ],
    });

    await builder.text(
      `Implemented the fullstack **Offline Sync Banner** feature and verified all **16 unit & contract tests**.\n\n### Highlights\n- Added \`useOfflineSyncBanner(docId)\` with strict ES2020 TypeScript compliance.\n- Documented the \`POST /api/v1/docs/{id}/sync-status\` endpoint schema.\n- Staged commit \`7b2e91f\` and saved a restorable checkpoint.\n\n\`\`\`typescript\nconst { pendingCount, isReconciling, syncNow } = useOfflineSyncBanner(102);\n\`\`\``
    );

    builder.data("suggestions", {
      items: [
        "/approval Push commit 7b2e91f after confirming deployment branch",
        "/preview Build an interactive live web preview for the Sync Banner UI",
        "/workflow Run multi-agent review across Go backend and React hook",
      ],
    });
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(1640, 980, 290, 420),
      finishReason: "stop",
    },
    "stop"
  );
}
