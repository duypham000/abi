import type { ReactNode } from "react";
import {
  FileTextIcon,
  FrameIcon,
  ClockIcon,
  ChevronRightIcon,
  LayersIcon,
} from "lucide-react";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import type { DocDto } from "@/core/interfaces/docs";
import type { CanvasDto } from "@/core/interfaces/canvas";
import { addRecent, type RecentEntry } from "@/presentation/features/docs/utils/recentDocs";
import { COMMANDS, type CommandContext } from "./commands";
import { fuzzyScore } from "./fuzzy";

/** A single rendered line in the palette. */
export interface Row {
  key: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  run: () => void | Promise<void>;
}

/** Datasets + actions handed to every provider. A provider reads only what it needs. */
export interface ProviderDeps {
  docs: DocDto[];
  canvas: CanvasDto[];
  recent: RecentEntry[];
  ctx: CommandContext;
}

/** Which RTK-Query entity searches to run while a provider is active. */
export type EntitySource = "docs" | "canvas";

/**
 * A palette "mode" selected by the first character typed.
 *
 * To add a new searchable kind later (e.g. scripts):
 *   1. add its `searchX` RTK endpoint + `useSearchXQuery` hook,
 *   2. extend `EntitySource` and the dataset fetch in CommandPalette.tsx,
 *   3. add a `ProviderDeps.x` field,
 *   4. append one entry here (and add it to the "all" provider). Nothing else changes.
 */
export interface SearchProvider {
  id: string;
  /** First-character trigger. "" = the default provider (no prefix). */
  prefix: string;
  /** Short name shown as the active-mode chip + in the prefix legend. */
  label: string;
  placeholder: string;
  icon: ReactNode;
  /** Entity datasets to fetch while this provider is active. */
  sources?: EntitySource[];
  /** Build the visible rows from the (prefix-stripped) term + datasets. */
  buildRows: (term: string, deps: ProviderDeps) => Row[];
}

const ICON = 16;

// ── Row builders (shared between the focused providers and the "all" provider) ──

function openDoc(ctx: CommandContext, id: number, title: string) {
  addRecent({ id, title });
  ctx.openPanel(PANEL_TYPES.DOC_EDITOR, { id }, { title: title || "Document", singleton: true });
}

function docRow(d: DocDto, ctx: CommandContext): Row {
  return {
    key: `doc:${d.id}`,
    icon: <FileTextIcon size={ICON} />,
    title: d.title || "Untitled",
    subtitle: "Doc",
    run: () => openDoc(ctx, d.id, d.title ?? ""),
  };
}

function canvasRow(c: CanvasDto, ctx: CommandContext): Row {
  return {
    key: `canvas:${c.id}`,
    icon: <FrameIcon size={ICON} />,
    title: c.title || "Untitled",
    subtitle: "Canvas",
    run: () =>
      ctx.openPanel(
        PANEL_TYPES.CANVAS_EDITOR,
        { id: c.id },
        { title: c.title || "Canvas", singleton: true },
      ),
  };
}


function recentRows({ recent, ctx }: ProviderDeps): Row[] {
  return recent.map((r) => ({
    key: `recent:${r.id}`,
    icon: <ClockIcon size={ICON} />,
    title: r.title || "Untitled",
    subtitle: "Recent",
    run: () => openDoc(ctx, r.id, r.title),
  }));
}

export const PROVIDERS: SearchProvider[] = [
  // ── Default (no prefix): search everything ─────────────────────────────
  {
    id: "all",
    prefix: "",
    label: "All",
    placeholder: "Search everything…  (@ docs · # canvas · > commands)",
    icon: <LayersIcon size={18} />,
    sources: ["docs", "canvas"],
    buildRows: (term, deps) => {
      if (!term) return recentRows(deps);
      return [
        ...deps.docs.map((d) => docRow(d, deps.ctx)),
        ...deps.canvas.map((c) => canvasRow(c, deps.ctx)),      ];
    },
  },

  // ── "@" : Docs ─────────────────────────────────────────────────────────
  {
    id: "docs",
    prefix: "@",
    label: "Docs",
    placeholder: "Search docs…",
    icon: <FileTextIcon size={18} />,
    sources: ["docs"],
    buildRows: (term, deps) =>
      !term ? recentRows(deps) : deps.docs.map((d) => docRow(d, deps.ctx)),
  },

  // ── ">" : Commands & features ──────────────────────────────────────────
  {
    id: "commands",
    prefix: ">",
    label: "Commands",
    placeholder: "Type a command…",
    icon: <ChevronRightIcon size={18} />,
    buildRows: (term, { ctx }) =>
      COMMANDS
        .map((c) => ({ c, score: fuzzyScore(term, `${c.title} ${c.category} ${c.keywords ?? ""}`) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ c }) => ({
          key: c.id,
          icon: c.icon,
          title: c.title,
          subtitle: c.category,
          run: () => c.run(ctx),
        })),
  },

  // ── "#" : Canvas ───────────────────────────────────────────────────────
  {
    id: "canvas",
    prefix: "#",
    label: "Canvas",
    placeholder: "Search canvas…",
    icon: <FrameIcon size={18} />,
    sources: ["canvas"],
    buildRows: (term, deps) =>
      !term ? [] : deps.canvas.map((c) => canvasRow(c, deps.ctx)),
  },

  ];

export const DEFAULT_PROVIDER = PROVIDERS.find((p) => p.prefix === "")!;

/** Providers reachable via a prefix — used to render the legend. */
export const PREFIX_PROVIDERS = PROVIDERS.filter((p) => p.prefix);

/**
 * Resolve which provider handles the current query.
 * A recognised first character wins; otherwise we stay on `baseId`
 * (the provider the opening shortcut selected), so clearing the input
 * keeps you in the same palette.
 */
export function resolveProvider(
  query: string,
  baseId: string,
): { provider: SearchProvider; term: string } {
  const trimmed = query.trimStart();
  const first = trimmed[0] ?? "";
  const byPrefix = PREFIX_PROVIDERS.find((p) => p.prefix === first);
  if (byPrefix) {
    return { provider: byPrefix, term: trimmed.slice(byPrefix.prefix.length).trim() };
  }
  const base = PROVIDERS.find((p) => p.id === baseId) ?? DEFAULT_PROVIDER;
  return { provider: base, term: query.trim() };
}
