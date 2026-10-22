import type { GitFileDiff } from "@/core/interfaces/github";
import { X, FileCode } from "lucide-react";
import { GitVisualDiffViewer } from "./GitVisualDiffViewer";
import "./GitDiffModal.scss";

interface GitDiffModalProps {
  diff: GitFileDiff | null;
  onClose: () => void;
}

export function GitDiffModal({ diff, onClose }: GitDiffModalProps) {
  if (!diff) return null;

  const displayPath = diff.filePath || diff.file_path || diff.path || "File diff";

  return (
    <div className="git-diff-overlay" onClick={onClose}>
      <div className="git-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="git-diff-header">
          <div className="header-title-group">
            <FileCode size={18} color="#2563eb" />
            <span className="diff-file-path">{displayPath}</span>
            <div className="diff-stats">
              {typeof diff.insertions === "number" && (
                <span className="diff-ins">+{diff.insertions}</span>
              )}
              {typeof diff.deletions === "number" && (
                <span className="diff-dels">-{diff.deletions}</span>
              )}
            </div>
          </div>
          <button className="btn-close" onClick={onClose} title="Đóng diff">
            <X size={18} />
          </button>
        </div>

        <div className="git-diff-body">
          {diff.isBinary || diff.is_binary ? (
            <div className="diff-empty">Binary file changed. Diff not previewable.</div>
          ) : (
            <GitVisualDiffViewer
              diff={diff}
              filePath={displayPath}
              oldContent={diff.oldContent || diff.old_content}
              newContent={diff.newContent || diff.new_content}
            />
          )}
        </div>
      </div>
    </div>
  );
}
