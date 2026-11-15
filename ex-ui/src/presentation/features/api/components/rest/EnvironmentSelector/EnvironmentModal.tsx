import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRestStore } from "../../../store/restStore";
import { KeyValueEditor } from "../../shared/KeyValueEditor";

interface EnvironmentModalProps {
  open: boolean;
  onClose: () => void;
}

export function EnvironmentModal({ open, onClose }: EnvironmentModalProps) {
  const environments = useRestStore((s) => s.environments);
  const addEnvironment = useRestStore((s) => s.addEnvironment);
  const updateEnvironment = useRestStore((s) => s.updateEnvironment);
  const deleteEnvironment = useRestStore((s) => s.deleteEnvironment);

  const [selectedId, setSelectedId] = useState<string | null>(
    environments[0]?.id ?? null
  );
  const [newName, setNewName] = useState("");

  const selected = environments.find((e) => e.id === selectedId) ?? null;

  const handleAdd = () => {
    if (!newName.trim()) return;
    addEnvironment(newName.trim());
    const updated = useRestStore.getState().environments;
    const newest = updated[updated.length - 1];
    if (newest) setSelectedId(newest.id);
    setNewName("");
  };

  const handleDelete = (id: string) => {
    deleteEnvironment(id);
    if (selectedId === id) {
      const remaining = environments.filter((e) => e.id !== id);
      setSelectedId(remaining[0]?.id ?? null);
    }
  };

  return (
    <Modal
      title="Environments"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      className="environment-modal"
    >
      <div className="env-modal-body">
        {/* Left: environment list */}
        <div className="env-list">
          <div className="env-list-header">
            <Input
              size="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New environment name"
              onPressEnter={handleAdd}
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              type="primary"
              icon={<PlusIcon size={14} />}
              onClick={handleAdd}
            />
          </div>
          <ul className="env-items">
            {environments.map((env) => (
              <li
                key={env.id}
                className={`env-item ${env.id === selectedId ? "selected" : ""}`}
                onClick={() => setSelectedId(env.id)}
              >
                <span className="env-item-name">{env.name}</span>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2Icon size={12} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(env.id);
                  }}
                />
              </li>
            ))}
            {environments.length === 0 && (
              <li className="env-empty">No environments yet.</li>
            )}
          </ul>
        </div>

        {/* Right: variable editor */}
        <div className="env-editor">
          {selected ? (
            <>
              <div className="env-editor-header">
                <Input
                  size="small"
                  value={selected.name}
                  onChange={(e) =>
                    updateEnvironment(selected.id, { name: e.target.value })
                  }
                  style={{ fontWeight: 600, width: 200 }}
                />
              </div>
              <KeyValueEditor
                rows={selected.variables}
                onChange={(rows) =>
                  updateEnvironment(selected.id, { variables: rows })
                }
                keyPlaceholder="Variable name"
                valuePlaceholder="Value"
                showDescription
              />
            </>
          ) : (
            <div className="env-editor-empty">
              Select or create an environment to edit its variables.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
