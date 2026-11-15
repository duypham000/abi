import { baseApi } from "./baseApi";
import type { PageResult } from "./baseApi";
import type { SecretDto, SecretDetailDto, SecretRequest } from "@/core/interfaces/secrets";

export const secretsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSecrets: builder.query<
      PageResult<SecretDto>,
      { page?: number; size?: number; groupId?: number | null; favorite?: boolean | null }
    >({
      query: ({ page = 0, size = 50, groupId, favorite }) => ({
        url: "/base/secrets/list",
        params: {
          page,
          size,
          ...(groupId != null && { groupId }),
          ...(favorite != null && { favorite }),
        },
      }),
      providesTags: ["Secret"],
    }),
    getSecretDetail: builder.query<SecretDetailDto, number>({
      query: (id) => `/base/secrets/${id}`,
      providesTags: (_res, _err, id) => [{ type: "Secret" as const, id }],
    }),
    searchSecrets: builder.query<SecretDto[], string>({
      query: (q) => ({ url: "/base/secrets/search", params: { q } }),
      providesTags: ["Secret"],
    }),
    createSecret: builder.mutation<SecretDto, SecretRequest>({
      query: (body) => ({ url: "/base/secrets", method: "POST", body }),
      invalidatesTags: ["Secret"],
    }),
    updateSecret: builder.mutation<SecretDto, { id: number; body: SecretRequest }>({
      query: ({ id, body }) => ({ url: `/base/secrets/${id}`, method: "PUT", body }),
      invalidatesTags: (_res, _err, { id }) => [{ type: "Secret" as const, id }, "Secret"],
    }),
    deleteSecret: builder.mutation<void, number>({
      query: (id) => ({ url: `/base/secrets/${id}`, method: "DELETE" }),
      invalidatesTags: ["Secret"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListSecretsQuery,
  useGetSecretDetailQuery,
  useSearchSecretsQuery,
  useCreateSecretMutation,
  useUpdateSecretMutation,
  useDeleteSecretMutation,
} = secretsApi;
