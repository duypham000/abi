import { Button, Input, Tooltip } from "antd";
import { InfoIcon } from "lucide-react";
import { useSseStore } from "../../store/sseStore";
import { sseService } from "../../services/sseService";
import { RealtimeLog } from "../../components/shared/RealtimeLog";
import "./SsePage.scss";

function isValidUrl(u: string): boolean {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

export function SsePage() {
  const url = useSseStore((s) => s.url);
  const eventType = useSseStore((s) => s.eventType);
  const connectionState = useSseStore((s) => s.connectionState);
  const log = useSseStore((s) => s.log);
  const store = useSseStore.getState;

  const isConnected = connectionState === "STARTED";
  const isStarting = connectionState === "STARTING";

  const handleStart = () => {
    if (!isValidUrl(url)) return;
    store().setConnectionState("STARTING");
    store().addLogEntry({
      ts: Date.now(),
      source: "info",
      payload: `Connecting to ${url}…`,
      event: "connecting",
    });

    sseService.connect(url, {
      onOpen: () => {
        store().setConnectionState("STARTED");
        store().addLogEntry({
          ts: Date.now(),
          source: "info",
          payload: "Connected — listening for events",
          event: "connected",
        });
      },
      onMessage: (data, event) => {
        const currentEventType = useSseStore.getState().eventType;
        if (currentEventType && event !== currentEventType) return;
        store().addLogEntry({
          ts: Date.now(),
          source: "server",
          payload:
            event && event !== "message"
              ? `event: ${event}, data: ${data}`
              : `data: ${data}`,
          prefix: "←",
        });
      },
      onError: () => {
        store().setConnectionState("STOPPED");
        store().addLogEntry({
          ts: Date.now(),
          source: "disconnected",
          payload: "Connection error",
          event: "error",
        });
      },
    });

    // Custom named event listener
    if (eventType && eventType !== "message") {
      sseService.source?.addEventListener(eventType, (e: Event) => {
        const me = e as MessageEvent;
        store().addLogEntry({
          ts: Date.now(),
          source: "server",
          payload: `event: ${eventType}, data: ${me.data}`,
          prefix: "←",
        });
      });
    }
  };

  const handleStop = () => {
    sseService.disconnect();
    store().setConnectionState("STOPPED");
    store().addLogEntry({
      ts: Date.now(),
      source: "disconnected",
      payload: "Stopped by user",
      event: "disconnected",
    });
  };

  return (
    <div className="sse-page">
      <div className="sse-connection-bar">
        <div className="sse-url-row">
          <Input
            value={url}
            onChange={(e) => store().setUrl(e.target.value)}
            placeholder="https://api.example.com/events"
            disabled={isConnected || isStarting}
            className="sse-url-input"
            size="small"
            onPressEnter={() =>
              !isConnected && !isStarting && isValidUrl(url) && handleStart()
            }
          />
          <Button
            type={isConnected ? "default" : "primary"}
            danger={isConnected}
            loading={isStarting}
            size="small"
            disabled={!isValidUrl(url) && !isConnected}
            onClick={isConnected ? handleStop : handleStart}
          >
            {isStarting ? "Starting…" : isConnected ? "Stop" : "Start"}
          </Button>
        </div>
        <div className="sse-event-row">
          <span className="sse-event-label">Event Type</span>
          <Input
            value={eventType}
            onChange={(e) => store().setEventType(e.target.value)}
            placeholder="message"
            disabled={isConnected || isStarting}
            size="small"
            className="sse-event-input"
          />
          <Tooltip title="Filter log to only show events of this type. Leave empty to show all.">
            <InfoIcon size={14} className="sse-info-icon" />
          </Tooltip>
        </div>
      </div>

      <div className="sse-log-area">
        <RealtimeLog entries={log} onClear={store().clearLog} title="Log" />
      </div>
    </div>
  );
}
