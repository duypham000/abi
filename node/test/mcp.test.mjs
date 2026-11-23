import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  markdownToBlocks,
  readBlocksFromYDoc,
  writeBlocksToYDoc,
} from '../dist/mcp/blocknoteYjs.js';
import {
  buildDiagramElements,
  buildExcalidrawElement,
  mutateCanvasYDoc,
  readCanvasFromYDoc,
} from '../dist/mcp/canvasYjs.js';
import { createTomoMcpServer } from '../dist/mcp/server.js';

test('blocknoteYjs round-trips Markdown <-> BlockNote Y.XmlFragment(document-store)', () => {
  const ydoc = new Y.Doc();
  const md = [
    '# System Design',
    '',
    'Intro with **bold**, *italic*, `inlineCode`, and [Tomo](https://tomoo.uk).',
    '',
    '- First bullet',
    '- [x] Completed task',
    '1. Step one',
    '',
    '> Important note',
    '',
    '```ts',
    'const ok = true;',
    '```',
  ].join('\n');

  const blocks = markdownToBlocks(md);
  const { changed, insertedIds } = writeBlocksToYDoc(ydoc, blocks, 'replace');
  assert.equal(changed, true);
  assert.ok(insertedIds.length >= 7);

  // Verify BlockNote schema structure: <blockGroup> -> <blockContainer>
  const frag = ydoc.getXmlFragment('document-store');
  const rootGroup = frag.get(0);
  assert.equal(rootGroup.nodeName, 'blockGroup');
  assert.equal(rootGroup.get(0).nodeName, 'blockContainer');

  const parsed = readBlocksFromYDoc(ydoc, false);
  assert.equal(parsed.blocks[0].type, 'heading');
  assert.equal(parsed.blocks[0].props.level, 1);
  assert.match(parsed.markdown, /^# System Design/);
  assert.match(parsed.markdown, /\*\*bold\*\*/);
  assert.match(parsed.markdown, /- \[x\] Completed task/);
  assert.match(parsed.markdown, /```ts\nconst ok = true;\n```/);

  // Insert after, update, and delete
  const headingId = parsed.blocks[0].id;
  writeBlocksToYDoc(
    ydoc,
    [{ type: 'paragraph', content: 'Inserted summary' }],
    'insert_after',
    headingId,
  );
  let afterInsert = readBlocksFromYDoc(ydoc, false);
  assert.equal(afterInsert.blocks[1].text, 'Inserted summary');

  const insertedId = afterInsert.blocks[1].id;
  writeBlocksToYDoc(
    ydoc,
    [{ type: 'paragraph', content: 'Updated summary' }],
    'update_block',
    insertedId,
  );
  afterInsert = readBlocksFromYDoc(ydoc, false);
  assert.equal(afterInsert.blocks[1].text, 'Updated summary');

  writeBlocksToYDoc(ydoc, [], 'delete_block', insertedId);
  afterInsert = readBlocksFromYDoc(ydoc, false);
  assert.notEqual(afterInsert.blocks[1].text, 'Updated summary');
});

test('canvasYjs builds Excalidraw elements, labeled diagrams, and mutates Y.Map(elements)', () => {
  const { element, boundText } = buildExcalidrawElement({
    id: 'rect-1',
    type: 'rectangle',
    x: 50,
    y: 50,
    label: 'Client App',
  });
  assert.equal(element.id, 'rect-1');
  assert.ok(boundText);
  assert.equal(boundText.containerId, 'rect-1');
  assert.equal(element.boundElements[0].id, boundText.id);

  const diagram = buildDiagramElements(
    [
      { key: 'ui', label: 'Mini Editor' },
      { key: 'go', label: 'Go Backend' },
    ],
    [{ from: 'ui', to: 'go', label: 'HTTP/MCP' }],
    'horizontal',
  );
  // 2 shapes + 2 labels + 1 arrow + 1 arrow label = 6 elements
  assert.equal(diagram.length, 6);

  const ydoc = new Y.Doc();
  mutateCanvasYDoc(ydoc, { kind: 'add', elements: diagram });
  let state = readCanvasFromYDoc(ydoc);
  assert.equal(state.activeElements.length, 6);

  const targetId = state.activeElements[0].id;
  mutateCanvasYDoc(ydoc, {
    kind: 'update',
    updates: [{ id: targetId, strokeColor: '#e03131' }],
  });
  state = readCanvasFromYDoc(ydoc);
  assert.equal(ydoc.getMap('elements').get(targetId).strokeColor, '#e03131');
  assert.equal(ydoc.getMap('elements').get(targetId).version, 2);

  mutateCanvasYDoc(ydoc, { kind: 'delete', elementIds: [targetId] });
  state = readCanvasFromYDoc(ydoc);
  assert.equal(state.deletedCount, 1);
  assert.equal(state.activeElements.length, 5);
});

function createMockGoClient() {
  const docs = new Map();
  const canvases = new Map();
  const series = new Map();
  const snapshots = new Map();
  let nextDoc = 1;
  let nextCanvas = 1;
  let nextSeries = 1;

  return {
    apiBase: 'http://mock.local/api/v1',
    authToken: 'mock-jwt',
    yjsSecret: 'mock-secret',

    async listDocs() {
      const items = Array.from(docs.values());
      return { items, total_items: items.length, page: 1, page_size: 20, total_pages: 1 };
    },
    async getDoc(id) {
      const d = docs.get(id);
      if (!d) throw new Error(`doc ${id} not found`);
      return d;
    },
    async getDocBySlug(slug) {
      const found = Array.from(docs.values()).find((d) => d.slug === slug);
      if (!found) throw new Error('not found');
      return found;
    },
    async getDocTree() {
      return Array.from(docs.values());
    },
    async createDoc({ title, content = '', status = 'DRAFT', parent_id = null }) {
      const id = `doc-uuid-${nextDoc++}`;
      const doc = {
        id,
        title,
        slug: `slug-${id}`,
        content,
        status,
        parent_id,
        owner_id: 'u1',
        is_pinned: false,
        is_starred: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      docs.set(id, doc);
      return doc;
    },
    async updateDoc(id, patch) {
      const d = docs.get(id);
      if (!d) throw new Error('not found');
      Object.assign(d, patch, { updated_at: new Date().toISOString() });
      return d;
    },
    async deleteDoc(id) {
      docs.delete(id);
    },
    async listRevisions() {
      return [];
    },
    async listSeries() {
      return { success: true, data: Array.from(series.values()), total: series.size };
    },
    async createSeries({ name, description = '' }) {
      const id = nextSeries++;
      const s = { id, name, description };
      series.set(id, s);
      return s;
    },
    async updateSeries(id, patch) {
      const s = series.get(id);
      Object.assign(s, patch);
      return s;
    },
    async deleteSeries(id) {
      series.delete(id);
    },
    async listCanvases() {
      const items = Array.from(canvases.values());
      return { items, total_items: items.length, page: 1, page_size: 20, total_pages: 1 };
    },
    async getCanvas(id) {
      const c = canvases.get(id);
      if (!c) throw new Error(`canvas ${id} not found`);
      return c;
    },
    async createCanvas({ title, scene = '{"elements":[],"appState":{},"files":{}}', metadata = '{}', status = 1 }) {
      const id = `canvas-uuid-${nextCanvas++}`;
      const c = {
        id,
        title,
        slug: `slug-${id}`,
        scene,
        metadata,
        status,
        owner_id: 'u1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      canvases.set(id, c);
      return c;
    },
    async updateCanvas(id, patch) {
      const c = canvases.get(id);
      if (!c) throw new Error('not found');
      Object.assign(c, patch, { updated_at: new Date().toISOString() });
      return c;
    },
    async deleteCanvas(id) {
      canvases.delete(id);
    },
    async mintToken() {
      throw new Error('force snapshot fallback in unit test');
    },
    async getInternalSnapshot(type, id) {
      return snapshots.get(`${type}:${id}`) || null;
    },
    async putInternalSnapshot(type, id, blob) {
      snapshots.set(`${type}:${id}`, blob);
    },
    async updateDocMeta(id, plainText) {
      const d = docs.get(id);
      if (d) d.content = plainText;
    },
  };
}

test('createTomoMcpServer end-to-end tool calls, resources, and prompts via InMemoryTransport', async () => {
  const mockClient = createMockGoClient();
  const mcpServer = createTomoMcpServer(mockClient);
  const client = new Client({ name: 'test-mcp-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

  const toolsList = await client.listTools();
  assert.ok(toolsList.tools.length >= 29);
  assert.ok(toolsList.tools.some((t) => t.name === 'docs_outline'));

  const parseJsonText = (res) => JSON.parse(res.content[0].text);

  // Create doc & write markdown live (large-file non-echoing response + outline + pagination)
  const createdDoc = parseJsonText(
    await client.callTool({
      name: 'docs_create',
      arguments: { title: 'Agent Handbook', content: '# Overview\n\nInitial paragraph.' },
    }),
  );
  assert.equal(createdDoc.title, 'Agent Handbook');

  const written = parseJsonText(
    await client.callTool({
      name: 'docs_write_markdown',
      arguments: {
        id: createdDoc.id,
        markdown: '## Next Steps\n\n- Review architecture\n- Benchmark large docs\n\n# Appendix\n\nDone.',
        mode: 'append',
      },
    }),
  );
  assert.equal(written.transport, 'snapshot-fallback');
  assert.equal(written.markdown, undefined);
  assert.match(written.preview, /# Overview/);
  assert.ok(written.total_blocks >= 6);

  const outline = parseJsonText(
    await client.callTool({
      name: 'docs_outline',
      arguments: { id: createdDoc.id },
    }),
  );
  assert.equal(outline.total_blocks, 7);
  assert.equal(outline.headings.length, 3);
  assert.equal(outline.headings[0].text, 'Overview');
  assert.equal(outline.headings[0].sectionBlockCount, 5);
  assert.equal(outline.headings[1].text, 'Next Steps');
  assert.equal(outline.headings[1].index, 2);
  assert.equal(outline.headings[1].sectionBlockCount, 3);
  assert.equal(outline.headings[2].text, 'Appendix');
  assert.equal(outline.headings[2].index, 5);
  assert.equal(outline.headings[2].sectionBlockCount, 2);

  // Paginated docs_read_live (page 1 default markdown only, then page 2 with format: 'both')
  const livePage1 = parseJsonText(
    await client.callTool({
      name: 'docs_read_live',
      arguments: { id: createdDoc.id, start_block: 0, limit: 2 },
    }),
  );
  assert.equal(livePage1.total_blocks, 7);
  assert.equal(livePage1.returned_blocks, 2);
  assert.equal(livePage1.has_more, true);
  assert.equal(livePage1.next_start_block, 2);
  assert.equal(livePage1.blocks, undefined);
  assert.match(livePage1.markdown, /<!-- block:/);

  const liveRead = parseJsonText(
    await client.callTool({
      name: 'docs_read_live',
      arguments: { id: createdDoc.id, start_block: 0, limit: 7, format: 'both' },
    }),
  );
  assert.equal(liveRead.has_more, false);
  assert.equal(liveRead.next_start_block, null);
  assert.ok(liveRead.blocks.length >= 3);
  const paraId = liveRead.blocks[1].id;

  await client.callTool({
    name: 'docs_update_block',
    arguments: { id: createdDoc.id, block_id: paraId, content: 'Updated **live** paragraph.' },
  });

  // Embed a newly generated diagram canvas into the doc
  const embedded = parseJsonText(
    await client.callTool({
      name: 'docs_embed_canvas',
      arguments: {
        doc_id: createdDoc.id,
        canvas_title: 'MCP Flow',
        diagram: {
          nodes: [
            { key: 'agent', label: 'AI Agent' },
            { key: 'tomo', label: 'Tomo Docs & Canvas' },
          ],
          edges: [{ from: 'agent', to: 'tomo', label: 'MCP' }],
        },
      },
    }),
  );
  assert.ok(embedded.canvas_id);
  assert.ok(embedded.embedded_block_id);

  // Read live canvas (full & summary_only + pagination + type filter)
  const liveCanvas = parseJsonText(
    await client.callTool({
      name: 'canvas_read_live',
      arguments: { id: embedded.canvas_id },
    }),
  );
  assert.equal(liveCanvas.active_count, 6);
  assert.equal(liveCanvas.total_active, 6);
  assert.equal(liveCanvas.type_counts.rectangle, 2);
  assert.ok(liveCanvas.bounds && liveCanvas.bounds.maxX > liveCanvas.bounds.minX);

  const liveCanvasSummary = parseJsonText(
    await client.callTool({
      name: 'canvas_read_live',
      arguments: {
        id: embedded.canvas_id,
        summary_only: true,
        types: ['rectangle'],
        offset: 0,
        limit: 1,
      },
    }),
  );
  assert.equal(liveCanvasSummary.matched_count, 2);
  assert.equal(liveCanvasSummary.returned_count, 1);
  assert.equal(liveCanvasSummary.has_more, true);
  assert.equal(liveCanvasSummary.next_offset, 1);
  assert.equal(liveCanvasSummary.elements[0].type, 'rectangle');
  assert.equal(liveCanvasSummary.elements[0].roughness, undefined);

  // Resource read & prompt get
  const docRes = await client.readResource({ uri: `tomo://docs/${createdDoc.id}` });
  assert.match(docRes.contents[0].text, /Updated \*\*live\*\* paragraph/);

  const prompt = await client.getPrompt({
    name: 'diagram_from_doc',
    arguments: { doc_id: createdDoc.id, canvas_title: 'Test Diagram' },
  });
  assert.match(prompt.messages[0].content.text, new RegExp(createdDoc.id));

  await Promise.all([client.close(), mcpServer.close()]);
});
