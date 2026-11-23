import type { ArtifactDataPart } from "@/core/interfaces/agent";
import {
  createMockUsage,
  getProviderForModel,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

function extractReferencedLabels(ctx: StreamScenarioContext): string[] {
  const labels: string[] = [];
  for (const item of ctx.contextItems) {
    labels.push(`${item.title} (${item.kind})`);
  }
  for (const file of ctx.attachments) {
    labels.push(file.filename || file.mediaType);
  }
  const mentionMatches = ctx.prompt.match(/@[A-Za-z0-9._/-]+/g);
  if (mentionMatches) {
    for (const m of mentionMatches) {
      labels.push(m);
    }
  }
  return Array.from(new Set(labels));
}

export async function runGeneralFallbackScenario(
  ctx: StreamScenarioContext,
  builder: MockStreamBuilder
): Promise<void> {
  const { config, prompt, attachments, contextItems, trigger } = ctx;
  const nowIso = new Date().toISOString();
  const provider = getProviderForModel(config.modelId);
  const refs = extractReferencedLabels(ctx);
  const isRegen = trigger === "regenerate-message";
  const branchGroupId = isRegen ? `branch-${Date.now().toString(36)}` : undefined;

  builder.start(undefined, {
    modelId: config.modelId,
    provider,
    createdAt: nowIso,
    scenarioTag: `general-${config.mode}`,
    ...(branchGroupId ? { branchGroupId } : {}),
  });

  await builder.step(async () => {
    const effortNote =
      config.reasoningEffort === "high"
        ? "Applying deep multi-step analysis across workspace contracts and edge cases."
        : "Evaluating prompt context and active agent mode.";

    await builder.reasoning(
      `${effortNote}\nMode: ${config.mode.toUpperCase()} | Model: ${config.modelId}${
        refs.length > 0 ? `\nContext references: ${refs.join(", ")}` : ""
      }${isRegen ? "\nRegenerating an alternative structured perspective." : ""}`
    );

    if (refs.length > 0) {
      builder.data("chain-of-thought", {
        title: "Analyzing Attached Context & Mentions",
        defaultOpen: true,
        steps: [
          {
            id: "ctx-step-1",
            label: `Loaded ${refs.length} context reference(s)`,
            description: refs.join(" • "),
            status: "complete",
            icon: "file",
            searchResults: refs.slice(0, 4),
          },
          {
            id: "ctx-step-2",
            label: `Synthesizing ${config.mode} response`,
            status: "complete",
            icon: "check",
          },
        ],
      });

      if (contextItems.length > 0 && builder.isToolEnabled("read_doc")) {
        const primary = contextItems[0];
        await builder.toolCompleted(
          "read_doc",
          { docId: primary.sourceId ?? primary.id },
          {
            docId: primary.sourceId ?? primary.id,
            title: primary.title,
            wordCount: 320,
            excerpt:
              primary.excerpt ??
              `Loaded workspace ${primary.kind}: ${primary.title}`,
          },
          `Inspect ${primary.title}`
        );
      }
    }

    if (config.mode === "plan") {
      builder.data("plan", {
        title: `Action Plan: ${prompt.slice(0, 48) || "Workspace Task"}`,
        description:
          "Structured execution steps tailored for your current workspace context.",
        estimatedDuration: "~3 min",
        steps: [
          {
            id: "gp-1",
            title: "Audit existing contracts & local SQLite state",
            status: "completed",
          },
          {
            id: "gp-2",
            title: "Implement scoped changes with ES2020 strict types",
            status: "in_progress",
          },
          {
            id: "gp-3",
            title: "Run tsc --noEmit and create checkpoint",
            status: "pending",
          },
        ],
      });

      builder.data("task-group", {
        title: "Recommended Execution Checklist",
        items: [
          {
            id: "gt-1",
            text: "Review domain interfaces in src/core/interfaces/",
            status: "completed",
          },
          {
            id: "gt-2",
            text: "Wire changes cleanly in src/infrastructure/ & presentation/",
            status: "pending",
          },
        ],
      });
    }

    const attachmentSummary =
      attachments.length > 0
        ? `\n\n**Attached Files Reviewed (${attachments.length}):** ${attachments
            .map((a) => `\`${a.filename || a.mediaType}\``)
            .join(", ")}`
        : "";

    const contextSummary =
      contextItems.length > 0
        ? `\n\n**Workspace Context Included:** ${contextItems
            .map((c) => `\`${c.title}\``)
            .join(", ")}`
        : "";

    const snippetBlock =
      prompt.toLowerCase().includes("code") ||
      prompt.toLowerCase().includes("ts") ||
      prompt.toLowerCase().includes("function")
        ? `\n\n\`\`\`typescript\nexport async function handleTomoTask(input: string) {\n  return { ok: true, mode: "${config.mode}", input };\n}\n\`\`\``
        : "";

    if (config.mode === "agent" && prompt.trim().length > 24) {
      const quickNote: ArtifactDataPart = {
        id: `art-note-${Date.now().toString(36)}`,
        version: 1,
        title: "AgentResponseNotes.md",
        description: "Structured response note ready to insert into BlockNote.",
        kind: "markdown",
        language: "markdown",
        content: `# Response Summary\n\n**Prompt:** ${prompt}\n\n- Mode: \`${config.mode}\`\n- Model: \`${config.modelId}\`\n${
          refs.length > 0 ? `- Context: ${refs.join(", ")}\n` : ""
        }`,
        updatedAt: nowIso,
      };
      builder.data("artifact", quickNote, quickNote.id);
    }

    const introLead = isRegen
      ? `Here is an alternative **${config.mode}** breakdown using **${config.modelId}**:`
      : `Here is my response in **${config.mode}** mode using **${config.modelId}**:`;

    await builder.text(
      `${introLead}\n\n> ${prompt.trim() || "Workspace inquiry"}${attachmentSummary}${contextSummary}\n\n### Next Steps\n- Use slash commands like \`/code\`, \`/research\`, \`/approval\`, \`/debug\`, \`/artifact\`, or \`/workflow\` to trigger deep end-to-end demonstrations.\n- Mention workspace Docs or Canvases with \`@\` to ground answers directly in your SQLite cache.${snippetBlock}`
    );

    builder.data("suggestions", {
      items: [
        "/code Implement this as a fullstack TypeScript feature",
        "/plan Break this down into an interactive approval workflow",
        "/research Research tradeoffs with inline citations",
      ],
    });
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(
        920 + refs.length * 140,
        460,
        config.reasoningEffort === "off" ? 0 : 120,
        160
      ),
      finishReason: "stop",
    },
    "stop"
  );
}
