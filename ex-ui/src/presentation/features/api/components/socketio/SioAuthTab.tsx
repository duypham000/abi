import { Button, Input, Select, Switch, Tooltip } from "antd";
import { Trash2Icon } from "lucide-react";
import { useSocketIOStore } from "../../store/socketioStore";

export function SioAuthTab() {
  const auth = useSocketIOStore((s) => s.auth);
  const setAuth = useSocketIOStore((s) => s.setAuth);

  return (
    <div className="sio-auth-tab">
      <div className="sio-auth-header">
        <div className="sio-auth-type-row">
          <span className="sio-auth-label">Authorization type</span>
          <Select
            value={auth.type}
            onChange={(type) => setAuth({ type })}
            size="small"
            style={{ width: 160 }}
            options={[
              { value: "none", label: "None" },
              { value: "bearer", label: "Bearer Token" },
            ]}
          />
          <Tooltip title="Enable authorization">
            <Switch
              checked={auth.enabled}
              onChange={(v) => setAuth({ enabled: v })}
              size="small"
            />
          </Tooltip>
        </div>
        <div className="sio-auth-actions">
          <Tooltip title="Clear">
            <Button
              size="small"
              type="text"
              icon={<Trash2Icon size={13} />}
              onClick={() => setAuth({ type: "none", token: "", enabled: true })}
            />
          </Tooltip>
        </div>
      </div>

      {auth.type === "bearer" && (
        <div className="sio-auth-fields">
          <div className="sio-field-row">
            <span className="sio-field-label">Token</span>
            <Input.Password
              value={auth.token}
              onChange={(e) => setAuth({ token: e.target.value })}
              placeholder="Bearer token"
              style={{ flex: 1 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
