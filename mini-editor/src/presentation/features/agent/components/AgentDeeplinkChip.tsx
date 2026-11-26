import {
  MessageResponse,
  type MessageResponseProps,
} from "@/components/ai-elements/message";
import {
  isAgentDeeplinkHref,
  injectAgentDeeplinksInMarkdown,
  openAgentDeeplinkFromHref,
  parseAgentDeeplinkUrl,
  resolveAndOpenAgentDeeplink,
  type AgentDeeplinkInput,
  type AgentDeeplinkTarget,
} from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import {
  ArrowUpRightIcon,
  FileTextIcon,
  ShapesIcon,
} from "lucide-react";
import {
  useMemo,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";

function formatTargetPositionBadge(target: AgentDeeplinkTarget): string | null {
  if (target.kind === "doc") {
    if (target.startLine != null) {
      return target.endLine && target.endLine !== target.startLine
        ? `L${target.startLine}–L${target.endLine}`
        : `L${target.startLine}`;
    }
    if (target.blockId) {
      return `#${target.blockId.slice(0, 8)}`;
    }
    if (target.heading) {
      return target.heading.length > 18
        ? `${target.heading.slice(0, 16)}…`
        : target.heading;
    }
    return null;
  }

  if (target.x != null && target.y != null) {
    return `${Math.round(target.x)},${Math.round(target.y)}`;
  }
  if (target.elementIds && target.elementIds.length > 0) {
    return `#${target.elementIds[0].slice(0, 8)}`;
  }
  if (target.label) {
    return target.label.length > 18
      ? `${target.label.slice(0, 16)}…`
      : target.label;
  }
  return null;
}

function buildDeeplinkTooltip(target: AgentDeeplinkTarget): string {
  const parts: string[] = [
    target.kind === "doc" ? `Mở Doc ${target.rawRef}` : `Mở Canvas ${target.rawRef}`,
  ];
  if (target.blockId) parts.push(`block ${target.blockId}`);
  if (target.startLine != null) {
    parts.push(
      target.endLine && target.endLine !== target.startLine
        ? `dòng ${target.startLine}–${target.endLine}`
        : `dòng ${target.startLine}`
    );
  }
  if (target.heading) parts.push(`mục "${target.heading}"`);
  if (target.elementIds?.length) parts.push(`element ${target.elementIds.join(", ")}`);
  if (target.label) parts.push(`nhãn "${target.label}"`);
  if (target.x != null && target.y != null) parts.push(`tọa độ (${target.x}, ${target.y})`);
  return parts.join(" • ");
}

export function AgentDeeplinkChip({
  href,
  children,
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const parsed = useMemo(() => parseAgentDeeplinkUrl(href), [href]);
  if (!parsed) return null;

  const Icon = parsed.kind === "doc" ? FileTextIcon : ShapesIcon;
  const posBadge = formatTargetPositionBadge(parsed);
  const tooltip = buildDeeplinkTooltip(parsed);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void resolveAndOpenAgentDeeplink(parsed);
  };

  return (
    <button
      className={cn(
        "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-primary/25 bg-primary/8 px-1.5 py-0.5 align-baseline text-[12px] font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      onClick={handleClick}
      title={tooltip}
      type="button"
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{children ?? parsed.title ?? parsed.rawRef}</span>
      {posBadge && (
        <span className="shrink-0 rounded bg-primary/15 px-1 font-mono text-[10px] leading-tight text-primary">
          {posBadge}
        </span>
      )}
    </button>
  );
}

export function AgentMarkdownLink({
  href,
  children,
  className,
  node: _node,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  if (href && isAgentDeeplinkHref(href)) {
    return (
      <AgentDeeplinkChip className={className} href={href}>
        {children}
      </AgentDeeplinkChip>
    );
  }

  return (
    <a
      className={cn("wrap-anywhere font-medium text-primary underline", className)}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      onClick={(e) => {
        if (href && isAgentDeeplinkHref(href)) {
          e.preventDefault();
          void openAgentDeeplinkFromHref(href);
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

const DEEPLINK_MARKDOWN_COMPONENTS = {
  a: AgentMarkdownLink,
};

export function AgentMarkdownResponse({
  children,
  components,
  defaultContext,
  ...props
}: MessageResponseProps & {
  defaultContext?: { docId?: string | number; canvasId?: string | number };
}) {
  const transformed = useMemo(
    () =>
      typeof children === "string"
        ? injectAgentDeeplinksInMarkdown(children, defaultContext)
        : children,
    [children, defaultContext]
  );

  const mergedComponents = useMemo(
    () =>
      components
        ? { ...DEEPLINK_MARKDOWN_COMPONENTS, ...components }
        : DEEPLINK_MARKDOWN_COMPONENTS,
    [components]
  );

  return (
    <MessageResponse
      components={mergedComponents}
      linkSafety={{ enabled: false }}
      {...props}
    >
      {transformed}
    </MessageResponse>
  );
}

function asRec(val: unknown): Record<string, unknown> | null {
  if (!val || typeof val !== "object" || Array.isArray(val)) return null;
  return val as Record<string, unknown>;
}

function parseJsonRec(val: unknown): Record<string, unknown> | null {
  const direct = asRec(val);
  if (direct) return direct;
  if (typeof val === "string") {
    try {
      return asRec(JSON.parse(val));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Extracts a quick-jump deeplink target from ABI MCP tool inputs/outputs.
 */
export function extractToolDeeplinkTarget(
  toolName: string,
  input: unknown,
  output: unknown
): AgentDeeplinkInput | null {
  const normalized = toolName.replace(/^.*[:_](?=(?:docs|canvas|read_doc)_?)/, "");
  const inRec = asRec(input);
  const outRec = parseJsonRec(output);

  const isDocTool =
    normalized === "read_doc" ||
    normalized.startsWith("docs_") ||
    normalized.includes("docs_");
  const isCanvasTool =
    !isDocTool &&
    (normalized.startsWith("canvas_") || normalized.includes("canvas_"));

  if (normalized === "docs_embed_canvas") {
    const canvasId =
      outRec?.canvas_id ?? inRec?.canvas_id;
    const docId = outRec?.doc_id ?? inRec?.doc_id;
    if (canvasId != null && String(canvasId).trim()) {
      return {
        kind: "canvas",
        rawRef: String(canvasId),
        title:
          typeof inRec?.canvas_title === "string" ? inRec.canvas_title : undefined,
      };
    }
    if (docId != null && String(docId).trim()) {
      const embeddedBlock =
        typeof outRec?.embedded_block_id === "string"
          ? outRec.embedded_block_id
          : undefined;
      return {
        kind: "doc",
        rawRef: String(docId),
        blockId: embeddedBlock,
      };
    }
  }

  if (isDocTool) {
    const rawDocId =
      outRec?.doc_id ??
      outRec?.id ??
      inRec?.id ??
      inRec?.doc_id ??
      inRec?.docId ??
      inRec?.slug;
    if (rawDocId == null || !String(rawDocId).trim()) return null;

    const insertedIds = Array.isArray(outRec?.inserted_ids)
      ? outRec.inserted_ids.map(String).filter(Boolean)
      : [];
    const blockId =
      (typeof outRec?.updated_block_id === "string" && outRec.updated_block_id) ||
      insertedIds[0] ||
      (typeof inRec?.block_id === "string" && inRec.block_id) ||
      (typeof inRec?.after_block_id === "string" && inRec.after_block_id) ||
      undefined;

    const startBlock =
      typeof inRec?.start_block === "number" && inRec.start_block >= 0
        ? inRec.start_block + 1
        : undefined;

    return {
      kind: "doc",
      rawRef: String(rawDocId),
      title:
        typeof outRec?.title === "string"
          ? outRec.title
          : typeof inRec?.title === "string"
            ? inRec.title
            : undefined,
      blockId,
      startLine: !blockId ? startBlock : undefined,
    };
  }

  if (isCanvasTool) {
    const rawCanvasId =
      outRec?.canvas_id ?? outRec?.id ?? inRec?.id ?? inRec?.canvas_id;
    if (rawCanvasId == null || !String(rawCanvasId).trim()) return null;

    const addedIds = Array.isArray(outRec?.added_ids)
      ? outRec.added_ids.map(String).filter(Boolean)
      : Array.isArray(outRec?.created_element_ids)
        ? outRec.created_element_ids.map(String).filter(Boolean)
        : Array.isArray(outRec?.updated_ids)
          ? outRec.updated_ids.map(String).filter(Boolean)
          : [];

    const canvasMeta = asRec(outRec?.canvas);
    return {
      kind: "canvas",
      rawRef: String(rawCanvasId),
      title:
        typeof outRec?.title === "string"
          ? outRec.title
          : typeof canvasMeta?.title === "string"
            ? canvasMeta.title
            : typeof inRec?.title === "string"
              ? inRec.title
              : undefined,
      elementIds: addedIds.length > 0 ? addedIds : undefined,
    };
  }

  return null;
}

export function ToolDeeplinkButton({
  target,
}: {
  target: AgentDeeplinkInput;
}) {
  const Icon = target.kind === "doc" ? FileTextIcon : ShapesIcon;
  const label =
    target.title ||
    (target.kind === "doc" ? `Doc #${target.rawRef}` : `Canvas #${target.rawRef}`);

  return (
    <button
      className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-primary/25 bg-primary/8 px-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/15"
      onClick={(e) => {
        e.stopPropagation();
        void resolveAndOpenAgentDeeplink(target);
      }}
      title={`Mở ${label}`}
      type="button"
    >
      <Icon className="size-3 shrink-0" />
      <span className="max-w-[160px] truncate">{label}</span>
      <ArrowUpRightIcon className="size-3 shrink-0 opacity-75" />
    </button>
  );
}
