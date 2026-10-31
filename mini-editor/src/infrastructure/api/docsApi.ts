import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { DocDto, DocRequest, DocRevisionDto, DocRevisionSummaryDto, BinAnalysisDto } from "@/core/interfaces/docs";
import type { EsIndexInfo } from "@/core/interfaces/search";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import {
  listDocsFromSqlite,
  getDocFromSqlite,
  createDocInSqlite,
  updateDocInSqlite,
  deleteDocFromSqlite,
  searchDocsInSqlite,
  cacheDoc,
} from "@/infrastructure/tauri/docCacheService";

export const docsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDocs: builder.query<
      PageResult<DocDto>,
      { seriesId?: number; page?: number; size?: number; sortBy?: string; sortDirection?: string } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await listDocsFromSqlite(args || undefined);
            const syncRemote = async () => {
              try {
                const token = await getAccessToken();
                if (token && token !== "local-standalone-token") {
                  const { seriesId, page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
                  const res = await fetchWithBaseQuery({
                    url: "/base/docs/list",
                    params: { seriesId, page, size, sortBy, sortDirection },
                  });
                  if (res.data && typeof res.data === "object" && "items" in (res.data as Record<string, unknown>)) {
                    const items = (res.data as PageResult<DocDto>).items;
                    if (Array.isArray(items)) {
                      for (const item of items) {
                        await cacheDoc(item);
                      }
                    }
                  }
                }
              } catch {
                // offline
              }
            };
            void syncRemote();
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { seriesId, page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/base/docs/list",
          params: { seriesId, page, size, sortBy, sortDirection },
        });
        return result.data
          ? { data: result.data as PageResult<DocDto> }
          : { error: result.error as any };
      },
      providesTags: ["Doc"],
    }),

    lazyDocs: builder.query<
      ScrollResult<DocDto>,
      { seriesId?: number; lastId?: number; size?: number } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const list = await listDocsFromSqlite();
            return { data: { items: list.items, hasMore: false, nextCursor: null } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { seriesId, lastId, size = 20 } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/base/docs/lazy",
          params: { seriesId, lastId, size },
        });
        return result.data
          ? { data: result.data as ScrollResult<DocDto> }
          : { error: result.error as any };
      },
    }),

    getDocById: builder.query<DocDto, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const local = await getDocFromSqlite(id);
            if (local) {
              const syncSingle = async () => {
                try {
                  const token = await getAccessToken();
                  if (token && token !== "local-standalone-token") {
                    const res = await fetchWithBaseQuery(`/base/docs/${id}`);
                    if (res.data) {
                      await cacheDoc(res.data as DocDto);
                    }
                  }
                } catch {
                  // offline
                }
              };
              void syncSingle();
              return { data: local };
            }
          } catch {
            // fallback sang backend fetch
          }
        }
        const result = await fetchWithBaseQuery(`/base/docs/${id}`);
        if (result.data && isTauri()) {
          cacheDoc(result.data as DocDto);
        }
        return result.data
          ? { data: result.data as DocDto }
          : { error: result.error as any };
      },
      providesTags: (_res, _err, id) => [{ type: "Doc" as const, id }],
    }),

    createDoc: builder.mutation<DocDto, DocRequest>({
      queryFn: async (body, _api, _extraOptions, fetchWithBaseQuery) => {
        let localDoc: DocDto | null = null;
        if (isTauri()) {
          try {
            localDoc = await createDocInSqlite(body);
          } catch (err) {
            console.warn("SQLite createDoc error:", err);
          }
        }

        try {
          const token = await getAccessToken();
          if (token && token !== "local-standalone-token") {
            const result = await fetchWithBaseQuery({ url: "/base/docs", method: "POST", body });
            if (result.data) {
              const remoteDoc = result.data as DocDto;
              if (isTauri()) await cacheDoc(remoteDoc);
              return { data: remoteDoc };
            }
          }
        } catch {
          // offline mode
        }

        if (localDoc) {
          return { data: localDoc };
        }

        const result = await fetchWithBaseQuery({ url: "/base/docs", method: "POST", body });
        return result.data
          ? { data: result.data as DocDto }
          : { error: result.error as any };
      },
      invalidatesTags: ["Doc"],
    }),

    updateDoc: builder.mutation<DocDto, { id: number; body: DocRequest }>({
      queryFn: async ({ id, body }, _api, _extraOptions, fetchWithBaseQuery) => {
        let localDoc: DocDto | null = null;
        if (isTauri()) {
          try {
            localDoc = await updateDocInSqlite(id, body);
          } catch (err) {
            console.warn("SQLite updateDoc error:", err);
          }
        }

        try {
          const token = await getAccessToken();
          if (token && token !== "local-standalone-token") {
            const result = await fetchWithBaseQuery({ url: `/base/docs/${id}`, method: "PUT", body });
            if (result.data) {
              const remoteDoc = result.data as DocDto;
              if (isTauri()) await cacheDoc(remoteDoc);
              return { data: remoteDoc };
            }
          }
        } catch {
          // offline mode
        }

        if (localDoc) {
          return { data: localDoc };
        }

        const result = await fetchWithBaseQuery({ url: `/base/docs/${id}`, method: "PUT", body });
        return result.data
          ? { data: result.data as DocDto }
          : { error: result.error as any };
      },
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Doc" as const, id },
        "Doc",
      ],
    }),

    deleteDoc: builder.mutation<void, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            await deleteDocFromSqlite(id);
          } catch (err) {
            console.warn("SQLite deleteDoc error:", err);
          }
        }

        try {
          const token = await getAccessToken();
          if (token && token !== "local-standalone-token") {
            await fetchWithBaseQuery({ url: `/base/docs/${id}`, method: "DELETE" });
          }
        } catch {
          // offline mode
        }

        return { data: undefined };
      },
      invalidatesTags: ["Doc"],
    }),

    searchDocs: builder.query<DocDto[], string>({
      queryFn: async (q, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await searchDocsInSqlite(q);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/docs/search", params: { q } });
        return result.data
          ? { data: result.data as DocDto[] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: ["Doc"],
    }),
    // Revision history
    listDocRevisions: builder.query<
      PageResult<DocRevisionSummaryDto>,
      { docId: number; page?: number; size?: number }
    >({
      query: ({ docId, page = 0, size = 20 }) => ({
        url: `/base/docs/${docId}/revisions`,
        params: { page, size },
      }),
      providesTags: (_res, _err, { docId }) => [{ type: "Doc" as const, id: `revisions-${docId}` }],
    }),
    getDocRevision: builder.query<DocRevisionDto, { docId: number; revisionId: number }>({
      query: ({ docId, revisionId }) => `/base/docs/${docId}/revisions/${revisionId}`,
    }),
    restoreDocRevision: builder.mutation<DocDto, { docId: number; revisionId: number }>({
      query: ({ docId, revisionId }) => ({
        url: `/base/docs/${docId}/revisions/${revisionId}/restore`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, { docId }) => [
        { type: "Doc" as const, id: docId },
        { type: "Doc" as const, id: `revisions-${docId}` },
        "Doc",
      ],
    }),
    analyzeBinRevision: builder.mutation<BinAnalysisDto, { docId: number; file: File }>({
      query: ({ docId, file }) => {
        const formData = new FormData();
        formData.append("file", file);
        return {
          url: `/base/docs/${docId}/bin-revisions/analyze`,
          method: "POST",
          body: formData,
        };
      },
    }),
    restoreBinRevision: builder.mutation<DocDto, { docId: number; file: File }>({
      query: ({ docId, file }) => {
        const formData = new FormData();
        formData.append("file", file);
        return {
          url: `/base/docs/${docId}/bin-revisions/restore`,
          method: "POST",
          body: formData,
        };
      },
      invalidatesTags: (_res, _err, { docId }) => [
        { type: "Doc" as const, id: docId },
        { type: "Doc" as const, id: `revisions-${docId}` },
        "Doc",
      ],
    }),
    reindexAll: builder.mutation<number, void>({
      query: () => ({ url: "/admin/search/reindex", method: "POST" }),
      invalidatesTags: ["SearchIndex"],
    }),
    reindexByType: builder.mutation<number, string>({
      query: (type) => ({ url: `/admin/search/reindex/${type}`, method: "POST" }),
      invalidatesTags: ["SearchIndex"],
    }),
    reconcile: builder.mutation<void, void>({
      query: () => ({ url: "/admin/search/reconcile", method: "POST" }),
      invalidatesTags: ["SearchIndex"],
    }),
    reconcileCount: builder.mutation<void, void>({
      query: () => ({ url: "/admin/search/reconcile/count", method: "POST" }),
      invalidatesTags: ["SearchIndex"],
    }),
    getIndicesInfo: builder.query<EsIndexInfo[], void>({
      query: () => ({ url: "/admin/search/indices" }),
      providesTags: ["SearchIndex"],
    }),
    syncDocFromGit: builder.mutation<DocDto, { title: string; content: string; gitSlug: string; status?: 0 | 1 }>({
      query: (body) => ({
        url: "/base/docs/sync-from-git",
        method: "POST",
        body: {
          title: body.title,
          content: body.content,
          git_slug: body.gitSlug,
          status: body.status ?? 1,
        },
      }),
      invalidatesTags: ["Doc"],
    }),
    getYjsToken: builder.query<{ token: string; url: string; expiresIn: number }, number | string>({
      query: (docId) => ({
        url: "/base/yjs/auth/token",
        method: "POST",
        body: { doc_id: String(docId), access_mode: "write" },
      }),
      transformResponse: (res: any) => res.data ?? res,
    }),
  }),
  overrideExisting: false,
});

export const {
  useListDocsQuery,
  useLazyDocsQuery,
  useGetDocByIdQuery,
  useLazyGetDocByIdQuery,
  useCreateDocMutation,
  useUpdateDocMutation,
  useDeleteDocMutation,
  useSearchDocsQuery,
  useListDocRevisionsQuery,
  useGetDocRevisionQuery,
  useRestoreDocRevisionMutation,
  useAnalyzeBinRevisionMutation,
  useRestoreBinRevisionMutation,
  useReindexAllMutation,
  useReindexByTypeMutation,
  useReconcileMutation,
  useReconcileCountMutation,
  useGetIndicesInfoQuery,
  useSyncDocFromGitMutation,
  useGetYjsTokenQuery,
} = docsApi;
