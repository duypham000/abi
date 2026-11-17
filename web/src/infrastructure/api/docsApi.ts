import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { DocDto, DocRequest, DocRevisionDto, DocRevisionSummaryDto, BinAnalysisDto } from "@/core/interfaces/docs";
import type { EsIndexInfo } from "@/core/interfaces/search";

export const docsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDocs: builder.query<
      PageResult<DocDto>,
      { seriesId?: number; page?: number; size?: number; sortBy?: string; sortDirection?: string }
    >({
      query: ({
        seriesId,
        page = 0,
        size = 20,
        sortBy = "id",
        sortDirection = "ASC",
      } = {}) => ({
        url: "/base/docs/list",
        params: { seriesId, page, size, sortBy, sortDirection },
      }),
      providesTags: ["Doc"],
    }),
    lazyDocs: builder.query<
      ScrollResult<DocDto>,
      { seriesId?: number; lastId?: number; size?: number }
    >({
      query: ({ seriesId, lastId, size = 20 } = {}) => ({
        url: "/base/docs/lazy",
        params: { seriesId, lastId, size },
      }),
    }),
    getDocById: builder.query<DocDto, number>({
      query: (id) => `/base/docs/${id}`,
      providesTags: (_res, _err, id) => [{ type: "Doc" as const, id }],
    }),
    createDoc: builder.mutation<DocDto, DocRequest>({
      query: (body) => ({ url: "/base/docs", method: "POST", body }),
      invalidatesTags: ["Doc"],
    }),
    updateDoc: builder.mutation<DocDto, { id: number; body: DocRequest }>({
      query: ({ id, body }) => ({
        url: `/base/docs/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Doc" as const, id },
        "Doc",
      ],
    }),
    deleteDoc: builder.mutation<void, number>({
      query: (id) => ({ url: `/base/docs/${id}`, method: "DELETE" }),
      invalidatesTags: ["Doc"],
    }),
    searchDocs: builder.query<DocDto[], string>({
      query: (q) => ({ url: "/base/docs/search", params: { q } }),
      providesTags: ["Doc"],
    }),

    // yhub collaboration auth token (ES384). Fetched imperatively in
    // useYjsCollaboration via endpoints.getYjsToken.initiate(docId, { forceRefetch: true }).
    getYjsToken: builder.query<{ token: string; url: string; expiresIn: number }, number | string>({
      query: (docId) => ({
        url: "/base/yjs/auth/token",
        method: "POST",
        body: { doc_id: String(docId), access_mode: "write" },
      }),
      transformResponse: (res: any) => res.data ?? res,
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
  useGetYjsTokenQuery,
  useReindexAllMutation,
  useReindexByTypeMutation,
  useReconcileMutation,
  useReconcileCountMutation,
  useGetIndicesInfoQuery,
} = docsApi;
