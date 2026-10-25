import { useState } from "react";
import { Select } from "antd";
import {
  useGetGithubUserQuery,
  useConnectGithubMutation,
  useDisconnectGithubMutation,
  useListGithubReposQuery,
  useCreateGithubRepoMutation,
  useSelectGithubRepoMutation,
  usePruneGitCacheMutation,
} from "@/infrastructure/api/githubApi";
import {
  RefreshCw,
  ExternalLink,
  PlusCircle,
  CheckCircle2,
} from "lucide-react";
import "./GithubSection.scss";

export default function GithubSection() {
  const { data: user, isLoading, isError: isUserError } = useGetGithubUserQuery(undefined, {
    // Tránh gọi lại liên tục gây block khi chưa đăng nhập
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });
  const { data: repos, isFetching: isFetchingRepos, refetch: refetchRepos } = useListGithubReposQuery(undefined, {
    skip: !user?.connected,
  });

  const [connectGithub, { isLoading: isConnecting }] = useConnectGithubMutation();
  const [disconnectGithub, { isLoading: isDisconnecting }] = useDisconnectGithubMutation();
  const [selectRepo, { isLoading: isSelecting }] = useSelectGithubRepoMutation();
  const [createRepo, { isLoading: isCreating }] = useCreateGithubRepoMutation();
  const [pruneCache, { isLoading: isPruning }] = usePruneGitCacheMutation();

  const [tokenInput, setTokenInput] = useState("");
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [targetBranch, setTargetBranch] = useState("main");
  const [cloneIfMissing, setCloneIfMissing] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const activeRepoOwner = user?.activeRepoOwner || user?.active_repo_owner || "";
  const activeRepoName = user?.activeRepoName || user?.active_repo_name || "";
  const activeRepoBranch = user?.activeRepoBranch || user?.active_repo_branch || "main";
  const activeWorkspacePath = user?.workspacePath || user?.workspace_path || "";
  const activeAvatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const activeTokenPreview = user?.tokenPreview || user?.token_preview || "";

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    setFeedbackMsg(null);
    try {
      await connectGithub({ token: tokenInput.trim() }).unwrap();
      setTokenInput("");
      setFeedbackMsg({ type: "success", text: "Successfully connected GitHub account!" });
    } catch (err: unknown) {
      setFeedbackMsg({ type: "error", text: (err as { data?: { message?: string } })?.data?.message || "Failed to connect to GitHub" });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disconnect your GitHub account?")) return;
    setFeedbackMsg(null);
    try {
      await disconnectGithub().unwrap();
      setFeedbackMsg({ type: "success", text: "Disconnected GitHub account." });
    } catch (err: unknown) {
      setFeedbackMsg({ type: "error", text: "Failed to disconnect." });
    }
  };

  const handleSelectRepo = async () => {
    if (!selectedRepoFullName) return;
    const parts = selectedRepoFullName.split("/");
    if (parts.length !== 2) return;
    const [repoOwner, repoName] = parts;
    const matched = repos?.find(
      (r) => (r.fullName || r.full_name) === selectedRepoFullName
    );

    setFeedbackMsg(null);
    try {
      await selectRepo({
        repoOwner,
        repoName,
        repo_owner: repoOwner,
        repo_name: repoName,
        branch: targetBranch || "main",
        cloneUrl: matched?.cloneUrl || matched?.clone_url,
        clone_url: matched?.cloneUrl || matched?.clone_url,
        cloneIfMissing,
        clone_if_missing: cloneIfMissing,
      }).unwrap();
      setFeedbackMsg({ type: "success", text: `Active repository set to ${selectedRepoFullName} (${targetBranch})` });
    } catch (err: unknown) {
      setFeedbackMsg({ type: "error", text: (err as { data?: { message?: string } })?.data?.message || "Failed to select repository" });
    }
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setFeedbackMsg(null);
    try {
      const created = await createRepo({
        name: newRepoName.trim(),
        description: newRepoDesc.trim(),
        private: newRepoPrivate,
        autoInit: true,
      }).unwrap();
      setShowCreateForm(false);
      setNewRepoName("");
      setNewRepoDesc("");
      refetchRepos();
      const createdFullName = created.fullName || created.full_name || `${user?.username}/${newRepoName.trim()}`;
      setSelectedRepoFullName(createdFullName);
      setFeedbackMsg({ type: "success", text: `Created repository ${createdFullName}!` });
    } catch (err: unknown) {
      setFeedbackMsg({ type: "error", text: (err as { data?: { message?: string } })?.data?.message || "Failed to create repository" });
    }
  };

  const handlePruneCache = async () => {
    try {
      const res = await pruneCache().unwrap();
      setFeedbackMsg({ type: "success", text: `Pruned ${res.pruned_files?.length || 0} expired files from local cache.` });
    } catch (err: unknown) {
      setFeedbackMsg({ type: "error", text: "Failed to prune cache." });
    }
  };

  if (isLoading && !isUserError) {
    return (
      <div className="github-section">
        <h2 className="settings-section-title">GitHub Integration</h2>
        <div className="settings-card">
          <p style={{ opacity: 0.7 }}>Loading GitHub account status…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="github-section">
      <h2 className="settings-section-title">GitHub Integration</h2>

      {feedbackMsg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 14,
            fontSize: "0.875rem",
            background: feedbackMsg.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            color: feedbackMsg.type === "success" ? "#059669" : "#dc2626",
            border: `1px solid ${feedbackMsg.type === "success" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Account connection card */}
      <div className="settings-card">
        {!user?.connected ? (
          <div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Connect Personal Access Token (PAT)</div>
                <div className="settings-row-desc">
                  Connect your GitHub account using a token with <code>repo</code> and <code>user</code> scopes to enable Git backup, commit/push, and version control.
                </div>
              </div>
            </div>
            <div className="github-input-group">
              <input
                type="password"
                className="github-input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <button
                className="settings-btn"
                onClick={handleConnect}
                disabled={isConnecting || !tokenInput.trim()}
              >
                {isConnecting ? "Connecting…" : "Connect"}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: "0.8rem", opacity: 0.75 }}>
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#2563eb", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                Generate a token on GitHub <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : (
          <div>
            <div className="github-profile-card">
              {activeAvatarUrl && (
                <img src={activeAvatarUrl} alt={user.username} className="github-avatar" />
              )}
              <div className="github-info">
                <div className="github-name">{user.name || user.username}</div>
                <div className="github-username">@{user.username} • Token: {activeTokenPreview || "••••"}</div>
                {user.scopes && user.scopes.length > 0 && (
                  <div className="github-scopes">
                    {user.scopes.map((s) => (
                      <span key={s} className="scope-badge">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="settings-btn-danger"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                title="Disconnect GitHub account"
              >
                {isDisconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Repository Selection Card (only if connected) */}
      {user?.connected && (
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Active Git Repository</div>
              <div className="settings-row-desc">
                Select the GitHub repository where Tomo docs and canvases will be committed and synchronized as JSON files.
              </div>
            </div>
            {activeRepoName ? (
              <span className="repo-badge">
                <CheckCircle2 size={14} /> {activeRepoOwner}/{activeRepoName} ({activeRepoBranch || "main"})
              </span>
            ) : (
              <span style={{ fontSize: "0.85rem", opacity: 0.6 }}>No repository selected</span>
            )}
          </div>

          <div className="github-input-group" style={{ marginTop: 12 }}>
            <Select
              showSearch
              className="github-repo-search-select"
              placeholder="Search or choose repository..."
              optionFilterProp="label"
              filterOption={(input, option) =>
                (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
              }
              value={selectedRepoFullName || (activeRepoOwner && activeRepoName ? `${activeRepoOwner}/${activeRepoName}` : undefined)}
              onChange={(val) => setSelectedRepoFullName(val)}
              style={{ flex: 1, minWidth: 260 }}
              options={repos?.map((r) => {
                const fullName = r.fullName || r.full_name || `${r.owner}/${r.name}`;
                return {
                  value: fullName,
                  label: `${fullName} ${r.private ? "🔒" : "🌐"}`,
                };
              })}
            />
            <input
              type="text"
              className="github-input"
              style={{ maxWidth: 120 }}
              placeholder="Branch (main)"
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
            />
            <button
              className="settings-btn"
              onClick={handleSelectRepo}
              disabled={isSelecting || !selectedRepoFullName}
            >
              {isSelecting ? "Applying…" : "Select"}
            </button>
            <button
              className="settings-btn"
              style={{ background: "transparent", border: "1px solid var(--border-color, #cbd5e1)", color: "var(--text-color, #0f172a)" }}
              onClick={() => refetchRepos()}
              disabled={isFetchingRepos}
              title="Refresh repository list"
            >
              <RefreshCw size={14} className={isFetchingRepos ? "spin" : ""} />
            </button>
          </div>

          <label className="github-checkbox-row">
            <input
              type="checkbox"
              checked={cloneIfMissing}
              onChange={(e) => setCloneIfMissing(e.target.checked)}
            />
            Clone from GitHub or initialize workspace folder automatically if missing
          </label>

          {/* Quick Create Repo button & toggle */}
          <div style={{ marginTop: 12 }}>
            <button
              className="settings-btn"
              style={{ background: "transparent", color: "#2563eb", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <PlusCircle size={14} /> {showCreateForm ? "Cancel new repository" : "Create new repository on GitHub"}
            </button>
          </div>

          {showCreateForm && (
            <div className="create-repo-form">
              <span className="form-title">Create New GitHub Repository</span>
              <input
                type="text"
                className="github-input"
                placeholder="Repository Name (e.g. tomo-notes)"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
              />
              <input
                type="text"
                className="github-input"
                placeholder="Description (optional)"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
              />
              <label className="github-checkbox-row">
                <input
                  type="checkbox"
                  checked={newRepoPrivate}
                  onChange={(e) => setNewRepoPrivate(e.target.checked)}
                />
                Private Repository
              </label>
              <div>
                <button
                  className="settings-btn"
                  onClick={handleCreateRepo}
                  disabled={isCreating || !newRepoName.trim()}
                >
                  {isCreating ? "Creating…" : "Create & Initialize"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Workspace & Cache Maintenance Card (only if connected) */}
      {user?.connected && activeWorkspacePath && (
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Workspace Folder & Lazy Cache</div>
              <div className="settings-row-desc">
                Local Git repository path on backend. Inactive cached files expire after 24 hours (uncommitted changes are safely preserved).
              </div>
              <code className="workspace-path-code">{activeWorkspacePath}</code>
            </div>
            <button
              className="settings-btn"
              style={{ background: "transparent", border: "1px solid var(--border-color, #cbd5e1)", color: "var(--text-color, #0f172a)", whiteSpace: "nowrap" }}
              onClick={handlePruneCache}
              disabled={isPruning}
              title="Prune expired clean cache files"
            >
              {isPruning ? "Pruning…" : "Prune Cache"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
