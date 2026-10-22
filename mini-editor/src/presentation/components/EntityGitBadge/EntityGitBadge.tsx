import { GitBranch, HardDrive, AlertTriangle, Edit3, DownloadCloud, PlusCircle } from "lucide-react";
import { Tooltip } from "antd";
import type { EntityGitStatus } from "@/presentation/hooks/useGitTrackedEntities";
import "./EntityGitBadge.scss";

interface EntityGitBadgeProps {
  isOnGit?: boolean;
  gitStatus?: EntityGitStatus;
  size?: number;
  className?: string;
  showLocalOnly?: boolean;
}

export function EntityGitBadge({
  isOnGit,
  gitStatus,
  size = 11,
  className = "",
  showLocalOnly = true,
}: EntityGitBadgeProps) {
  if (isOnGit) {
    if (gitStatus === "conflict") {
      return (
        <Tooltip title="Git: Có xung đột (Conflict) — Cần giải quyết" placement="top">
          <span className={`entity-git-badge entity-git-badge--conflict ${className}`}>
            <AlertTriangle size={size} />
          </span>
        </Tooltip>
      );
    }

    if (gitStatus === "modified") {
      return (
        <Tooltip title="Git: Có thay đổi cục bộ (Chưa commit)" placement="top">
          <span className={`entity-git-badge entity-git-badge--modified ${className}`}>
            <Edit3 size={size} />
          </span>
        </Tooltip>
      );
    }

    if (gitStatus === "behind") {
      return (
        <Tooltip title="Git: Có bản cập nhật trên remote (Chưa pull)" placement="top">
          <span className={`entity-git-badge entity-git-badge--behind ${className}`}>
            <DownloadCloud size={size} />
          </span>
        </Tooltip>
      );
    }

    if (gitStatus === "untracked") {
      return (
        <Tooltip title="Git: File mới chưa commit" placement="top">
          <span className={`entity-git-badge entity-git-badge--untracked ${className}`}>
            <PlusCircle size={size} />
          </span>
        </Tooltip>
      );
    }

    // Default clean Git tracked item
    return (
      <Tooltip title="Đã liên kết Git repository (Đồng bộ)" placement="top">
        <span className={`entity-git-badge entity-git-badge--git ${className}`}>
          <GitBranch size={size} />
        </span>
      </Tooltip>
    );
  }

  // Not on Git (Local only)
  if (!showLocalOnly) return null;

  return (
    <Tooltip title="Chỉ lưu ở local (Chưa đẩy lên Git)" placement="top">
      <span className={`entity-git-badge entity-git-badge--local ${className}`}>
        <HardDrive size={size} />
      </span>
    </Tooltip>
  );
}
