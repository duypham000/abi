import { baseApi } from "./baseApi";
import type { SecretGroupDto, SecretGroupRequest } from "@/core/interfaces/secrets";

export const secretGroupsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSecretGroups: builder.query<SecretGroupDto[], void>({
      query: () => "/base/secret-groups/list",
      providesTags: ["SecretGroup"],
    }),
    createSecretGroup: builder.mutation<SecretGroupDto, SecretGroupRequest>({
      query: (body) => ({ url: "/base/secret-groups", method: "POST", body }),
      invalidatesTags: ["SecretGroup"],
    }),
    updateSecretGroup: builder.mutation<SecretGroupDto, { id: number; body: SecretGroupRequest }>({
      query: ({ id, body }) => ({ url: `/base/secret-groups/${id}`, method: "PUT", body }),
      invalidatesTags: ["SecretGroup"],
    }),
    deleteSecretGroup: builder.mutation<void, number>({
      query: (id) => ({ url: `/base/secret-groups/${id}`, method: "DELETE" }),
      invalidatesTags: ["SecretGroup"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListSecretGroupsQuery,
  useCreateSecretGroupMutation,
  useUpdateSecretGroupMutation,
  useDeleteSecretGroupMutation,
} = secretGroupsApi;
