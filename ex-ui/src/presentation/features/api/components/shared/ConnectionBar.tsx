import React from "react";
import { Button, Input } from "antd";

type ConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "STOPPED"
  | "STARTING"
  | "STARTED";

interface ConnectionBarProps {
  url: string;
  onUrlChange: (v: string) => void;
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  urlPlaceholder?: string;
  extraFields?: React.ReactNode;
  connectLabel?: string;
  disconnectLabel?: string;
}

const ACTIVE_STATES: ConnectionState[] = ["CONNECTED", "STARTED"];
const LOADING_STATES: ConnectionState[] = ["CONNECTING", "STARTING"];

function getButtonLabel(
  state: ConnectionState,
  connectLabel = "Connect",
  disconnectLabel = "Disconnect"
): string {
  if (ACTIVE_STATES.includes(state)) return disconnectLabel;
  if (LOADING_STATES.includes(state)) return "Connecting…";
  return connectLabel;
}

export function ConnectionBar({
  url,
  onUrlChange,
  state,
  onConnect,
  onDisconnect,
  urlPlaceholder = "URL",
  extraFields,
  connectLabel = "Connect",
  disconnectLabel = "Disconnect",
}: ConnectionBarProps) {
  const isActive = ACTIVE_STATES.includes(state);
  const isLoading = LOADING_STATES.includes(state);

  return (
    <div className="connection-bar">
      <Input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder={urlPlaceholder}
        disabled={isActive || isLoading}
        className="connection-url-input"
        onPressEnter={() => !isActive && !isLoading && url && onConnect()}
      />
      {extraFields}
      <Button
        type={isActive ? "default" : "primary"}
        danger={isActive}
        loading={isLoading}
        disabled={!isActive && !isLoading && !url.trim()}
        onClick={isActive ? onDisconnect : onConnect}
        className="connection-btn"
      >
        {getButtonLabel(state, connectLabel, disconnectLabel)}
      </Button>
    </div>
  );
}
