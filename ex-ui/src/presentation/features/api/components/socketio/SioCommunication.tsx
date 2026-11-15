import { Button, Input, Select, message } from "antd";
import { BracesIcon, RssIcon, SendIcon, XIcon } from "lucide-react";
import { useSocketIOStore } from "../../store/socketioStore";

interface SioCommunicationProps {
  onSend: () => void;
  isConnected: boolean;
}

export function SioCommunication({ onSend, isConnected }: SioCommunicationProps) {
  const eventName = useSocketIOStore((s) => s.eventName);
  const messageInput = useSocketIOStore((s) => s.messageInput);
  const contentType = useSocketIOStore((s) => s.contentType);
  const setEventName = useSocketIOStore((s) => s.setEventName);
  const setMessageInput = useSocketIOStore((s) => s.setMessageInput);
  const setContentType = useSocketIOStore((s) => s.setContentType);

  const handlePrettify = () => {
    try {
      setMessageInput(JSON.stringify(JSON.parse(messageInput), null, 2));
    } catch {
      message.error("Invalid JSON");
    }
  };

  return (
    <div className="sio-communication">
      <div className="sio-event-row">
        <RssIcon size={14} className="sio-event-icon" />
        <Input
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Event name"
          size="small"
          prefix={<span className="sio-event-prefix">Event</span>}
          className="sio-event-input"
        />
      </div>

      <textarea
        value={messageInput}
        onChange={(e) => setMessageInput(e.target.value)}
        placeholder='{"message": "hello"}'
        className="sio-message-input"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === "Enter") onSend();
        }}
      />

      <div className="sio-toolbar">
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
          onClick={onSend}
          disabled={!isConnected || !eventName || !messageInput.trim()}
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
        <Button
          size="small"
          icon={<BracesIcon size={13} />}
          onClick={handlePrettify}
          disabled={contentType !== "json"}
        >
          Prettify
        </Button>
      </div>
    </div>
  );
}
