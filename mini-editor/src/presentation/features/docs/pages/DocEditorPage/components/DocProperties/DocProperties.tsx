import { useState, useEffect } from "react";
import {
  TagOutlined,
  FileOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ColumnWidthOutlined,
  FontSizeOutlined,
  PlusOutlined,
  FolderOutlined,
} from "@ant-design/icons";
import { Select } from "antd";
import { useListSeriesQuery } from "@/infrastructure/api/seriesApi";
import type { DocDto, DocMetadata } from "@/core/interfaces/docs";
import { parseDocMetadata } from "@/core/interfaces/docs";
import type { EditorSettings } from "@/presentation/features/docs/pages/DocEditorPage/DocEditorPage";
import { PropRow } from "./components/PropRow";
import { PropToggle } from "./components/PropToggle";
import { PropCheckbox } from "./components/PropCheckbox";
import { PropTagsInput } from "./components/PropTagsInput";
import { PropTextInput } from "./components/PropTextInput";
import "./DocProperties.scss";

interface DocPropertiesProps {
  doc: DocDto;
  onMetadataChange: (meta: DocMetadata) => void;
  onSeriesIdChange?: (seriesId: number | null) => void;
  settings: EditorSettings;
  onSettingsChange: (s: EditorSettings) => void;
}

const RESERVED_NAMES = new Set([
  "Tags", "Doc mode", "Journal", "Template",
  "Created", "Updated", "Created by",
  "Edgeless theme", "Page width", "Series",
]);

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function DocProperties({ doc, onMetadataChange, onSeriesIdChange, settings, onSettingsChange }: DocPropertiesProps) {
  // Local state updates immediately (optimistic); syncs from server only when doc switches
  const [meta, setMeta] = useState(() => parseDocMetadata(doc.metadata));
  const [addingProp, setAddingProp] = useState(false);
  const [newPropKey, setNewPropKey] = useState("");

  const { data: seriesList, isLoading: seriesLoading } = useListSeriesQuery({ page: 0, size: 100 });

  useEffect(() => {
    setMeta(parseDocMetadata(doc.metadata));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const visibleProps = meta.properties.filter((p) => !RESERVED_NAMES.has(p.key));

  function commit(next: DocMetadata) {
    setMeta(next);
    onMetadataChange(next);
  }

  function handleTagsChange(tags: string[], tagColors: Record<string, string>) {
    commit({ ...meta, tags, tagColors });
  }

  function handleRemoveProperty(key: string) {
    commit({ ...meta, properties: meta.properties.filter((p) => p.key !== key) });
  }

  function handleUpdateProperty(key: string, value: string) {
    commit({ ...meta, properties: meta.properties.map((p) => p.key === key ? { ...p, value } : p) });
  }

  function handleAddProperty() {
    const key = newPropKey.trim();
    if (!key || RESERVED_NAMES.has(key) || meta.properties.some((p) => p.key === key)) return;
    commit({ ...meta, properties: [...meta.properties, { key, value: "" }] });
    setNewPropKey("");
    setAddingProp(false);
  }

  return (
    <div className="doc-properties">
      <div className="doc-properties__header">
        <span className="doc-properties__header-title">Workspace properties</span>
      </div>

      <PropRow icon={<TagOutlined />} label="Tags">
        <PropTagsInput tags={meta.tags} tagColors={meta.tagColors} onChange={handleTagsChange} />
      </PropRow>

      <PropRow icon={<FolderOutlined />} label="Series">
        <Select
          placeholder="Select Series"
          allowClear
          loading={seriesLoading}
          value={doc.seriesId ?? undefined}
          onChange={(val) => onSeriesIdChange?.(val ?? null)}
          style={{ width: "100%" }}
          options={(seriesList?.items ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
        />
      </PropRow>

      <PropRow icon={<CalendarOutlined />} label="Journal">
        <PropCheckbox checked={meta.journal} onChange={(v) => commit({ ...meta, journal: v })} />
      </PropRow>

      <PropRow icon={<FileOutlined />} label="Template">
        <PropCheckbox checked={meta.template} onChange={(v) => commit({ ...meta, template: v })} />
      </PropRow>

      <PropRow icon={<ClockCircleOutlined />} label="Created">
        <span className="doc-prop-date">{formatDate(meta.createdAt)}</span>
      </PropRow>

      <PropRow icon={<CalendarOutlined />} label="Updated">
        <span className="doc-prop-date">{formatDate(doc.lastSync)}</span>
      </PropRow>

      <PropRow icon={<UserOutlined />} label="Created by">
        <span className="doc-prop-text">{doc.createdBy?.username ?? "Unknown"}</span>
      </PropRow>

      <PropRow icon={<ColumnWidthOutlined />} label="Page width">
        <PropToggle
          options={[{ value: "medium", label: "Standard" }, { value: "full", label: "Full width" }]}
          value={settings.width === "full" ? "full" : "medium"}
          onChange={(v) => onSettingsChange({ ...settings, width: v as "medium" | "full" })}
        />
      </PropRow>

      {visibleProps.map((prop) => (
        <PropRow key={prop.key} icon={<FontSizeOutlined />} label={prop.key} removable onRemove={() => handleRemoveProperty(prop.key)}>
          <PropTextInput value={prop.value} onChange={(v) => handleUpdateProperty(prop.key, v)} />
        </PropRow>
      ))}

      {addingProp ? (
        <div className="doc-properties__add-form">
          <input
            autoFocus
            className="doc-properties__add-input"
            placeholder="Property name"
            value={newPropKey}
            onChange={(e) => setNewPropKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddProperty();
              if (e.key === "Escape") { setAddingProp(false); setNewPropKey(""); }
            }}
            onBlur={() => { if (!newPropKey.trim()) { setAddingProp(false); setNewPropKey(""); } }}
          />
        </div>
      ) : (
        <button className="doc-properties__add-btn" onClick={() => setAddingProp(true)}>
          <PlusOutlined /> Add property
        </button>
      )}
    </div>
  );
}
