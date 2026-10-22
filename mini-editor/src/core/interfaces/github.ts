export interface GithubAccount {
  id?: string;
  userId?: string;
  user_id?: string;
  username: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  avatar_url?: string;
  tokenPreview?: string;
  token_preview?: string;
  scopes?: string[];
  activeRepoOwner?: string;
  active_repo_owner?: string;
  activeRepoName?: string;
  active_repo_name?: string;
  activeRepoBranch?: string;
  active_repo_branch?: string;
  activeRepoUrl?: string;
  active_repo_url?: string;
  workspacePath?: string;
  workspace_path?: string;
  connected: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface GithubRepoItem {
  id: number;
  name: string;
  fullName?: string;
  full_name?: string;
  owner: string;
  description: string;
  private: boolean;
  defaultBranch?: string;
  default_branch?: string;
  htmlUrl?: string;
  html_url?: string;
  cloneUrl?: string;
  clone_url?: string;
  updatedAt?: string;
  updated_at?: string;
}

export type GitFileStatus = "clean" | "modified" | "untracked" | "deleted" | "conflicted" | "CLEAN" | "MODIFIED" | "UNTRACKED" | "DELETED" | "CONFLICTED";

export interface GitFileItem {
  path: string;
  name: string;
  isDir?: boolean;
  is_dir?: boolean;
  size: number;
  modTime?: string;
  mod_time?: string;
  status: GitFileStatus;
}

export interface GitDiffHunk {
  oldStart?: number;
  old_start?: number;
  oldLines?: number;
  old_lines?: number;
  newStart?: number;
  new_start?: number;
  newLines?: number;
  new_lines?: number;
  body: string;
}

export interface GitFileDiff {
  filePath?: string;
  file_path?: string;
  path?: string;
  status: string;
  isBinary?: boolean;
  is_binary?: boolean;
  insertions?: number;
  deletions?: number;
  hunks?: GitDiffHunk[];
  patch?: string;
  oldContent?: string;
  old_content?: string;
  newContent?: string;
  new_content?: string;
}

export interface GitDiffResponse {
  files: GitFileDiff[];
  totalInsertions?: number;
  total_insertions?: number;
  totalDeletions?: number;
  total_deletions?: number;
  isClean?: boolean;
  is_clean?: boolean;
  aheadCommits?: number;
  ahead_commits?: number;
  behindCommits?: number;
  behind_commits?: number;
}

export interface GitCommitItem {
  hash: string;
  shortHash?: string;
  short_hash?: string;
  message: string;
  author?: string;
  author_name?: string;
  authorName?: string;
  email?: string;
  author_email?: string;
  authorEmail?: string;
  timestamp?: string;
  when?: string;
  files?: string[];
}

export interface GitConflictItem {
  path: string;
  isConflicted?: boolean;
  is_conflicted?: boolean;
  baseContent?: string;
  base_content?: string;
  oursContent?: string;
  ours_content?: string;
  theirsContent?: string;
  theirs_content?: string;
  conflictMarkers?: string[];
  conflict_markers?: string[];
}

export interface ConnectGithubRequest {
  token: string;
}

export interface SelectRepoRequest {
  repo_owner: string;
  repo_name: string;
  branch?: string;
  clone_url?: string;
  clone_if_missing?: boolean;

  repoOwner?: string;
  repoName?: string;
  cloneUrl?: string;
  cloneIfMissing?: boolean;
}

export interface CreateRepoRequest {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  autoInit?: boolean;
}

export interface CommitAndPushRequest {
  message?: string;
  files?: string[];
  branch?: string;
  remote?: string;
}

export interface PullRequest {
  remote?: string;
  branch?: string;
}

export interface ResolveConflictRequest {
  filePath?: string;
  file_path?: string;
  strategy: "ours" | "theirs" | "manual";
  manualContent?: string;
  resolved_content?: string;
}

export interface SaveGitFileRequest {
  path: string;
  content: unknown;
  auto_commit?: boolean;
  auto_push?: boolean;
  message?: string;
}

export interface CommitPushResponse {
  commitHash?: string;
  commit_hash?: string;
  shortHash?: string;
  short_hash?: string;
  branch: string;
  filesCommitted?: number;
  files_committed?: number;
  pushed: boolean;
  message: string;
  committedFiles?: string[];
  committed_files?: string[];
}

export interface PullResponse {
  status?: string;
  pulled?: boolean;
  alreadyUpToDate?: boolean;
  hasConflicts?: boolean;
  has_conflict?: boolean;
  conflictedFiles?: unknown[];
  conflicted_files?: unknown[];
  filesUpdated?: string[];
  updated_commits?: number;
  message?: string;
}

export interface ManifestItem {
  id: string;
  type: "doc" | "canvas" | "asset";
  path: string;
  title: string;
  slug?: string;
  size: number;
  updated_at: string;
}

export interface WorkspaceManifest {
  version: string;
  updated_at: string;
  total_docs: number;
  total_canvases: number;
  items: ManifestItem[];
}

export interface CheckFileStatusRequest {
  file_path: string;
  content?: string;
  remote?: string;
  branch?: string;
}

export interface CheckFileStatusResponse {
  file_path: string;
  is_on_git: boolean;
  has_changes: boolean;
  has_conflict: boolean;
  conflict_detail?: string;
  remote_updated: boolean;
  ahead_commits: number;
  behind_commits: number;
  status: "clean" | "modified" | "untracked" | "conflict" | "behind";
}

export interface WorkspaceItemStatus {
  id: string;
  type: "doc" | "canvas" | "file";
  path: string;
  title: string;
  slug?: string;
  size: number;
  updated_at: string;
  status: "uptodate" | "modified" | "conflict" | "behind" | "untracked" | "deleted";
  status_detail?: string;
}

export interface WorkspaceStatusResponse {
  items: WorkspaceItemStatus[];
  total_items: number;
  total_uptodate: number;
  total_modified: number;
  total_conflict: number;
  total_behind: number;
  total_untracked: number;
  ahead_commits: number;
  behind_commits: number;
  active_branch: string;
  is_clean: boolean;
}
