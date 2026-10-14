import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useDispatch } from "react-redux";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import type { AppDispatch } from "@/presentation/store";
import { useSearchDocsQuery } from "@/infrastructure/api/docsApi";
import { useSearchCanvasQuery } from "@/infrastructure/api/canvasApi";
import { getRecent } from "@/presentation/features/docs/utils/recentDocs";
import type { CommandContext } from "./commands";
import {
  resolveProvider,
  PREFIX_PROVIDERS,
  type Row,
  type ProviderDeps,
  type EntitySource,
} from "./providers";
import { useCommandPaletteHotkeys, type PaletteMode } from "./useCommandPaletteHotkeys";
import "./CommandPalette.scss";

/** Map the opening shortcut to the provider it lands on. */
const BASE_BY_MODE: Record<PaletteMode, string> = {
  "quick-open": "all",
  command: "commands",
};

export function CommandPalette() {
  const dispatch = useDispatch<AppDispatch>();
  const { openPanel, resetLayout, splitPanel } = useGoldenLayout();

  const [open, setOpen] = useState(false);
  const [baseId, setBaseId] = useState("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx: CommandContext = useMemo(
    () => ({ openPanel, resetLayout, splitPanel, dispatch }),
    [openPanel, resetLayout, splitPanel, dispatch],
  );

  const openWith = useCallback((mode: PaletteMode) => {
    setBaseId(BASE_BY_MODE[mode]);
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);
  useCommandPaletteHotkeys(openWith);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Focus the input whenever the palette opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // First character dispatches to a provider; otherwise we stay on the base.
  const { provider, term } = resolveProvider(query, baseId);

  // Debounce the term for entity-search hooks (commands filter instantly off `term`).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  // Run only the entity searches the active provider declares.
  const want = (src: EntitySource) =>
    open && !!debounced && (provider.sources?.includes(src) ?? false);
  const { data: docs = [] } = useSearchDocsQuery(debounced, { skip: !want("docs") });
  const { data: canvas = [] } = useSearchCanvasQuery(debounced, { skip: !want("canvas") });
  
  const deps: ProviderDeps = useMemo(
    () => ({ docs, canvas, recent: getRecent(), ctx }),
    [docs, canvas, ctx],
  );

  const rows: Row[] = useMemo(
    () => provider.buildRows(term, deps),
    [provider, term, deps],
  );

  useEffect(() => { setSelected(0); }, [provider.id, term]);

  const runRow = useCallback((row: Row | undefined) => {
    if (!row) return;
    close();
    void row.run();
  }, [close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runRow(rows[selected]);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette__scrim" onMouseDown={close}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="command-palette__input-row">
          <span className="command-palette__lead-icon">{provider.icon}</span>
          <span className="command-palette__chip">{provider.label}</span>
          <input
            ref={inputRef}
            className="command-palette__input"
            value={query}
            placeholder={provider.placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />
        </div>

        <ul className="command-palette__list">
          {rows.length === 0 && (
            <li className="command-palette__empty">No results</li>
          )}
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={`command-palette__row${i === selected ? " is-selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onMouseDown={(e) => { e.preventDefault(); runRow(row); }}
            >
              <span className="command-palette__row-icon">{row.icon}</span>
              <span className="command-palette__row-title">{row.title}</span>
              {row.subtitle && (
                <span className="command-palette__row-subtitle">{row.subtitle}</span>
              )}
            </li>
          ))}
        </ul>

        {/* Prefix legend — generated from the registry, so new providers show up automatically */}
        <div className="command-palette__legend">
          {PREFIX_PROVIDERS.map((p) => (
            <span key={p.id} className="command-palette__legend-item">
              <kbd>{p.prefix}</kbd> {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
