import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { NoteDto, NoteRequest } from "@/core/interfaces/notes";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import {
  listNotesFromSqlite,
  getNoteFromSqlite,
  createNoteInSqlite,
  updateNoteInSqlite,
  deleteNoteFromSqlite,
  searchNotesInSqlite,
} from "@/infrastructure/tauri/noteCacheService";

export const notesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listNotes: builder.query<
      PageResult<NoteDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await listNotesFromSqlite(args || undefined);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/base/notes/list",
          params: { page, size, sortBy, sortDirection },
        });
        return result.data
          ? { data: result.data as PageResult<NoteDto> }
          : { error: result.error as any };
      },
      providesTags: ["Note"],
    }),

    lazyNotes: builder.query<
      ScrollResult<NoteDto>,
      { lastId?: number; size?: number } | void
    >({
      queryFn: async (_args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const list = await listNotesFromSqlite();
            return { data: { items: list.items, hasMore: false, nextCursor: null } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/notes/lazy" });
        return result.data
          ? { data: result.data as ScrollResult<NoteDto> }
          : { error: result.error as any };
      },
    }),

    getNoteById: builder.query<NoteDto, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await getNoteFromSqlite(id);
            if (data) return { data };
            return { error: { status: 404, statusText: "Note not found", data: "Note not found" } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery(`/base/notes/${id}`);
        return result.data
          ? { data: result.data as NoteDto }
          : { error: result.error as any };
      },
      providesTags: (_res, _err, id) => [{ type: "Note" as const, id }],
    }),

    createNote: builder.mutation<NoteDto, NoteRequest>({
      queryFn: async (body, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await createNoteInSqlite(body);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/notes", method: "POST", body });
        return result.data
          ? { data: result.data as NoteDto }
          : { error: result.error as any };
      },
      invalidatesTags: ["Note"],
    }),

    updateNote: builder.mutation<NoteDto, { id: number; body: NoteRequest }>({
      queryFn: async ({ id, body }, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await updateNoteInSqlite(id, body);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({
          url: `/base/notes/${id}`,
          method: "PUT",
          body,
        });
        return result.data
          ? { data: result.data as NoteDto }
          : { error: result.error as any };
      },
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Note" as const, id },
        "Note",
      ],
    }),

    deleteNote: builder.mutation<void, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            await deleteNoteFromSqlite(id);
            return { data: undefined };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: `/base/notes/${id}`, method: "DELETE" });
        return result.data
          ? { data: undefined }
          : { error: result.error as any };
      },
      invalidatesTags: ["Note"],
    }),

    searchNotes: builder.query<NoteDto[], string>({
      queryFn: async (q, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await searchNotesInSqlite(q);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/base/notes/search", params: { q } });
        return result.data
          ? { data: result.data as NoteDto[] }
          : { error: result.error as any };
      },
      providesTags: ["Note"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListNotesQuery,
  useLazyNotesQuery,
  useGetNoteByIdQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useSearchNotesQuery,
} = notesApi;
