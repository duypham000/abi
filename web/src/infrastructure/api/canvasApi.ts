import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { CanvasDto, CanvasRequest } from "@/core/interfaces/canvas";

export const canvasApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listCanvas: builder.query<
      PageResult<CanvasDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string }
    >({
      query: ({
        page = 0,
        size = 20,
        sortBy = "id",
        sortDirection = "ASC",
      } = {}) => ({
        url: "/canvas/list",
        params: { page, size, sortBy, sortDirection },
      }),
      providesTags: ["Canvas"],
    }),
    lazyCanvas: builder.query<
      ScrollResult<CanvasDto>,
      { lastId?: number; size?: number }
    >({
      query: ({ lastId, size = 20 } = {}) => ({
        url: "/canvas/lazy",
        params: { lastId, size },
      }),
    }),
    getCanvasById: builder.query<CanvasDto, number>({
      query: (id) => `/canvas/${id}`,
      providesTags: (_res, _err, id) => [{ type: "Canvas" as const, id }],
    }),
    createCanvas: builder.mutation<CanvasDto, CanvasRequest>({
      query: (body) => ({ url: "/canvas", method: "POST", body }),
      invalidatesTags: ["Canvas"],
    }),
    updateCanvas: builder.mutation<CanvasDto, { id: number; body: CanvasRequest }>({
      query: ({ id, body }) => ({
        url: `/canvas/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Canvas" as const, id },
        "Canvas",
      ],
    }),
    deleteCanvas: builder.mutation<void, number>({
      query: (id) => ({ url: `/canvas/${id}`, method: "DELETE" }),
      invalidatesTags: ["Canvas"],
    }),
    searchCanvas: builder.query<CanvasDto[], string>({
      query: (q) => ({ url: "/canvas/search", params: { q } }),
      providesTags: ["Canvas"],
    }),
    getYjsCanvasToken: builder.query<{ token: string; url: string; expiresIn: number }, number>({
      query: (canvasId) => ({
        url: "/yjs/auth/token",
        method: "POST",
        body: { canvas_id: String(canvasId), access_mode: "write" },
      }),
      transformResponse: (res: any) => res.data ?? res,
    }),
  }),
  overrideExisting: false,
});

export const {
  useListCanvasQuery,
  useLazyCanvasQuery,
  useGetCanvasByIdQuery,
  useCreateCanvasMutation,
  useUpdateCanvasMutation,
  useDeleteCanvasMutation,
  useSearchCanvasQuery,
  useGetYjsCanvasTokenQuery,
} = canvasApi;

