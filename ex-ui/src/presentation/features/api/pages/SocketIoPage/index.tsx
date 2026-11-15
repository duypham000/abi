import { Button, Input, Select, Tabs } from "antd";
import { useSocketIOStore } from "../../store/socketioStore";
import { socketioService } from "../../services/socketioService";
import { RealtimeLog } from "../../components/shared/RealtimeLog";
import { SioCommunication } from "../../components/socketio/SioCommunication";
import { SioAuthTab } from "../../components/socketio/SioAuthTab";
import "./SocketIoPage.scss";

export function SocketIoPage() {
  const url = useSocketIOStore((s) => s.url);
  const path = useSocketIOStore((s) => s.path);
  const version = useSocketIOStore((s) => s.version);
  const connectionState = useSocketIOStore((s) => s.connectionState);
  const log = useSocketIOStore((s) => s.log);
  const activeTab = useSocketIOStore((s) => s.activeTab);
  const store = useSocketIOStore.getState;

  const isConnected = connectionState === "CONNECTED";
  const isConnecting = connectionState === "CONNECTING";

  const handleConnect = () => {
    const { url, path, auth } = useSocketIOStore.getState();
    store().setConnectionState("CONNECTING");
    store().addLogEntry({
      ts: Date.now(),
      source: "info",
      payload: `Connecting to ${url}${path}…`,
      event: "connecting",
    });

    socketioService.connect(url, path, auth, {
      onConnect: () => {
        store().setConnectionState("CONNECTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "info",
          payload: "Connected to server",
          event: "connected",
        });
      },
      onEvent: (event, data) => {
        const payload =
          typeof data === "object" ? JSON.stringify(data) : String(data);
        store().addLogEntry({
          ts: Date.now(),
          source: "server",
          payload: `[${event}] ${payload}`,
          prefix: "←",
        });
      },
      onDisconnect: () => {
        store().setConnectionState("DISCONNECTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "disconnected",
          payload: "Disconnected",
          event: "disconnected",
        });
      },
      onError: (e) => {
        store().setConnectionState("DISCONNECTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "disconnected",
          payload: `Error: ${e.message}`,
          event: "error",
        });
      },
    });
  };

  const handleDisconnect = () => {
    socketioService.disconnect();
    store().setConnectionState("DISCONNECTED");
    store().addLogEntry({
      ts: Date.now(),
      source: "disconnected",
      payload: "Disconnected by user",
      event: "disconnected",
    });
  };

  const handleSend = () => {
    const { eventName, messageInput } = useSocketIOStore.getState();
    if (!eventName || !messageInput.trim()) return;
    socketioService.emit(eventName, messageInput);
    store().addLogEntry({
      ts: Date.now(),
      source: "client",
      payload: `[${eventName}] ${messageInput}`,
      prefix: "→",
    });
    store().setMessageInput("");
  };

  return (
    <div className="sio-page">
      <div className="sio-connection-bar">
        <Select
          value={version}
          onChange={store().setVersion}
          disabled={isConnected || isConnecting}
          size="small"
          className="sio-version-select"
          options={[
            { value: "v4", label: "v4" },
            { value: "v3", label: "v3" },
            { value: "v2", label: "v2" },
          ]}
        />
        <Input
          value={url}
          onChange={(e) => store().setUrl(e.target.value)}
          placeholder="https://echo.socketio.io"
          disabled={isConnected || isConnecting}
          size="small"
          className="sio-url-input"
          onPressEnter={() => !isConnected && !isConnecting && handleConnect()}
        />
        <Input
          value={path}
          onChange={(e) => store().setPath(e.target.value)}
          placeholder="/socket.io"
          disabled={isConnected || isConnecting}
          size="small"
          className="sio-path-input"
        />
        <Button
          type={isConnected ? "default" : "primary"}
          danger={isConnected}
          loading={isConnecting}
          size="small"
          onClick={isConnected ? handleDisconnect : handleConnect}
        >
          {isConnected ? "Disconnect" : isConnecting ? "Connecting…" : "Connect"}
        </Button>
      </div>

      <div className="sio-body">
        <div className="sio-tabs-area">
          <Tabs
            activeKey={activeTab}
            onChange={(t) => store().setActiveTab(t as "communication" | "authorization")}
            size="small"
            items={[
              {
                key: "communication",
                label: "Communication",
                children: (
                  <SioCommunication onSend={handleSend} isConnected={isConnected} />
                ),
              },
              {
                key: "authorization",
                label: "Authorization",
                children: <SioAuthTab />,
              },
            ]}
          />
        </div>
        <div className="sio-log-area">
          <RealtimeLog entries={log} onClear={store().clearLog} title="Log" />
        </div>
      </div>
    </div>
  );
}
