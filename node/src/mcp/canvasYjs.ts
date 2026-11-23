import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';

export type ExcalidrawElement = Record<string, any>;

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

export function buildExcalidrawElement(input: Record<string, any>): {
  element: ExcalidrawElement;
  boundText?: ExcalidrawElement;
} {
  const el: ExcalidrawElement = { ...input };
  const label = typeof el.label === 'string' ? el.label : undefined;
  delete el.label;

  const id = String(el.id || randomUUID().slice(0, 12));
  const type = String(el.type || 'rectangle');
  el.id = id;
  el.type = type;

  el.x = typeof el.x === 'number' ? el.x : 0;
  el.y = typeof el.y === 'number' ? el.y : 0;
  el.width =
    typeof el.width === 'number'
      ? el.width
      : type === 'arrow' || type === 'line'
        ? 120
        : 180;
  el.height =
    typeof el.height === 'number'
      ? el.height
      : type === 'arrow' || type === 'line'
        ? 0
        : 80;
  el.angle = typeof el.angle === 'number' ? el.angle : 0;
  el.strokeColor = el.strokeColor ?? '#1e1e1e';
  el.backgroundColor = el.backgroundColor ?? 'transparent';
  el.fillStyle = el.fillStyle ?? 'solid';
  el.strokeWidth = el.strokeWidth ?? 2;
  el.strokeStyle = el.strokeStyle ?? 'solid';
  el.roughness = el.roughness ?? 1;
  el.opacity = el.opacity ?? 100;
  el.groupIds = Array.isArray(el.groupIds) ? el.groupIds : [];
  el.frameId = el.frameId ?? null;
  el.seed = typeof el.seed === 'number' ? el.seed : randomSeed();
  el.version = typeof el.version === 'number' ? el.version : 1;
  el.versionNonce = typeof el.versionNonce === 'number' ? el.versionNonce : randomSeed();
  el.isDeleted = Boolean(el.isDeleted ?? false);
  el.boundElements = Array.isArray(el.boundElements) ? [...el.boundElements] : [];
  el.updated = typeof el.updated === 'number' ? el.updated : Date.now();
  el.link = el.link ?? null;
  el.locked = Boolean(el.locked ?? false);

  if (type === 'rectangle' || type === 'diamond') {
    el.roundness = el.roundness !== undefined ? el.roundness : { type: 3 };
  } else if (type === 'ellipse') {
    el.roundness = el.roundness !== undefined ? el.roundness : { type: 2 };
  } else if (type === 'arrow' || type === 'line') {
    el.roundness = el.roundness !== undefined ? el.roundness : { type: 2 };
    if (!Array.isArray(el.points)) {
      el.points = [
        [0, 0],
        [el.width, el.height],
      ];
    }
    if (type === 'arrow') {
      el.startBinding = el.startBinding ?? null;
      el.endBinding = el.endBinding ?? null;
      el.startArrowhead = el.startArrowhead ?? null;
      el.endArrowhead = el.endArrowhead === undefined ? 'arrow' : el.endArrowhead;
    }
  } else if (type === 'text') {
    const txt = String(el.text ?? '');
    el.text = txt;
    el.fontSize = el.fontSize ?? 20;
    el.fontFamily = el.fontFamily ?? 1;
    el.textAlign = el.textAlign ?? 'left';
    el.verticalAlign = el.verticalAlign ?? 'top';
    el.baseline = el.baseline ?? 18;
    el.containerId = el.containerId ?? null;
    el.originalText = el.originalText ?? txt;
    el.autoResize = el.autoResize ?? true;
    el.lineHeight = el.lineHeight ?? 1.25;
    el.roundness = null;
  }

  let boundText: ExcalidrawElement | undefined;
  if (label && label.trim() && type !== 'text') {
    const textId = randomUUID().slice(0, 12);
    const textW = Math.max(40, el.width - 20);
    const textH = 25;
    boundText = {
      id: textId,
      type: 'text',
      x: el.x + (el.width - textW) / 2,
      y: el.y + (el.height - textH) / 2,
      width: textW,
      height: textH,
      angle: 0,
      strokeColor: el.strokeColor,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: randomSeed(),
      version: 1,
      versionNonce: randomSeed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: label,
      fontSize: 18,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      baseline: 16,
      containerId: id,
      originalText: label,
      autoResize: true,
      lineHeight: 1.25,
    };
    el.boundElements.push({ id: textId, type: 'text' });
  }

  return { element: el, boundText };
}

export interface DiagramNodeInput {
  key: string;
  label: string;
  shape?: 'rectangle' | 'ellipse' | 'diamond';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  strokeColor?: string;
}

export interface DiagramEdgeInput {
  from: string;
  to: string;
  label?: string;
  strokeColor?: string;
}

export function buildDiagramElements(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[] = [],
  layout: 'horizontal' | 'vertical' | 'grid' = 'horizontal',
): ExcalidrawElement[] {
  const out: ExcalidrawElement[] = [];
  const nodeBoxByKey = new Map<string, ExcalidrawElement>();

  const defaultW = 200;
  const defaultH = 84;
  const gapX = 110;
  const gapY = 90;
  const cols = layout === 'grid' ? Math.max(1, Math.ceil(Math.sqrt(nodes.length))) : 1;

  nodes.forEach((n, idx) => {
    let x = n.x;
    let y = n.y;
    const w = n.width ?? defaultW;
    const h = n.height ?? defaultH;

    if (x === undefined || y === undefined) {
      if (layout === 'vertical') {
        x = x ?? 120;
        y = y ?? 100 + idx * (h + gapY);
      } else if (layout === 'grid') {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        x = x ?? 100 + col * (w + gapX);
        y = y ?? 100 + row * (h + gapY);
      } else {
        x = x ?? 100 + idx * (w + gapX);
        y = y ?? 160;
      }
    }

    const { element, boundText } = buildExcalidrawElement({
      type: n.shape || 'rectangle',
      x,
      y,
      width: w,
      height: h,
      backgroundColor: n.backgroundColor || '#e7f5ff',
      strokeColor: n.strokeColor || '#1971c2',
      label: n.label,
    });

    nodeBoxByKey.set(n.key, element);
    out.push(element);
    if (boundText) out.push(boundText);
  });

  for (const edge of edges) {
    const src = nodeBoxByKey.get(edge.from);
    const dst = nodeBoxByKey.get(edge.to);
    if (!src || !dst) continue;

    const srcCx = src.x + src.width / 2;
    const srcCy = src.y + src.height / 2;
    const dstCx = dst.x + dst.width / 2;
    const dstCy = dst.y + dst.height / 2;

    const dx = dstCx - srcCx;
    const dy = dstCy - srcCy;

    let startX = srcCx;
    let startY = srcCy;
    let endX = dstCx;
    let endY = dstCy;

    if (Math.abs(dx) >= Math.abs(dy)) {
      startX = dx >= 0 ? src.x + src.width : src.x;
      endX = dx >= 0 ? dst.x : dst.x + dst.width;
    } else {
      startY = dy >= 0 ? src.y + src.height : src.y;
      endY = dy >= 0 ? dst.y : dst.y + dst.height;
    }

    const relX = endX - startX;
    const relY = endY - startY;

    const { element: arrow, boundText } = buildExcalidrawElement({
      type: 'arrow',
      x: startX,
      y: startY,
      width: Math.abs(relX),
      height: Math.abs(relY),
      points: [
        [0, 0],
        [relX, relY],
      ],
      strokeColor: edge.strokeColor || '#1e1e1e',
      startBinding: { elementId: src.id, focus: 0, gap: 6 },
      endBinding: { elementId: dst.id, focus: 0, gap: 6 },
      ...(edge.label ? { label: edge.label } : {}),
    });

    src.boundElements.push({ id: arrow.id, type: 'arrow' });
    dst.boundElements.push({ id: arrow.id, type: 'arrow' });

    if (boundText) {
      boundText.x = startX + relX / 2 - boundText.width / 2;
      boundText.y = startY + relY / 2 - boundText.height / 2;
    }

    out.push(arrow);
    if (boundText) out.push(boundText);
  }

  return out;
}

export function readCanvasFromYDoc(ydoc: Y.Doc): {
  elements: ExcalidrawElement[];
  activeElements: ExcalidrawElement[];
  deletedCount: number;
  files: Record<string, any>;
} {
  const elementsMap = ydoc.getMap<any>('elements');
  const filesMap = ydoc.getMap<any>('files');

  const elements: ExcalidrawElement[] = [];
  elementsMap.forEach((val) => {
    if (val && typeof val === 'object') {
      elements.push(val);
    }
  });

  const activeElements = elements.filter((el) => !el.isDeleted);
  const files: Record<string, any> = {};
  filesMap.forEach((val, key) => {
    files[key] = val;
  });

  return {
    elements,
    activeElements,
    deletedCount: elements.length - activeElements.length,
    files,
  };
}

export function seedCanvasYDocFromSceneJson(ydoc: Y.Doc, sceneJson: string | null | undefined): void {
  if (!sceneJson) return;
  const elementsMap = ydoc.getMap<any>('elements');
  const filesMap = ydoc.getMap<any>('files');
  if (elementsMap.size > 0) return;

  try {
    const parsed = JSON.parse(sceneJson);
    const els = Array.isArray(parsed?.elements) ? parsed.elements : [];
    const files = parsed?.files && typeof parsed.files === 'object' ? parsed.files : {};
    if (els.length === 0 && Object.keys(files).length === 0) return;

    ydoc.transact(() => {
      for (const el of els) {
        if (el?.id) elementsMap.set(String(el.id), el);
      }
      for (const [k, v] of Object.entries(files)) {
        if (!filesMap.has(k)) filesMap.set(k, v);
      }
    }, 'mcp-seed');
  } catch {
    // ignore invalid scene JSON
  }
}

export type CanvasMutationOp =
  | { kind: 'add'; elements: Record<string, any>[] }
  | { kind: 'update'; updates: Record<string, any>[] }
  | { kind: 'delete'; elementIds: string[]; hardDelete?: boolean }
  | { kind: 'replace'; elements: Record<string, any>[] };

export function mutateCanvasYDoc(
  ydoc: Y.Doc,
  op: CanvasMutationOp,
): { affectedIds: string[]; missingIds: string[] } {
  const elementsMap = ydoc.getMap<any>('elements');
  const affectedIds: string[] = [];
  const missingIds: string[] = [];

  ydoc.transact(() => {
    if (op.kind === 'replace') {
      for (const k of Array.from(elementsMap.keys())) {
        elementsMap.delete(k);
      }
      for (const raw of op.elements) {
        const { element, boundText } = buildExcalidrawElement(raw);
        elementsMap.set(element.id, element);
        affectedIds.push(element.id);
        if (boundText) {
          elementsMap.set(boundText.id, boundText);
          affectedIds.push(boundText.id);
        }
      }
      return;
    }

    if (op.kind === 'add') {
      for (const raw of op.elements) {
        const { element, boundText } = buildExcalidrawElement(raw);
        elementsMap.set(element.id, element);
        affectedIds.push(element.id);
        if (boundText) {
          elementsMap.set(boundText.id, boundText);
          affectedIds.push(boundText.id);
        }
      }
      return;
    }

    if (op.kind === 'update') {
      const now = Date.now();
      for (const patch of op.updates) {
        const id = String(patch.id || '');
        if (!id) continue;
        const existing = elementsMap.get(id);
        if (!existing) {
          missingIds.push(id);
          continue;
        }
        const merged = {
          ...existing,
          ...patch,
          id,
          version: (typeof existing.version === 'number' ? existing.version : 1) + 1,
          versionNonce: randomSeed(),
          updated: now,
        };
        elementsMap.set(id, merged);
        affectedIds.push(id);
      }
      return;
    }

    if (op.kind === 'delete') {
      const now = Date.now();
      for (const id of op.elementIds) {
        const existing = elementsMap.get(id);
        if (!existing) {
          missingIds.push(id);
          continue;
        }
        if (op.hardDelete) {
          elementsMap.delete(id);
        } else {
          elementsMap.set(id, {
            ...existing,
            isDeleted: true,
            version: (typeof existing.version === 'number' ? existing.version : 1) + 1,
            versionNonce: randomSeed(),
            updated: now,
          });
        }
        affectedIds.push(id);
      }
    }
  }, 'mcp-agent');

  return { affectedIds, missingIds };
}
