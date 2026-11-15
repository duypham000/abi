import { Tag } from "antd";

interface StatusBarProps {
  status: number;
  statusText: string;
  timeMs: number;
  sizeBytes: number;
  compact?: boolean;
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "processing";
  if (status >= 400 && status < 500) return "warning";
  if (status >= 500) return "error";
  return "default";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function StatusBar({ status, statusText, timeMs, sizeBytes, compact }: StatusBarProps) {
  return (
    <div className={`status-bar${compact ? " status-bar-compact" : ""}`}>
      <Tag color={getStatusColor(status)} className="status-code-tag">
        {status} {statusText}
      </Tag>
      <span className="status-meta">{timeMs} ms</span>
      <span className="status-sep">·</span>
      <span className="status-meta">{formatSize(sizeBytes)}</span>
    </div>
  );
}
