import type {
  AgentToolPart,
  AgentUIMessagePart,
  ArtifactDataPart,
} from "@/core/interfaces/agent";
import {
  createMockUsage,
  getProviderForModel,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

function findAskUserPart(parts: AgentUIMessagePart[]) {
  return parts.find(
    (part): part is Extract<AgentToolPart, { type: "tool-ask_user" }> =>
      part.type === "tool-ask_user"
  );
}

function findGitPushPart(parts: AgentUIMessagePart[]) {
  return parts.find(
    (part): part is Extract<AgentToolPart, { type: "tool-git_push" }> =>
      part.type === "tool-git_push"
  );
}

async function emitCompletedDeployment(
  builder: MockStreamBuilder,
  branch: string,
  nowIso: string
): Promise<void> {
  builder.data(
    "terminal",
    {
      title: `git push origin ${branch}`,
      command: `git push origin ${branch} && tomo-migrate --target ${branch}`,
      ansiOutput: `\u001b[36m$ git push origin ${branch}\u001b[0m\nEnumerating objects: 7, done.\nWriting objects: 100% (7/7), 2.14 KiB | 2.14 MiB/s, done.\n`,
      isStreaming: true,
    },
    "term-approval-push"
  );

  await builder.delay(4);

  builder.data(
    "terminal",
    {
      title: `git push origin ${branch}`,
      command: `git push origin ${branch} && tomo-migrate --target ${branch}`,
      ansiOutput: `\u001b[36m$ git push origin ${branch}\u001b[0m\nEnumerating objects: 7, done.\nWriting objects: 100% (7/7), 2.14 KiB | 2.14 MiB/s, done.\nTo github.com:tomo-org/mini-editor.git\n   4c18a90..9f3c2a1  ${branch} -> ${branch}\n\u001b[32m✓\u001b[0m Migration applied cleanly (0 drift warnings)\n`,
      isStreaming: false,
      exitCode: 0,
      durationMs: 640,
    },
    "term-approval-push"
  );

  builder.data("commit", {
    hash: "9f3c2a1",
    message: `chore(release): apply verified workspace patch to ${branch}`,
    author: { name: "Tomo Agent", initials: "TA" },
    timestamp: nowIso,
    files: [
      {
        path: "src/infrastructure/tauri/syncEngine.ts",
        status: "modified",
        additions: 18,
        deletions: 4,
      },
      {
        path: "migrations/004_agent_checkpoints.sql",
        status: "added",
        additions: 24,
        deletions: 0,
      },
    ],
  });

  builder.data("checkpoint", {
    checkpointId: `chk-dep-${Date.now().toString(36)}`,
    label: `Pushed & Migrated (${branch})`,
    timestampIso: nowIso,
    affectedFiles: [
      "src/infrastructure/tauri/syncEngine.ts",
      "migrations/004_agent_checkpoints.sql",
    ],
  });

  await builder.text(
    `\n\nDeployment completed on **\`${branch}\`** (commit \`9f3c2a1\`). Telemetry and checkpoints have been recorded.`
  );

  builder.data("suggestions", {
    items: [
      "/debug Run post-deploy health diagnostics",
      "/workflow View multi-agent post-release audit",
    ],
  });
}

export async function runApprovalAndQuestionScenario(
  ctx: StreamScenarioContext,
  builder: MockStreamBuilder
): Promise<void> {
  const { config, lastMessage } = ctx;
  const nowIso = new Date().toISOString();
  const provider = getProviderForModel(config.modelId);

  const isAssistantContinuation = lastMessage?.role === "assistant";
  const existingParts = isAssistantContinuation ? lastMessage.parts : [];
  const askUserPart = findAskUserPart(existingParts);
  const gitPushPart = findGitPushPart(existingParts);

  // PHASE 3: User responded to tool approval request
  if (gitPushPart && gitPushPart.state === "approval-responded") {
    builder.start(undefined, {
      modelId: config.modelId,
      provider,
      scenarioTag: "approval",
    });

    await builder.step(async () => {
      if (gitPushPart.approval.approved) {
        const branch = gitPushPart.input.branch || "staging";
        await builder.reasoning(
          `Approval granted (${gitPushPart.approval.id}). Executing push and migration on "${branch}".`
        );
        builder.toolOutputAvailable(gitPushPart.toolCallId, {
          pushed: true,
          remote: gitPushPart.input.remote,
          branch,
          commitHash: "9f3c2a1",
          status: "deployed",
        });
        await emitCompletedDeployment(builder, branch, nowIso);
      } else {
        await builder.reasoning(
          `Approval denied (${gitPushPart.approval.id}). Aborting remote push and preparing a safe dry-run patch artifact instead.`
        );
        builder.toolOutputDenied(gitPushPart.toolCallId);

        const dryRunArtifact: ArtifactDataPart = {
          id: `art-dryrun-${Date.now().toString(36)}`,
          version: 1,
          title: "dry-run-release.diff",
          description: "Safe local dry-run patch generated after push approval was denied.",
          kind: "diff",
          language: "diff",
          content: `--- a/src/infrastructure/tauri/syncEngine.ts\n+++ b/src/infrastructure/tauri/syncEngine.ts\n@@ -42,4 +42,7 @@ export async function flushOutbox() {\n+  // Dry-run validated locally — remote push cancelled by operator\n+  return { dryRun: true, pending: 0 };\n }\n`,
          updatedAt: nowIso,
        };
        builder.data("artifact", dryRunArtifact, dryRunArtifact.id);

        await builder.text(
          `\n\nRemote push and migration were **cancelled** per your decision. No remote changes were made.\n\nI exported a safe local dry-run patch (\`dry-run-release.diff\`) so you can review or apply changes manually.`
        );

        builder.data("suggestions", {
          items: [
            "/approval Restart deployment flow with a different target branch",
            "/code Review local patch changes without pushing",
          ],
        });
      }
    });

    builder.finish(
      {
        durationMs: builder.elapsedMs(),
        usage: createMockUsage(1480, 620, 180, 310),
        finishReason: "stop",
      },
      "stop"
    );
    return;
  }

  // PHASE 2: User submitted answer to ask_user -> request approval (or auto-run if policy is auto-all)
  if (askUserPart && askUserPart.state === "output-available" && !gitPushPart) {
    const selectedTarget =
      askUserPart.output.selectedValues[0] || "staging";
    const note = askUserPart.output.text?.trim();

    builder.start(undefined, {
      modelId: config.modelId,
      provider,
      scenarioTag: "approval",
    });

    await builder.step(async () => {
      await builder.reasoning(
        `User selected target "${selectedTarget}"${note ? ` with note "${note}"` : ""}. Checking approval policy (${config.approvalPolicy}).`
      );

      await builder.text(
        `\n\nConfirmed target **\`${selectedTarget}\`**${note ? ` (*${note}*)` : ""}. Preparing remote push & migration step.`
      );

      if (config.approvalPolicy === "auto-all") {
        await builder.toolCompleted(
          "git_push",
          {
            remote: "origin",
            branch: selectedTarget,
            force: false,
            migrationTarget: selectedTarget,
            commitsAhead: 2,
          },
          {
            pushed: true,
            remote: "origin",
            branch: selectedTarget,
            commitHash: "9f3c2a1",
            status: "deployed",
          },
          "Push & Apply Migration (Auto-Approved)"
        );
        await emitCompletedDeployment(builder, selectedTarget, nowIso);
      } else {
        const approvalId = `apr-${Date.now().toString(36)}`;
        await builder.toolNeedsApproval(
          "git_push",
          {
            remote: "origin",
            branch: selectedTarget,
            force: false,
            migrationTarget: selectedTarget,
            commitsAhead: 2,
          },
          approvalId,
          `Push & Apply Migration (${selectedTarget})`
        );
      }
    });

    builder.finish(
      {
        durationMs: builder.elapsedMs(),
        usage: createMockUsage(1120, 410, 140, 200),
        finishReason: config.approvalPolicy === "auto-all" ? "stop" : "tool-calls",
      },
      config.approvalPolicy === "auto-all" ? "stop" : "tool-calls"
    );
    return;
  }

  // PHASE 1: Initial request -> Ask user structured Question before proceeding
  builder.start(undefined, {
    modelId: config.modelId,
    provider,
    createdAt: nowIso,
    scenarioTag: "approval",
  });

  await builder.step(async () => {
    await builder.reasoning(
      "This workflow involves pushing commits and applying a database migration. First, gather the target branch/environment using ask_user, then gate execution with tool-approval-request."
    );

    await builder.text(
      "Before I stage the migration and push to remote, please confirm which environment/branch you want to target:"
    );

    await builder.toolClientPending(
      "ask_user",
      {
        question: "Which target branch should receive the migration and push?",
        description:
          "After selecting a target, I will ask for explicit confirmation before executing git push.",
        selectionMode: "single",
        options: [
          {
            value: "staging",
            label: "staging (Pre-release verification)",
            description: "Safe sandbox target with automated rollback checks",
          },
          {
            value: "release/v0.2",
            label: "release/v0.2 (Release candidate)",
            description: "Triggers Go backend migration & desktop bundle check",
          },
          {
            value: "main",
            label: "main (Production branch)",
            description: "Requires final human confirmation gate before push",
          },
        ],
        allowCustomInput: true,
        placeholder: "Add an optional release note or override branch name...",
      },
      "Select Target Environment"
    );
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(680, 240, 90, 0),
      finishReason: "tool-calls",
    },
    "tool-calls"
  );
}
