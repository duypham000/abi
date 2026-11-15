import { Button, Input, Switch, Tooltip } from "antd";
import { GripVerticalIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useWebSocketStore } from "../../store/websocketStore";

export function ProtocolsPanel() {
  const protocols = useWebSocketStore((s) => s.protocols);
  const addProtocol = useWebSocketStore((s) => s.addProtocol);
  const updateProtocol = useWebSocketStore((s) => s.updateProtocol);
  const toggleProtocol = useWebSocketStore((s) => s.toggleProtocol);
  const removeProtocol = useWebSocketStore((s) => s.removeProtocol);
  const clearProtocols = useWebSocketStore((s) => s.clearProtocols);

  return (
    <div className="protocols-panel">
      <div className="protocols-header">
        <span className="protocols-title">Protocols</span>
        <div className="protocols-actions">
          <Button size="small" icon={<PlusIcon size={13} />} onClick={addProtocol}>
            Add Protocol
          </Button>
          {protocols.length > 0 && (
            <Tooltip title="Clear all">
              <Button
                size="small"
                danger
                icon={<Trash2Icon size={13} />}
                onClick={clearProtocols}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {protocols.length === 0 ? (
        <div className="protocols-empty">
          No protocols added. Add subprotocols for the WebSocket handshake.
        </div>
      ) : (
        <div className="protocols-list">
          {protocols.map((p) => (
            <div key={p.id} className="protocol-row">
              <GripVerticalIcon size={14} className="drag-handle" />
              <Input
                size="small"
                value={p.value}
                onChange={(e) => updateProtocol(p.id, e.target.value)}
                placeholder="e.g. graphql-ws"
                style={{ flex: 1 }}
              />
              <Switch
                checked={p.enabled}
                onChange={() => toggleProtocol(p.id)}
                size="small"
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<XIcon size={13} />}
                onClick={() => removeProtocol(p.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
