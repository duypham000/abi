import {
  EyeInvisibleOutlined,
  MoreOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Badge, Dropdown, Modal, Tooltip } from "antd";
import type { MenuProps } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { RunningProcess, Script } from "@/core/interfaces/script";
import "./ScriptCard.scss";

dayjs.extend(relativeTime);

interface ScriptCardProps {
  script: Script;
  runningProcesses: RunningProcess[];
  onRun: (script: Script, mode: "normal" | "hidden" | "admin") => void;
  onEdit: (script: Script) => void;
  onStopAll: (scriptId: string) => void;
  onToggleStartWithWindow: (script: Script) => void;
}

export default function ScriptCard({
  script,
  runningProcesses,
  onRun,
  onEdit,
  onStopAll,
  onToggleStartWithWindow,
}: ScriptCardProps) {
  const runCount = runningProcesses.length;
  const hasRunning = runCount > 0;

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onRun(script, "admin");
    } else {
      onRun(script, "normal");
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onRun(script, "hidden");
  };

  const handleStopAll = () => {
    Modal.confirm({
      title: "Stop all processes",
      content: `Stop all ${runCount} running instance(s) of "${script.title}"?`,
      okText: "Stop all",
      okButtonProps: { danger: true },
      onOk: () => onStopAll(script.id),
    });
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: "Edit script",
      onClick: () => onEdit(script),
    },
    {
      key: "startWithWindow",
      label: script.startWithWindow ? "✓ Start with window" : "Start with window",
      onClick: () => onToggleStartWithWindow(script),
    },
    { type: "divider" },
    {
      key: "stopAll",
      label: "Stop all processes",
      danger: true,
      disabled: !hasRunning,
      onClick: handleStopAll,
    },
  ];

  return (
    <div
      className={`script-card ${hasRunning ? "script-card--running" : ""}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="script-card__header">
        <span className="script-card__title">{script.title}</span>
        <div className="script-card__actions" onClick={(e) => e.stopPropagation()}>
          {hasRunning && (
            <Badge
              count={runCount}
              size="small"
              className="script-card__badge"
            />
          )}
          <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
            <button className="script-card__menu-btn" aria-label="Script options">
              <MoreOutlined />
            </button>
          </Dropdown>
        </div>
      </div>

      {script.description && (
        <p className="script-card__description">{script.description}</p>
      )}

      <pre className="script-card__body">{script.body}</pre>

      <div className="script-card__footer">
        <span className="script-card__updated">
          {dayjs(script.updatedAt).fromNow()}
        </span>
        <div className="script-card__hints">
          <Tooltip title="Left-click: run normally">
            <ThunderboltOutlined className="script-card__hint-icon" />
          </Tooltip>
          <Tooltip title="Right-click: run hidden">
            <EyeInvisibleOutlined className="script-card__hint-icon" />
          </Tooltip>
          <Tooltip title="Ctrl+click: run as admin">
            <SafetyCertificateOutlined className="script-card__hint-icon" />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
