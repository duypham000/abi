import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { setOnline, connectionLost } from "@/store/appSlice";
import { setUser } from "@/store/authSlice";
import { getAccessToken } from "@/infrastructure/auth/authClient";

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ScrollResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: number | null;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  prepareHeaders: async (headers) => {
    const token = await getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    try {
      const token = await getAccessToken();
      if (token) {
        result = await rawBaseQuery(args, api, extraOptions);
      }
      if (result.error?.status === 401) {
        api.dispatch(setUser(null));
      }
    } catch {
      // Network/server error during refresh
    }
  }

  return result;
};

const baseQueryWithTransform: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await baseQueryWithReauth(args, api, extraOptions);

  const isOfflineStatus =
    result.error?.status === "FETCH_ERROR" ||
    (typeof result.error?.status === "number" &&
      result.error.status >= 502 &&
      result.error.status <= 504);

  if (isOfflineStatus) {
    api.dispatch(connectionLost());
  } else if (!result.error) {
    api.dispatch(setOnline(true));
  }

  if (result.data && typeof result.data === "object") {
    const raw = result.data as Record<string, unknown>;
    const isEnvelope = ("status" in raw || "success" in raw) && "data" in raw;
    if (isEnvelope) {
      const payload = raw.data;
      // Case 1: envelope data is a paginated object: { items: [...], total_items: ... }
      if (payload && typeof payload === "object" && "items" in (payload as Record<string, unknown>)) {
        const p = payload as Record<string, unknown>;
        const items = Array.isArray(p.items) ? (p.items as unknown[]) : [];
        const total = Number(p.total ?? p.total_items ?? p.totalItems ?? items.length);
        const page = Number(p.page ?? 0);
        const pageSize = Number(p.pageSize ?? p.page_size ?? p.pageSize ?? 20);
        return {
          ...result,
          data: { items, total, page, pageSize },
        };
      }

      // Case 2: envelope total is on the outer envelope: { data: [...], total: ... }
      if ("total" in raw || "total_items" in raw) {
        const total = Number(raw.total ?? raw.total_items ?? 0);
        const page = Number(raw.page ?? 0);
        const pageSize = Number(raw.pageSize ?? raw.page_size ?? 20);
        return {
          ...result,
          data: { items: Array.isArray(raw.data) ? raw.data : [], total, page, pageSize },
        };
      } else if ("hasMore" in raw) {
        return {
          ...result,
          data: { items: raw.data, hasMore: raw.hasMore, nextCursor: raw.nextCursor },
        };
      } else {
        return { ...result, data: raw.data };
      }
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithTransform,
  tagTypes: ["Doc", "Canvas", "Note", "Series", "SearchIndex", "User", "ApiKey"] as const,
  endpoints: () => ({}),
});
