/**
 * WorkspaceStatusBar — VS Code-style status bar (24 px strip at the bottom).
 * Shows: panel count · saving state indicator · panel toggle button.
 */
import { useDispatch, useSelector } from "react-redux";
import { PanelBottomIcon, SaveIcon, GitBranch } from "lucide-react";
import { togglePanel, toggleActiveSidebar } from "@/presentation/store/appSlice";
import type { RootState, AppDispatch } from "@/presentation/store";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { walkComponents } from "../golden/GoldenLayoutHost";
import { useGetGithubUserQuery, useGetGitDiffQuery } from "@/infrastructure/api/githubApi";
import "./WorkspaceStatusBar.scss";

export function WorkspaceStatusBar() {
  const dispatch = useDispatch<AppDispatch>();
  const panelOpen = useSelector((s: RootState) => s.app.panelOpen);
  const activeSidebar = useSelector((s: RootState) => s.app.activeSidebar);
  const { layout } = useGoldenLayout();

  const { data: user } = useGetGithubUserQuery();
  const activeRepoOwner = user?.activeRepoOwner || user?.active_repo_owner || "";
  const activeRepoName = user?.activeRepoName || user?.active_repo_name || "";
  const activeRepoBranch = user?.activeRepoBranch || user?.active_repo_branch || "main";
  const hasGit = user?.connected && !!activeRepoName;
  const { data: diffData } = useGetGitDiffQuery(undefined, { skip: !hasGit });

  let panelCount = 0;
  if (layout?.rootItem) {
    walkComponents(layout.rootItem, () => { panelCount++; });
  }

  const hasSaved = Boolean(localStorage.getItem("tomo-gl-layout"));

  return (
    <div className="workspace-statusbar" role="status" aria-label="Status bar">
      {/* Left: Git branch + panel count + save state */}
      <div className="wsb-left">
        {hasGit && (
          <button
            className={`wsb-btn${activeSidebar === "git" ? " is-active" : ""}`}
            title={`Git Repository: ${activeRepoOwner}/${activeRepoName} (${activeRepoBranch}) — click to toggle Source Control`}
            onClick={() => dispatch(toggleActiveSidebar("git"))}
          >
            <GitBranch size={11} />
            <span>{activeRepoBranch}</span>
            {diffData && (((diffData.aheadCommits || diffData.ahead_commits) ?? 0) > 0 || ((diffData.behindCommits || diffData.behind_commits) ?? 0) > 0) && (
              <span style={{ fontSize: "10px", opacity: 0.85 }}>
                ↑{(diffData.aheadCommits || diffData.ahead_commits) ?? 0} ↓{(diffData.behindCommits || diffData.behind_commits) ?? 0}
              </span>
            )}
            {diffData && (diffData.files?.length ?? 0) > 0 && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#fef08a" }}>
                *{diffData.files?.length}
              </span>
            )}
          </button>
        )}

        <span className="wsb-item" title="Open panels">
          {panelCount} {panelCount === 1 ? "panel" : "panels"}
        </span>
        {hasSaved && (
          <span className="wsb-item wsb-item--muted" title="Layout saved to localStorage">
            <SaveIcon size={10} />
            Layout saved
          </span>
        )}
      </div>

      {/* Right: panel toggle */}
      <div className="wsb-right">
        <button
          className={`wsb-btn${panelOpen ? " is-active" : ""}`}
          title="Toggle bottom panel"
          onClick={() => dispatch(togglePanel())}
        >
          <PanelBottomIcon size={12} />
          Panel
        </button>
      </div>
    </div>
  );
}
