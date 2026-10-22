import { baseApi } from "./baseApi";
import type {
  GithubAccount,
  GithubRepoItem,
  GitDiffResponse,
  GitFileDiff,
  GitCommitItem,
  GitConflictItem,
  GitFileItem,
  ConnectGithubRequest,
  SelectRepoRequest,
  CreateRepoRequest,
  CommitAndPushRequest,
  PullRequest,
  ResolveConflictRequest,
  SaveGitFileRequest,
  CommitPushResponse,
  PullResponse,
  WorkspaceManifest,
  CheckFileStatusRequest,
  CheckFileStatusResponse,
  WorkspaceStatusResponse,
} from "@/core/interfaces/github";

export const githubApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGithubUser: builder.query<GithubAccount, void>({
      query: () => "/github/user",
      providesTags: ["GithubAccount"],
    }),

    connectGithub: builder.mutation<GithubAccount, ConnectGithubRequest>({
      query: (body) => ({
        url: "/github/connect",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GithubAccount", "GitStatus"],
    }),

    disconnectGithub: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: "/github/disconnect",
        method: "DELETE",
      }),
      invalidatesTags: ["GithubAccount", "GitStatus", "GitHistory"],
    }),

    listGithubRepos: builder.query<GithubRepoItem[], void>({
      query: () => "/github/repos",
    }),

    createGithubRepo: builder.mutation<GithubRepoItem, CreateRepoRequest>({
      query: (body) => ({
        url: "/github/repo/create",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GithubAccount"],
    }),

    selectGithubRepo: builder.mutation<GithubAccount, SelectRepoRequest>({
      query: (body) => ({
        url: "/github/repo/select",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GithubAccount", "GitStatus", "GitHistory"],
    }),

    getActiveRepo: builder.query<{ repository: string; workspace_path: string }, void>({
      query: () => "/github/repo/active",
      providesTags: ["GithubAccount"],
    }),

    getGitDiff: builder.query<GitDiffResponse, void>({
      query: () => ({
        url: "/github/repo/diff",
        method: "POST",
      }),
      providesTags: ["GitStatus"],
    }),

    commitAndPush: builder.mutation<CommitPushResponse, CommitAndPushRequest>({
      query: (body) => ({
        url: "/github/repo/commit-and-push",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GitStatus", "GitHistory", "GithubAccount"],
    }),

    pullRepo: builder.mutation<PullResponse, PullRequest | void>({
      query: (body) => ({
        url: "/github/repo/pull",
        method: "POST",
        body: body || {},
      }),
      invalidatesTags: ["GitStatus", "GitHistory", "Doc", "Canvas"],
    }),

    getFileHistory: builder.query<GitCommitItem[], string>({
      query: (filePath) => `/github/repo/file-history?file_path=${encodeURIComponent(filePath)}`,
      providesTags: ["GitHistory"],
    }),

    getFileAtCommit: builder.query<{ content: string; file_path: string; commit_hash: string }, { filePath: string; commitHash: string }>({
      query: ({ filePath, commitHash }) =>
        `/github/repo/file-at-commit?file_path=${encodeURIComponent(filePath)}&commit_hash=${encodeURIComponent(commitHash)}`,
    }),

    getFileCommitDiff: builder.query<
      GitFileDiff,
      { filePath: string; commitHash: string; baseCommit?: string }
    >({
      query: ({ filePath, commitHash, baseCommit }) =>
        `/github/repo/file-diff?file_path=${encodeURIComponent(filePath)}&commit_hash=${encodeURIComponent(commitHash)}${
          baseCommit ? `&base_commit=${encodeURIComponent(baseCommit)}` : ""
        }`,
    }),

    getConflicts: builder.query<{ conflicts: GitConflictItem[] }, void>({
      query: () => "/github/repo/conflicts",
      providesTags: ["GitStatus"],
    }),

    resolveConflict: builder.mutation<{ message: string }, ResolveConflictRequest>({
      query: (body) => ({
        url: "/github/repo/resolve-conflict",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GitStatus", "GitHistory"],
    }),

    saveGitFile: builder.mutation<{ path: string; size: number }, SaveGitFileRequest>({
      query: (body) => ({
        url: "/github/files/save",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GitStatus"],
    }),

    getGitFile: builder.query<{ path: string; content: string; cached_at: string }, string>({
      query: (path) => `/github/files/get?path=${encodeURIComponent(path)}`,
    }),

    listGitFiles: builder.query<GitFileItem[], string | void>({
      query: (dir) => `/github/files/list${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`,
      providesTags: ["GitStatus"],
    }),

    deleteGitFile: builder.mutation<void, string>({
      query: (path) => ({
        url: `/github/files/delete?path=${encodeURIComponent(path)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["GitStatus"],
    }),

    pruneGitCache: builder.mutation<{ pruned_files: string[] }, void>({
      query: () => ({
        url: "/github/cache/prune",
        method: "POST",
      }),
    }),

    getWorkspaceManifest: builder.query<WorkspaceManifest, void>({
      query: () => "/github/workspace/manifest",
      providesTags: ["GitStatus"],
    }),

    checkFileStatus: builder.mutation<CheckFileStatusResponse, CheckFileStatusRequest>({
      query: (body) => ({
        url: "/github/repo/check-file",
        method: "POST",
        body,
      }),
    }),

    getWorkspaceStatus: builder.query<WorkspaceStatusResponse, void>({
      query: () => "/github/workspace/status",
      providesTags: ["GitStatus"],
    }),
  }),
});

export const {
  useGetGithubUserQuery,
  useConnectGithubMutation,
  useDisconnectGithubMutation,
  useListGithubReposQuery,
  useCreateGithubRepoMutation,
  useSelectGithubRepoMutation,
  useGetActiveRepoQuery,
  useGetGitDiffQuery,
  useLazyGetGitDiffQuery,
  useCommitAndPushMutation,
  usePullRepoMutation,
  useGetFileHistoryQuery,
  useLazyGetFileHistoryQuery,
  useGetFileAtCommitQuery,
  useLazyGetFileAtCommitQuery,
  useGetFileCommitDiffQuery,
  useLazyGetFileCommitDiffQuery,
  useGetConflictsQuery,
  useResolveConflictMutation,
  useSaveGitFileMutation,
  useGetGitFileQuery,
  useListGitFilesQuery,
  useDeleteGitFileMutation,
  usePruneGitCacheMutation,
  useGetWorkspaceManifestQuery,
  useCheckFileStatusMutation,
  useGetWorkspaceStatusQuery,
  useLazyGetWorkspaceStatusQuery,
} = githubApi;
