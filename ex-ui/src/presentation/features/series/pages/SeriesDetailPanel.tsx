import { useState, useRef, useCallback } from "react";
import {
  LayoutGridIcon,
  ListIcon,
  FilePlusIcon,
  PlusCircleIcon,
  XIcon,
  FileTextIcon,
  SearchIcon,
  EditIcon,
  Trash2Icon,
  CalendarIcon,
  CheckIcon,
  LayersIcon,
} from "lucide-react";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import {
  useGetSeriesByIdQuery,
  useUpdateSeriesMutation,
  useDeleteSeriesMutation,
} from "@/infrastructure/api/seriesApi";
import {
  useListDocsQuery,
  useSearchDocsQuery,
  useUpdateDocMutation,
  useCreateDocMutation,
  useLazyGetDocByIdQuery,
} from "@/infrastructure/api/docsApi";
import type { DocDto } from "@/core/interfaces/docs";
import "./SeriesDetailPanel.scss";

type ViewMode = "grid" | "list";

// ── Add Existing Doc picker ───────────────────────────────────────────────
function AddDocPicker({
  seriesId,
  currentDocIds,
  onClose,
}: {
  seriesId: number;
  currentDocIds: Set<number>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [adding, setAdding] = useState<number | null>(null);
  const [updateDoc] = useUpdateDocMutation();
  const [getDocById] = useLazyGetDocByIdQuery();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (val: string) => {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val), 300);
  };

  const { data: results, isFetching } = useSearchDocsQuery(debouncedQ, {
    skip: !debouncedQ,
  });

  const candidates = (results ?? []).filter((d) => !currentDocIds.has(d.id));

  const handleAdd = async (doc: DocDto) => {
    try {
      setAdding(doc.id);
      // Fetch the full doc to preserve yjsState / content.
      // Force a fresh network fetch (preferCacheValue=false) to get the full doc with yjsState.
      const result = getDocById(doc.id, false);
      const full: DocDto | null = await result.unwrap().catch(() => null);
      const source = full ?? doc; // fall back to search-result DTO if fetch fails

      await updateDoc({
        id: source.id,
        body: {
          title: source.title,
          content: source.content ?? null,
          plainText: source.plainText ?? null,
          metadata: source.metadata ?? null,
          seriesId,
          lastSync: new Date().toISOString(),
          status: source.status,
          yjsState: null,
        },
      }).unwrap();
      onClose();
    } catch (err) {
      console.error("Failed to add doc to series", err);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="sdp-picker-overlay" onClick={onClose}>
      <div className="sdp-picker" onClick={(e) => e.stopPropagation()}>
        <div className="sdp-picker__header">
          <SearchIcon size={13} className="sdp-picker__icon" />
          <input
            className="sdp-picker__input"
            type="text"
            placeholder="Search docs to add…"
            value={q}
            onChange={(e) => handleChange(e.target.value)}
            autoFocus
          />
          <button className="sdp-picker__close" onClick={onClose}>
            <XIcon size={14} />
          </button>
        </div>
        <div className="sdp-picker__list">
          {isFetching && <div className="sdp-picker__hint">Searching…</div>}
          {!isFetching && debouncedQ && candidates.length === 0 && (
            <div className="sdp-picker__hint">No matching docs found</div>
          )}
          {!debouncedQ && (
            <div className="sdp-picker__hint">Type to search docs…</div>
          )}
          {candidates.map((doc) => (
            <button
              key={doc.id}
              className="sdp-picker__item"
              onClick={() => handleAdd(doc)}
              disabled={adding === doc.id}
            >
              <FileTextIcon size={13} />
              <span>{doc.title || "Untitled"}</span>
              {adding === doc.id
                ? <span className="sdp-picker__item-loading">Adding…</span>
                : <CheckIcon size={12} className="sdp-picker__item-add" />
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Edit Series form ──────────────────────────────────────────────────────
function EditSeriesForm({
  id,
  initialName,
  initialDesc,
  onDone,
}: {
  id: number;
  initialName: string;
  initialDesc: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc ?? "");
  const [update, { isLoading }] = useUpdateSeriesMutation();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await update({ id, body: { name: name.trim(), description: desc.trim() || null } }).unwrap();
    onDone();
  };

  return (
    <form className="sdp-edit-form" onSubmit={handleSave}>
      <input
        className="sdp-edit-form__input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Series name"
        autoFocus
      />
      <input
        className="sdp-edit-form__input sdp-edit-form__input--desc"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
      />
      <div className="sdp-edit-form__actions">
        <button type="button" className="sdp-edit-form__btn sdp-edit-form__btn--cancel" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="sdp-edit-form__btn sdp-edit-form__btn--save" disabled={isLoading}>
          {isLoading ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// ── Doc Grid Card ─────────────────────────────────────────────────────────
function DocGridCard({
  doc,
  onOpen,
  onRemove,
}: {
  doc: DocDto;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const date = doc.lastSync
    ? new Date(doc.lastSync).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  return (
    <div className="sdp-grid-card" onClick={onOpen}>
      <button
        className="sdp-grid-card__remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove from series"
        aria-label="Remove"
      >
        <XIcon size={11} />
      </button>
      <div className="sdp-grid-card__icon">
        <FileTextIcon size={18} />
      </div>
      <div className="sdp-grid-card__title">{doc.title || "Untitled"}</div>
      {doc.plainText && (
        <div className="sdp-grid-card__preview">{doc.plainText.slice(0, 80)}</div>
      )}
      {date && (
        <div className="sdp-grid-card__date">
          <CalendarIcon size={9} />
          {date}
        </div>
      )}
    </div>
  );
}

// ── Doc List Row ──────────────────────────────────────────────────────────
function DocListRow({
  doc,
  onOpen,
  onRemove,
}: {
  doc: DocDto;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const date = doc.lastSync
    ? new Date(doc.lastSync).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  return (
    <div className="sdp-list-row" onClick={onOpen}>
      <FileTextIcon size={13} className="sdp-list-row__icon" />
      <span className="sdp-list-row__title">{doc.title || "Untitled"}</span>
      {date && <span className="sdp-list-row__date">{date}</span>}
      <button
        className="sdp-list-row__remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove from series"
        aria-label="Remove"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}

// ── SeriesDetailPanel ─────────────────────────────────────────────────────
export interface SeriesDetailPanelProps {
  panelMode?: boolean;
  seriesIdProp?: number;
}

export function SeriesDetailPanel({ seriesIdProp }: SeriesDetailPanelProps) {
  const { openPanel } = useGoldenLayout();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [editing, setEditing] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const seriesId = seriesIdProp!;

  const { data: series, isLoading: seriesLoading } = useGetSeriesByIdQuery(seriesId, {
    skip: !seriesId,
  });
  const { data: docsPage, isLoading: docsLoading } = useListDocsQuery(
    { seriesId, size: 100 },
    { skip: !seriesId }
  );
  const [updateDoc] = useUpdateDocMutation();
  const [createDoc] = useCreateDocMutation();
  const [deleteSeries] = useDeleteSeriesMutation();

  const docs: DocDto[] = docsPage?.items ?? [];
  const docIds = new Set(docs.map((d) => d.id));

  const handleOpenDoc = useCallback(
    (doc: DocDto) => {
      openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title, singleton: true });
    },
    [openPanel]
  );

  const handleRemoveDoc = useCallback(
    async (doc: DocDto) => {
      await updateDoc({
        id: doc.id,
        body: {
          title: doc.title,
          content: doc.content ?? null,
          plainText: doc.plainText ?? null,
          metadata: doc.metadata ?? null,
          seriesId: null,
          lastSync: new Date().toISOString(),
          status: doc.status,
          yjsState: null,
        },
      }).unwrap();
    },
    [updateDoc]
  );

  const handleNewDoc = async () => {
    const doc = await createDoc({
      title: "Untitled",
      content: null,
      plainText: null,
      metadata: null,
      seriesId,
      lastSync: null,
      status: 0,
    }).unwrap();
    openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title, singleton: true });
  };

  const handleDeleteSeries = async () => {
    await deleteSeries(seriesId).unwrap();
    // Panel will remain open but series is gone — a simple reload notice suffices
  };

  if (!seriesId) {
    return <div className="sdp-empty">No series selected.</div>;
  }

  if (seriesLoading) {
    return <div className="sdp-empty">Loading…</div>;
  }

  return (
    <div className="series-detail-panel">
      {/* ── Header ── */}
      <div className="sdp-header">
        <div className="sdp-header__left">
          <LayersIcon size={16} className="sdp-header__icon" />
          {editing ? (
            <EditSeriesForm
              id={seriesId}
              initialName={series?.name ?? ""}
              initialDesc={series?.description ?? null}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div className="sdp-header__info">
              <h1 className="sdp-header__name">{series?.name ?? "Series"}</h1>
              {series?.description && (
                <p className="sdp-header__desc">{series.description}</p>
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div className="sdp-header__actions">
            {/* View toggle */}
            <div className="sdp-view-toggle">
              <button
                className={`sdp-view-toggle__btn${viewMode === "grid" ? " is-active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGridIcon size={14} />
              </button>
              <button
                className={`sdp-view-toggle__btn${viewMode === "list" ? " is-active" : ""}`}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <ListIcon size={14} />
              </button>
            </div>

            <button className="sdp-action-btn" onClick={handleNewDoc} title="New doc in series">
              <FilePlusIcon size={14} />
              <span>New Doc</span>
            </button>
            <button
              className="sdp-action-btn"
              onClick={() => setShowAddPicker(true)}
              title="Add existing doc"
            >
              <PlusCircleIcon size={14} />
              <span>Add Doc</span>
            </button>
            <button
              className="sdp-action-btn sdp-action-btn--icon"
              onClick={() => setEditing(true)}
              title="Edit series"
            >
              <EditIcon size={14} />
            </button>
            {confirmDelete ? (
              <div className="sdp-confirm">
                <span className="sdp-confirm__text">Delete?</span>
                <button className="sdp-confirm__yes" onClick={handleDeleteSeries}>Yes</button>
                <button className="sdp-confirm__no" onClick={() => setConfirmDelete(false)}>No</button>
              </div>
            ) : (
              <button
                className="sdp-action-btn sdp-action-btn--danger sdp-action-btn--icon"
                onClick={() => setConfirmDelete(true)}
                title="Delete series"
              >
                <Trash2Icon size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Doc count badge ── */}
      <div className="sdp-count">
        <FileTextIcon size={11} />
        <span>{docs.length} doc{docs.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Content ── */}
      <div className="sdp-content">
        {docsLoading && <div className="sdp-empty">Loading docs…</div>}

        {!docsLoading && docs.length === 0 && (
          <div className="sdp-no-docs">
            <LayersIcon size={32} className="sdp-no-docs__icon" />
            <p className="sdp-no-docs__msg">No docs in this series yet.</p>
            <button className="sdp-no-docs__btn" onClick={handleNewDoc}>
              <FilePlusIcon size={14} />
              Create first doc
            </button>
          </div>
        )}

        {!docsLoading && docs.length > 0 && viewMode === "grid" && (
          <div className="sdp-grid">
            {docs.map((doc) => (
              <DocGridCard
                key={doc.id}
                doc={doc}
                onOpen={() => handleOpenDoc(doc)}
                onRemove={() => handleRemoveDoc(doc)}
              />
            ))}
          </div>
        )}

        {!docsLoading && docs.length > 0 && viewMode === "list" && (
          <div className="sdp-list">
            {docs.map((doc) => (
              <DocListRow
                key={doc.id}
                doc={doc}
                onOpen={() => handleOpenDoc(doc)}
                onRemove={() => handleRemoveDoc(doc)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddPicker && (
        <AddDocPicker
          seriesId={seriesId}
          currentDocIds={docIds}
          onClose={() => setShowAddPicker(false)}
        />
      )}
    </div>
  );
}

export default SeriesDetailPanel;
