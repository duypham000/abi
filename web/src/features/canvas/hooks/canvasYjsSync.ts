export interface CollaboratorColor {
  background: string;
  stroke: string;
}

const COLLABORATOR_PALETTE: readonly CollaboratorColor[] = [
  { background: "#ffc9c9", stroke: "#e03131" },
  { background: "#fcc2d7", stroke: "#c2255c" },
  { background: "#eebefa", stroke: "#9c36b5" },
  { background: "#d0bfff", stroke: "#6741d9" },
  { background: "#bac8ff", stroke: "#3b5bdb" },
  { background: "#a5d8ff", stroke: "#1971c2" },
  { background: "#99e9f2", stroke: "#0c8599" },
  { background: "#b2f2bb", stroke: "#2f9e44" },
  { background: "#ffd8a8", stroke: "#e8590c" },
  { background: "#ffec99", stroke: "#f08c00" },
];

export function hashCollaboratorColor(userId: string | number): CollaboratorColor {
  const str = String(userId);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return COLLABORATOR_PALETTE[Math.abs(hash) % COLLABORATOR_PALETTE.length];
}

export function normalizeCollaboratorColor(
  color: unknown,
  fallbackSeed: string | number
): CollaboratorColor {
  if (color && typeof color === "object") {
    const c = color as { background?: unknown; stroke?: unknown };
    if (typeof c.background === "string" && typeof c.stroke === "string") {
      return { background: c.background, stroke: c.stroke };
    }
  }
  if (typeof color === "string" && color.trim().length > 0) {
    return { background: color, stroke: color };
  }
  return hashCollaboratorColor(fallbackSeed);
}

/**
 * Deep-clones values read from or written to Yjs `Y.Map` so Excalidraw's
 * in-place `mutateElement` never mutates objects stored inside Yjs.
 */
export function cloneCanvasValue<T>(val: T): T {
  if (val == null || typeof val !== "object") return val;
  const maybeJson = val as unknown as { toJSON?: () => T };
  const raw = typeof maybeJson.toJSON === "function" ? maybeJson.toJSON() : val;
  if (raw == null || typeof raw !== "object") return raw;
  try {
    return structuredClone(raw);
  } catch {
    return JSON.parse(JSON.stringify(raw)) as T;
  }
}

// Ephemeral Excalidraw bookkeeping keys; structural/binding keys such as
// boundElements, frameId, and containerId remain compared so bindings stay in sync.
const EXCALIDRAW_METADATA_KEYS = new Set([
  "version",
  "versionNonce",
  "updated",
  "seed",
]);

export function hasVisualChange(a: any, b: any): boolean {
  if (a === b) return false;
  if (!a || !b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (EXCALIDRAW_METADATA_KEYS.has(key)) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return true;
  }
  return false;
}

/**
 * Deterministic ordering matching Excalidraw's element reconciliation:
 * higher `version` wins, then lower `versionNonce`, then newer visual `updated`.
 */
export function isNewerElement(candidate: any, existing: any): boolean {
  if (!existing) return true;
  const cVer = typeof candidate?.version === "number" ? candidate.version : 0;
  const eVer = typeof existing?.version === "number" ? existing.version : 0;
  if (cVer !== eVer) return cVer > eVer;

  const cNonce =
    typeof candidate?.versionNonce === "number"
      ? candidate.versionNonce
      : Number.MAX_SAFE_INTEGER;
  const eNonce =
    typeof existing?.versionNonce === "number"
      ? existing.versionNonce
      : Number.MAX_SAFE_INTEGER;
  if (cNonce !== eNonce) return cNonce < eNonce;

  const cUpdated = typeof candidate?.updated === "number" ? candidate.updated : 0;
  const eUpdated = typeof existing?.updated === "number" ? existing.updated : 0;
  return cUpdated > eUpdated && hasVisualChange(candidate, existing);
}

export function sortElementsByIndex<T extends { index?: string | null }>(elements: T[]): T[] {
  if (!elements.some((el) => typeof el?.index === "string")) {
    return elements;
  }
  return elements
    .map((el, pos) => ({ el, pos }))
    .sort((a, b) => {
      const ai = a.el?.index;
      const bi = b.el?.index;
      const aHas = typeof ai === "string";
      const bHas = typeof bi === "string";
      if (aHas && bHas) {
        if (ai < bi) return -1;
        if (ai > bi) return 1;
        return a.pos - b.pos;
      }
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.pos - b.pos;
    })
    .map((entry) => entry.el);
}

export function getActiveLocalElementIds(appState: any): Set<string> {
  const ids = new Set<string>();
  const activeItems = [
    appState?.draggingElement,
    appState?.resizingElement,
    appState?.newElement,
    appState?.editingTextElement,
  ];
  for (const item of activeItems) {
    if (item && typeof item.id === "string") {
      ids.add(item.id);
    }
  }
  return ids;
}

export interface ReconcileRemoteResult {
  nextElements: any[];
  changed: boolean;
  deferredKeys: string[];
  localWinnersToPush: any[];
}

export function reconcileRemoteElements(
  currentElements: readonly any[],
  elementsMap: { get(k: string): any },
  keysChanged: Iterable<string>,
  activeLocalElementIds: ReadonlySet<string>
): ReconcileRemoteResult {
  let nextElements = [...currentElements];
  const indexById = new Map<string, number>();
  for (let i = 0; i < nextElements.length; i++) {
    const id = nextElements[i]?.id;
    if (typeof id === "string") {
      indexById.set(id, i);
    }
  }

  let changed = false;
  const removedIds = new Set<string>();
  const deferredKeys: string[] = [];
  const localWinnersToPush: any[] = [];

  for (const key of keysChanged) {
    const rawVal = elementsMap.get(key);
    const newVal = rawVal !== undefined ? cloneCanvasValue(rawVal) : undefined;
    const idx = indexById.get(key);

    if (newVal !== undefined) {
      if (idx !== undefined) {
        const local = nextElements[idx];
        if (activeLocalElementIds.has(key)) {
          if (isNewerElement(newVal, local)) {
            deferredKeys.push(key);
          }
          continue;
        }
        if (isNewerElement(newVal, local)) {
          nextElements[idx] = newVal;
          changed = true;
        } else if (isNewerElement(local, newVal)) {
          localWinnersToPush.push(cloneCanvasValue(local));
        }
      } else {
        indexById.set(key, nextElements.length);
        nextElements.push(newVal);
        changed = true;
      }
    } else if (idx !== undefined && !activeLocalElementIds.has(key)) {
      removedIds.add(key);
      changed = true;
    }
  }

  if (changed) {
    const filtered =
      removedIds.size > 0
        ? nextElements.filter((el) => !removedIds.has(el?.id))
        : nextElements;
    nextElements = sortElementsByIndex(filtered);
  }

  return {
    nextElements,
    changed,
    deferredKeys,
    localWinnersToPush,
  };
}

export function collectElementsToPush(
  elements: readonly any[],
  elementsMap: { get(k: string): any }
): any[] {
  const toPush: any[] = [];
  for (const el of elements) {
    if (!el?.id) continue;
    const rawRemote = elementsMap.get(el.id);
    const remote =
      rawRemote !== undefined && typeof rawRemote?.toJSON === "function"
        ? rawRemote.toJSON()
        : rawRemote;
    if (isNewerElement(el, remote)) {
      toPush.push(cloneCanvasValue(el));
    }
  }
  return toPush;
}
