import { baseApi } from "./baseApi";
import type { UserDto } from "@/core/interfaces/auth";

export interface AdminUserCreateRequest {
  username: string;
  email: string;
  password?: string;
  role: string;
}

export interface AdminUserUpdateRequest {
  username: string;
  email: string;
  role: string;
  active: boolean;
}

export interface AdminUserPasswordRequest {
  password: string;
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query<UserDto[], void>({
      query: () => "/admin/users",
      providesTags: ["User"],
    }),
    createUser: builder.mutation<UserDto, AdminUserCreateRequest>({
      query: (body) => ({
        url: "/admin/users",
        method: "POST",
        body,
      }),
      invalidatesTags: ["User"],
    }),
    updateUser: builder.mutation<UserDto, { id: number; body: AdminUserUpdateRequest }>({
      query: ({ id, body }) => ({
        url: `/admin/users/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "User" as const, id },
        "User",
      ],
    }),
    deleteUser: builder.mutation<void, number>({
      query: (id) => ({
        url: `/admin/users/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["User"],
    }),
    updateUserPassword: builder.mutation<void, { id: number; body: AdminUserPasswordRequest }>({
      query: ({ id, body }) => ({
        url: `/admin/users/${id}/password`,
        method: "PUT",
        body,
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateUserPasswordMutation,
} = usersApi;
