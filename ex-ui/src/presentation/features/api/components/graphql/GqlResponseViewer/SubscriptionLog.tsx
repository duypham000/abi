import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { Trash2Icon } from "lucide-react";
import type { GqlResponseEvent } from "../../../types/graphql";

interface SubscriptionLogProps {
  events: GqlResponseEvent[];
  onClear: () => void;
}

export function SubscriptionLog({ events, onClear }: SubscriptionLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="subscription-log">
      <div className="subscription-log-header">
        <span className="subscription-log-count">{events.length} events</span>
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
      <div className="subscription-log-entries">
        {events.map((event, idx) => {
          const expanded = expandedIdx === idx;
          let preview = "";
          try {
            preview = JSON.stringify(JSON.parse(event.data)).slice(0, 80);
          } catch {
            preview = event.data.slice(0, 80);
          }
          return (
            <div
              key={idx}
              className={`sub-log-entry ${expanded ? "expanded" : ""}`}
              onClick={() => setExpandedIdx(expanded ? null : idx)}
            >
              <div className="sub-log-entry-header">
                <span className="sub-log-idx">#{idx + 1}</span>
                <span className="sub-log-op">{event.operationName}</span>
                <span className="sub-log-preview">{preview}</span>
              </div>
              {expanded && (
                <pre className="sub-log-full">
                  {JSON.stringify(JSON.parse(event.data), null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
