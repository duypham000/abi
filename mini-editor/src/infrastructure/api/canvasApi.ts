import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { CanvasDto, CanvasRequest } from "@/core/interfaces/canvas";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import {
  listCanvasFromSqlite,
  getCanvasFromSqlite,
  createCanvasInSqlite,
  updateCanvasInSqlite,
  deleteCanvasFromSqlite,
  searchCanvasFromSqlite,
} from "@/infrastructure/tauri/canvasCacheService";

export const canvasApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listCanvas: builder.query<
      PageResult<CanvasDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await listCanvasFromSqlite(args || undefined);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/base/canvas/list",
          params: { page, size, sortBy, sortDirection },
        });
        return result.data
          ? { data: result.data as PageResult<CanvasDto> }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: ["Canvas"],
    }),

    lazyCanvas: builder.query<
      ScrollResult<CanvasDto>,
      { lastId?: number; size?: number } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const list = await listCanvasFromSqlite();
            return { data: { items: list.items, hasMore: false, nextCursor: null } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { lastId, size = 20 } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/base/canvas/lazy",
          params: { lastId, size },
        });
        return result.data
          ? { data: result.data as ScrollResult<CanvasDto> }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
    }),

    getCanvasById: builder.query<CanvasDto, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await getCanvasFromSqlite(id);
            if (data) return { data };
            return { error: { status: 404, statusText: "Canvas not found in SQLite", data: "Canvas not found" } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery(`/base/canvas/${id}`);
        return result.data
          ? { data: result.data as CanvasDto }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: (_res, _err, id) => [{ type: "Canvas" as const, id }],
    }),

    createCanvas: builder.mutation<CanvasDto, CanvasRequest>({
      queryFn: async (body, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await createCanvasInSqlite(body);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/canvas", method: "POST", body });
        return result.data
          ? { data: result.data as CanvasDto }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      invalidatesTags: ["Canvas"],
    }),

    updateCanvas: builder.mutation<CanvasDto, { id: number; body: CanvasRequest }>({
      queryFn: async ({ id, body }, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await updateCanvasInSqlite(id, body);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({
          url: `/base/canvas/${id}`,
          method: "PUT",
          body,
        });
        return result.data
          ? { data: result.data as CanvasDto }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Canvas" as const, id },
        "Canvas",
      ],
    }),

    deleteCanvas: builder.mutation<void, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            await deleteCanvasFromSqlite(id);
            return { data: undefined };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: `/base/canvas/${id}`, method: "DELETE" });
        return result.data
          ? { data: undefined }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      invalidatesTags: ["Canvas"],
    }),

    searchCanvas: builder.query<CanvasDto[], string>({
      queryFn: async (q, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await searchCanvasFromSqlite(q);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/canvas/search", params: { q } });
        return result.data
          ? { data: result.data as CanvasDto[] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: ["Canvas"],
    }),  }),
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
} = canvasApi;
