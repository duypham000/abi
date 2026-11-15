import { Button, Input, Modal, Select, Tooltip } from "antd";
import { PlusIcon, XIcon } from "lucide-react";
import { useMqttStore } from "../../store/mqttStore";
import { mqttService } from "../../services/mqttService";

export function MqttSubscriptions() {
  const subscriptions = useMqttStore((s) => s.subscriptions);
  const activeTopicTab = useMqttStore((s) => s.activeTopicTab);
  const openSubscribeModal = useMqttStore((s) => s.openSubscribeModal);
  const removeSubscription = useMqttStore((s) => s.removeSubscription);
  const setActiveTopicTab = useMqttStore((s) => s.setActiveTopicTab);
  const isConnected = useMqttStore((s) => s.connectionState === "CONNECTED");

  const handleUnsubscribe = (id: string, topic: string) => {
    if (isConnected) mqttService.unsubscribe(topic);
    removeSubscription(id);
  };

  return (
    <div className="mqtt-subscriptions">
      <div className="mqtt-sub-header">
        <Button
          type="primary"
          size="small"
          icon={<PlusIcon size={13} />}
          onClick={openSubscribeModal}
          disabled={!isConnected}
        >
          New Subscription
        </Button>
      </div>

      {subscriptions.length === 0 ? (
        <div className="mqtt-sub-empty">
          No subscriptions yet.
          <br />
          Connect and click &quot;+ New Subscription&quot;
        </div>
      ) : (
        <div className="mqtt-sub-list">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className={`mqtt-sub-item${activeTopicTab === sub.topic ? " mqtt-sub-item--active" : ""}`}
              onClick={() => setActiveTopicTab(sub.topic)}
            >
              <span
                className="mqtt-sub-dot"
                style={{ background: sub.color }}
              />
              <span className="mqtt-sub-topic" title={sub.topic}>
                {sub.topic}
              </span>
              <Tooltip title="Unsubscribe">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<XIcon size={12} />}
                  className="mqtt-sub-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnsubscribe(sub.id, sub.topic);
                  }}
                />
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      <MqttSubscribeModal />
    </div>
  );
}

function MqttSubscribeModal() {
  const subscribeModalOpen = useMqttStore((s) => s.subscribeModalOpen);
  const subscribeModalTopic = useMqttStore((s) => s.subscribeModalTopic);
  const subscribeModalQos = useMqttStore((s) => s.subscribeModalQos);
  const closeSubscribeModal = useMqttStore((s) => s.closeSubscribeModal);
  const setSubscribeModalTopic = useMqttStore((s) => s.setSubscribeModalTopic);
  const setSubscribeModalQos = useMqttStore((s) => s.setSubscribeModalQos);
  const addSubscription = useMqttStore((s) => s.addSubscription);

  const handleSubscribe = () => {
    if (!subscribeModalTopic.trim()) return;
    mqttService.subscribe(subscribeModalTopic, subscribeModalQos);
    addSubscription(subscribeModalTopic, subscribeModalQos);
    closeSubscribeModal();
  };

  return (
    <Modal
      title="New Subscription"
      open={subscribeModalOpen}
      onCancel={closeSubscribeModal}
      footer={[
        <Button key="cancel" onClick={closeSubscribeModal}>
          Cancel
        </Button>,
        <Button
          key="sub"
          type="primary"
          onClick={handleSubscribe}
          disabled={!subscribeModalTopic.trim()}
        >
          Subscribe
        </Button>,
      ]}
    >
      <div className="mqtt-sub-modal-fields">
        <div className="mqtt-field">
          <label>Topic</label>
          <Input
            value={subscribeModalTopic}
            onChange={(e) => setSubscribeModalTopic(e.target.value)}
            placeholder="sensors/# or home/+/temperature"
            onPressEnter={handleSubscribe}
          />
        </div>
        <div className="mqtt-field" style={{ marginTop: 12 }}>
          <label>QoS</label>
          <Select
            value={subscribeModalQos}
            onChange={(v) => setSubscribeModalQos(v)}
            style={{ width: "100%" }}
            options={[
              { value: 0, label: "QoS 0 — At most once" },
              { value: 1, label: "QoS 1 — At least once" },
              { value: 2, label: "QoS 2 — Exactly once" },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
