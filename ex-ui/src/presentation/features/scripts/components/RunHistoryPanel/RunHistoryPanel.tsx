import {
  ClockCircleOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Modal, Tag } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";
import type { RunHistory } from "@/core/interfaces/script";
import "./RunHistoryPanel.scss";

dayjs.extend(relativeTime);
dayjs.extend(duration);

const MODE_CONFIG = {
  normal: { icon: <ThunderboltOutlined />, label: "Normal", color: "blue" },
  hidden: { icon: <EyeInvisibleOutlined />, label: "Hidden", color: "default" },
  admin: { icon: <SafetyCertificateOutlined />, label: "Admin", color: "orange" },
};

function formatDuration(start: string, end: string): string {
  if (!end) return "—";
  const ms = dayjs(end).diff(dayjs(start));
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

interface RunHistoryPanelProps {
  history: RunHistory[];
  onClear: () => void;
}

export default function RunHistoryPanel({ history, onClear }: RunHistoryPanelProps) {
  const handleClear = () => {
    Modal.confirm({
      title: "Clear run history?",
      content: "This will permanently delete all run history.",
      okText: "Clear",
      okButtonProps: { danger: true },
      onOk: onClear,
    });
  };

  if (history.length === 0) {
    return (
      <div className="history-empty">
        <ClockCircleOutlined className="history-empty__icon" />
        <span className="history-empty__text">No run history yet</span>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-panel__header">
        <span className="history-panel__count">{history.length} runs</span>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={handleClear}
        >
          Clear
        </Button>
      </div>

      <div className="history-list">
        {history.map((entry) => {
          const modeConf = MODE_CONFIG[entry.mode];
          return (
            <div key={entry.id} className="history-item">
              <div className="history-item__left">
                <span className="history-item__title">{entry.scriptTitle}</span>
                <span className="history-item__meta">
                  {dayjs(entry.startedAt).format("MMM D, HH:mm:ss")} ·{" "}
                  {formatDuration(entry.startedAt, entry.endedAt)}
                </span>
              </div>
              <Tag icon={modeConf.icon} color={modeConf.color}>
                {modeConf.label}
              </Tag>
            </div>
          );
        })}
      </div>
    </div>
  );
}
