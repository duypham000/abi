import type { BaseQueryApi, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
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
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import {
  clearCachedResourcesByPrefix,
  getCachedResource,
  removeCachedResource,
  RESOURCE_CACHE_KEYS,
  RESOURCE_CACHE_TTLS,
  setCachedResource,
} from "@/infrastructure/tauri/resourceCacheService";

const REVALIDATE_COOLDOWN_MS = 10_000;
const lastRevalidateAt = new Map<string, number>();
const inFlightRevalidations = new Map<string, Promise<void>>();

function invalidateRevalidateCooldown(...keys: string[]) {
  for (const key of keys) {
    lastRevalidateAt.delete(key);
  }
}

type GithubCachedEndpoint =
  | "getGithubUser"
  | "listGithubRepos"
  | "getWorkspaceStatus"
  | "getWorkspaceManifest"
  | "getGitDiff"
  | "getConflicts";

async function swrGithubQuery<T>(
  opts: {
    cacheKey: string;
    ttlMs: number;
    endpointName: GithubCachedEndpoint;
    fetchArgs: string | FetchArgs;
    guestFallback?: T;
  },
  api: BaseQueryApi,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchWithBaseQuery: (arg: string | FetchArgs) => any
): Promise<{ data: T } | { error: FetchBaseQueryError }> {
  const { cacheKey, ttlMs, endpointName, fetchArgs, guestFallback } = opts;
  const cached = await getCachedResource<T>(cacheKey);

  const revalidate = async () => {
    const existing = inFlightRevalidations.get(cacheKey);
    if (existing) return existing;

    const task = (async () => {
      try {
        const token = await getAccessToken();
        if (!token || token === "local-standalone-token") return;
        lastRevalidateAt.set(cacheKey, Date.now());
        const res = await fetchWithBaseQuery(fetchArgs);
        if (res?.data !== undefined && !res?.error) {
          const fresh = res.data as T;
          await setCachedResource(cacheKey, fresh, ttlMs);
          api.dispatch(githubApi.util.upsertQueryData(endpointName, undefined, fresh as never));
        }
      } catch {
        // keep cached data on offline/network errors
      } finally {
        inFlightRevalidations.delete(cacheKey);
      }
    })();

    inFlightRevalidations.set(cacheKey, task);
    return task;
  };

  if (cached) {
    const last = lastRevalidateAt.get(cacheKey) ?? 0;
    if (cached.isExpired || Date.now() - last > REVALIDATE_COOLDOWN_MS) {
      setTimeout(() => {
        void revalidate();
      }, 0);
    }
    return { data: cached.data };
  }

  const token = await getAccessToken();
  if (!token || token === "local-standalone-token") {
    if (guestFallback !== undefined) {
      return { data: guestFallback };
    }
    return {
      error: {
        status: 401,
        data: { message: "Chưa đăng nhập" },
      },
    };
  }

  lastRevalidateAt.set(cacheKey, Date.now());
  const res = await fetchWithBaseQuery(fetchArgs);
  if (res?.data !== undefined && !res?.error) {
    const fresh = res.data as T;
    await setCachedResource(cacheKey, fresh, ttlMs);
    return { data: fresh };
  }
  return { error: res?.error as FetchBaseQueryError };
}

export const githubApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGithubUser: builder.query<GithubAccount, void>({
      queryFn: (_arg, api, _extraOptions, fetchWithBaseQuery) =>
        swrGithubQuery<GithubAccount>(
          {
            cacheKey: RESOURCE_CACHE_KEYS.GITHUB_USER,
            ttlMs: RESOURCE_CACHE_TTLS.GITHUB_USER,
            endpointName: "getGithubUser",
            fetchArgs: "/github/user",
            guestFallback: { connected: false, username: "" },
          },
          api,
          fetchWithBaseQuery
        ),
      providesTags: ["GithubAccount"],
    }),

    connectGithub: builder.mutation<GithubAccount, ConnectGithubRequest>({
      query: (body) => ({
        url: "/github/connect",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          await setCachedResource(
            RESOURCE_CACHE_KEYS.GITHUB_USER,
            data,
            RESOURCE_CACHE_TTLS.GITHUB_USER
          );
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_USER,
            RESOURCE_CACHE_KEYS.GITHUB_REPOS,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GithubAccount", "GitStatus"],
    }),

    disconnectGithub: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: "/github/disconnect",
        method: "DELETE",
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          await clearCachedResourcesByPrefix("github:");
          lastRevalidateAt.clear();
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GithubAccount", "GitStatus", "GitHistory"],
    }),

    listGithubRepos: builder.query<GithubRepoItem[], void>({
      queryFn: (_arg, api, _extraOptions, fetchWithBaseQuery) =>
        swrGithubQuery<GithubRepoItem[]>(
          {
            cacheKey: RESOURCE_CACHE_KEYS.GITHUB_REPOS,
            ttlMs: RESOURCE_CACHE_TTLS.GITHUB_REPOS,
            endpointName: "listGithubRepos",
            fetchArgs: "/github/repos",
            guestFallback: [],
          },
          api,
          fetchWithBaseQuery
        ),
    }),

    createGithubRepo: builder.mutation<GithubRepoItem, CreateRepoRequest>({
      query: (body) => ({
        url: "/github/repo/create",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          await removeCachedResource(RESOURCE_CACHE_KEYS.GITHUB_REPOS);
          invalidateRevalidateCooldown(RESOURCE_CACHE_KEYS.GITHUB_REPOS);
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GithubAccount"],
    }),

    selectGithubRepo: builder.mutation<GithubAccount, SelectRepoRequest>({
      query: (body) => ({
        url: "/github/repo/select",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          await setCachedResource(
            RESOURCE_CACHE_KEYS.GITHUB_USER,
            data,
            RESOURCE_CACHE_TTLS.GITHUB_USER
          );
          await Promise.all([
            removeCachedResource(RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS),
            removeCachedResource(RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST),
            removeCachedResource(RESOURCE_CACHE_KEYS.GITHUB_DIFF),
            removeCachedResource(RESOURCE_CACHE_KEYS.GITHUB_CONFLICTS),
          ]);
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_USER,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF,
            RESOURCE_CACHE_KEYS.GITHUB_CONFLICTS
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GithubAccount", "GitStatus", "GitHistory"],
    }),

    getActiveRepo: builder.query<{ repository: string; workspace_path: string }, void>({
      query: () => "/github/repo/active",
      providesTags: ["GithubAccount"],
    }),

    getGitDiff: builder.query<GitDiffResponse, void>({
      queryFn: (_arg, api, _extraOptions, fetchWithBaseQuery) =>
        swrGithubQuery<GitDiffResponse>(
          {
            cacheKey: RESOURCE_CACHE_KEYS.GITHUB_DIFF,
            ttlMs: RESOURCE_CACHE_TTLS.GITHUB_DIFF,
            endpointName: "getGitDiff",
            fetchArgs: { url: "/github/repo/diff", method: "POST" },
            guestFallback: { files: [], isClean: true },
          },
          api,
          fetchWithBaseQuery
        ),
      providesTags: ["GitStatus"],
    }),

    commitAndPush: builder.mutation<CommitPushResponse, CommitAndPushRequest>({
      query: (body) => ({
        url: "/github/repo/commit-and-push",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF,
            RESOURCE_CACHE_KEYS.GITHUB_CONFLICTS
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GitStatus", "GitHistory", "GithubAccount"],
    }),

    pullRepo: builder.mutation<PullResponse, PullRequest | void>({
      query: (body) => ({
        url: "/github/repo/pull",
        method: "POST",
        body: body || {},
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF,
            RESOURCE_CACHE_KEYS.GITHUB_CONFLICTS
          );
        } catch {
          // ignore
        }
      },
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
      queryFn: (_arg, api, _extraOptions, fetchWithBaseQuery) =>
        swrGithubQuery<{ conflicts: GitConflictItem[] }>(
          {
            cacheKey: RESOURCE_CACHE_KEYS.GITHUB_CONFLICTS,
            ttlMs: RESOURCE_CACHE_TTLS.GITHUB_CONFLICTS,
            endpointName: "getConflicts",
            fetchArgs: "/github/repo/conflicts",
            guestFallback: { conflicts: [] },
          },
          api,
          fetchWithBaseQuery
        ),
      providesTags: ["GitStatus"],
    }),

    resolveConflict: builder.mutation<{ message: string }, ResolveConflictRequest>({
      query: (body) => ({
        url: "/github/repo/resolve-conflict",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF,
            RESOURCE_CACHE_KEYS.GITHUB_CONFLICTS
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GitStatus", "GitHistory"],
    }),

    saveGitFile: builder.mutation<{ path: string; size: number }, SaveGitFileRequest>({
      query: (body) => ({
        url: "/github/files/save",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF
          );
        } catch {
          // ignore
        }
      },
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
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["GitStatus"],
    }),

    pruneGitCache: builder.mutation<{ pruned_files: string[] }, void>({
      query: () => ({
        url: "/github/cache/prune",
        method: "POST",
      }),
    }),

    getWorkspaceManifest: builder.query<WorkspaceManifest, void>({
      queryFn: (_arg, api, _extraOptions, fetchWithBaseQuery) =>
        swrGithubQuery<WorkspaceManifest>(
          {
            cacheKey: RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST,
            ttlMs: RESOURCE_CACHE_TTLS.GITHUB_WORKSPACE_MANIFEST,
            endpointName: "getWorkspaceManifest",
            fetchArgs: "/github/workspace/manifest",
            guestFallback: {
              version: "1",
              updated_at: "",
              total_docs: 0,
              total_canvases: 0,
              items: [],
            },
          },
          api,
          fetchWithBaseQuery
        ),
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
      queryFn: (_arg, api, _extraOptions, fetchWithBaseQuery) =>
        swrGithubQuery<WorkspaceStatusResponse>(
          {
            cacheKey: RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            ttlMs: RESOURCE_CACHE_TTLS.GITHUB_WORKSPACE_STATUS,
            endpointName: "getWorkspaceStatus",
            fetchArgs: "/github/workspace/status",
            guestFallback: {
              items: [],
              total_items: 0,
              total_uptodate: 0,
              total_modified: 0,
              total_conflict: 0,
              total_behind: 0,
              total_untracked: 0,
              ahead_commits: 0,
              behind_commits: 0,
              active_branch: "main",
              is_clean: true,
            },
          },
          api,
          fetchWithBaseQuery
        ),
      providesTags: ["GitStatus"],
    }),

    syncWorkspace: builder.mutation<{ message: string; warning?: string }, void>({
      query: () => ({
        url: "/github/workspace/sync",
        method: "POST",
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          invalidateRevalidateCooldown(
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_STATUS,
            RESOURCE_CACHE_KEYS.GITHUB_WORKSPACE_MANIFEST,
            RESOURCE_CACHE_KEYS.GITHUB_DIFF
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["Doc", "GitStatus"],
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
  useSyncWorkspaceMutation,
} = githubApi;
