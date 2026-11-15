import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { NoteDto, NoteRequest } from "@/core/interfaces/notes";

export const notesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listNotes: builder.query<
      PageResult<NoteDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string }
    >({
      query: ({
        page = 0,
        size = 20,
        sortBy = "id",
        sortDirection = "ASC",
      } = {}) => ({
        url: "/base/notes/list",
        params: { page, size, sortBy, sortDirection },
      }),
      providesTags: ["Note"],
    }),
    lazyNotes: builder.query<
      ScrollResult<NoteDto>,
      { lastId?: number; size?: number }
    >({
      query: ({ lastId, size = 20 } = {}) => ({
        url: "/base/notes/lazy",
        params: { lastId, size },
      }),
    }),
    getNoteById: builder.query<NoteDto, number>({
      query: (id) => `/base/notes/${id}`,
      providesTags: (_res, _err, id) => [{ type: "Note" as const, id }],
    }),
    createNote: builder.mutation<NoteDto, NoteRequest>({
      query: (body) => ({ url: "/base/notes", method: "POST", body }),
      invalidatesTags: ["Note"],
    }),
    updateNote: builder.mutation<NoteDto, { id: number; body: NoteRequest }>({
      query: ({ id, body }) => ({
        url: `/base/notes/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Note" as const, id },
        "Note",
      ],
    }),
    deleteNote: builder.mutation<void, number>({
      query: (id) => ({ url: `/base/notes/${id}`, method: "DELETE" }),
      invalidatesTags: ["Note"],
    }),
    searchNotes: builder.query<NoteDto[], string>({
      query: (q) => ({ url: "/base/notes/search", params: { q } }),
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
