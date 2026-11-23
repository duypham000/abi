import type {
  IWorkspaceBridgePort,
  WorkspaceContextItem,
} from "@/core/interfaces/agent";
import {
  getCanvasFromSqlite,
  listCanvasFromSqlite,
} from "@/infrastructure/tauri/canvasCacheService";
import {
  getDocFromSqlite,
  listDocsFromSqlite,
} from "@/infrastructure/tauri/docCacheService";

export const AGENT_OPEN_ITEM_EVENT = "tomo:agent-open-item";
export const AGENT_INSERT_CONTENT_EVENT = "tomo:agent-insert-content";

const MOCK_WORKSPACE_DOCS_AND_CANVASES: WorkspaceContextItem[] = [
  {
    id: "doc-mock-101",
    kind: "doc",
    title: "Architecture & Yjs CRDT Sync Spec",
    path: "docs/architecture-yjs-sync.md",
    subtitle: "Tomo Doc • Room doc-101",
    excerpt:
      "Defines XmlFragment('document-store') persistence, Redis streams worker (:1236), and offline SQLite hash reconciliation.",
    language: "markdown",
    updatedAt: "2026-11-22T09:15:00.000Z",
    sourceId: 101,
  },
  {
    id: "doc-mock-102",
    kind: "doc",
    title: "Local-First SQLite Offline Outbox Plan",
    path: "docs/local-first-outbox.md",
    subtitle: "Tomo Doc • Room doc-102",
    excerpt:
      "Details content_hash vs synced_hash conflict detection, single-flight AuthCore token refresh, and 3-way merge recovery.",
    language: "markdown",
    updatedAt: "2026-11-21T16:40:00.000Z",
    sourceId: 102,
  },
  {
    id: "doc-mock-103",
    kind: "doc",
    title: "API Contracts & Go Route Prefix Matrix",
    path: "docs/api-route-matrix.md",
    subtitle: "Tomo Doc • Room doc-103",
    excerpt:
      "Documents /api/v1 vs /go/v1 route mounting, pagination envelope normalization, and GitHub workspace sync endpoints.",
    language: "markdown",
    updatedAt: "2026-11-20T14:05:00.000Z",
    sourceId: 103,
  },
  {
    id: "canvas-mock-201",
    kind: "canvas",
    title: "Tomo Workspace & Yjs Hub Topology",
    path: "canvases/yjs-hub-topology.excalidraw",
    subtitle: "Excalidraw Canvas • Room canvas-201",
    excerpt:
      "Visual topology connecting Tauri client, uWebSockets (:1234), Redis Streams worker (:1236), and Go API (:8080).",
    language: "json",
    updatedAt: "2026-11-22T11:20:00.000Z",
    sourceId: 201,
  },
  {
    id: "canvas-mock-202",
    kind: "canvas",
    title: "AI Agent Panel State & Transport Flow",
    path: "canvases/agent-panel-flow.excalidraw",
    subtitle: "Excalidraw Canvas • Room canvas-202",
    excerpt:
      "Illustrates useChat + DynamicAgentTransport, 23 UIMessage data-* parts, tool approvals, and Checkpoint rewind flow.",
    language: "json",
    updatedAt: "2026-11-23T04:10:00.000Z",
    sourceId: 202,
  },
];

const MOCK_WORKSPACE_FILES_AND_DIFFS: WorkspaceContextItem[] = [
  {
    id: "file-sync-engine",
    kind: "file",
    title: "syncEngine.ts",
    path: "src/infrastructure/tauri/syncEngine.ts",
    subtitle: "TypeScript • Offline Sync",
    excerpt:
      "Reconciles dirty SQLite docs with Go backend snapshots using deterministic content hashes and conflict resolution.",
    language: "typescript",
    updatedAt: "2026-11-22T18:00:00.000Z",
  },
  {
    id: "file-auth-bridge",
    kind: "file",
    title: "authBridge.ts",
    path: "src/infrastructure/tauri/authBridge.ts",
    subtitle: "TypeScript • Auth Bridge",
    excerpt:
      "Bridges Rust AuthCore single-flight token lookup (auth_access_token) and localStorage fallback in Web mode.",
    language: "typescript",
    updatedAt: "2026-11-22T10:30:00.000Z",
  },
  {
    id: "file-kv-store",
    kind: "file",
    title: "kvStore.ts",
    path: "src/infrastructure/tauri/kvStore.ts",
    subtitle: "TypeScript • SQLite KV",
    excerpt:
      "Async key-value persistence backed by sqlite:tomo-docs.db app_kv table in Tauri and localStorage on Web.",
    language: "typescript",
    updatedAt: "2026-11-21T08:45:00.000Z",
  },
  {
    id: "diff-head-workspace",
    kind: "git-diff",
    title: "Working Tree Diff (HEAD~1..HEAD)",
    path: "git://diff/HEAD",
    subtitle: "Git Diff • 3 modified files",
    excerpt:
      "+142 / -28 across agent contracts, kvStore session indexing, and transport streaming cancellation.",
    language: "diff",
    updatedAt: "2026-11-23T06:00:00.000Z",
  },
];

const MOCK_CONTENT_BY_ID: Record<string, string> = {
  "doc-mock-101": `# Architecture & Yjs CRDT Sync Spec\n\n- BlockNote binds to \`ydoc.getXmlFragment("document-store")\`.\n- Excalidraw binds to \`ydoc.getMap("elements")\` and \`ydoc.getMap("files")\`.\n- Room IDs follow \`doc-<id>\` and \`canvas-<id>\`.\n`,
  "doc-mock-102": `# Local-First SQLite Offline Outbox Plan\n\n1. Write mutations to \`sqlite:tomo-docs.db\` immediately.\n2. Compute \`localHash\` and compare against \`syncedHash\`.\n3. Flush outbox entries once Go backend \`/api/v1\` becomes reachable.\n`,
  "doc-mock-103": `# API Contracts & Go Route Prefix Matrix\n\n- \`docs\`, \`series\`, \`yjs\` mount on 5 prefixes (\`/api/v1\`, \`/go/api/v1\`, \`/go/v1\`, \`/api/v1/base\`, \`/go/api/v1/base\`).\n- \`auth\` and \`github\` mount only on the first 3 prefixes.\n`,
  "canvas-mock-201": JSON.stringify(
    {
      room: "canvas-201",
      nodes: ["Tauri Client", "uWebSockets :1234", "Redis Streams :1236", "Go API :8080"],
      status: "synced",
    },
    null,
    2
  ),
  "canvas-mock-202": JSON.stringify(
    {
      room: "canvas-202",
      nodes: ["useChat", "DynamicAgentTransport", "MockScenarios", "ArtifactDrawer"],
      status: "active",
    },
    null,
    2
  ),
  "file-sync-engine": `export async function reconcileWorkspaceDocs(): Promise<void> {\n  // Compare localHash vs syncedHash and schedule non-blocking 3-way merge.\n}\n`,
  "file-auth-bridge": `export async function getAccessToken(): Promise<string | null> {\n  // Delegates to Tauri auth_access_token or localStorage fallback.\n  return null;\n}\n`,
  "file-kv-store": `export async function getItem(key: string): Promise<string | null> {\n  // Uses sqlite app_kv in Tauri and window.localStorage on Web.\n  return null;\n}\n`,
  "diff-head-workspace": `diff --git a/src/core/interfaces/agent/parts.ts b/src/core/interfaces/agent/parts.ts\nnew file mode 100644\n+ export interface PlanDataPart { title: string; steps: PlanStepItem[]; }\n`,
};

function truncateExcerpt(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 140
    ? `${normalized.slice(0, 137)}...`
    : normalized;
}

export async function listWorkspaceContextItems(): Promise<
  WorkspaceContextItem[]
> {
  const liveItems: WorkspaceContextItem[] = [];

  try {
    const docsPage = await listDocsFromSqlite({ page: 0, size: 25 });
    for (const doc of docsPage.items) {
      liveItems.push({
        id: `doc-${doc.id}`,
        kind: "doc",
        title: doc.title || "Untitled Doc",
        path: doc.slug ? `docs/${doc.slug}.md` : `docs/doc-${doc.id}.md`,
        subtitle: `Tomo Doc #${doc.id}`,
        excerpt: truncateExcerpt(
          doc.plainText ?? doc.preview ?? doc.content,
          "Local SQLite Tomo document"
        ),
        language: "markdown",
        updatedAt: doc.lastSync ?? undefined,
        sourceId: doc.id,
      });
    }
  } catch {
    // Web mode or uninitialized SQLite — fall back smoothly
  }

  try {
    const canvasPage = await listCanvasFromSqlite({ page: 0, size: 20 });
    for (const canvas of canvasPage.items) {
      liveItems.push({
        id: `canvas-${canvas.id}`,
        kind: "canvas",
        title: canvas.title || "Untitled Canvas",
        path: `canvases/canvas-${canvas.id}.excalidraw`,
        subtitle: `Tomo Canvas #${canvas.id}`,
        excerpt: truncateExcerpt(
          canvas.preview ?? canvas.scene,
          "Local SQLite Excalidraw canvas"
        ),
        language: "json",
        updatedAt: canvas.lastSync ?? undefined,
        sourceId: canvas.id,
      });
    }
  } catch {
    // Web mode or uninitialized SQLite — fall back smoothly
  }

  const baseItems =
    liveItems.length > 0 ? liveItems : MOCK_WORKSPACE_DOCS_AND_CANVASES;

  const combined = [...baseItems, ...MOCK_WORKSPACE_FILES_AND_DIFFS];
  const seen = new Set<string>();
  return combined.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export async function searchWorkspaceContextItems(
  query: string
): Promise<WorkspaceContextItem[]> {
  const all = await listWorkspaceContextItems();
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((item) => {
    const haystack = [item.title, item.path, item.subtitle, item.excerpt]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export async function readWorkspaceItemContent(
  item: WorkspaceContextItem
): Promise<string> {
  if (item.kind === "doc" && item.sourceId !== undefined) {
    try {
      const doc = await getDocFromSqlite(item.sourceId);
      if (doc && (doc.content || doc.plainText)) {
        return doc.content || doc.plainText || "";
      }
    } catch {
      // ignore and fall back to mock content
    }
  }

  if (item.kind === "canvas" && item.sourceId !== undefined) {
    try {
      const canvas = await getCanvasFromSqlite(item.sourceId);
      if (canvas && canvas.scene) {
        return canvas.scene;
      }
    } catch {
      // ignore and fall back to mock content
    }
  }

  return (
    MOCK_CONTENT_BY_ID[item.id] ??
    `# ${item.title}\n\n${item.excerpt ?? "Workspace context item."}\n`
  );
}

export async function openWorkspaceItem(
  item: WorkspaceContextItem
): Promise<void> {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceContextItem>(AGENT_OPEN_ITEM_EVENT, {
      detail: item,
    })
  );
}

export async function insertMarkdownSnippet(
  markdown: string,
  targetDocId?: number | string
): Promise<boolean> {
  let dispatched = false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AGENT_INSERT_CONTENT_EVENT, {
        detail: {
          markdown,
          targetDocId,
          timestamp: new Date().toISOString(),
        },
      })
    );
    dispatched = true;
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // ignore clipboard permission errors
    }
  }

  return dispatched;
}

export const miniEditorWorkspaceBridge: IWorkspaceBridgePort = {
  listWorkspaceContextItems,
  searchWorkspaceContextItems,
  readWorkspaceItemContent,
  openWorkspaceItem,
  insertMarkdownSnippet,
};
