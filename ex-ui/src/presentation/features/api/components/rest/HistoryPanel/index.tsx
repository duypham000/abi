import { Button, Tooltip } from "antd";
import { Trash2Icon } from "lucide-react";
import { useRestStore } from "../../../store/restStore";
import { MethodBadge } from "../../shared/MethodBadge";
import { StatusBar } from "../../shared/StatusBar";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? "?" + u.search : "");
  } catch {
    return url;
  }
}

export function HistoryPanel() {
  const history = useRestStore((s) => s.history);
  const replaceCurrentRequest = useRestStore((s) => s.replaceCurrentRequest);
  const clearHistory = useRestStore((s) => s.clearHistory);

  if (history.length === 0) {
    return (
      <div className="history-empty">
        <p>No history yet.</p>
        <p className="history-hint">Sent requests will appear here.</p>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-count">{history.length} requests</span>
        <Tooltip title="Clear history">
          <Button
            size="small"
            type="text"
            danger
            icon={<Trash2Icon size={12} />}
            onClick={clearHistory}
          />
        </Tooltip>
      </div>
      <ul className="history-list">
        {[...history].reverse().map((item) => (
          <li
            key={item.id}
            className="history-item"
            onClick={() => replaceCurrentRequest(item.request)}
          >
            <div className="history-item-top">
              <MethodBadge method={item.request.method} size="xs" />
              <span className="history-url" title={item.request.url}>
                {shortenUrl(item.request.url)}
              </span>
              <span className="history-time">{formatTime(item.timestamp)}</span>
            </div>
            <div className="history-item-bottom">
              <StatusBar
                status={item.response.status}
                statusText={item.response.statusText}
                timeMs={item.response.timeMs}
                sizeBytes={item.response.sizeBytes}
                compact
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
