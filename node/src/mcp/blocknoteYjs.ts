import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';

export const COLLAB_FRAGMENT = 'document-store';

export interface InlineRun {
  text: string;
  marks?: {
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    code?: boolean;
    link?: string;
  };
}

export interface BlockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: InlineRun[];
  text: string;
  children: BlockNode[];
  tableRows?: string[][];
}

export interface ParsedDocument {
  blocks: BlockNode[];
  markdown: string;
  plainText: string;
  blockCount: number;
}

export interface OutlineEntry {
  index: number;
  blockId: string;
  level: number;
  text: string;
  sectionBlockCount: number;
}

/**
 * Extract a top-level heading outline whose `index` aligns with `start_block`
 * pagination in `docs_read_live`.
 */
export function extractDocumentOutline(blocks: BlockNode[]): OutlineEntry[] {
  const rawHeadings: Array<{ index: number; blockId: string; level: number; text: string }> = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'heading') {
      const level = Math.min(Math.max(Number(b.props.level || 1), 1), 6);
      rawHeadings.push({
        index: i,
        blockId: b.id,
        level,
        text: b.text.trim(),
      });
    }
  }
  return rawHeadings.map((h, pos) => {
    let nextBoundary = blocks.length;
    for (let j = pos + 1; j < rawHeadings.length; j++) {
      if (rawHeadings[j].level <= h.level) {
        nextBoundary = rawHeadings[j].index;
        break;
      }
    }
    return {
      ...h,
      sectionBlockCount: nextBoundary - h.index,
    };
  });
}

function attrsToPlainRecord(xml: Y.XmlElement): Record<string, unknown> {
  const attrs = xml.getAttributes();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function deltaToInlineRuns(xmlText: Y.XmlText): InlineRun[] {
  const delta = xmlText.toDelta() as Array<{
    insert?: unknown;
    attributes?: Record<string, unknown>;
  }>;
  const runs: InlineRun[] = [];
  for (const op of delta) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue;
    const rawAttrs = op.attributes || {};
    const marks: InlineRun['marks'] = {};
    if (rawAttrs.bold) marks.bold = true;
    if (rawAttrs.italic) marks.italic = true;
    if (rawAttrs.strike) marks.strike = true;
    if (rawAttrs.code) marks.code = true;
    if (rawAttrs.link && typeof rawAttrs.link === 'object' && 'href' in rawAttrs.link) {
      marks.link = String((rawAttrs.link as { href: unknown }).href);
    } else if (typeof rawAttrs.link === 'string') {
      marks.link = rawAttrs.link;
    }
    const hasMarks = Object.keys(marks).length > 0;
    runs.push(hasMarks ? { text: op.insert, marks } : { text: op.insert });
  }
  return runs;
}

function runsToMarkdown(runs: InlineRun[]): string {
  return runs
    .map((r) => {
      let s = r.text;
      if (!r.marks) return s;
      if (r.marks.code) s = `\`${s}\``;
      if (r.marks.bold) s = `**${s}**`;
      if (r.marks.italic) s = `*${s}*`;
      if (r.marks.strike) s = `~~${s}~~`;
      if (r.marks.link) s = `[${s}](${r.marks.link})`;
      return s;
    })
    .join('');
}

function extractInlineRunsFromContentNode(el: Y.XmlElement): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const child of el.toArray()) {
    if (child instanceof Y.XmlText) {
      runs.push(...deltaToInlineRuns(child));
    }
  }
  return runs;
}

function extractTableRows(tableEl: Y.XmlElement): string[][] {
  const rows: string[][] = [];
  for (const rowNode of tableEl.toArray()) {
    if (!(rowNode instanceof Y.XmlElement)) continue;
    const cells: string[] = [];
    for (const cellNode of rowNode.toArray()) {
      if (!(cellNode instanceof Y.XmlElement)) continue;
      const cellParts: string[] = [];
      for (const pNode of cellNode.toArray()) {
        if (pNode instanceof Y.XmlText) {
          cellParts.push(pNode.toString());
        } else if (pNode instanceof Y.XmlElement) {
          cellParts.push(runsToMarkdown(extractInlineRunsFromContentNode(pNode)));
        }
      }
      cells.push(cellParts.join(' ').trim());
    }
    rows.push(cells);
  }
  return rows;
}

function parseBlockContainer(container: Y.XmlElement): BlockNode | null {
  const containerAttrs = attrsToPlainRecord(container);
  const blockId = String(containerAttrs.id || randomUUID());
  const childrenEls = container.toArray();

  let contentEl: Y.XmlElement | null = null;
  let nestedGroupEl: Y.XmlElement | null = null;

  for (const child of childrenEls) {
    if (child instanceof Y.XmlElement) {
      if (child.nodeName === 'blockGroup') {
        nestedGroupEl = child;
      } else if (!contentEl) {
        contentEl = child;
      }
    }
  }

  if (!contentEl) return null;

  const blockType = contentEl.nodeName;
  const contentAttrs = attrsToPlainRecord(contentEl);
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(containerAttrs)) {
    if (k !== 'id') props[k] = v;
  }
  for (const [k, v] of Object.entries(contentAttrs)) {
    props[k] = v;
  }

  let runs: InlineRun[] = [];
  let tableRows: string[][] | undefined;

  if (blockType === 'table') {
    tableRows = extractTableRows(contentEl);
  } else {
    runs = extractInlineRunsFromContentNode(contentEl);
  }

  const nestedChildren = nestedGroupEl ? parseBlockGroup(nestedGroupEl) : [];
  const plain = tableRows
    ? tableRows.map((r) => r.join(' | ')).join('\n')
    : runs.map((r) => r.text).join('');

  return {
    id: blockId,
    type: blockType,
    props,
    content: runs,
    text: plain,
    children: nestedChildren,
    ...(tableRows ? { tableRows } : {}),
  };
}

function parseBlockGroup(groupEl: Y.XmlElement): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const child of groupEl.toArray()) {
    if (child instanceof Y.XmlElement) {
      if (child.nodeName === 'blockContainer') {
        const b = parseBlockContainer(child);
        if (b) blocks.push(b);
      } else if (child.nodeName === 'blockGroup') {
        blocks.push(...parseBlockGroup(child));
      }
    }
  }
  return blocks;
}

export function blocksToMarkdown(blocks: BlockNode[], includeIds = false, indent = 0): string {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);

  let numberedCounter = 0;
  for (const block of blocks) {
    if (block.type !== 'numberedListItem') {
      numberedCounter = 0;
    }

    const idSuffix = includeIds ? ` <!-- block:${block.id} -->` : '';
    const inlineMd = runsToMarkdown(block.content);

    switch (block.type) {
      case 'heading': {
        const lvl = Math.min(Math.max(Number(block.props.level || 1), 1), 6);
        lines.push(`${pad}${'#'.repeat(lvl)} ${inlineMd}${idSuffix}`);
        break;
      }
      case 'bulletListItem':
        lines.push(`${pad}- ${inlineMd}${idSuffix}`);
        break;
      case 'numberedListItem':
        numberedCounter += 1;
        lines.push(`${pad}${numberedCounter}. ${inlineMd}${idSuffix}`);
        break;
      case 'checkListItem': {
        const checked = block.props.checked === true || block.props.checked === 'true';
        lines.push(`${pad}- [${checked ? 'x' : ' '}] ${inlineMd}${idSuffix}`);
        break;
      }
      case 'codeBlock': {
        const lang = String(block.props.language || '');
        lines.push(`${pad}\`\`\`${lang}${idSuffix}\n${block.text}\n${pad}\`\`\``);
        break;
      }
      case 'quote':
        lines.push(`${pad}> ${inlineMd}${idSuffix}`);
        break;
      case 'image': {
        const url = String(block.props.url || '');
        const caption = String(block.props.caption || 'image');
        lines.push(`${pad}![${caption}](${url})${idSuffix}`);
        break;
      }
      case 'excalidraw': {
        const canvasId = String(block.props.canvasId || '');
        lines.push(`${pad}<!-- excalidraw:${canvasId} -->${idSuffix}`);
        break;
      }
      case 'table': {
        const rows = block.tableRows || [];
        if (rows.length > 0) {
          lines.push(`${pad}| ${rows[0].join(' | ')} |${idSuffix}`);
          lines.push(`${pad}| ${rows[0].map(() => '---').join(' | ')} |`);
          for (let i = 1; i < rows.length; i++) {
            lines.push(`${pad}| ${rows[i].join(' | ')} |`);
          }
        }
        break;
      }
      default:
        lines.push(`${pad}${inlineMd}${idSuffix}`);
        break;
    }

    if (block.children.length > 0) {
      lines.push(blocksToMarkdown(block.children, includeIds, indent + 1));
    }
  }

  return lines.join('\n');
}

function countBlocks(blocks: BlockNode[]): number {
  let count = 0;
  for (const b of blocks) {
    count += 1 + countBlocks(b.children);
  }
  return count;
}

function collectPlainText(blocks: BlockNode[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.text.trim()) parts.push(b.text.trim());
    if (b.children.length > 0) {
      const childText = collectPlainText(b.children);
      if (childText) parts.push(childText);
    }
  }
  return parts.join('\n');
}

export function readBlocksFromYDoc(ydoc: Y.Doc, includeIds = false): ParsedDocument {
  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT);
  const blocks: BlockNode[] = [];

  for (const child of fragment.toArray()) {
    if (child instanceof Y.XmlElement) {
      if (child.nodeName === 'blockGroup') {
        blocks.push(...parseBlockGroup(child));
      } else if (child.nodeName === 'blockContainer') {
        const b = parseBlockContainer(child);
        if (b) blocks.push(b);
      }
    }
  }

  return {
    blocks,
    markdown: blocksToMarkdown(blocks, includeIds),
    plainText: collectPlainText(blocks),
    blockCount: countBlocks(blocks),
  };
}

export function parseInlineMarkdown(text: string): InlineRun[] {
  if (!text) return [];
  const runs: InlineRun[] = [];
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined && match[3] !== undefined) {
      runs.push({ text: match[2], marks: { link: match[3] } });
    } else if (match[4] !== undefined) {
      runs.push({ text: match[4], marks: { code: true } });
    } else if (match[5] !== undefined) {
      runs.push({ text: match[5], marks: { bold: true } });
    } else if (match[6] !== undefined) {
      runs.push({ text: match[6], marks: { strike: true } });
    } else if (match[7] !== undefined) {
      runs.push({ text: match[7], marks: { italic: true } });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex) });
  }
  return runs;
}

export interface InputBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: string | InlineRun[];
  children?: InputBlock[];
}

export function markdownToBlocks(markdown: string): InputBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: InputBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({
        id: randomUUID(),
        type: 'codeBlock',
        props: { language },
        content: codeLines.join('\n'),
      });
      continue;
    }

    // Blank line -> skip unless explicitly needed
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Excalidraw HTML comment directive: <!-- excalidraw:<canvasId> -->
    const excalMatch = line.trim().match(/^<!--\s*excalidraw:([^\s>]+)\s*-->$/);
    if (excalMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'excalidraw',
        props: { canvasId: excalMatch[1], previewWidth: 0 },
      });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      blocks.push({
        id: randomUUID(),
        type: 'heading',
        props: { level },
        content: parseInlineMarkdown(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Check list item: - [ ] or - [x]
    const checkMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (checkMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'checkListItem',
        props: { checked: checkMatch[1].toLowerCase() === 'x' },
        content: parseInlineMarkdown(checkMatch[2]),
      });
      i++;
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'bulletListItem',
        content: parseInlineMarkdown(bulletMatch[1]),
      });
      i++;
      continue;
    }

    // Numbered list item
    const numMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'numberedListItem',
        content: parseInlineMarkdown(numMatch[1]),
      });
      i++;
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'quote',
        content: parseInlineMarkdown(quoteMatch[1]),
      });
      i++;
      continue;
    }

    // Image ![alt](url)
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'image',
        props: { url: imgMatch[2], caption: imgMatch[1] },
      });
      i++;
      continue;
    }

    // Default paragraph (coalesce consecutive plain lines)
    const paraLines: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>\s|!\[|<!--\s*excalidraw:)/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({
      id: randomUUID(),
      type: 'paragraph',
      content: parseInlineMarkdown(paraLines.join(' ')),
    });
  }

  return blocks;
}

function applyRunsToXmlText(xmlText: Y.XmlText, content?: string | InlineRun[], isCode = false): void {
  if (!content) return;
  const runs: InlineRun[] =
    typeof content === 'string'
      ? isCode
        ? [{ text: content }]
        : parseInlineMarkdown(content)
      : content;

  let offset = 0;
  let hadPreviousMarks = false;
  for (const run of runs) {
    if (!run.text) continue;
    const attrs = buildXmlTextAttrs(run.marks, hadPreviousMarks);
    xmlText.insert(offset, run.text, attrs);
    offset += run.text.length;
    hadPreviousMarks = Boolean(
      run.marks &&
        (run.marks.bold || run.marks.italic || run.marks.strike || run.marks.code || run.marks.link),
    );
  }
}

function buildXmlTextAttrs(
  marks?: InlineRun['marks'],
  clearInherited = false,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  if (marks?.bold) out.bold = {};
  else if (clearInherited) out.bold = null;

  if (marks?.italic) out.italic = {};
  else if (clearInherited) out.italic = null;

  if (marks?.strike) out.strike = {};
  else if (clearInherited) out.strike = null;

  if (marks?.code) out.code = {};
  else if (clearInherited) out.code = null;

  if (marks?.link) out.link = { href: marks.link };
  else if (clearInherited) out.link = null;

  return Object.keys(out).length > 0 ? out : undefined;
}

const CONTAINER_ATTR_KEYS = new Set(['textColor', 'backgroundColor', 'textAlignment']);

function createBlockContainerElement(block: InputBlock): Y.XmlElement {
  const container = new Y.XmlElement('blockContainer');
  const id = block.id || randomUUID();
  container.setAttribute('id', id);
  container.setAttribute('textColor', String(block.props?.textColor ?? 'default'));
  container.setAttribute('backgroundColor', String(block.props?.backgroundColor ?? 'default'));

  const type = block.type || 'paragraph';
  const contentEl = new Y.XmlElement(type);

  const props = block.props || {};
  if (type === 'heading') {
    contentEl.setAttribute('level', (props.level ?? 1) as unknown as string);
  } else if (type === 'checkListItem') {
    contentEl.setAttribute('checked', Boolean(props.checked) as unknown as string);
  } else if (type === 'codeBlock') {
    contentEl.setAttribute('language', String(props.language ?? 'text'));
  } else if (type === 'excalidraw') {
    contentEl.setAttribute('canvasId', String(props.canvasId ?? ''));
    contentEl.setAttribute('previewWidth', Number(props.previewWidth ?? 0) as unknown as string);
  } else if (type === 'image') {
    contentEl.setAttribute('url', String(props.url ?? ''));
    contentEl.setAttribute('caption', String(props.caption ?? ''));
  }

  for (const [k, v] of Object.entries(props)) {
    if (CONTAINER_ATTR_KEYS.has(k)) {
      container.setAttribute(k, String(v));
    } else if (
      k !== 'level' &&
      k !== 'checked' &&
      k !== 'language' &&
      k !== 'canvasId' &&
      k !== 'previewWidth' &&
      k !== 'url' &&
      k !== 'caption'
    ) {
      contentEl.setAttribute(k, v as string);
    }
  }

  const isInlineBlock = type !== 'excalidraw' && type !== 'image' && type !== 'table';
  if (isInlineBlock) {
    const xmlText = new Y.XmlText();
    contentEl.insert(0, [xmlText]);
    applyRunsToXmlText(xmlText, block.content, type === 'codeBlock');
  }

  container.insert(0, [contentEl]);

  if (block.children && block.children.length > 0) {
    const childGroup = new Y.XmlElement('blockGroup');
    const childContainers = block.children.map((c) => createBlockContainerElement(c));
    childGroup.insert(0, childContainers);
    container.insert(1, [childGroup]);
  }

  return container;
}

function ensureRootBlockGroup(fragment: Y.XmlFragment): Y.XmlElement {
  for (const child of fragment.toArray()) {
    if (child instanceof Y.XmlElement && child.nodeName === 'blockGroup') {
      return child;
    }
  }
  const group = new Y.XmlElement('blockGroup');
  fragment.insert(0, [group]);
  return group;
}

function findBlockInGroup(
  group: Y.XmlElement,
  targetId: string,
): { parentGroup: Y.XmlElement; index: number; container: Y.XmlElement } | null {
  const arr = group.toArray();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!(item instanceof Y.XmlElement)) continue;
    if (item.nodeName === 'blockContainer') {
      if (String(item.getAttribute('id')) === targetId) {
        return { parentGroup: group, index: i, container: item };
      }
      for (const child of item.toArray()) {
        if (child instanceof Y.XmlElement && child.nodeName === 'blockGroup') {
          const found = findBlockInGroup(child, targetId);
          if (found) return found;
        }
      }
    } else if (item.nodeName === 'blockGroup') {
      const found = findBlockInGroup(item, targetId);
      if (found) return found;
    }
  }
  return null;
}

export type WriteBlocksMode =
  | 'replace'
  | 'append'
  | 'prepend'
  | 'insert_after'
  | 'update_block'
  | 'delete_block';

export function writeBlocksToYDoc(
  ydoc: Y.Doc,
  blocks: InputBlock[],
  mode: WriteBlocksMode,
  targetBlockId?: string,
): { changed: boolean; insertedIds: string[] } {
  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT);
  const insertedIds: string[] = [];
  let changed = false;

  ydoc.transact(() => {
    const rootGroup = ensureRootBlockGroup(fragment);

    if (mode === 'replace') {
      if (rootGroup.length > 0) {
        rootGroup.delete(0, rootGroup.length);
      }
      const created = blocks.map((b) => {
        const normalized = { ...b, id: b.id || randomUUID() };
        insertedIds.push(normalized.id);
        return createBlockContainerElement(normalized);
      });
      if (created.length > 0) {
        rootGroup.insert(0, created);
      }
      changed = true;
      return;
    }

    if (mode === 'append') {
      const created = blocks.map((b) => {
        const normalized = { ...b, id: b.id || randomUUID() };
        insertedIds.push(normalized.id);
        return createBlockContainerElement(normalized);
      });
      if (created.length > 0) {
        rootGroup.insert(rootGroup.length, created);
        changed = true;
      }
      return;
    }

    if (mode === 'prepend') {
      const created = blocks.map((b) => {
        const normalized = { ...b, id: b.id || randomUUID() };
        insertedIds.push(normalized.id);
        return createBlockContainerElement(normalized);
      });
      if (created.length > 0) {
        rootGroup.insert(0, created);
        changed = true;
      }
      return;
    }

    if (!targetBlockId) {
      throw new Error(`targetBlockId is required for mode "${mode}"`);
    }
    const found = findBlockInGroup(rootGroup, targetBlockId);
    if (!found) {
      throw new Error(`Block "${targetBlockId}" not found in document`);
    }

    if (mode === 'insert_after') {
      const created = blocks.map((b) => {
        const normalized = { ...b, id: b.id || randomUUID() };
        insertedIds.push(normalized.id);
        return createBlockContainerElement(normalized);
      });
      if (created.length > 0) {
        found.parentGroup.insert(found.index + 1, created);
        changed = true;
      }
      return;
    }

    if (mode === 'delete_block') {
      found.parentGroup.delete(found.index, 1);
      changed = true;
      return;
    }

    if (mode === 'update_block') {
      const nextSpec = blocks[0];
      if (!nextSpec) throw new Error('At least one block is required for update_block');
      const existing = parseBlockContainer(found.container);
      const merged: InputBlock = {
        id: targetBlockId,
        type: nextSpec.type || existing?.type || 'paragraph',
        props: { ...(existing?.props || {}), ...(nextSpec.props || {}) },
        content: nextSpec.content !== undefined ? nextSpec.content : existing?.content,
      };
      const replacement = createBlockContainerElement(merged);
      found.parentGroup.delete(found.index, 1);
      found.parentGroup.insert(found.index, [replacement]);
      insertedIds.push(targetBlockId);
      changed = true;
    }
  }, 'mcp-agent');

  return { changed, insertedIds };
}
