import { useState, useMemo } from "react";
import { Drawer, Tooltip, Input, Button, Popconfirm, Tag, message } from "antd";
import {
  useGetFileHistoryQuery,
  useLazyGetFileAtCommitQuery,
} from "@/infrastructure/api/githubApi";
import type { GitCommitItem } from "@/core/interfaces/github";
import {
  GitBranch,
  Clock,
  Search,
  RefreshCw,
  Eye,
  GitCompare,
  RotateCcw,
  Copy,
  Check,
  GitCommit,
} from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { DocSnapshotModal } from "./DocSnapshotModal";
import "./DocGitHistoryDrawer.scss";

dayjs.extend(relativeTime);

interface DocGitHistoryDrawerProps {
  filePath: string;
  open: boolean;
  onClose: () => void;
  onRestoreSnapshot?: (content: string) => void;
}

function getAuthor(c: GitCommitItem): string {
  return c.author || c.author_name || c.authorName || "Unknown";
}

function getEmail(c: GitCommitItem): string {
  return c.email || c.author_email || c.authorEmail || "";
}

function getTimestamp(c: GitCommitItem): string {
  return c.timestamp || c.when || "";
}

function getShortHash(c: GitCommitItem): string {
  return c.shortHash || c.short_hash || c.hash?.slice(0, 7) || "";
}

export function DocGitHistoryDrawer({
  filePath,
  open,
  onClose,
  onRestoreSnapshot,
}: DocGitHistoryDrawerProps) {
  const { data: commits, isLoading, isFetching, refetch } = useGetFileHistoryQuery(filePath, {
    skip: !open || !filePath,
  });

  const [fetchSnapshot, { isFetching: isFetchingSnapshot }] = useLazyGetFileAtCommitQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  // Snapshot modal state
  const [selectedSnapshot, setSelectedSnapshot] = useState<{
    commit: GitCommitItem;
    content: string;
    initialView?: "reader" | "raw" | "diff";
  } | null>(null);

  const filteredCommits = useMemo(() => {
    if (!commits) return [];
    if (!searchQuery.trim()) return commits;
    const q = searchQuery.toLowerCase();
    return commits.filter((c) => {
      const msg = c.message || "";
      const author = getAuthor(c);
      const hash = c.hash || "";
      const shortHash = getShortHash(c);
      return (
        msg.toLowerCase().includes(q) ||
        author.toLowerCase().includes(q) ||
        hash.toLowerCase().includes(q) ||
        shortHash.toLowerCase().includes(q)
      );
    });
  }, [commits, searchQuery]);

  const handleCopySha = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedSha(hash);
    message.success(`Đã sao chép SHA: ${hash.slice(0, 7)}`);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const handleOpenSnapshot = async (commit: GitCommitItem, initialView: "reader" | "raw" | "diff" = "reader") => {
    try {
      const res = await fetchSnapshot({ filePath, commitHash: commit.hash }).unwrap();
      setSelectedSnapshot({
        commit,
        content: res.content,
        initialView,
      });
    } catch (err) {
      console.error("Failed to load commit snapshot:", err);
      message.error("Không thể tải snapshot của commit này");
    }
  };

  return (
    <>
      <Drawer
        title={
          <div className="drawer-header-title">
            <div className="header-left">
              <GitBranch size={16} className="branch-icon" />
              <span className="file-name" title={filePath}>
                {filePath.split("/").pop()}
              </span>
            </div>
            <Tooltip title="Làm mới lịch sử commit">
              <Button
                type="text"
                size="small"
                icon={<RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />}
                onClick={() => refetch()}
              />
            </Tooltip>
          </div>
        }
        placement="right"
        styles={{ wrapper: { width: 480 } }}
        open={open}
        onClose={onClose}
        className="git-history-drawer"
      >
        {/* Subheader info & Search */}
        <div className="git-history-drawer__search-bar">
          <Input
            placeholder="Tìm theo tin nhắn, tác giả hoặc SHA..."
            prefix={<Search size={13} className="search-icon" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            size="small"
          />
          <div className="history-stats-bar">
            <span className="stats-text">
              {commits ? `${filteredCommits.length} / ${commits.length} commits` : "Đang tải…"}
            </span>
            <span className="file-path-sub" title={filePath}>
              {filePath}
            </span>
          </div>
        </div>

        {/* Commit List / Timeline */}
        {isLoading ? (
          <div className="loading-state">
            <RefreshCw size={16} className="animate-spin" style={{ marginBottom: 8 }} />
            <div>Đang tải lịch sử Git commits…</div>
          </div>
        ) : !commits || commits.length === 0 ? (
          <div className="empty-state">
            <GitCommit size={32} opacity={0.3} style={{ marginBottom: 12 }} />
            <div className="empty-title">Chưa có lịch sử commit Git cho file này</div>
            <div className="empty-sub">
              Lưu hoặc commit file lên Git repository để bắt đầu theo dõi lịch sử thay đổi.
            </div>
          </div>
        ) : filteredCommits.length === 0 ? (
          <div className="empty-state">
            <Search size={24} opacity={0.3} style={{ marginBottom: 8 }} />
            <div>Không tìm thấy commit phù hợp với "{searchQuery}"</div>
          </div>
        ) : (
          <div className="git-history-timeline">
            {filteredCommits.map((c, index) => {
              const isHead = index === 0 && !searchQuery;
              const author = getAuthor(c);
              const email = getEmail(c);
              const timestamp = getTimestamp(c);
              const shortHash = getShortHash(c);
              const initial = author.length > 0 ? author.charAt(0).toUpperCase() : "?";

              return (
                <div key={c.hash} className={`git-timeline-node ${isHead ? "is-head" : ""}`}>
                  {/* Timeline dot & line */}
                  <div className="timeline-rail">
                    <div className="timeline-dot" />
                    {index < filteredCommits.length - 1 && <div className="timeline-line" />}
                  </div>

                  {/* Commit Card */}
                  <div className="git-commit-card">
                    <div className="card-top-row">
                      <div className="sha-group">
                        <button
                          className="commit-hash-pill"
                          onClick={(e) => handleCopySha(c.hash, e)}
                          title="Sao chép full SHA"
                        >
                          <code>{shortHash}</code>
                          {copiedSha === c.hash ? (
                            <Check size={11} color="#16a34a" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                        {isHead && (
                          <Tag color="blue" className="head-tag">
                            HEAD
                          </Tag>
                        )}
                      </div>

                      <Tooltip title={timestamp ? dayjs(timestamp).format("dddd, DD/MM/YYYY HH:mm:ss") : ""}>
                        <span className="commit-time">
                          <Clock size={11} />
                          <span>{timestamp ? dayjs(timestamp).fromNow() : ""}</span>
                        </span>
                      </Tooltip>
                    </div>

                    {/* Commit Message */}
                    <div className="commit-message" title={c.message}>
                      {c.message}
                    </div>

                    {/* Commit Footer & Actions */}
                    <div className="card-bottom-row">
                      <div className="commit-author" title={email || author}>
                        <div className="author-avatar">
                          {initial}
                        </div>
                        <span className="author-name">{author}</span>
                      </div>

                      <div className="commit-actions-group">
                        <Tooltip title="So sánh thay đổi của commit này">
                          <button
                            className="btn-action btn-action--diff"
                            onClick={() => handleOpenSnapshot(c, "diff")}
                            disabled={isFetchingSnapshot}
                          >
                            <GitCompare size={12} />
                            <span>Diff</span>
                          </button>
                        </Tooltip>

                        <Tooltip title="Xem snapshot tài liệu ở chế độ chỉ đọc (Only View)">
                          <button
                            className="btn-action btn-action--view"
                            onClick={() => handleOpenSnapshot(c, "reader")}
                            disabled={isFetchingSnapshot}
                          >
                            <Eye size={12} />
                            <span>View Snapshot</span>
                          </button>
                        </Tooltip>

                        {onRestoreSnapshot && (
                          <Popconfirm
                            title="Khôi phục phiên bản này?"
                            description="Tài liệu trong editor sẽ được thay thế bằng snapshot này."
                            okText="Khôi phục"
                            cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                            onConfirm={async () => {
                              try {
                                const res = await fetchSnapshot({ filePath, commitHash: c.hash }).unwrap();
                                onRestoreSnapshot(res.content);
                                onClose();
                              } catch {
                                message.error("Không thể tải snapshot để khôi phục");
                              }
                            }}
                          >
                            <Tooltip title="Khôi phục tài liệu về commit này">
                              <button className="btn-action btn-action--restore">
                                <RotateCcw size={12} />
                              </button>
                            </Tooltip>
                          </Popconfirm>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Drawer>

      {/* Rich Read-Only Snapshot Modal */}
      {selectedSnapshot && (
        <DocSnapshotModal
          open={Boolean(selectedSnapshot)}
          onClose={() => setSelectedSnapshot(null)}
          filePath={filePath}
          commitHash={selectedSnapshot.commit.hash}
          commitMessage={selectedSnapshot.commit.message}
          commitAuthor={getAuthor(selectedSnapshot.commit)}
          commitDate={getTimestamp(selectedSnapshot.commit)}
          rawContent={selectedSnapshot.content}
          onRestoreSnapshot={
            onRestoreSnapshot
              ? (content) => {
                  onRestoreSnapshot(content);
                  setSelectedSnapshot(null);
                  onClose();
                }
              : undefined
          }
        />
      )}
    </>
  );
}
