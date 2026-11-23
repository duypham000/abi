import * as z from 'zod/v4';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GoClient } from './goClient.js';
import {
  InputBlock,
  markdownToBlocks,
  readBlocksFromYDoc,
  writeBlocksToYDoc,
} from './blocknoteYjs.js';
import {
  buildDiagramElements,
  buildExcalidrawElement,
  mutateCanvasYDoc,
  readCanvasFromYDoc,
  seedCanvasYDocFromSceneJson,
} from './canvasYjs.js';
import { withLiveYDoc } from './yjsClient.js';

function jsonToolResponse(payload: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function errorToolResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function seedDocYDocIfEmpty(
  ydoc: Parameters<typeof readBlocksFromYDoc>[0],
  rawContent: string | undefined,
): void {
  if (!rawContent || !rawContent.trim()) return;
  const current = readBlocksFromYDoc(ydoc);
  if (current.blockCount > 0) return;

  const trimmed = rawContent.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        writeBlocksToYDoc(ydoc, parsed as InputBlock[], 'replace');
        return;
      }
    } catch {
      // fall through to Markdown parsing
    }
  }
  const mdBlocks = markdownToBlocks(rawContent);
  if (mdBlocks.length > 0) {
    writeBlocksToYDoc(ydoc, mdBlocks, 'replace');
  }
}

const BlockInputSchema = z.object({
  id: z.string().optional(),
  type: z
    .string()
    .describe(
      'BlockNote block type: paragraph, heading, bulletListItem, numberedListItem, checkListItem, codeBlock, quote, image, excalidraw',
    ),
  props: z.record(z.string(), z.any()).optional(),
  content: z
    .union([
      z.string(),
      z.array(
        z.object({
          text: z.string(),
          marks: z
            .object({
              bold: z.boolean().optional(),
              italic: z.boolean().optional(),
              strike: z.boolean().optional(),
              code: z.boolean().optional(),
              link: z.string().optional(),
            })
            .optional(),
        }),
      ),
    ])
    .optional(),
  children: z.array(z.any()).optional(),
});

export function createTomoMcpServer(goClient: GoClient): McpServer {
  const server = new McpServer(
    {
      name: 'tomo-node-mcp',
      version: '1.0.0',
    },
    {
      instructions:
        'Tomo realtime workspace MCP server. Supports Docs CRUD, Series collections, live BlockNote Yjs collaboration (read/write Markdown, insert/update/delete blocks, embed Excalidraw canvases), and live Excalidraw Canvas editing (add/update/delete elements and auto-laid-out diagrams).',
    },
  );

  // =========================================================================
  // Docs CRUD & Metadata Tools
  // =========================================================================

  server.registerTool(
    'docs_list',
    {
      description: 'List documents with optional pagination, parent_id filter, and keyword search.',
      inputSchema: {
        page: z.number().int().positive().optional(),
        page_size: z.number().int().positive().optional(),
        parent_id: z
          .string()
          .optional()
          .describe('Optional parent doc ID; empty string "" filters root docs'),
        search: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const res = await goClient.listDocs(args);
        return jsonToolResponse(res);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_search',
    {
      description: 'Search documents by keyword across title and content.',
      inputSchema: {
        query: z.string().min(1),
        page: z.number().int().positive().optional(),
        page_size: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, page, page_size }) => {
      try {
        const res = await goClient.listDocs({ search: query, page, page_size });
        return jsonToolResponse(res);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_tree',
    {
      description: 'Get the hierarchical tree of all documents and nested sub-documents.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const tree = await goClient.getDocTree();
        return jsonToolResponse({ tree });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_get',
    {
      description: 'Get document metadata and stored content by ID or slug.',
      inputSchema: {
        id: z.string().optional(),
        slug: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, slug }) => {
      try {
        if (!id && !slug) {
          return errorToolResponse(new Error('Either id or slug is required'));
        }
        const doc = id ? await goClient.getDoc(id) : await goClient.getDocBySlug(slug!);
        return jsonToolResponse(doc);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_create',
    {
      description:
        'Create a new document, optionally populating its live BlockNote Yjs room with Markdown right away.',
      inputSchema: {
        title: z.string().min(1),
        content: z.string().optional().describe('Initial Markdown or plain text content'),
        status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
        parent_id: z.string().nullable().optional(),
        sync_yjs: z
          .boolean()
          .optional()
          .describe('If true (default when content is non-empty), also initializes the BlockNote Y.Doc'),
      },
    },
    async ({ title, content, status, parent_id, sync_yjs }) => {
      try {
        const created = await goClient.createDoc({
          title,
          content: content ?? '',
          status,
          parent_id,
        });
        const shouldSync = sync_yjs ?? Boolean(content && content.trim().length > 0);
        if (shouldSync && content && content.trim().length > 0) {
          const blocks = markdownToBlocks(content);
          await withLiveYDoc('doc', created.id, goClient, (ydoc) => {
            const out = writeBlocksToYDoc(ydoc, blocks, 'replace');
            return { result: out, mutated: out.changed };
          }).catch(() => {});
        }
        return jsonToolResponse(created);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_update',
    {
      description: 'Update document title, stored content, status, parent_id, or pin/star flags.',
      inputSchema: {
        id: z.string().min(1),
        title: z.string().optional(),
        content: z.string().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
        parent_id: z.string().nullable().optional(),
        is_pinned: z.boolean().optional(),
        is_starred: z.boolean().optional(),
      },
    },
    async ({ id, ...patch }) => {
      try {
        const updated = await goClient.updateDoc(id, patch);
        return jsonToolResponse(updated);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_move',
    {
      description: 'Move a document under a different parent document, or pass empty string "" for root.',
      inputSchema: {
        id: z.string().min(1),
        parent_id: z.string().optional(),
      },
    },
    async ({ id, parent_id }) => {
      try {
        const updated = await goClient.updateDoc(id, { parent_id: parent_id ?? '' });
        return jsonToolResponse(updated);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_set_flags',
    {
      description: 'Set is_pinned, is_starred, or publication status on a document.',
      inputSchema: {
        id: z.string().min(1),
        is_pinned: z.boolean().optional(),
        is_starred: z.boolean().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      },
    },
    async ({ id, is_pinned, is_starred, status }) => {
      try {
        const updated = await goClient.updateDoc(id, { is_pinned, is_starred, status });
        return jsonToolResponse(updated);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_delete',
    {
      description: 'Permanently delete a document by ID.',
      inputSchema: { id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        await goClient.deleteDoc(id);
        return jsonToolResponse({ deleted: true, id });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_list_revisions',
    {
      description: 'List revision history entries for a document.',
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        const revisions = await goClient.listRevisions(id);
        return jsonToolResponse({ doc_id: id, revisions });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  // =========================================================================
  // Series Tools
  // =========================================================================

  server.registerTool(
    'series_list',
    {
      description: 'List or search document series.',
      inputSchema: {
        search: z.string().optional(),
        page: z.number().int().min(0).optional(),
        size: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const res = await goClient.listSeries(args);
        return jsonToolResponse(res);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'series_create',
    {
      description: 'Create a new document series.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const res = await goClient.createSeries(args);
        return jsonToolResponse(res);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'series_update',
    {
      description: 'Update an existing series name or description.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ id, name, description }) => {
      try {
        const res = await goClient.updateSeries(id, { name, description });
        return jsonToolResponse(res);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'series_delete',
    {
      description: 'Delete a series by numeric ID.',
      inputSchema: { id: z.number().int().positive() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        await goClient.deleteSeries(id);
        return jsonToolResponse({ deleted: true, id });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  // =========================================================================
  // Live BlockNote Yjs Tools
  // =========================================================================

  server.registerTool(
    'docs_read_live',
    {
      description:
        'Read the live collaborative BlockNote Yjs document (or persisted snapshot), returning Markdown (with optional block ID comments), structured block JSON, and plain text.',
      inputSchema: {
        id: z.string().min(1).describe('Document ID'),
        include_block_ids: z
          .boolean()
          .optional()
          .describe('Include <!-- block:<id> --> annotations in Markdown for targeted updates'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, include_block_ids }) => {
      try {
        const doc = await goClient.getDoc(id).catch(() => null);
        const live = await withLiveYDoc('doc', id, goClient, (ydoc) => {
          const parsed = readBlocksFromYDoc(ydoc, Boolean(include_block_ids));
          return { result: parsed, mutated: false };
        });
        return jsonToolResponse({
          doc_id: id,
          title: doc?.title,
          transport: live.transport,
          ...live.result,
          ...(live.result.blockCount === 0 && doc?.content
            ? { stored_content_fallback: doc.content }
            : {}),
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_write_markdown',
    {
      description:
        'Write Markdown directly into a live BlockNote Yjs document (replace, append, prepend, or insert_after a specific block_id) so open editors update in real time.',
      inputSchema: {
        id: z.string().min(1).describe('Document ID'),
        markdown: z.string().describe('Markdown text to write'),
        mode: z
          .enum(['replace', 'append', 'prepend', 'insert_after'])
          .default('append'),
        after_block_id: z
          .string()
          .optional()
          .describe('Target block ID when mode is insert_after'),
      },
    },
    async ({ id, markdown, mode, after_block_id }) => {
      try {
        const doc = await goClient.getDoc(id).catch(() => null);
        const newBlocks = markdownToBlocks(markdown);
        const live = await withLiveYDoc('doc', id, goClient, (ydoc) => {
          if (mode !== 'replace') {
            seedDocYDocIfEmpty(ydoc, doc?.content);
          }
          const writeOut = writeBlocksToYDoc(ydoc, newBlocks, mode, after_block_id);
          const parsed = readBlocksFromYDoc(ydoc, true);
          return {
            result: { ...writeOut, parsed },
            mutated: writeOut.changed,
          };
        });
        await goClient
          .updateDocMeta(id, live.result.parsed.plainText || live.result.parsed.markdown)
          .catch(() => {});
        return jsonToolResponse({
          doc_id: id,
          transport: live.transport,
          inserted_ids: live.result.insertedIds,
          block_count: live.result.parsed.blockCount,
          markdown: live.result.parsed.markdown,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_insert_blocks',
    {
      description:
        'Insert structured BlockNote blocks (paragraph, heading, bulletListItem, numberedListItem, checkListItem, codeBlock, quote, image, excalidraw) into a live document.',
      inputSchema: {
        id: z.string().min(1),
        blocks: z.array(BlockInputSchema).min(1),
        mode: z.enum(['append', 'prepend', 'insert_after', 'replace']).default('append'),
        after_block_id: z.string().optional(),
      },
    },
    async ({ id, blocks, mode, after_block_id }) => {
      try {
        const doc = await goClient.getDoc(id).catch(() => null);
        const live = await withLiveYDoc('doc', id, goClient, (ydoc) => {
          if (mode !== 'replace') {
            seedDocYDocIfEmpty(ydoc, doc?.content);
          }
          const writeOut = writeBlocksToYDoc(
            ydoc,
            blocks as InputBlock[],
            mode,
            after_block_id,
          );
          const parsed = readBlocksFromYDoc(ydoc, true);
          return { result: { ...writeOut, parsed }, mutated: writeOut.changed };
        });
        await goClient
          .updateDocMeta(id, live.result.parsed.plainText || live.result.parsed.markdown)
          .catch(() => {});
        return jsonToolResponse({
          doc_id: id,
          transport: live.transport,
          inserted_ids: live.result.insertedIds,
          block_count: live.result.parsed.blockCount,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_update_block',
    {
      description: 'Update a single BlockNote block by block_id inside a live document.',
      inputSchema: {
        id: z.string().min(1).describe('Document ID'),
        block_id: z.string().min(1).describe('Target block ID'),
        type: z.string().optional().describe('Optional new block type'),
        props: z.record(z.string(), z.any()).optional(),
        content: z.union([z.string(), z.array(z.any())]).optional(),
      },
    },
    async ({ id, block_id, type, props, content }) => {
      try {
        const doc = await goClient.getDoc(id).catch(() => null);
        const live = await withLiveYDoc('doc', id, goClient, (ydoc) => {
          seedDocYDocIfEmpty(ydoc, doc?.content);
          const writeOut = writeBlocksToYDoc(
            ydoc,
            [{ id: block_id, type: type || '', props, content }],
            'update_block',
            block_id,
          );
          const parsed = readBlocksFromYDoc(ydoc, true);
          return { result: { ...writeOut, parsed }, mutated: writeOut.changed };
        });
        await goClient
          .updateDocMeta(id, live.result.parsed.plainText || live.result.parsed.markdown)
          .catch(() => {});
        return jsonToolResponse({
          doc_id: id,
          transport: live.transport,
          updated_block_id: block_id,
          block_count: live.result.parsed.blockCount,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_delete_block',
    {
      description: 'Delete a BlockNote block by block_id from a live document.',
      inputSchema: {
        id: z.string().min(1).describe('Document ID'),
        block_id: z.string().min(1).describe('Block ID to delete'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, block_id }) => {
      try {
        const doc = await goClient.getDoc(id).catch(() => null);
        const live = await withLiveYDoc('doc', id, goClient, (ydoc) => {
          seedDocYDocIfEmpty(ydoc, doc?.content);
          const writeOut = writeBlocksToYDoc(ydoc, [], 'delete_block', block_id);
          const parsed = readBlocksFromYDoc(ydoc, true);
          return { result: { ...writeOut, parsed }, mutated: writeOut.changed };
        });
        await goClient
          .updateDocMeta(id, live.result.parsed.plainText || live.result.parsed.markdown)
          .catch(() => {});
        return jsonToolResponse({
          doc_id: id,
          transport: live.transport,
          deleted_block_id: block_id,
          block_count: live.result.parsed.blockCount,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'docs_embed_canvas',
    {
      description:
        'Embed an Excalidraw canvas block into a live BlockNote document. Either reference an existing canvas_id, or omit canvas_id and provide canvas_title (plus optional diagram nodes/edges) to create and embed a new canvas in one step.',
      inputSchema: {
        doc_id: z.string().min(1),
        canvas_id: z.string().optional(),
        canvas_title: z.string().optional(),
        preview_width: z.number().int().min(0).optional(),
        after_block_id: z.string().optional(),
        diagram: z
          .object({
            nodes: z.array(
              z.object({
                key: z.string(),
                label: z.string(),
                shape: z.enum(['rectangle', 'ellipse', 'diamond']).optional(),
                backgroundColor: z.string().optional(),
                strokeColor: z.string().optional(),
              }),
            ),
            edges: z
              .array(
                z.object({
                  from: z.string(),
                  to: z.string(),
                  label: z.string().optional(),
                }),
              )
              .optional(),
            layout: z.enum(['horizontal', 'vertical', 'grid']).optional(),
          })
          .optional(),
      },
    },
    async ({ doc_id, canvas_id, canvas_title, preview_width, after_block_id, diagram }) => {
      try {
        let targetCanvasId = canvas_id;
        let createdCanvas = null;

        if (!targetCanvasId) {
          const elements = diagram
            ? buildDiagramElements(diagram.nodes, diagram.edges || [], diagram.layout || 'horizontal')
            : [];
          const scene = JSON.stringify({ elements, appState: {}, files: {} });
          createdCanvas = await goClient.createCanvas({
            title: canvas_title || 'Embedded Diagram',
            scene,
          });
          targetCanvasId = createdCanvas.id;
          if (elements.length > 0) {
            await withLiveYDoc('canvas', targetCanvasId, goClient, (ydoc) => {
              mutateCanvasYDoc(ydoc, { kind: 'replace', elements });
              return { result: true, mutated: true };
            }).catch(() => {});
          }
        }

        const doc = await goClient.getDoc(doc_id).catch(() => null);
        const mode = after_block_id ? 'insert_after' : 'append';
        const live = await withLiveYDoc('doc', doc_id, goClient, (ydoc) => {
          seedDocYDocIfEmpty(ydoc, doc?.content);
          const out = writeBlocksToYDoc(
            ydoc,
            [
              {
                type: 'excalidraw',
                props: {
                  canvasId: targetCanvasId,
                  previewWidth: preview_width ?? 0,
                },
              },
            ],
            mode,
            after_block_id,
          );
          return { result: out, mutated: out.changed };
        });

        return jsonToolResponse({
          doc_id,
          canvas_id: targetCanvasId,
          embedded_block_id: live.result.insertedIds[0],
          transport: live.transport,
          ...(createdCanvas ? { created_canvas: createdCanvas } : {}),
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  // =========================================================================
  // Canvas CRUD & Live Excalidraw Yjs Tools
  // =========================================================================

  server.registerTool(
    'canvas_list',
    {
      description: 'List Excalidraw canvases with pagination and optional keyword search.',
      inputSchema: {
        page: z.number().int().positive().optional(),
        page_size: z.number().int().positive().optional(),
        search: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const res = await goClient.listCanvases(args);
        return jsonToolResponse(res);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_get',
    {
      description: 'Get canvas metadata and stored scene JSON from backend.',
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        const canvas = await goClient.getCanvas(id);
        let parsedScene: any = {};
        try {
          parsedScene = JSON.parse(canvas.scene || '{}');
        } catch {
          parsedScene = {};
        }
        return jsonToolResponse({ canvas, parsed_scene: parsedScene });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_create',
    {
      description: 'Create a new Excalidraw canvas, optionally seeded with initial elements or a diagram.',
      inputSchema: {
        title: z.string().min(1),
        elements: z.array(z.record(z.string(), z.any())).optional(),
        tags: z.array(z.string()).optional(),
        starred: z.boolean().optional(),
        status: z.number().int().optional(),
      },
    },
    async ({ title, elements, tags, starred, status }) => {
      try {
        const builtElements: any[] = [];
        if (elements && elements.length > 0) {
          for (const rawEl of elements) {
            const { element, boundText } = buildExcalidrawElement(rawEl);
            builtElements.push(element);
            if (boundText) builtElements.push(boundText);
          }
        }

        const scene = JSON.stringify({ elements: builtElements, appState: {}, files: {} });
        const metadata = JSON.stringify({
          starred: Boolean(starred),
          tags: tags ?? [],
          thumbnail: null,
        });
        const created = await goClient.createCanvas({ title, scene, metadata, status });

        if (builtElements.length > 0) {
          await withLiveYDoc('canvas', created.id, goClient, (ydoc) => {
            mutateCanvasYDoc(ydoc, { kind: 'replace', elements: builtElements });
            return { result: true, mutated: true };
          }).catch(() => {});
        }
        return jsonToolResponse(created);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_update',
    {
      description: 'Update canvas title, raw scene JSON, metadata JSON, or status.',
      inputSchema: {
        id: z.string().min(1),
        title: z.string().optional(),
        scene: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
        metadata: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
        status: z.number().int().optional(),
      },
    },
    async ({ id, title, scene, metadata, status }) => {
      try {
        const updated = await goClient.updateCanvas(id, {
          title,
          scene: typeof scene === 'object' ? JSON.stringify(scene) : scene,
          metadata: typeof metadata === 'object' ? JSON.stringify(metadata) : metadata,
          status,
        });
        return jsonToolResponse(updated);
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_delete',
    {
      description: 'Permanently delete a canvas by ID.',
      inputSchema: { id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        await goClient.deleteCanvas(id);
        return jsonToolResponse({ deleted: true, id });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_read_live',
    {
      description:
        'Read live Excalidraw elements and files from the canvas Yjs room (or persisted snapshot).',
      inputSchema: {
        id: z.string().min(1),
        include_deleted: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, include_deleted }) => {
      try {
        const canvas = await goClient.getCanvas(id).catch(() => null);
        const live = await withLiveYDoc('canvas', id, goClient, (ydoc) => {
          seedCanvasYDocFromSceneJson(ydoc, canvas?.scene);
          const data = readCanvasFromYDoc(ydoc);
          return { result: data, mutated: false };
        });
        return jsonToolResponse({
          canvas_id: id,
          title: canvas?.title,
          transport: live.transport,
          active_count: live.result.activeElements.length,
          deleted_count: live.result.deletedCount,
          elements: include_deleted ? live.result.elements : live.result.activeElements,
          file_keys: Object.keys(live.result.files),
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_add_elements',
    {
      description:
        'Add Excalidraw elements (rectangle, ellipse, diamond, text, arrow, line) to a live canvas. Supports a `label` field on shapes to create centered bound text automatically.',
      inputSchema: {
        id: z.string().min(1),
        elements: z.array(z.record(z.string(), z.any())).min(1),
      },
    },
    async ({ id, elements }) => {
      try {
        const canvas = await goClient.getCanvas(id).catch(() => null);
        const live = await withLiveYDoc('canvas', id, goClient, (ydoc) => {
          seedCanvasYDocFromSceneJson(ydoc, canvas?.scene);
          const out = mutateCanvasYDoc(ydoc, { kind: 'add', elements });
          const full = readCanvasFromYDoc(ydoc);
          return { result: { ...out, full }, mutated: true };
        });
        await syncCanvasSceneToGo(goClient, canvas?.id ?? id, canvas?.scene, live.result.full);
        return jsonToolResponse({
          canvas_id: id,
          transport: live.transport,
          added_ids: live.result.affectedIds,
          active_count: live.result.full.activeElements.length,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_add_diagram',
    {
      description:
        'Generate and add a complete labeled node-and-arrow diagram (flowchart or architecture diagram) to a live Excalidraw canvas with automatic layout.',
      inputSchema: {
        id: z.string().min(1),
        nodes: z
          .array(
            z.object({
              key: z.string(),
              label: z.string(),
              shape: z.enum(['rectangle', 'ellipse', 'diamond']).optional(),
              x: z.number().optional(),
              y: z.number().optional(),
              width: z.number().optional(),
              height: z.number().optional(),
              backgroundColor: z.string().optional(),
              strokeColor: z.string().optional(),
            }),
          )
          .min(1),
        edges: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              label: z.string().optional(),
              strokeColor: z.string().optional(),
            }),
          )
          .optional(),
        layout: z.enum(['horizontal', 'vertical', 'grid']).default('horizontal'),
        replace_existing: z.boolean().optional(),
      },
    },
    async ({ id, nodes, edges, layout, replace_existing }) => {
      try {
        const diagramEls = buildDiagramElements(nodes, edges || [], layout);
        const canvas = await goClient.getCanvas(id).catch(() => null);
        const live = await withLiveYDoc('canvas', id, goClient, (ydoc) => {
          if (!replace_existing) {
            seedCanvasYDocFromSceneJson(ydoc, canvas?.scene);
          }
          const out = mutateCanvasYDoc(ydoc, {
            kind: replace_existing ? 'replace' : 'add',
            elements: diagramEls,
          });
          const full = readCanvasFromYDoc(ydoc);
          return { result: { ...out, full }, mutated: true };
        });
        await syncCanvasSceneToGo(goClient, canvas?.id ?? id, canvas?.scene, live.result.full);
        return jsonToolResponse({
          canvas_id: id,
          transport: live.transport,
          created_element_ids: live.result.affectedIds,
          active_count: live.result.full.activeElements.length,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_update_elements',
    {
      description:
        'Update existing elements in a live canvas by element ID, automatically bumping Excalidraw version and versionNonce.',
      inputSchema: {
        id: z.string().min(1),
        updates: z.array(z.record(z.string(), z.any())).min(1),
      },
    },
    async ({ id, updates }) => {
      try {
        const canvas = await goClient.getCanvas(id).catch(() => null);
        const live = await withLiveYDoc('canvas', id, goClient, (ydoc) => {
          seedCanvasYDocFromSceneJson(ydoc, canvas?.scene);
          const out = mutateCanvasYDoc(ydoc, { kind: 'update', updates });
          const full = readCanvasFromYDoc(ydoc);
          return { result: { ...out, full }, mutated: out.affectedIds.length > 0 };
        });
        if (live.mutated) {
          await syncCanvasSceneToGo(goClient, canvas?.id ?? id, canvas?.scene, live.result.full);
        }
        return jsonToolResponse({
          canvas_id: id,
          transport: live.transport,
          updated_ids: live.result.affectedIds,
          missing_ids: live.result.missingIds,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  server.registerTool(
    'canvas_delete_elements',
    {
      description:
        'Delete elements from a live canvas by element ID (soft-delete isDeleted=true by default, or hard_delete=true).',
      inputSchema: {
        id: z.string().min(1),
        element_ids: z.array(z.string()).min(1),
        hard_delete: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, element_ids, hard_delete }) => {
      try {
        const canvas = await goClient.getCanvas(id).catch(() => null);
        const live = await withLiveYDoc('canvas', id, goClient, (ydoc) => {
          seedCanvasYDocFromSceneJson(ydoc, canvas?.scene);
          const out = mutateCanvasYDoc(ydoc, {
            kind: 'delete',
            elementIds: element_ids,
            hardDelete: hard_delete,
          });
          const full = readCanvasFromYDoc(ydoc);
          return { result: { ...out, full }, mutated: out.affectedIds.length > 0 };
        });
        if (live.mutated) {
          await syncCanvasSceneToGo(goClient, canvas?.id ?? id, canvas?.scene, live.result.full);
        }
        return jsonToolResponse({
          canvas_id: id,
          transport: live.transport,
          deleted_ids: live.result.affectedIds,
          missing_ids: live.result.missingIds,
        });
      } catch (e) {
        return errorToolResponse(e);
      }
    },
  );

  // =========================================================================
  // Resources & Prompts
  // =========================================================================

  server.registerResource(
    'doc',
    new ResourceTemplate('tomo://docs/{id}', {
      list: async () => {
        const page = await goClient.listDocs({ page: 1, page_size: 50 }).catch(() => null);
        return {
          resources: (page?.items || []).map((d) => ({
            uri: `tomo://docs/${d.id}`,
            name: d.title,
            description: `Document (${d.status})`,
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    { mimeType: 'text/markdown', description: 'Tomo document rendered from live Yjs or stored content' },
    async (uri, { id }) => {
      const docId = Array.isArray(id) ? id[0] : id;
      const doc = await goClient.getDoc(docId).catch(() => null);
      const live = await withLiveYDoc('doc', docId, goClient, (ydoc) => ({
        result: readBlocksFromYDoc(ydoc, true),
        mutated: false,
      })).catch(() => null);

      const text =
        live && live.result.blockCount > 0
          ? `# ${doc?.title || docId}\n\n${live.result.markdown}`
          : `# ${doc?.title || docId}\n\n${doc?.content || ''}`;
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text }],
      };
    },
  );

  server.registerResource(
    'canvas',
    new ResourceTemplate('tomo://canvases/{id}', {
      list: async () => {
        const page = await goClient.listCanvases({ page: 1, page_size: 50 }).catch(() => null);
        return {
          resources: (page?.items || []).map((c) => ({
            uri: `tomo://canvases/${c.id}`,
            name: c.title,
            description: 'Excalidraw Canvas',
            mimeType: 'application/json',
          })),
        };
      },
    }),
    { mimeType: 'application/json', description: 'Excalidraw canvas JSON state' },
    async (uri, { id }) => {
      const canvasId = Array.isArray(id) ? id[0] : id;
      const canvas = await goClient.getCanvas(canvasId).catch(() => null);
      const live = await withLiveYDoc('canvas', canvasId, goClient, (ydoc) => {
        seedCanvasYDocFromSceneJson(ydoc, canvas?.scene);
        return { result: readCanvasFromYDoc(ydoc), mutated: false };
      }).catch(() => null);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                canvas,
                live_elements: live?.result.activeElements ?? [],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'write_doc_outline',
    {
      description: 'Draft and write a structured Markdown document outline into Tomo.',
      argsSchema: {
        topic: z.string().describe('Document topic or title'),
        audience: z.string().optional().describe('Target readers'),
      },
    },
    ({ topic, audience }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a structured document on "${topic}" for ${audience || 'engineering and product teammates'}. First inspect existing docs with docs_list/docs_tree, then create the doc with docs_create or edit live blocks with docs_write_markdown.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'review_and_improve_doc',
    {
      description: 'Review an existing document live and improve its structure and clarity.',
      argsSchema: {
        doc_id: z.string().describe('Document ID'),
        goal: z.string().optional().describe('Focus area for review'),
      },
    },
    ({ doc_id, goal }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Call docs_read_live with include_block_ids=true on "${doc_id}". Review the document for ${goal || 'clarity, completeness, and structure'}, then apply clean block-level improvements using docs_update_block or docs_insert_blocks.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'diagram_from_doc',
    {
      description: 'Read a document and generate an embedded Excalidraw architecture/workflow diagram.',
      argsSchema: {
        doc_id: z.string().describe('Source document ID'),
        canvas_title: z.string().optional().describe('Diagram title'),
      },
    },
    ({ doc_id, canvas_title }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Read document "${doc_id}" via docs_read_live. Identify key nodes and flows, then use docs_embed_canvas with a structured diagram ({ nodes, edges, layout }) titled "${canvas_title || 'Architecture Diagram'}" to create and embed the Excalidraw canvas directly into the document.`,
          },
        },
      ],
    }),
  );

  return server;
}

async function syncCanvasSceneToGo(
  goClient: GoClient,
  canvasId: string,
  prevSceneJson: string | undefined,
  full: ReturnType<typeof readCanvasFromYDoc>,
): Promise<void> {
  let appState: Record<string, unknown> = {};
  if (prevSceneJson) {
    try {
      const parsed = JSON.parse(prevSceneJson);
      if (parsed?.appState && typeof parsed.appState === 'object') {
        appState = parsed.appState;
      }
    } catch {
      // ignore
    }
  }
  const nextScene = JSON.stringify({
    elements: full.elements,
    appState,
    files: full.files,
  });
  await goClient.updateCanvas(canvasId, { scene: nextScene }).catch(() => {});
}
