import { Tabs } from "antd";
import { useWebSocketStore } from "../../store/websocketStore";
import { wsService } from "../../services/wsService";
import { ConnectionBar } from "../../components/shared/ConnectionBar";
import { RealtimeLog } from "../../components/shared/RealtimeLog";
import { WsCommunication } from "../../components/websocket/WsCommunication";
import { ProtocolsPanel } from "../../components/websocket/ProtocolsPanel";
import "./WebSocketPage.scss";

export function WebSocketPage() {
  const url = useWebSocketStore((s) => s.url);
  const protocols = useWebSocketStore((s) => s.protocols);
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const log = useWebSocketStore((s) => s.log);
  const store = useWebSocketStore.getState;

  const handleConnect = () => {
    store().setConnectionState("CONNECTING");
    store().addLogEntry({
      ts: Date.now(),
      source: "info",
      payload: `Connecting to ${url}…`,
      event: "connecting",
    });

    const activeProtocols = protocols
      .filter((p) => p.enabled && p.value)
      .map((p) => p.value);

    wsService.connect(url, activeProtocols, {
      onOpen: () => {
        store().setConnectionState("CONNECTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "info",
          payload: "Connected to server",
          event: "connected",
        });
      },
      onMessage: (data) => {
        store().addLogEntry({
          ts: Date.now(),
          source: "server",
          payload: data,
          prefix: "←",
        });
      },
      onClose: () => {
        store().setConnectionState("DISCONNECTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "disconnected",
          payload: "Disconnected",
          event: "disconnected",
        });
      },
      onError: () => {
        store().setConnectionState("DISCONNECTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "disconnected",
          payload: "Connection error",
          event: "error",
        });
      },
    });
  };

  const handleDisconnect = () => {
    wsService.disconnect();
    store().setConnectionState("DISCONNECTED");
    store().addLogEntry({
      ts: Date.now(),
      source: "disconnected",
      payload: "Disconnected by user",
      event: "disconnected",
    });
  };

  const handleSend = (msg: string) => {
    wsService.send(msg);
    store().addLogEntry({
      ts: Date.now(),
      source: "client",
      payload: msg,
      prefix: "→",
    });
    store().setMessageInput("");
  };

  return (
    <div className="ws-page">
      <ConnectionBar
        url={url}
        onUrlChange={store().setUrl}
        state={connectionState}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        urlPlaceholder="wss://echo.websocket.org"
        connectLabel="Connect"
        disconnectLabel="Disconnect"
      />

      <div className="ws-body">
        <div className="ws-top">
          <Tabs
            size="small"
            items={[
              {
                key: "communication",
                label: "Communication",
                children: <WsCommunication onSend={handleSend} />,
              },
              {
                key: "protocols",
                label: "Protocols",
                children: <ProtocolsPanel />,
              },
            ]}
          />
        </div>
        <div className="ws-bottom">
          <RealtimeLog entries={log} onClear={store().clearLog} title="Log" />
        </div>
      </div>
    </div>
  );
}
