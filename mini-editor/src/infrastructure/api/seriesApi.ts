import { baseApi, PageResult } from "./baseApi";
import type { SeriesDto, SeriesRequest } from "@/core/interfaces/series";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import {
  listSeriesFromSqlite,
  getSeriesFromSqlite,
  createSeriesInSqlite,
  updateSeriesInSqlite,
  deleteSeriesFromSqlite,
  searchSeriesInSqlite,
  cacheSeries,
} from "@/infrastructure/tauri/seriesCacheService";

export const seriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSeries: builder.query<
      PageResult<SeriesDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await listSeriesFromSqlite(args || undefined);
            // Đồng bộ nền với Go backend nếu có token đăng nhập
            const syncRemote = async () => {
              try {
                const token = await getAccessToken();
                if (token && token !== "local-standalone-token") {
                  const { page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
                  const res = await fetchWithBaseQuery({
                    url: "/base/series/list",
                    params: { page, size, sortBy, sortDirection },
                  });
                  if (res.data && typeof res.data === "object" && "items" in (res.data as Record<string, unknown>)) {
                    const items = (res.data as PageResult<SeriesDto>).items;
                    if (Array.isArray(items)) {
                      for (const item of items) {
                        await cacheSeries(item);
                      }
                    }
                  }
                }
              } catch {
                // ignore background sync errors
              }
            };
            void syncRemote();
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/base/series/list",
          params: { page, size, sortBy, sortDirection },
        });
        return result.data
          ? { data: result.data as PageResult<SeriesDto> }
          : { error: result.error as any };
      },
      providesTags: ["Series"],
    }),

    getSeriesById: builder.query<SeriesDto, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const local = await getSeriesFromSqlite(id);
            if (local) {
              const syncRemote = async () => {
                try {
                  const token = await getAccessToken();
                  if (token && token !== "local-standalone-token") {
                    const res = await fetchWithBaseQuery(`/base/series/${id}`);
                    if (res.data) await cacheSeries(res.data as SeriesDto);
                  }
                } catch {
                  // ignore
                }
              };
              void syncRemote();
              return { data: local };
            }
          } catch {
            // fallback
          }
        }
        const result = await fetchWithBaseQuery(`/base/series/${id}`);
        if (result.data && isTauri()) {
          cacheSeries(result.data as SeriesDto);
        }
        return result.data
          ? { data: result.data as SeriesDto }
          : { error: result.error as any };
      },
      providesTags: (_res, _err, id) => [{ type: "Series" as const, id }],
    }),

    createSeries: builder.mutation<SeriesDto, SeriesRequest>({
      queryFn: async (body, _api, _extraOptions, fetchWithBaseQuery) => {
        let localSeries: SeriesDto | null = null;
        if (isTauri()) {
          try {
            localSeries = await createSeriesInSqlite(body);
          } catch (err) {
            console.warn("createSeriesInSqlite error:", err);
          }
        }

        try {
          const token = await getAccessToken();
          if (token && token !== "local-standalone-token") {
            const result = await fetchWithBaseQuery({ url: "/base/series", method: "POST", body });
            if (result.data) {
              const remoteSeries = result.data as SeriesDto;
              if (isTauri()) await cacheSeries(remoteSeries);
              return { data: remoteSeries };
            }
          }
        } catch {
          // offline
        }

        if (localSeries) {
          return { data: localSeries };
        }

        const result = await fetchWithBaseQuery({ url: "/base/series", method: "POST", body });
        return result.data
          ? { data: result.data as SeriesDto }
          : { error: result.error as any };
      },
      invalidatesTags: ["Series"],
    }),

    updateSeries: builder.mutation<SeriesDto, { id: number; body: SeriesRequest }>({
      queryFn: async ({ id, body }, _api, _extraOptions, fetchWithBaseQuery) => {
        let localSeries: SeriesDto | null = null;
        if (isTauri()) {
          try {
            localSeries = await updateSeriesInSqlite(id, body);
          } catch (err) {
            console.warn("updateSeriesInSqlite error:", err);
          }
        }

        try {
          const token = await getAccessToken();
          if (token && token !== "local-standalone-token") {
            const result = await fetchWithBaseQuery({
              url: `/base/series/${id}`,
              method: "PUT",
              body,
            });
            if (result.data) {
              const remoteSeries = result.data as SeriesDto;
              if (isTauri()) await cacheSeries(remoteSeries);
              return { data: remoteSeries };
            }
          }
        } catch {
          // offline
        }

        if (localSeries) {
          return { data: localSeries };
        }

        const result = await fetchWithBaseQuery({
          url: `/base/series/${id}`,
          method: "PUT",
          body,
        });
        return result.data
          ? { data: result.data as SeriesDto }
          : { error: result.error as any };
      },
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Series" as const, id },
        "Series",
        "Doc",
      ],
    }),

    deleteSeries: builder.mutation<void, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            await deleteSeriesFromSqlite(id);
          } catch (err) {
            console.warn("deleteSeriesFromSqlite error:", err);
          }
        }

        try {
          const token = await getAccessToken();
          if (token && token !== "local-standalone-token") {
            await fetchWithBaseQuery({ url: `/base/series/${id}`, method: "DELETE" });
          }
        } catch {
          // offline
        }

        return { data: undefined };
      },
      invalidatesTags: ["Series", "Doc"],
    }),

    searchSeries: builder.query<SeriesDto[], string>({
      queryFn: async (q, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await searchSeriesInSqlite(q);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/series/search", params: { q } });
        return result.data
          ? { data: result.data as SeriesDto[] }
          : { error: result.error as any };
      },
      providesTags: ["Series"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListSeriesQuery,
  useGetSeriesByIdQuery,
  useCreateSeriesMutation,
  useUpdateSeriesMutation,
  useDeleteSeriesMutation,
  useSearchSeriesQuery,
} = seriesApi;
