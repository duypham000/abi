import { Button, Select, Tooltip, message } from "antd";
import { BracesIcon, SendIcon, XIcon } from "lucide-react";
import { useWebSocketStore } from "../../store/websocketStore";

interface WsCommunicationProps {
  onSend: (msg: string) => void;
}

export function WsCommunication({ onSend }: WsCommunicationProps) {
  const isConnected = useWebSocketStore((s) => s.connectionState === "CONNECTED");
  const messageInput = useWebSocketStore((s) => s.messageInput);
  const contentType = useWebSocketStore((s) => s.contentType);
  const setMessageInput = useWebSocketStore((s) => s.setMessageInput);
  const setContentType = useWebSocketStore((s) => s.setContentType);

  const handleSend = () => {
    if (!messageInput.trim() || !isConnected) return;
    onSend(messageInput);
  };

  const handlePrettify = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(messageInput), null, 2);
      setMessageInput(formatted);
    } catch {
      message.error("Invalid JSON");
    }
  };

  return (
    <div className="ws-communication">
      <textarea
        value={messageInput}
        onChange={(e) => setMessageInput(e.target.value)}
        placeholder="Enter message"
        className="ws-message-input"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === "Enter") handleSend();
        }}
      />
      <div className="ws-communication-toolbar">
        <Select
          value={contentType}
          onChange={setContentType}
          size="small"
          style={{ width: 80 }}
          options={[
            { value: "json", label: "JSON" },
            { value: "raw", label: "Raw" },
          ]}
        />
        <Button
          type="primary"
          size="small"
          icon={<SendIcon size={13} />}
          onClick={handleSend}
          disabled={!isConnected || !messageInput.trim()}
        >
          Send
        </Button>
        <Button
          size="small"
          icon={<XIcon size={13} />}
          onClick={() => setMessageInput("")}
        >
          Clear
        </Button>
        <Tooltip title="Format JSON">
          <Button
            size="small"
            icon={<BracesIcon size={13} />}
            onClick={handlePrettify}
            disabled={contentType !== "json"}
          >
            Prettify
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
