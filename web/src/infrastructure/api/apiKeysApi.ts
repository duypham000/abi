import { baseApi } from "./baseApi";
import type { APIKeyDto, CreateAPIKeyRequest } from "@/core/interfaces/auth";

export const apiKeysApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listApiKeys: builder.query<APIKeyDto[], void>({
      query: () => "/admin/api-keys",
      providesTags: ["ApiKey"],
    }),
    createApiKey: builder.mutation<APIKeyDto, CreateAPIKeyRequest>({
      query: (body) => ({
        url: "/admin/api-keys",
        method: "POST",
        body,
      }),
      invalidatesTags: ["ApiKey"],
    }),
    revokeApiKey: builder.mutation<{ id: string; revoked: boolean }, string>({
      query: (id) => ({
        url: `/admin/api-keys/${encodeURIComponent(id)}/revoke`,
        method: "POST",
      }),
      invalidatesTags: ["ApiKey"],
    }),
    deleteApiKey: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({
        url: `/admin/api-keys/${encodeURIComponent(id)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ApiKey"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
  useDeleteApiKeyMutation,
} = apiKeysApi;
