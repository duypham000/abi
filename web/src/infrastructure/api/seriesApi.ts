import { baseApi, PageResult } from "./baseApi";
import type { SeriesDto, SeriesRequest } from "@/core/interfaces/series";

export const seriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSeries: builder.query<
      PageResult<SeriesDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string }
    >({
      query: ({
        page = 0,
        size = 20,
        sortBy = "id",
        sortDirection = "ASC",
      } = {}) => ({
        url: "/series/list",
        params: { page, size, sortBy, sortDirection },
      }),
      providesTags: ["Series"],
    }),
    getSeriesById: builder.query<SeriesDto, number>({
      query: (id) => `/series/${id}`,
      providesTags: (_res, _err, id) => [{ type: "Series" as const, id }],
    }),
    createSeries: builder.mutation<SeriesDto, SeriesRequest>({
      query: (body) => ({ url: "/series", method: "POST", body }),
      invalidatesTags: ["Series"],
    }),
    updateSeries: builder.mutation<SeriesDto, { id: number; body: SeriesRequest }>({
      query: ({ id, body }) => ({
        url: `/series/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Series" as const, id },
        "Series",
        "Doc",
      ],
    }),
    deleteSeries: builder.mutation<void, number>({
      query: (id) => ({ url: `/series/${id}`, method: "DELETE" }),
      invalidatesTags: ["Series", "Doc"],
    }),
    searchSeries: builder.query<SeriesDto[], string>({
      query: (q) => ({ url: "/series/search", params: { q } }),
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
