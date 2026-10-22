import { useState, useMemo } from "react";
import { Modal, Segmented, Button, Popconfirm, Tooltip, message, Tag } from "antd";
import {
  FileText,
  Code,
  GitCompare,
  Copy,
  Check,
  Download,
  RotateCcw,
  Clock,
  User,
  GitCommit,
  Calendar,
} from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { workspaceSchema } from "@/presentation/components/BlockNote/useBlockNoteEditor";
import { useGetFileCommitDiffQuery } from "@/infrastructure/api/githubApi";
import { useSelector } from "react-redux";
import type { RootState } from "@/presentation/store";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "@blocknote/mantine/style.css";
import { GitVisualDiffViewer } from "./GitVisualDiffViewer";
import "./DocSnapshotModal.scss";

dayjs.extend(relativeTime);

interface DocSnapshotModalProps {
  open: boolean;
  onClose: () => void;
  filePath: string;
  commitHash: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitDate?: string;
  rawContent: string;
  onRestoreSnapshot?: (content: string) => void;
}

interface ParsedDoc {
  title?: string;
  status?: string | number;
  saved_at?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[];
  isBlockNote: boolean;
  prettyJson: string;
}

function formatDocStatus(status: unknown): { label: string; color: string } | null {
  if (status === undefined || status === null) return null;
  if (status === 1 || status === "1" || status === "published") {
    return { label: "PUBLISHED", color: "green" };
  }
  if (status === 0 || status === "0" || status === "draft") {
    return { label: "DRAFT", color: "blue" };
  }
  return { label: String(status).toUpperCase(), color: "blue" };
}

function parseSnapshotContent(raw: string): ParsedDoc {
  try {
    const parsed = JSON.parse(raw);
    let title: string | undefined;
    let status: string | number | undefined;
    let saved_at: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let blocks: any[] = [];
    let isBlockNote = false;

    if (parsed && typeof parsed === "object") {
      title = typeof parsed.title === "string" ? parsed.title : undefined;
      status = parsed.status;
      saved_at = typeof parsed.saved_at === "string" ? parsed.saved_at : typeof parsed.updated_at === "string" ? parsed.updated_at : undefined;

      if (Array.isArray(parsed.content)) {
        blocks = parsed.content;
        isBlockNote = true;
      } else if (typeof parsed.content === "string") {
        try {
          const inner = JSON.parse(parsed.content);
          if (Array.isArray(inner)) {
            blocks = inner;
            isBlockNote = true;
          }
        } catch {
          // not json blocks
        }
      } else if (Array.isArray(parsed)) {
        blocks = parsed;
        isBlockNote = true;
      }
    }

    return {
      title,
      status,
      saved_at,
      blocks,
      isBlockNote,
      prettyJson: JSON.stringify(parsed, null, 2),
    };
  } catch {
    return {
      blocks: [],
      isBlockNote: false,
      prettyJson: raw,
    };
  }
}

// Dedicated component to initialize a clean read-only BlockNote editor
function SnapshotBlockNoteReader({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks,
  theme,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[];
  theme: "light" | "dark";
}) {
  const initialContent = useMemo(() => (blocks.length > 0 ? blocks : undefined), [blocks]);

  const editor = useCreateBlockNote({
    schema: workspaceSchema,
    initialContent,
  });

  return (
    <div className="snapshot-reader-container">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <BlockNoteView editor={editor as any} editable={false} theme={theme} spellCheck={false} />
    </div>
  );
}

export function DocSnapshotModal({
  open,
  onClose,
  filePath,
  commitHash,
  commitMessage,
  commitAuthor,
  commitDate,
  rawContent,
  onRestoreSnapshot,
}: DocSnapshotModalProps) {
  const theme = useSelector((s: RootState) => s.app.theme) as "light" | "dark";
  const [copiedSha, setCopiedSha] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [viewMode, setViewMode] = useState<"reader" | "raw" | "diff">("reader");
  const [diffBase, setDiffBase] = useState<"parent" | "worktree">("parent");

  const parsedDoc = useMemo(() => parseSnapshotContent(rawContent), [rawContent]);
  const statusInfo = useMemo(() => formatDocStatus(parsedDoc.status), [parsedDoc.status]);

  // Diff query when Diff tab is active
  const { data: diffData, isLoading: isLoadingDiff } = useGetFileCommitDiffQuery(
    { filePath, commitHash, baseCommit: diffBase },
    { skip: !open || viewMode !== "diff" }
  );

  const handleCopySha = () => {
    navigator.clipboard.writeText(commitHash);
    setCopiedSha(true);
    message.success("Đã sao chép Commit SHA");
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(parsedDoc.prettyJson);
    setCopiedContent(true);
    message.success("Đã sao chép nội dung snapshot");
    setTimeout(() => setCopiedContent(false), 2000);
  };

  const handleDownload = () => {
    const filename = filePath.split("/").pop() || "snapshot.json";
    const blob = new Blob([parsedDoc.prettyJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${commitHash.slice(0, 7)}_${filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success("Đã tải snapshot về máy");
  };

  const shortSha = commitHash ? commitHash.slice(0, 7) : "";

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width="90vw"
      style={{ maxWidth: 1040, top: 24 }}
      footer={null}
      destroyOnClose
      className="doc-snapshot-modal"
    >
      {/* Modal Header */}
      <div className="doc-snapshot-modal__header">
        <div className="header-meta-left">
          <div className="commit-badge-row">
            <span className="commit-sha-badge" onClick={handleCopySha} title="Nhấn để copy SHA đầy đủ">
              <GitCommit size={13} />
              <code>{shortSha}</code>
              {copiedSha ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
            </span>
            <span className="file-path-badge">{filePath}</span>
            {statusInfo && (
              <Tag color={statusInfo.color} style={{ margin: 0 }}>
                {statusInfo.label}
              </Tag>
            )}
          </div>
          <div className="commit-msg-text">
            {commitMessage || "Snapshot version"}
          </div>
          <div className="commit-details-sub">
            {commitAuthor && (
              <span className="meta-item">
                <User size={12} />
                <span>{commitAuthor}</span>
              </span>
            )}
            {commitDate && (
              <span className="meta-item" title={dayjs(commitDate).format("YYYY-MM-DD HH:mm:ss")}>
                <Clock size={12} />
                <span>{dayjs(commitDate).fromNow()}</span>
              </span>
            )}
            {parsedDoc.saved_at && (
              <span className="meta-item" title={parsedDoc.saved_at}>
                <Calendar size={12} />
                <span>Saved: {dayjs(parsedDoc.saved_at).format("DD/MM/YYYY HH:mm")}</span>
              </span>
            )}
          </div>
        </div>

        {/* View Mode Segmented */}
        <div className="header-segmented-controls">
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as "reader" | "raw" | "diff")}
            options={[
              {
                value: "reader",
                label: (
                  <span className="segmented-tab-label">
                    <FileText size={14} />
                    <span>Tài liệu (Only View)</span>
                  </span>
                ),
              },
              {
                value: "raw",
                label: (
                  <span className="segmented-tab-label">
                    <Code size={14} />
                    <span>Mã JSON</span>
                  </span>
                ),
              },
              {
                value: "diff",
                label: (
                  <span className="segmented-tab-label">
                    <GitCompare size={14} />
                    <span>Thay đổi (Diff)</span>
                  </span>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Modal Body */}
      <div className="doc-snapshot-modal__body">
        {viewMode === "reader" && (
          <div className="snapshot-reader-view">
            {parsedDoc.title && (
              <div className="snapshot-doc-title">
                <h1>{parsedDoc.title}</h1>
                <div className="only-view-badge">
                  <span>Chế độ xem chỉ đọc (Read-only)</span>
                </div>
              </div>
            )}
            {parsedDoc.isBlockNote ? (
              <SnapshotBlockNoteReader
                key={commitHash}
                blocks={parsedDoc.blocks}
                theme={theme}
              />
            ) : (
              <div className="snapshot-plain-fallback">
                <pre>{parsedDoc.prettyJson}</pre>
              </div>
            )}
          </div>
        )}

        {viewMode === "raw" && (
          <div className="snapshot-raw-view">
            <div className="raw-toolbar">
              <span className="raw-stats">
                {parsedDoc.prettyJson.split("\n").length} dòng • {new Blob([parsedDoc.prettyJson]).size} bytes
              </span>
              <Button
                size="small"
                icon={copiedContent ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                onClick={handleCopyContent}
              >
                {copiedContent ? "Đã chép" : "Sao chép toàn bộ"}
              </Button>
            </div>
            <pre className="raw-code-block">
              <code>{parsedDoc.prettyJson}</code>
            </pre>
          </div>
        )}

        {viewMode === "diff" && (
          <div className="snapshot-diff-view">
            <div className="diff-toolbar">
              <div className="diff-target-switch">
                <span className="diff-label">So sánh với:</span>
                <Segmented
                  size="small"
                  value={diffBase}
                  onChange={(val) => setDiffBase(val as "parent" | "worktree")}
                  options={[
                    { value: "parent", label: "Commit liền trước (Parent)" },
                    { value: "worktree", label: "Phiên bản hiện tại (Worktree)" },
                  ]}
                />
              </div>
            </div>

            <div className="diff-content-container">
              {isLoadingDiff ? (
                <div className="diff-loading">Đang tải phân tích thay đổi…</div>
              ) : diffData ? (
                <GitVisualDiffViewer
                  diff={diffData}
                  filePath={filePath}
                  oldContent={diffData.oldContent || diffData.old_content}
                  newContent={diffData.newContent || diffData.new_content}
                />
              ) : (
                <div className="diff-empty">
                  Không có thay đổi văn bản nào giữa snapshot này và phiên bản so sánh.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Footer */}
      <div className="doc-snapshot-modal__footer">
        <div className="footer-left-actions">
          <Tooltip title="Tải file snapshot về máy">
            <Button icon={<Download size={14} />} onClick={handleDownload}>
              Tải xuống
            </Button>
          </Tooltip>
          <Tooltip title="Sao chép nội dung snapshot">
            <Button icon={<Copy size={14} />} onClick={handleCopyContent}>
              Sao chép nội dung
            </Button>
          </Tooltip>
        </div>

        <div className="footer-right-actions">
          <Button onClick={onClose}>Đóng</Button>
          {onRestoreSnapshot && (
            <Popconfirm
              title="Khôi phục phiên bản này?"
              description="Nội dung editor hiện tại sẽ được thay thế bằng snapshot này. Bạn có muốn tiếp tục?"
              okText="Khôi phục"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                onRestoreSnapshot(rawContent);
                onClose();
              }}
            >
              <Button type="primary" icon={<RotateCcw size={14} />} className="btn-restore-version">
                Khôi phục phiên bản này
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>
    </Modal>
  );
}
