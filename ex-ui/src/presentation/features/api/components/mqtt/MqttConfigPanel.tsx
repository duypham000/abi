import { Input, InputNumber, Select, Switch } from "antd";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMqttStore } from "../../store/mqttStore";

interface MqttConfigPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function MqttConfigPanel({ collapsed, onToggle }: MqttConfigPanelProps) {
  const config = useMqttStore((s) => s.config);
  const setConfig = useMqttStore((s) => s.setConfig);
  const setLastWill = useMqttStore((s) => s.setLastWill);
  const isConnected = useMqttStore((s) => s.connectionState === "CONNECTED");

  return (
    <div className="mqtt-config">
      <div className="mqtt-config-toggle" onClick={onToggle}>
        <span>Connection Config</span>
        {collapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
      </div>

      {!collapsed && (
        <div className="mqtt-config-body">
          <div className="mqtt-config-row">
            <div className="mqtt-field">
              <label>Username</label>
              <Input
                value={config.username}
                onChange={(e) => setConfig({ username: e.target.value })}
                disabled={isConnected}
                size="small"
                placeholder="optional"
              />
            </div>
            <div className="mqtt-field">
              <label>Password</label>
              <Input.Password
                value={config.password}
                onChange={(e) => setConfig({ password: e.target.value })}
                disabled={isConnected}
                size="small"
                placeholder="optional"
              />
            </div>
          </div>

          <div className="mqtt-config-row">
            <div className="mqtt-field mqtt-field--small">
              <label>Keep-alive (s)</label>
              <InputNumber
                value={config.keepAlive}
                onChange={(v) => setConfig({ keepAlive: v ?? 60 })}
                min={0}
                max={65535}
                disabled={isConnected}
                size="small"
                style={{ width: "100%" }}
              />
            </div>
            <div className="mqtt-field mqtt-field--toggle">
              <label>Clean Session</label>
              <Switch
                checked={config.cleanSession}
                onChange={(v) => setConfig({ cleanSession: v })}
                disabled={isConnected}
                size="small"
              />
            </div>
          </div>

          <div className="mqtt-section-title">Last Will</div>
          <div className="mqtt-config-row">
            <div className="mqtt-field">
              <label>Topic</label>
              <Input
                value={config.lastWill.topic}
                onChange={(e) => setLastWill({ topic: e.target.value })}
                disabled={isConnected}
                size="small"
                placeholder="will/topic"
              />
            </div>
            <div className="mqtt-field mqtt-field--small">
              <label>QoS</label>
              <Select
                value={config.lastWill.qos}
                onChange={(v) => setLastWill({ qos: v })}
                disabled={isConnected}
                size="small"
                style={{ width: "100%" }}
                options={[
                  { value: 0, label: "0" },
                  { value: 1, label: "1" },
                  { value: 2, label: "2" },
                ]}
              />
            </div>
            <div className="mqtt-field mqtt-field--toggle">
              <label>Retain</label>
              <Switch
                checked={config.lastWill.retain}
                onChange={(v) => setLastWill({ retain: v })}
                disabled={isConnected}
                size="small"
              />
            </div>
          </div>
          <div className="mqtt-field">
            <label>Message</label>
            <Input.TextArea
              value={config.lastWill.message}
              onChange={(e) => setLastWill({ message: e.target.value })}
              disabled={isConnected}
              size="small"
              placeholder="Last will message"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}
