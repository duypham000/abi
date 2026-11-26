import type { DocDto } from "@/core/interfaces/docs";
import type { CanvasDto } from "@/core/interfaces/canvas";
import { parseOrHashId } from "@/core/utils/idUtils";
import {
  getCanvasFromSqlite,
  listCanvasFromSqlite,
} from "@/infrastructure/tauri/canvasCacheService";
import {
  getDocFromSqlite,
  listDocsFromSqlite,
} from "@/infrastructure/tauri/docCacheService";
import { store } from "@/presentation/store";
import { docsApi } from "@/infrastructure/api/docsApi";
import { canvasApi } from "@/infrastructure/api/canvasApi";

export const AGENT_DEEPLINK_NAVIGATE_EVENT = "tomo:agent-deeplink-navigate";
export const AGENT_DEEPLINK_HASH_PREFIX = "#tomo-deeplink";

export type AgentDeeplinkKind = "doc" | "canvas";

export interface AgentDeeplinkTarget {
  kind: AgentDeeplinkKind;
  rawRef: string;
  resolvedId?: number;
  title?: string;
  // Doc navigation targets
  blockId?: string;
  startLine?: number;
  endLine?: number;
  heading?: string;
  searchText?: string;
  // Canvas navigation targets
  elementIds?: string[];
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zoom?: number;
  nonce: number;
}

export type AgentDeeplinkInput = Omit<AgentDeeplinkTarget, "nonce"> & {
  nonce?: number;
};

let deeplinkNonceSeq = 0;
function nextDeeplinkNonce(): number {
  deeplinkNonceSeq += 1;
  return Date.now() * 1000 + (deeplinkNonceSeq % 1000);
}

const pendingDeeplinks = new Map<
  string,
  { target: AgentDeeplinkTarget; expiresAt: number }
>();

const PENDING_TTL_MS = 30_000;

function pendingKey(kind: AgentDeeplinkKind, idOrRef: number | string): string {
  return `${kind}:${String(idOrRef)}`;
}

function storePendingDeeplink(target: AgentDeeplinkTarget): void {
  const expiresAt = Date.now() + PENDING_TTL_MS;
  if (target.resolvedId != null && Number.isFinite(target.resolvedId)) {
    pendingDeeplinks.set(pendingKey(target.kind, target.resolvedId), {
      target,
      expiresAt,
    });
  }
  if (target.rawRef) {
    pendingDeeplinks.set(pendingKey(target.kind, target.rawRef), {
      target,
      expiresAt,
    });
  }
}

export function consumePendingDeeplink(
  kind: AgentDeeplinkKind,
  id: number,
  altRefs: Array<string | null | undefined> = []
): AgentDeeplinkTarget | null {
  const now = Date.now();
  const keys = [
    pendingKey(kind, id),
    ...altRefs.filter((r): r is string => Boolean(r)).map((r) => pendingKey(kind, r)),
  ];
  for (const key of keys) {
    const entry = pendingDeeplinks.get(key);
    if (!entry) continue;
    pendingDeeplinks.delete(key);
    if (entry.expiresAt >= now) {
      return entry.target;
    }
  }
  return null;
}

function parseFiniteNumber(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parsePositiveInt(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseLineRange(
  raw: string | null | undefined
): { startLine?: number; endLine?: number } {
  if (!raw) return {};
  const cleaned = raw.trim().replace(/^L/i, "");
  const m = /^(\d+)(?:\s*[-–:]\s*L?(\d+))?$/i.exec(cleaned);
  if (!m) return {};
  const startLine = Number.parseInt(m[1], 10);
  const endLine = m[2] ? Number.parseInt(m[2], 10) : startLine;
  if (!Number.isFinite(startLine) || startLine <= 0) return {};
  return {
    startLine,
    endLine: Number.isFinite(endLine) && endLine >= startLine ? endLine : startLine,
  };
}

export function buildAgentDeeplinkHash(
  target: Omit<AgentDeeplinkTarget, "nonce">
): string {
  const params = new URLSearchParams();
  params.set("kind", target.kind);
  params.set("ref", target.rawRef);
  if (target.resolvedId != null && Number.isFinite(target.resolvedId)) {
    params.set("id", String(target.resolvedId));
  }
  if (target.title) params.set("title", target.title);
  if (target.blockId) params.set("block", target.blockId);
  if (target.startLine != null) params.set("line", String(target.startLine));
  if (target.endLine != null && target.endLine !== target.startLine) {
    params.set("endLine", String(target.endLine));
  }
  if (target.heading) params.set("heading", target.heading);
  if (target.searchText) params.set("text", target.searchText);
  if (target.elementIds && target.elementIds.length > 0) {
    params.set("element", target.elementIds.join(","));
  }
  if (target.label) params.set("label", target.label);
  if (target.x != null && Number.isFinite(target.x)) params.set("x", String(target.x));
  if (target.y != null && Number.isFinite(target.y)) params.set("y", String(target.y));
  if (target.width != null && Number.isFinite(target.width)) {
    params.set("w", String(target.width));
  }
  if (target.height != null && Number.isFinite(target.height)) {
    params.set("h", String(target.height));
  }
  if (target.zoom != null && Number.isFinite(target.zoom)) {
    params.set("zoom", String(target.zoom));
  }
  return `${AGENT_DEEPLINK_HASH_PREFIX}?${params.toString()}`;
}

export function isAgentDeeplinkHref(href?: string | null): boolean {
  if (!href || typeof href !== "string") return false;
  const trimmed = href.trim();
  return (
    trimmed.startsWith(AGENT_DEEPLINK_HASH_PREFIX) ||
    trimmed.includes(`${AGENT_DEEPLINK_HASH_PREFIX}?`) ||
    /^tomo:\/\/(docs?|canvases?)\//i.test(trimmed) ||
    /^\/(docs|canvas)\/[^/?#]+/i.test(trimmed)
  );
}

export function parseAgentDeeplinkUrl(
  rawHref: string
): AgentDeeplinkTarget | null {
  if (!rawHref || typeof rawHref !== "string") return null;
  const trimmed = rawHref.trim();

  // 1. Internal hash format: #tomo-deeplink?kind=doc&ref=101&...
  const hashIdx = trimmed.indexOf(AGENT_DEEPLINK_HASH_PREFIX);
  if (hashIdx !== -1) {
    const afterPrefix = trimmed.slice(hashIdx + AGENT_DEEPLINK_HASH_PREFIX.length);
    const queryStr = afterPrefix.startsWith("?")
      ? afterPrefix.slice(1)
      : afterPrefix;
    const params = new URLSearchParams(queryStr);
    const kindRaw = params.get("kind");
    const rawRef = params.get("ref") ?? params.get("id") ?? "";
    if ((kindRaw !== "doc" && kindRaw !== "canvas") || !rawRef) {
      return null;
    }
    const lineRange = parseLineRange(params.get("line"));
    const startLine = parsePositiveInt(params.get("startLine")) ?? lineRange.startLine;
    const endLine =
      parsePositiveInt(params.get("endLine")) ?? lineRange.endLine ?? startLine;
    const elementParam = params.get("element") ?? params.get("elements");
    const elementIds = elementParam
      ? elementParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    return {
      kind: kindRaw,
      rawRef,
      resolvedId: parsePositiveInt(params.get("id")),
      title: params.get("title") || undefined,
      blockId: params.get("block") || params.get("blockId") || undefined,
      startLine,
      endLine,
      heading: params.get("heading") || undefined,
      searchText: params.get("text") || undefined,
      elementIds: elementIds && elementIds.length > 0 ? elementIds : undefined,
      label: params.get("label") || undefined,
      x: parseFiniteNumber(params.get("x")),
      y: parseFiniteNumber(params.get("y")),
      width: parseFiniteNumber(params.get("w") ?? params.get("width")),
      height: parseFiniteNumber(params.get("h") ?? params.get("height")),
      zoom: parseFiniteNumber(params.get("zoom")),
      nonce: nextDeeplinkNonce(),
    };
  }

  // 2. Custom protocol: tomo://doc/<ref>?... or tomo://canvas/<ref>?...
  const tomoMatch = /^tomo:\/\/(docs?|canvases?)\/([^?#]+)(?:\?([^#]*))?(?:#(.*))?$/i.exec(
    trimmed
  );
  if (tomoMatch) {
    const kind: AgentDeeplinkKind = tomoMatch[1].toLowerCase().startsWith("doc")
      ? "doc"
      : "canvas";
    const rawRef = decodeURIComponent(tomoMatch[2].replace(/\/+$/, ""));
    const params = new URLSearchParams(tomoMatch[3] ?? "");
    const hashFrag = tomoMatch[4] ? decodeURIComponent(tomoMatch[4]) : "";

    const lineRange = parseLineRange(
      params.get("line") ?? (hashFrag.startsWith("L") ? hashFrag : undefined)
    );
    const startLine = parsePositiveInt(params.get("startLine")) ?? lineRange.startLine;
    const endLine =
      parsePositiveInt(params.get("endLine")) ?? lineRange.endLine ?? startLine;

    const elementVals = [
      ...params.getAll("element"),
      ...params.getAll("elements"),
      ...params.getAll("elementId"),
    ]
      .flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter(Boolean);

    if (
      kind === "canvas" &&
      elementVals.length === 0 &&
      hashFrag &&
      !/^L\d+/i.test(hashFrag)
    ) {
      elementVals.push(hashFrag);
    }

    return {
      kind,
      rawRef,
      title: params.get("title") || undefined,
      blockId:
        params.get("block") ||
        params.get("blockId") ||
        params.get("block_id") ||
        (kind === "doc" && hashFrag && !/^L\d+/i.test(hashFrag)
          ? hashFrag
          : undefined),
      startLine,
      endLine,
      heading: params.get("heading") || undefined,
      searchText: params.get("text") || params.get("q") || undefined,
      elementIds: elementVals.length > 0 ? elementVals : undefined,
      label: params.get("label") || undefined,
      x: parseFiniteNumber(params.get("x")),
      y: parseFiniteNumber(params.get("y")),
      width: parseFiniteNumber(params.get("w") ?? params.get("width")),
      height: parseFiniteNumber(params.get("h") ?? params.get("height")),
      zoom: parseFiniteNumber(params.get("zoom")),
      nonce: nextDeeplinkNonce(),
    };
  }

  // 3. App relative route: /docs/<id> or /canvas/<id>
  const routeMatch = /^\/(docs|canvas)\/([^?#]+)(?:\?([^#]*))?(?:#(.*))?$/i.exec(
    trimmed
  );
  if (routeMatch) {
    const kind: AgentDeeplinkKind =
      routeMatch[1].toLowerCase() === "docs" ? "doc" : "canvas";
    const rawRef = decodeURIComponent(routeMatch[2].replace(/\/+$/, ""));
    const params = new URLSearchParams(routeMatch[3] ?? "");
    const hashFrag = routeMatch[4] ? decodeURIComponent(routeMatch[4]) : "";
    const lineRange = parseLineRange(
      params.get("line") ?? (hashFrag.startsWith("L") ? hashFrag : undefined)
    );

    return {
      kind,
      rawRef,
      blockId: params.get("block") || params.get("blockId") || undefined,
      startLine: parsePositiveInt(params.get("startLine")) ?? lineRange.startLine,
      endLine:
        parsePositiveInt(params.get("endLine")) ??
        lineRange.endLine ??
        lineRange.startLine,
      heading: params.get("heading") || undefined,
      searchText: params.get("text") || undefined,
      elementIds: params.get("element")
        ? params
            .get("element")!
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      label: params.get("label") || undefined,
      x: parseFiniteNumber(params.get("x")),
      y: parseFiniteNumber(params.get("y")),
      width: parseFiniteNumber(params.get("w") ?? params.get("width")),
      height: parseFiniteNumber(params.get("h") ?? params.get("height")),
      zoom: parseFiniteNumber(params.get("zoom")),
      nonce: nextDeeplinkNonce(),
    };
  }

  return null;
}

function extractDirectNumericId(rawRef: string, prefix: "doc-" | "canvas-"): number | null {
  const trimmed = rawRef.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const prefixed = new RegExp(`^${prefix}(\\d+)$`, "i").exec(trimmed);
  if (prefixed) {
    const n = Number(prefixed[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

async function resolveDocTarget(
  rawRef: string
): Promise<{ id: number; title?: string }> {
  const directNum = extractDirectNumericId(rawRef, "doc-");
  const normalized = rawRef.trim();

  // Check SQLite first (Tauri)
  try {
    const directDoc = await getDocFromSqlite(normalized);
    if (directDoc) {
      return { id: directDoc.id, title: directDoc.title };
    }
    const listRes = await listDocsFromSqlite({ page: 0, size: 200 });
    const match = findMatchingDoc(listRes.items, normalized);
    if (match) {
      return { id: match.id, title: match.title };
    }
  } catch {
    // Web mode or uninitialized SQLite
  }

  // Check RTK Query cache
  try {
    const state = store.getState();
    const cachedList = docsApi.endpoints.listDocs.select()(state)?.data?.items;
    if (Array.isArray(cachedList)) {
      const match = findMatchingDoc(cachedList, normalized);
      if (match) {
        return { id: match.id, title: match.title };
      }
    }
  } catch {
    // ignore store lookup errors
  }

  if (directNum !== null) {
    return { id: directNum };
  }

  return { id: parseOrHashId(normalized, "doc-") };
}

function findMatchingDoc(items: DocDto[], rawRef: string): DocDto | undefined {
  const lower = rawRef.toLowerCase();
  const withPrefix = lower.startsWith("doc-") ? lower : `doc-${lower}`;
  return items.find((d) => {
    if (String(d.id) === rawRef) return true;
    if (d.backendUuid && d.backendUuid.toLowerCase() === lower) return true;
    if (
      d.slug &&
      (d.slug.toLowerCase() === lower || d.slug.toLowerCase() === withPrefix)
    ) {
      return true;
    }
    if (d.title && d.title.trim().toLowerCase() === lower) return true;
    return false;
  });
}

async function resolveCanvasTarget(
  rawRef: string
): Promise<{ id: number; title?: string }> {
  const directNum = extractDirectNumericId(rawRef, "canvas-");
  const normalized = rawRef.trim();

  try {
    const directCanvas = await getCanvasFromSqlite(normalized);
    if (directCanvas) {
      return { id: directCanvas.id, title: directCanvas.title };
    }
    const listRes = await listCanvasFromSqlite({ page: 0, size: 200 });
    const match = findMatchingCanvas(listRes.items, normalized);
    if (match) {
      return { id: match.id, title: match.title };
    }
  } catch {
    // Web mode or uninitialized SQLite
  }

  try {
    const state = store.getState();
    const cachedList = canvasApi.endpoints.listCanvas.select()(state)?.data?.items;
    if (Array.isArray(cachedList)) {
      const match = findMatchingCanvas(cachedList, normalized);
      if (match) {
        return { id: match.id, title: match.title };
      }
    }
  } catch {
    // ignore
  }

  if (directNum !== null) {
    return { id: directNum };
  }

  return { id: parseOrHashId(normalized, "canvas-") };
}

function findMatchingCanvas(
  items: CanvasDto[],
  rawRef: string
): CanvasDto | undefined {
  const lower = rawRef.toLowerCase();
  const withPrefix = lower.startsWith("canvas-") ? lower : `canvas-${lower}`;
  return items.find((c) => {
    if (String(c.id) === rawRef) return true;
    if (c.backendUuid && c.backendUuid.toLowerCase() === lower) return true;
    if (
      c.slug &&
      (c.slug.toLowerCase() === lower || c.slug.toLowerCase() === withPrefix)
    ) {
      return true;
    }
    if (c.title && c.title.trim().toLowerCase() === lower) return true;
    return false;
  });
}

export async function resolveAndOpenAgentDeeplink(
  input: AgentDeeplinkInput
): Promise<AgentDeeplinkTarget | null> {
  if (!input.rawRef) return null;

  const resolved =
    input.resolvedId != null && Number.isFinite(input.resolvedId)
      ? { id: input.resolvedId, title: input.title }
      : input.kind === "doc"
        ? await resolveDocTarget(input.rawRef)
        : await resolveCanvasTarget(input.rawRef);

  const target: AgentDeeplinkTarget = {
    ...input,
    resolvedId: resolved.id,
    title: input.title ?? resolved.title,
    nonce: input.nonce ?? nextDeeplinkNonce(),
  };

  storePendingDeeplink(target);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AgentDeeplinkTarget>(AGENT_DEEPLINK_NAVIGATE_EVENT, {
        detail: target,
      })
    );
  }

  return target;
}

export async function openAgentDeeplinkFromHref(href: string): Promise<boolean> {
  const parsed = parseAgentDeeplinkUrl(href);
  if (!parsed) return false;
  await resolveAndOpenAgentDeeplink(parsed);
  return true;
}

function autoLinkSegment(
  segment: string,
  ctx: { docRef?: string; canvasRef?: string }
): string {
  // Protect existing markdown links `[label](url)` and HTML tags `<...>`
  const tokenRe = /(\[[^\]]+\]\([^)]+\)|<[^>]+>)/g;
  const parts: string[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(segment)) !== null) {
    if (match.index > lastIdx) {
      parts.push(transformPlainTextChunk(segment.slice(lastIdx, match.index), ctx));
    }
    const token = match[0];
    if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const label = linkMatch[1];
        const url = linkMatch[2].trim();
        const parsed = parseAgentDeeplinkUrl(url);
        if (parsed) {
          if (parsed.kind === "doc") ctx.docRef = parsed.rawRef;
          if (parsed.kind === "canvas") ctx.canvasRef = parsed.rawRef;
          parts.push(`[${label}](${buildAgentDeeplinkHash(parsed)})`);
          lastIdx = match.index + token.length;
          continue;
        }
      }
    }
    parts.push(token);
    lastIdx = match.index + token.length;
  }

  if (lastIdx < segment.length) {
    parts.push(transformPlainTextChunk(segment.slice(lastIdx), ctx));
  }

  return parts.join("");
}

function transformPlainTextChunk(
  text: string,
  ctx: { docRef?: string; canvasRef?: string }
): string {
  // Ordered from most specific (entity + position) to standalone entity / contextual position.
  const combinedRe = new RegExp(
    [
      // 1. Doc with line/range: `docs/doc-101.md#L10-L20`, `doc-101#L25`, `doc-101:25`
      "`?(?:docs\\/)?doc-([A-Za-z0-9-]+)(?:\\.(?:md|json))?(?:#L|:)(\\d+)(?:-L?(\\d+))?`?",
      // 2. Doc #101 (dòng 15-20) or Doc #101 (block abc)
      "\\bDoc\\s*#(\\d+)\\s*\\((?:dòng|line|L)\\s*(\\d+)(?:\\s*[-–]\\s*L?(\\d+))?\\)",
      "\\bDoc\\s*#(\\d+)\\s*\\(block\\s+([A-Za-z0-9_-]+)\\)",
      // 3. Canvas #201 (x: 120, y: 200) or Canvas #201 (element abc) or `canvas-201#el-xyz`
      "`?(?:canvases\\/)?canvas-([A-Za-z0-9-]+)(?:\\.(?:json|excalidraw))?#([A-Za-z0-9_-]+)`?",
      "\\bCanvas\\s*#(\\d+)\\s*\\(\\s*x\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*y\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)",
      "\\bCanvas\\s*#(\\d+)\\s*\\(element\\s+([A-Za-z0-9_-]+)\\)",
      // 4. Standalone Doc / Canvas refs: `doc-101`, `Doc #101`, `canvas-201`, `Canvas #201`
      "`?\\bdoc-(\\d+)\\b`?",
      "\\bDoc\\s*#(\\d+)\\b",
      "`?\\bcanvas-(\\d+)\\b`?",
      "\\bCanvas\\s*#(\\d+)\\b",
      // 5. Contextual block_id / element_id / line / coordinates (only linked when ctx has a target)
      "\\bblock_id\\s*[:=]\\s*[\"`']?([A-Za-z0-9_-]{6,})[\"`']?",
      "\\belement_id\\s*[:=]\\s*[\"`']?([A-Za-z0-9_-]{6,})[\"`']?",
      "\\b(?:dòng|line)\\s+(\\d+)(?:\\s*[-–]\\s*(\\d+))?\\b",
      "\\(\\s*x\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*y\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)",
    ].join("|"),
    "gi"
  );

  return text.replace(combinedRe, (full, ...groups) => {
    const g = groups as Array<string | undefined>;
    // Group offsets:
    // 0,1,2: doc-<ref>#L<start>-L<end>
    if (g[0]) {
      ctx.docRef = g[0];
      const startLine = Number.parseInt(g[1]!, 10);
      const endLine = g[2] ? Number.parseInt(g[2], 10) : startLine;
      const hash = buildAgentDeeplinkHash({
        kind: "doc",
        rawRef: g[0],
        startLine,
        endLine,
      });
      return `[${full.replace(/`/g, "")}](${hash})`;
    }
    // 3,4,5: Doc #101 (dòng 15-20)
    if (g[3]) {
      ctx.docRef = g[3];
      const startLine = Number.parseInt(g[4]!, 10);
      const endLine = g[5] ? Number.parseInt(g[5], 10) : startLine;
      const hash = buildAgentDeeplinkHash({
        kind: "doc",
        rawRef: g[3],
        startLine,
        endLine,
      });
      return `[${full}](${hash})`;
    }
    // 6,7: Doc #101 (block abc)
    if (g[6]) {
      ctx.docRef = g[6];
      const hash = buildAgentDeeplinkHash({
        kind: "doc",
        rawRef: g[6],
        blockId: g[7],
      });
      return `[${full}](${hash})`;
    }
    // 8,9: canvas-201#el-xyz
    if (g[8]) {
      ctx.canvasRef = g[8];
      const hash = buildAgentDeeplinkHash({
        kind: "canvas",
        rawRef: g[8],
        elementIds: g[9] ? [g[9]] : undefined,
      });
      return `[${full.replace(/`/g, "")}](${hash})`;
    }
    // 10,11,12: Canvas #201 (x: 120, y: 200)
    if (g[10]) {
      ctx.canvasRef = g[10];
      const hash = buildAgentDeeplinkHash({
        kind: "canvas",
        rawRef: g[10],
        x: Number(g[11]),
        y: Number(g[12]),
      });
      return `[${full}](${hash})`;
    }
    // 13,14: Canvas #201 (element abc)
    if (g[13]) {
      ctx.canvasRef = g[13];
      const hash = buildAgentDeeplinkHash({
        kind: "canvas",
        rawRef: g[13],
        elementIds: g[14] ? [g[14]] : undefined,
      });
      return `[${full}](${hash})`;
    }
    // 15: doc-101
    if (g[15]) {
      ctx.docRef = g[15];
      const hash = buildAgentDeeplinkHash({ kind: "doc", rawRef: g[15] });
      return `[${full.replace(/`/g, "")}](${hash})`;
    }
    // 16: Doc #101
    if (g[16]) {
      ctx.docRef = g[16];
      const hash = buildAgentDeeplinkHash({ kind: "doc", rawRef: g[16] });
      return `[${full}](${hash})`;
    }
    // 17: canvas-201
    if (g[17]) {
      ctx.canvasRef = g[17];
      const hash = buildAgentDeeplinkHash({ kind: "canvas", rawRef: g[17] });
      return `[${full.replace(/`/g, "")}](${hash})`;
    }
    // 18: Canvas #201
    if (g[18]) {
      ctx.canvasRef = g[18];
      const hash = buildAgentDeeplinkHash({ kind: "canvas", rawRef: g[18] });
      return `[${full}](${hash})`;
    }
    // 19: block_id: "..."
    if (g[19]) {
      if (!ctx.docRef) return full;
      const hash = buildAgentDeeplinkHash({
        kind: "doc",
        rawRef: ctx.docRef,
        blockId: g[19],
      });
      return `[${full}](${hash})`;
    }
    // 20: element_id: "..."
    if (g[20]) {
      if (!ctx.canvasRef) return full;
      const hash = buildAgentDeeplinkHash({
        kind: "canvas",
        rawRef: ctx.canvasRef,
        elementIds: [g[20]],
      });
      return `[${full}](${hash})`;
    }
    // 21,22: dòng 15 / line 15-20
    if (g[21]) {
      if (!ctx.docRef) return full;
      const startLine = Number.parseInt(g[21], 10);
      const endLine = g[22] ? Number.parseInt(g[22], 10) : startLine;
      const hash = buildAgentDeeplinkHash({
        kind: "doc",
        rawRef: ctx.docRef,
        startLine,
        endLine,
      });
      return `[${full}](${hash})`;
    }
    // 23,24: (x: 100, y: 200)
    if (g[23] !== undefined && g[24] !== undefined) {
      if (!ctx.canvasRef) return full;
      const hash = buildAgentDeeplinkHash({
        kind: "canvas",
        rawRef: ctx.canvasRef,
        x: Number(g[23]),
        y: Number(g[24]),
      });
      return `[${full}](${hash})`;
    }

    return full;
  });
}

/**
 * Rewrites `tomo://...` links to `#tomo-deeplink?...` (so Streamdown's rehype-sanitize
 * preserves them) and auto-links natural references to Docs, Canvases, lines, blocks,
 * elements, and coordinates outside fenced code blocks.
 */
export function injectAgentDeeplinksInMarkdown(
  markdown: string,
  defaultContext?: { docId?: string | number; canvasId?: string | number }
): string {
  if (!markdown || typeof markdown !== "string") return markdown;

  const ctx: { docRef?: string; canvasRef?: string } = {
    docRef:
      defaultContext?.docId != null ? String(defaultContext.docId) : undefined,
    canvasRef:
      defaultContext?.canvasId != null
        ? String(defaultContext.canvasId)
        : undefined,
  };

  // Split by fenced code blocks (``` or ~~~) so code examples stay untouched
  const fenceRe = /(^|\n)(```[\s\S]*?\n```|~~~[\s\S]*?\n~~~)/g;
  const out: string[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(markdown)) !== null) {
    const prefixEnd = match.index + match[1].length;
    if (prefixEnd > lastIdx) {
      out.push(autoLinkSegment(markdown.slice(lastIdx, prefixEnd), ctx));
    }
    out.push(match[2]);
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < markdown.length) {
    out.push(autoLinkSegment(markdown.slice(lastIdx), ctx));
  }

  return out.join("");
}
