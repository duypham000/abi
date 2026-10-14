import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { setOnline, connectionLost } from "@/presentation/store/appSlice";
import { setUser } from "@/presentation/store/authSlice";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";

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

const BASE_URL = "/api/v1";

// The Rust auth core (via authBridge) is the single source of truth for tokens
// and performs refresh transparently + single-flight. Each request just asks it
// for a currently-valid access token.
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

  // A 401 should be rare (Rust refreshes proactively). If it happens, force a
  // token refresh once and retry; if still unauthorized, the session is gone.
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
      // Network/server error during refresh — keep the session and let the
      // caller handle it as a network error.
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
      if ("total" in raw || "total_items" in raw) {
        const total = Number(raw.total ?? raw.total_items ?? 0);
        const page = Number(raw.page ?? 0);
        const pageSize = Number(raw.pageSize ?? raw.page_size ?? 20);
        return {
          ...result,
          data: { items: raw.data, total, page, pageSize },
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
  tagTypes: ["Doc", "Canvas", "Note", "SearchIndex", "User", "Series"] as const,
  endpoints: () => ({}),
});
