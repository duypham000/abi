import "./shared.scss";
import { useRef, useState, useEffect } from "react";
import { Button, Tooltip } from "antd";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import type { LogEntry } from "../../types/realtime";

interface RealtimeLogProps {
  entries: LogEntry[];
  onClear: () => void;
  title?: string;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function getEntryClass(entry: LogEntry): string {
  if (entry.event === "connected") return "log-connected";
  if (entry.event === "error") return "log-error";
  if (entry.source === "client") return "log-client";
  if (entry.source === "server") return "log-server";
  return "log-muted";
}

function getPrefix(entry: LogEntry): string {
  if (entry.prefix) return entry.prefix;
  if (entry.source === "client") return "→";
  if (entry.source === "server") return "←";
  return "◉";
}

export function RealtimeLog({ entries, onClear, title = "Log" }: RealtimeLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastEntryRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      lastEntryRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
    if (!atBottom) setAutoScroll(false);
  };

  return (
    <div className="realtime-log">
      <div className="realtime-log-header">
        <span className="log-title">{title}</span>
        <div className="log-actions">
          <Tooltip title="Scroll to top">
            <Button
              size="small"
              type="text"
              icon={<ArrowUpIcon size={12} />}
              onClick={() => containerRef.current?.scrollTo({ top: 0 })}
            />
          </Tooltip>
          <Tooltip title="Scroll to bottom">
            <Button
              size="small"
              type="text"
              icon={<ArrowDownIcon size={12} />}
              onClick={() => {
                lastEntryRef.current?.scrollIntoView();
                setAutoScroll(true);
              }}
            />
          </Tooltip>
          <Tooltip title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}>
            <Button
              size="small"
              type="text"
              icon={<RefreshCwIcon size={12} />}
              style={{ color: autoScroll ? "#52c41a" : "#ff4d4f" }}
              onClick={() => setAutoScroll((v) => !v)}
            />
          </Tooltip>
          <Tooltip title="Clear log">
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2Icon size={12} />}
              onClick={onClear}
            />
          </Tooltip>
        </div>
      </div>

      <div
        className="log-entries"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <div className="log-empty">Waiting for events…</div>
        ) : (
          entries.map((entry, i) => (
            <div
              key={entry.id}
              className={`log-entry ${getEntryClass(entry)}`}
              ref={i === entries.length - 1 ? lastEntryRef : undefined}
            >
              <span className="log-ts">[{formatTs(entry.ts)}]</span>
              {entry.topic && (
                <span className="log-topic">[{entry.topic}]</span>
              )}
              <span className="log-prefix">{getPrefix(entry)}</span>
              <span className="log-payload">{entry.payload}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
