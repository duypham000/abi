import { Button, Input, Tabs } from "antd";
import { useMqttStore } from "../../store/mqttStore";
import { mqttService } from "../../services/mqttService";
import { RealtimeLog } from "../../components/shared/RealtimeLog";
import { MqttConfigPanel } from "../../components/mqtt/MqttConfigPanel";
import { MqttSubscriptions } from "../../components/mqtt/MqttSubscriptions";
import { MqttPublish } from "../../components/mqtt/MqttPublish";
import "./MqttPage.scss";

function mqttTopicMatches(pattern: string, topic: string): boolean {
  const patParts = pattern.split("/");
  const topParts = topic.split("/");
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i] === "#") return true;
    if (patParts[i] !== "+" && patParts[i] !== topParts[i]) return false;
  }
  return patParts.length === topParts.length;
}

export function MqttPage() {
  const url = useMqttStore((s) => s.url);
  const clientId = useMqttStore((s) => s.clientId);
  const connectionState = useMqttStore((s) => s.connectionState);
  const configCollapsed = useMqttStore((s) => s.configCollapsed);
  const subscriptions = useMqttStore((s) => s.subscriptions);
  const logs = useMqttStore((s) => s.logs);
  const activeTopicTab = useMqttStore((s) => s.activeTopicTab);
  const store = useMqttStore.getState;

  const isConnected = connectionState === "CONNECTED";
  const isConnecting = connectionState === "CONNECTING";

  const handleConnect = () => {
    const { url, clientId, config } = useMqttStore.getState();
    store().setConnectionState("CONNECTING");
    store().addLogEntry(["all"], {
      ts: Date.now(),
      source: "info",
      payload: `Connecting to ${url}…`,
      event: "connecting",
    });

    mqttService.connect(url, clientId, config, {
      onConnect: () => {
        store().setConnectionState("CONNECTED");
        store().addLogEntry(["all"], {
          ts: Date.now(),
          source: "info",
          payload: "Connected to broker",
          event: "connected",
        });
      },
      onMessage: (topic, payload) => {
        const matchingTopics = useMqttStore
          .getState()
          .subscriptions.filter((sub) => mqttTopicMatches(sub.topic, topic))
          .map((sub) => sub.topic);
        store().addLogEntry([topic, ...matchingTopics], {
          ts: Date.now(),
          source: "server",
          payload,
          topic,
          prefix: "←",
        });
      },
      onError: (e) => {
        store().setConnectionState("DISCONNECTED");
        store().addLogEntry(["all"], {
          ts: Date.now(),
          source: "disconnected",
          payload: `Error: ${e.message}`,
          event: "error",
        });
      },
      onClose: () => {
        store().setConnectionState("DISCONNECTED");
        store().addLogEntry(["all"], {
          ts: Date.now(),
          source: "disconnected",
          payload: "Disconnected",
          event: "disconnected",
        });
      },
    });
  };

  const handleDisconnect = () => {
    mqttService.disconnect();
    store().setConnectionState("DISCONNECTED");
    store().addLogEntry(["all"], {
      ts: Date.now(),
      source: "disconnected",
      payload: "Disconnected by user",
      event: "disconnected",
    });
  };

  const handlePublish = () => {
    const { publishTopic, publishMessage, publishQos, publishRetain } =
      useMqttStore.getState();
    if (!publishTopic.trim()) return;
    mqttService.publish(publishTopic, publishMessage, publishQos, publishRetain);
    store().addLogEntry(["all"], {
      ts: Date.now(),
      source: "client",
      payload: `[${publishTopic}] ${publishMessage}`,
      prefix: "→",
      topic: publishTopic,
    });
  };

  const tabItems = [
    {
      key: "all",
      label: "All",
      closable: false,
      children: (
        <RealtimeLog
          entries={logs.all ?? []}
          onClear={() => store().clearLog("all")}
        />
      ),
    },
    ...subscriptions.map((sub) => ({
      key: sub.topic,
      label: (
        <span>
          <span
            className="mqtt-sub-dot-inline"
            style={{ background: sub.color }}
          />
          {sub.topic}
        </span>
      ),
      closable: true,
      children: (
        <RealtimeLog
          entries={logs[sub.topic] ?? []}
          onClear={() => store().clearLog(sub.topic)}
        />
      ),
    })),
  ];

  return (
    <div className="mqtt-page">
      <div className="mqtt-header">
        <Input
          value={url}
          onChange={(e) => store().setUrl(e.target.value)}
          placeholder="mqtt://test.mosquitto.org:1883 or ws://…"
          disabled={isConnected || isConnecting}
          size="small"
          className="mqtt-url-input"
        />
        <Input
          value={clientId}
          onChange={(e) => store().setClientId(e.target.value)}
          placeholder="Client ID"
          disabled={isConnected || isConnecting}
          size="small"
          className="mqtt-client-id"
        />
        <Button
          type={isConnected ? "default" : "primary"}
          danger={isConnected}
          loading={isConnecting}
          size="small"
          onClick={isConnected ? handleDisconnect : handleConnect}
        >
          {isConnected
            ? "Disconnect"
            : isConnecting
              ? "Connecting…"
              : "Connect"}
        </Button>
      </div>

      <div className="mqtt-body">
        <div className="mqtt-sidebar">
          <MqttSubscriptions />
        </div>

        <div className="mqtt-main">
          <MqttConfigPanel
            collapsed={configCollapsed}
            onToggle={() => store().setConfigCollapsed(!configCollapsed)}
          />
          <div className="mqtt-log-area">
            <Tabs
              activeKey={activeTopicTab}
              onChange={store().setActiveTopicTab}
              type="editable-card"
              hideAdd
              size="small"
              onEdit={(key, action) => {
                if (action === "remove") {
                  const sub = subscriptions.find((s) => s.topic === key);
                  if (sub) {
                    mqttService.unsubscribe(sub.topic);
                    store().removeSubscription(sub.id);
                  }
                }
              }}
              items={tabItems}
              className="mqtt-log-tabs"
            />
          </div>
          <MqttPublish onPublish={handlePublish} isConnected={isConnected} />
        </div>
      </div>
    </div>
  );
}
