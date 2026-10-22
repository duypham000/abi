import { useState, useMemo } from "react";
import {
  useGetGithubUserQuery,
  useGetGitDiffQuery,
  useCommitAndPushMutation,
  usePullRepoMutation,
  useGetConflictsQuery,
  useGetWorkspaceStatusQuery,
} from "@/infrastructure/api/githubApi";
import type { GitFileDiff, WorkspaceItemStatus } from "@/core/interfaces/github";
import {
  GitBranch,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  FileCheck2,
  AlertTriangle,
  FolderGit2,
  FileText,
  Layout,
  FileCode2,
  Edit3,
  PlusCircle,
  Trash2,
  Search,
  X,
  History,
} from "lucide-react";
import { Tooltip } from "antd";
import { GitDiffModal } from "@/presentation/features/git/components/GitDiffModal";
import { GitConflictModal } from "@/presentation/features/git/components/GitConflictModal";
import { DocGitHistoryDrawer } from "@/presentation/features/git/components/DocGitHistoryDrawer";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES, PANEL_TITLES } from "@/presentation/layout/golden/panelRegistry";
import "./GitPanel.scss";

export function GitPanel() {
  const { openPanel } = useGoldenLayout();
  const { data: user, isLoading: isUserLoading } = useGetGithubUserQuery();
  const activeRepoOwner = user?.activeRepoOwner || user?.active_repo_owner || "";
  const activeRepoName = user?.activeRepoName || user?.active_repo_name || "";
  const activeRepoBranch = user?.activeRepoBranch || user?.active_repo_branch || "main";
  const isConnected = user?.connected && !!activeRepoName;

  const {
    data: workspaceStatus,
    isLoading: isStatusLoading,
    isFetching: isStatusFetching,
    refetch: refetchStatus,
  } = useGetWorkspaceStatusQuery(undefined, { skip: !isConnected });

  const {
    data: diffData,
    isFetching: isDiffFetching,
    refetch: refetchDiff,
  } = useGetGitDiffQuery(undefined, { skip: !isConnected });

  const { data: conflictsData, refetch: refetchConflicts } = useGetConflictsQuery(undefined, {
    skip: !isConnected,
  });

  const [commitAndPush, { isLoading: isCommitting }] = useCommitAndPushMutation();
  const [pullRepo, { isLoading: isPulling }] = usePullRepoMutation();

  const [commitMessage, setCommitMessage] = useState("");
  const [activeDiff, setActiveDiff] = useState<GitFileDiff | null>(null);
  const [historyFilePath, setHistoryFilePath] = useState<string | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [panelMessage, setPanelMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "changes" | "uptodate">("all");

  const conflicts = conflictsData?.conflicts || [];
  const hasConflicts = conflicts.length > 0 || (workspaceStatus?.total_conflict ?? 0) > 0;
  const changes = diffData?.files || [];
  const ahead = workspaceStatus?.ahead_commits ?? diffData?.aheadCommits ?? 0;
  const behind = workspaceStatus?.behind_commits ?? diffData?.behindCommits ?? 0;

  const allItems = useMemo(() => workspaceStatus?.items || [], [workspaceStatus?.items]);
  const totalItems = workspaceStatus?.total_items ?? allItems.length;
  const totalUptodate = workspaceStatus?.total_uptodate ?? allItems.filter((i) => i.status === "uptodate").length;
  const changesCount = totalItems - totalUptodate;

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (filterTab === "changes" && item.status === "uptodate") return false;
      if (filterTab === "uptodate" && item.status !== "uptodate") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [allItems, filterTab, searchQuery]);

  const handleRefresh = () => {
    refetchStatus();
    refetchDiff();
    refetchConflicts();
  };

  const handlePull = async () => {
    setPanelMessage(null);
    try {
      const res = await pullRepo().unwrap();
      if (res.hasConflicts || res.has_conflict) {
        setPanelMessage({ type: "error", text: "Merge conflicts detected during pull!" });
        setShowConflictModal(true);
      } else if (res.alreadyUpToDate) {
        setPanelMessage({ type: "success", text: "Already up to date with remote." });
      } else {
        setPanelMessage({ type: "success", text: `Pulled updated files from GitHub.` });
      }
      handleRefresh();
    } catch {
      setPanelMessage({ type: "error", text: "Failed to pull from remote." });
    }
  };

  const generateDefaultCommitMessage = (): string => {
    if (changes.length === 0) return "Update workspace";
    if (changes.length === 1) {
      const file = changes[0];
      const path = file.filePath || file.file_path || "file";
      const fileName = path.split("/").pop() || path;
      if (file.status === "untracked") return `Add ${fileName}`;
      if (file.status === "deleted") return `Delete ${fileName}`;
      return `Update ${fileName}`;
    }
    const summary = changes
      .slice(0, 2)
      .map((f) => {
        const p = f.filePath || f.file_path || "file";
        return p.split("/").pop() || p;
      })
      .join(", ");
    const rest = changes.length > 2 ? ` and ${changes.length - 2} other file(s)` : "";
    return `Update ${summary}${rest}`;
  };

  const handleCommit = async (push: boolean) => {
    if (changes.length === 0 && (workspaceStatus?.total_modified ?? 0) === 0 && (workspaceStatus?.total_untracked ?? 0) === 0) return;
    const finalMessage = commitMessage.trim() || generateDefaultCommitMessage();
    setPanelMessage(null);
    try {
      const res = await commitAndPush({
        message: finalMessage,
      }).unwrap();
      setCommitMessage("");
      const shortHash = res.shortHash || res.short_hash || "";
      setPanelMessage({
        type: "success",
        text: push && res.pushed
          ? `Committed & pushed ${shortHash} to ${res.branch}`
          : `Committed ${shortHash} locally`,
      });
      handleRefresh();
    } catch (err: unknown) {
      setPanelMessage({
        type: "error",
        text: (err as { data?: { message?: string } })?.data?.message || "Failed to commit changes",
      });
    }
  };

  const handleItemClick = (item: WorkspaceItemStatus) => {
    if (item.status === "conflict") {
      setShowConflictModal(true);
      return;
    }
    if (item.status === "behind") {
      handlePull();
      return;
    }
    if (item.status === "modified" || item.status === "untracked") {
      const diff = changes.find((c) => (c.filePath || c.file_path) === item.path);
      if (diff) {
        setActiveDiff(diff);
        return;
      }
    }
    if (item.type === "doc" || item.path.startsWith("docs/doc-")) {
      const numericId = Number(item.id.replace("doc-", ""));
      if (!isNaN(numericId)) {
        openPanel(PANEL_TYPES.DOC_EDITOR, { docId: numericId }, { title: item.title, singleton: true });
        return;
      }
    }
    if (item.type === "canvas" || item.path.startsWith("canvases/canvas-")) {
      const canvasId = item.id.replace("canvas-", "");
      openPanel(PANEL_TYPES.CANVAS_EDITOR, { canvasId }, { title: item.title, singleton: true });
      return;
    }
  };

  if (isUserLoading) {
    return (
      <div className="git-panel">
        <div style={{ padding: 20, color: "var(--text-muted, #64748b)" }}>Loading Git status…</div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="git-panel">
        <div className="git-panel__header">
          <div className="git-panel__title-group">
            <span className="git-panel__title">Source Control</span>
          </div>
        </div>
        <div className="git-panel__not-connected">
          <FolderGit2 size={36} style={{ marginBottom: 12, opacity: 0.6 }} />
          <p>GitHub account is not connected or no repository is selected.</p>
          <button
            className="btn-connect-link"
            onClick={() =>
              openPanel(PANEL_TYPES.SETTINGS, { section: "github" }, { title: PANEL_TITLES[PANEL_TYPES.SETTINGS], singleton: true })
            }
          >
            Configure in Settings
          </button>
        </div>
      </div>
    );
  }

  const isRefreshing = isStatusFetching || isDiffFetching;

  return (
    <div className="git-panel">
      {/* Header */}
      <div className="git-panel__header">
        <div className="git-panel__title-group">
          <span className="git-panel__title">Source Control</span>
          <span className="git-panel__repo-name">
            <FolderGit2 size={13} color="#2563eb" />
            {activeRepoOwner}/{activeRepoName}
          </span>
        </div>
        <div className="git-panel__actions">
          <button
            className="git-btn-icon"
            onClick={handlePull}
            disabled={isPulling}
            title="Pull from origin"
          >
            <DownloadCloud size={14} className={isPulling ? "spin" : ""} />
          </button>
          <button
            className="git-btn-icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh changes"
          >
            <RefreshCw size={14} className={isRefreshing ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Branch & Sync Info Bar */}
      <div className="git-panel__branch-row">
        <span className="branch-badge">
          <GitBranch size={13} />
          {activeRepoBranch}
        </span>
        <div className="sync-counter" title="Commits ahead / behind remote origin">
          <span title={`${ahead} commit(s) ahead`}>↑{ahead}</span>
          <span title={`${behind} commit(s) behind`}>↓{behind}</span>
        </div>
      </div>

      {/* Conflict Alert Banner */}
      {hasConflicts && (
        <div className="git-panel__conflict-banner">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} />
            {conflicts.length || workspaceStatus?.total_conflict} conflict(s)
          </span>
          <button
            className="btn-resolve-conflicts"
            onClick={() => setShowConflictModal(true)}
          >
            Resolve
          </button>
        </div>
      )}

      {/* Status feedback message */}
      {panelMessage && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: "0.775rem",
            background: panelMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: panelMessage.type === "success" ? "#166534" : "#991b1b",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          {panelMessage.text}
        </div>
      )}

      {/* Commit Input Box */}
      <div className="git-panel__commit-box">
        <textarea
          className="commit-textarea"
          placeholder={
            changesCount > 0
              ? `Message (Ctrl+Enter to commit)`
              : "Message (Ctrl+Enter to commit)"
          }
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              handleCommit(true);
            }
          }}
        />
        <div className="commit-actions">
          <button
            className="btn-commit-push"
            onClick={() => handleCommit(true)}
            disabled={isCommitting || changesCount === 0}
            title={commitMessage.trim() ? "Commit & Push to GitHub" : `Commit & Push (auto-message: "${generateDefaultCommitMessage()}")`}
          >
            <UploadCloud size={13} />
            {isCommitting ? "Pushing…" : "Commit & Push"}
          </button>
          <button
            className="btn-commit-only"
            onClick={() => handleCommit(false)}
            disabled={isCommitting || changesCount === 0}
            title="Commit changes locally without pushing to remote"
          >
            Commit
          </button>
        </div>
      </div>

      {/* Section Header with Tabs */}
      <div className="git-panel__section-header">
        <div className="section-title">
          <span>Workspace Files</span>
          <span className="count-pill">{filteredItems.length}</span>
        </div>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filterTab === "all" ? "filter-tab--active" : ""}`}
            onClick={() => setFilterTab("all")}
            title="All files in repository"
          >
            All ({totalItems})
          </button>
          <button
            className={`filter-tab ${filterTab === "changes" ? "filter-tab--active" : ""}`}
            onClick={() => setFilterTab("changes")}
            title="Files with local changes, remote updates, or conflicts"
          >
            Changes ({changesCount})
          </button>
          <button
            className={`filter-tab ${filterTab === "uptodate" ? "filter-tab--active" : ""}`}
            onClick={() => setFilterTab("uptodate")}
            title="Files up-to-date with Git"
          >
            Clean ({totalUptodate})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="git-panel__search-row">
        <div className="search-input-wrapper">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search workspace files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Workspace Items List */}
      <div className="git-panel__items-list">
        {isStatusLoading ? (
          <div className="loading-state">Loading workspace items…</div>
        ) : filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            return (
              <div
                key={item.path}
                className={`git-item-row git-item-row--${item.status}`}
                onClick={() => handleItemClick(item)}
                title={`${item.title} (${item.path})${item.status_detail ? ` — ${item.status_detail}` : ""}`}
              >
                <div className="git-item-row__left">
                  <span className="git-item-row__icon">
                    {item.type === "doc" ? (
                      <FileText size={14} className="type-icon type-icon--doc" />
                    ) : item.type === "canvas" ? (
                      <Layout size={14} className="type-icon type-icon--canvas" />
                    ) : (
                      <FileCode2 size={14} className="type-icon type-icon--file" />
                    )}
                  </span>
                  <span className="git-item-row__title">
                    {item.title || item.path}
                  </span>
                </div>

                <div className="git-item-row__right">
                  {item.status === "conflict" && (
                    <Tooltip title="Xung đột Git (Conflict) — Nhấn để giải quyết" placement="left">
                      <span className="git-status-icon git-status-icon--conflict">
                        <AlertTriangle size={14} />
                      </span>
                    </Tooltip>
                  )}
                  {item.status === "modified" && (
                    <Tooltip title="Có thay đổi cục bộ (Chưa commit) — Nhấn để xem diff" placement="left">
                      <span className="git-status-icon git-status-icon--modified">
                        <Edit3 size={14} />
                      </span>
                    </Tooltip>
                  )}
                  {item.status === "behind" && (
                    <Tooltip title="Nội dung trên Git đã cập nhật (Chưa pull về) — Nhấn để pull" placement="left">
                      <span className="git-status-icon git-status-icon--behind">
                        <DownloadCloud size={14} />
                      </span>
                    </Tooltip>
                  )}
                  {item.status === "untracked" && (
                    <Tooltip title="File mới chưa có trên Git" placement="left">
                      <span className="git-status-icon git-status-icon--untracked">
                        <PlusCircle size={14} />
                      </span>
                    </Tooltip>
                  )}
                  {item.status === "deleted" && (
                    <Tooltip title="Đã xóa khỏi thư mục làm việc" placement="left">
                      <span className="git-status-icon git-status-icon--deleted">
                        <Trash2 size={14} />
                      </span>
                    </Tooltip>
                  )}
                  {/* Lịch sử commit Git của file */}
                  <Tooltip title="Xem lịch sử Git của file" placement="left">
                    <button
                      className="git-item-history-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistoryFilePath(item.path);
                      }}
                    >
                      <History size={13} />
                    </button>
                  </Tooltip>
                  {/* Nếu uptodate: Không hiển thị icon nào dóng phải theo đúng yêu cầu */}
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <FileCheck2 size={24} />
            <div>
              {searchQuery
                ? "No matching items found"
                : filterTab === "changes"
                ? "All files are up to date"
                : "No files found in Git workspace"}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeDiff && (
        <GitDiffModal diff={activeDiff} onClose={() => setActiveDiff(null)} />
      )}
      {showConflictModal && (
        <GitConflictModal onClose={() => { setShowConflictModal(false); handleRefresh(); }} />
      )}
      {historyFilePath && (
        <DocGitHistoryDrawer
          filePath={historyFilePath}
          open={Boolean(historyFilePath)}
          onClose={() => setHistoryFilePath(null)}
        />
      )}
    </div>
  );
}
