import {
  createMockUsage,
  getProviderForModel,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

export async function runResearchCitationsScenario(
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
    scenarioTag: "research",
  });

  await builder.step(async () => {
    await builder.reasoning(
      `Synthesizing evidence for: "${prompt.slice(0, 80)}".\nCross-checking AI SDK v6 UIMessage streaming specs, Yjs CRDT state-vector semantics, and mini-editor's local-first SQLite architecture.`
    );

    builder.data("chain-of-thought", {
      title: "Multi-Source Research & Fact Verification",
      defaultOpen: true,
      steps: [
        {
          id: "res-1",
          label: "Queried workspace specs and Tomo KB docs",
          description:
            "Inspected Yjs shared type bindings and SQLite content hash rules.",
          status: "complete",
          icon: "search",
          searchResults: [
            "docs/architecture-yjs-sync.md",
            "docs/local-first-outbox.md",
            "ai-sdk.dev/docs",
          ],
        },
        {
          id: "res-2",
          label: "Compared CRDT vs OT conflict resolution latency",
          status: "complete",
          icon: "brain",
          searchResults: ["yjs.dev", "prosemirror.net"],
        },
        {
          id: "res-3",
          label: "Compiled verified inline citations and comparison matrix",
          status: "complete",
          icon: "check",
        },
      ],
    });

    if (builder.isToolEnabled("search_workspace")) {
      await builder.toolCompleted(
        "search_workspace",
        { query: "Yjs CRDT BlockNote", scope: "all", limit: 5 },
        {
          total: 3,
          matches: [
            {
              id: "doc-mock-101",
              title: "Architecture & Yjs CRDT Sync Spec",
              path: "docs/architecture-yjs-sync.md",
              score: 0.97,
            },
            {
              id: "canvas-mock-201",
              title: "Tomo Workspace & Yjs Hub Topology",
              path: "canvases/yjs-hub-topology.excalidraw",
              score: 0.9,
            },
          ],
        },
        "Search Knowledge Base"
      );
    }

    if (builder.isToolEnabled("read_doc")) {
      await builder.toolCompleted(
        "read_doc",
        { docId: 101 },
        {
          docId: 101,
          title: "Architecture & Yjs CRDT Sync Spec",
          wordCount: 540,
          excerpt:
            "BlockNote binds to ydoc.getXmlFragment('document-store') while Excalidraw uses ydoc.getMap('elements') and ydoc.getMap('files').",
        },
        "Read Yjs CRDT Spec"
      );
    }

    builder.sourceUrl(
      "src-aisdk-v6",
      "https://ai-sdk.dev/docs/ai-sdk-ui/chatbot",
      "Vercel AI SDK v6 — useChat & UIMessageStream"
    );
    builder.sourceUrl(
      "src-yjs-docs",
      "https://docs.yjs.dev/api/shared-types/y.xmlfragment",
      "Yjs Documentation — Y.XmlFragment & State Vectors"
    );
    builder.sourceDoc(
      "src-doc-101",
      "text/markdown",
      "Architecture & Yjs CRDT Sync Spec",
      "docs/architecture-yjs-sync.md"
    );

    builder.data("inline-citations", {
      paragraphs: [
        {
          id: "cit-p-1",
          leadText: "For collaborative rich-text editing, ",
          claimText:
            "mini-editor binds BlockNote directly to a shared Y.XmlFragment named 'document-store'",
          tailText:
            " so concurrent updates converge deterministically without a central lock server.",
          citations: [
            {
              title: "Architecture & Yjs CRDT Sync Spec",
              url: "https://tomo.local/docs/architecture-yjs-sync",
              description: "Workspace room binding specification for Tomo Docs",
              quote: "BlockNote uses ydoc.getXmlFragment('document-store'); room names are doc-<id>.",
            },
            {
              title: "Yjs Y.XmlFragment Reference",
              url: "https://docs.yjs.dev/api/shared-types/y.xmlfragment",
              description: "Official CRDT XML fragment reference",
              quote: "Y.XmlFragment represents an ordered list of XML elements with CRDT merge guarantees.",
            },
          ],
        },
        {
          id: "cit-p-2",
          leadText: "On the streaming transport boundary, ",
          claimText:
            "AI SDK v6 routes typed data-* parts and tool approvals over a single ReadableStream<UIMessageChunk>",
          tailText:
            " enabling instant local mock playback or authenticated HTTP SSE streaming.",
          citations: [
            {
              title: "AI SDK v6 Chatbot & ChatTransport",
              url: "https://ai-sdk.dev/docs/ai-sdk-ui/chatbot",
              description: "ChatTransport<UIMessage> specification in ai@6",
              quote: "UIMessageChunk unifies text, reasoning, tool approval requests, and typed data parts.",
            },
          ],
        },
      ],
    });

    await builder.text(
      `### Research Synthesis\n\nHere is a verified architectural comparison based on the workspace specs and external references:\n\n| Dimension | Local SQLite + Yjs CRDT | Direct HTTP-Only Sync |\n|---|---|---|\n| **Offline Writes** | Instant via \`tomo-docs.db\` | Blocked when offline |\n| **Conflict Resolution** | Automatic Yjs CRDT + 3-way merge | Last-write-wins overwrite risk |\n| **Collaboration Latency** | ~14ms via uWebSockets \`:1234\` | High polling overhead |\n\n### Key Recommendations\n1. Always keep **ProseMirror** packages pinned to a single deduplicated instance across \`BlockNote\`.\n2. Compute \`localHash\` and \`remoteHash\` before clearing dirty flags in \`docCacheService\`.\n3. Use \`ChatTransport<AgentUIMessage>\` so mock and Go/Node HTTP transports share identical UI rendering.`
    );

    builder.data("suggestions", {
      items: [
        "/code Scaffold a Yjs state-vector diagnostic helper",
        "/workflow Compare CRDT vs REST sync using 3 specialized subagents",
        "/artifact Generate a visual Yjs sync architecture diagram",
      ],
    });
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(1920, 860, 260, 510),
      finishReason: "stop",
    },
    "stop"
  );
}
