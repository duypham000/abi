import { Button, Input, Select, Switch } from "antd";
import { SendIcon } from "lucide-react";
import { useMqttStore } from "../../store/mqttStore";

interface MqttPublishProps {
  onPublish: () => void;
  isConnected: boolean;
}

export function MqttPublish({ onPublish, isConnected }: MqttPublishProps) {
  const publishTopic = useMqttStore((s) => s.publishTopic);
  const publishMessage = useMqttStore((s) => s.publishMessage);
  const publishQos = useMqttStore((s) => s.publishQos);
  const publishRetain = useMqttStore((s) => s.publishRetain);
  const setPublishTopic = useMqttStore((s) => s.setPublishTopic);
  const setPublishMessage = useMqttStore((s) => s.setPublishMessage);
  const setPublishQos = useMqttStore((s) => s.setPublishQos);
  const setPublishRetain = useMqttStore((s) => s.setPublishRetain);

  return (
    <div className="mqtt-publish">
      <div className="mqtt-publish-bar">
        <span className="mqtt-publish-label">Publish to</span>
        <Input
          value={publishTopic}
          onChange={(e) => setPublishTopic(e.target.value)}
          placeholder="topic/path"
          disabled={!isConnected}
          size="small"
          className="mqtt-pub-topic"
        />
        <span className="mqtt-publish-label">QoS</span>
        <Select
          value={publishQos}
          onChange={setPublishQos}
          disabled={!isConnected}
          size="small"
          className="mqtt-pub-qos"
          options={[
            { value: 0, label: "0" },
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
        />
        <span className="mqtt-publish-label">Retain</span>
        <Switch
          checked={publishRetain}
          onChange={setPublishRetain}
          disabled={!isConnected}
          size="small"
        />
      </div>

      <div className="mqtt-publish-payload">
        <Input.TextArea
          value={publishMessage}
          onChange={(e) => setPublishMessage(e.target.value)}
          placeholder="Message payload"
          rows={3}
          disabled={!isConnected}
        />
        <Button
          type="primary"
          icon={<SendIcon size={14} />}
          disabled={!isConnected || !publishTopic.trim()}
          onClick={onPublish}
          size="small"
        >
          Publish
        </Button>
      </div>
    </div>
  );
}
