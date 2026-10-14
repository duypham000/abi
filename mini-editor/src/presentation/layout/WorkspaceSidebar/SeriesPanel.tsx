import { useState, useEffect, useCallback } from "react";
import {
  SearchIcon,
  PlusIcon,
  BookOpenIcon,
  CalendarIcon,
  XIcon,
  LayersIcon,
} from "lucide-react";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { PANEL_TYPES } from "../golden/panelRegistry";
import {
  useListSeriesQuery,
  useSearchSeriesQuery,
  useCreateSeriesMutation,
} from "@/infrastructure/api/seriesApi";
import type { SeriesDto } from "@/core/interfaces/series";
import "./SeriesPanel.scss";

// ── Create Series Dialog ──────────────────────────────────────────────────
function CreateSeriesDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createSeries, { isLoading }] = useCreateSeriesMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createSeries({ name: name.trim(), description: description.trim() || null }).unwrap();
    onClose();
  };

  return (
    <div className="sp-dialog-overlay" onClick={onClose}>
      <div className="sp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sp-dialog__header">
          <span className="sp-dialog__title">New Series</span>
          <button className="sp-dialog__close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="sp-dialog__form">
          <label className="sp-dialog__label">
            Name <span className="sp-dialog__required">*</span>
          </label>
          <input
            className="sp-dialog__input"
            type="text"
            placeholder="Series name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <label className="sp-dialog__label">Description</label>
          <textarea
            className="sp-dialog__textarea"
            placeholder="Optional description…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className="sp-dialog__actions">
            <button type="button" className="sp-dialog__btn sp-dialog__btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="sp-dialog__btn sp-dialog__btn--create"
              disabled={!name.trim() || isLoading}
            >
              {isLoading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Series Card ───────────────────────────────────────────────────────────
function SeriesCard({
  series,
  onClick,
}: {
  series: SeriesDto;
  onClick: () => void;
}) {
  const date = new Date(series.lastModifiedDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <button className="sp-card" onClick={onClick} title={series.name}>
      <div className="sp-card__icon">
        <LayersIcon size={16} />
      </div>
      <div className="sp-card__body">
        <span className="sp-card__name">{series.name}</span>
        {series.description && (
          <span className="sp-card__desc">{series.description}</span>
        )}
        <div className="sp-card__meta">
          <CalendarIcon size={10} />
          <span>{date}</span>
        </div>
      </div>
    </button>
  );
}

// ── SeriesPanel ───────────────────────────────────────────────────────────
export function SeriesPanel() {
  const { openPanel } = useGoldenLayout();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: listData, isLoading } = useListSeriesQuery({ size: 50 });
  const { data: searchResults, isFetching: isSearching } = useSearchSeriesQuery(
    debouncedQuery,
    { skip: !debouncedQuery }
  );

  const allSeries: SeriesDto[] = listData?.items ?? [];
  const displaySeries: SeriesDto[] = debouncedQuery ? (searchResults ?? []) : allSeries;
  const isLoadingDisplay = debouncedQuery ? isSearching : isLoading;

  const handleOpen = useCallback(
    (s: SeriesDto) => {
      openPanel(PANEL_TYPES.SERIES_DETAIL, { id: s.id }, { title: s.name, singleton: true });
    },
    [openPanel]
  );

  return (
    <div className="series-panel">
      {/* Header */}
      <div className="series-panel__header">
        <div className="series-panel__header-left">
          <BookOpenIcon size={13} className="series-panel__header-icon" />
          <span className="series-panel__title">Series</span>
        </div>
        <button
          className="series-panel__new-btn"
          onClick={() => setShowCreate(true)}
          title="New Series"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="series-panel__search">
        <SearchIcon size={13} className="series-panel__search-icon" />
        <input
          className="series-panel__search-input"
          type="text"
          placeholder="Search series…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Card list */}
      <div className="series-panel__body">
        <div className="series-panel__section-label">
          {debouncedQuery ? (
            <>
              <SearchIcon size={10} />
              Results
            </>
          ) : (
            <>
              <LayersIcon size={10} />
              All Series
            </>
          )}
        </div>

        {isLoadingDisplay && (
          <div className="series-panel__empty">Loading…</div>
        )}

        {!isLoadingDisplay && displaySeries.length === 0 && (
          <div className="series-panel__empty">
            {debouncedQuery ? "No results" : "No series yet"}
          </div>
        )}

        {!isLoadingDisplay &&
          displaySeries.map((s) => (
            <SeriesCard key={s.id} series={s} onClick={() => handleOpen(s)} />
          ))}
      </div>

      {showCreate && <CreateSeriesDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
