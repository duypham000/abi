import {
  CloseOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Button, Modal, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { RunningProcess } from "@/core/interfaces/script";
import "./RunningProcessPanel.scss";

dayjs.extend(relativeTime);

interface RunningProcessPanelProps {
  processes: RunningProcess[];
  onKill: (instanceId: string) => void;
  onShow: (instanceId: string) => void;
  onHide: (instanceId: string) => void;
  onRestart: (instanceId: string, asAdmin?: boolean) => void;
}

export default function RunningProcessPanel({
  processes,
  onKill,
  onShow,
  onHide,
  onRestart,
}: RunningProcessPanelProps) {
  if (processes.length === 0) {
    return (
      <div className="running-empty">
        <span className="running-empty__text">No running processes</span>
      </div>
    );
  }

  const handleKill = (proc: RunningProcess) => {
    Modal.confirm({
      title: "Kill process?",
      content: `Stop "${proc.scriptTitle}" (PID ${proc.pid})?`,
      okText: "Kill",
      okButtonProps: { danger: true },
      onOk: () => onKill(proc.instanceId),
    });
  };

  return (
    <div className="running-list">
      {processes.map((proc) => (
        <div key={proc.instanceId} className="running-item">
          <div className="running-item__left">
            <div className="running-item__title-row">
              <span className="running-item__title">{proc.scriptTitle}</span>
              <div className="running-item__tags">
                {proc.isAdmin && (
                  <Tag icon={<SafetyCertificateOutlined />} color="orange">
                    Admin
                  </Tag>
                )}
                {proc.isHidden && (
                  <Tag icon={<EyeInvisibleOutlined />} color="default">
                    Hidden
                  </Tag>
                )}
              </div>
            </div>
            <span className="running-item__meta">
              PID {proc.pid} · started {dayjs(proc.startedAt).fromNow()}
            </span>
          </div>

          <div className="running-item__actions">
            {!proc.isHidden ? (
              <Tooltip title="Hide window">
                <Button
                  size="small"
                  icon={<EyeInvisibleOutlined />}
                  onClick={() => onHide(proc.instanceId)}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Show window">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => onShow(proc.instanceId)}
                />
              </Tooltip>
            )}

            <Tooltip title="Restart">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => onRestart(proc.instanceId)}
              />
            </Tooltip>

            <Tooltip title="Restart as Admin">
              <Button
                size="small"
                icon={<SafetyCertificateOutlined />}
                onClick={() => onRestart(proc.instanceId, true)}
              />
            </Tooltip>

            <Tooltip title="Kill process">
              <Button
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => handleKill(proc)}
              />
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
}
