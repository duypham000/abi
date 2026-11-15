import { Button, Checkbox, Input, Tooltip } from "antd";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { nanoid } from "nanoid";
import type { KeyValueRow } from "../../types/common";

interface KeyValueEditorProps {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showDescription?: boolean;
  readOnly?: boolean;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  showDescription = true,
  readOnly = false,
}: KeyValueEditorProps) {
  const addRow = () => {
    onChange([
      ...rows,
      { id: nanoid(), key: "", value: "", enabled: true, description: "" },
    ]);
  };

  const updateRow = (id: string, patch: Partial<KeyValueRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="kv-editor">
      {rows.length > 0 && (
        <div className="kv-editor-header">
          <div className="kv-col-check" />
          <div className="kv-col-key">Key</div>
          <div className="kv-col-value">Value</div>
          {showDescription && <div className="kv-col-desc">Description</div>}
          <div className="kv-col-action" />
        </div>
      )}

      {rows.map((row) => (
        <div key={row.id} className="kv-row">
          <div className="kv-col-check">
            <Checkbox
              checked={row.enabled}
              onChange={(e) => updateRow(row.id, { enabled: e.target.checked })}
              disabled={readOnly}
            />
          </div>
          <div className="kv-col-key">
            <Input
              size="small"
              value={row.key}
              onChange={(e) => updateRow(row.id, { key: e.target.value })}
              placeholder={keyPlaceholder}
              disabled={readOnly}
              variant="borderless"
            />
          </div>
          <div className="kv-col-value">
            <Input
              size="small"
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              placeholder={valuePlaceholder}
              disabled={readOnly}
              variant="borderless"
            />
          </div>
          {showDescription && (
            <div className="kv-col-desc">
              <Input
                size="small"
                value={row.description}
                onChange={(e) =>
                  updateRow(row.id, { description: e.target.value })
                }
                placeholder="Description"
                disabled={readOnly}
                variant="borderless"
              />
            </div>
          )}
          <div className="kv-col-action">
            {!readOnly && (
              <Tooltip title="Delete">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2Icon size={12} />}
                  onClick={() => removeRow(row.id)}
                />
              </Tooltip>
            )}
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="kv-editor-footer">
          <Button
            type="dashed"
            size="small"
            icon={<PlusIcon size={12} />}
            onClick={addRow}
            className="kv-add-btn"
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
