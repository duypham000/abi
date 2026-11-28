import { baseApi } from "./baseApi";
import {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UserDto,
} from "@/core/interfaces/auth";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import {
  getCachedResource,
  RESOURCE_CACHE_KEYS,
  RESOURCE_CACHE_TTLS,
  setCachedResource,
} from "@/infrastructure/tauri/resourceCacheService";
import { setUser } from "@/presentation/store/authSlice";

const REVALIDATE_COOLDOWN_MS = 15_000;
let lastMeRevalidateAt = 0;
let meInFlight: Promise<void> | null = null;

function applyUserProfileToStore(
  dispatch: (action: unknown) => unknown,
  profile: UserDto
): void {
  if (!profile || !profile.email || profile.email === "local@device") return;
  dispatch(
    setUser({
      userId: profile.id,
      username: profile.username,
      email: profile.email,
      role: profile.role || "USER",
      fullName: profile.fullName ?? profile.full_name,
      createdAt: profile.createdAt ?? profile.createdDate,
      active: profile.active,
    })
  );
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<TokenResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
    }),
    register: builder.mutation<UserDto, RegisterRequest>({
      query: (body) => ({
        url: "/auth/register",
        method: "POST",
        body,
      }),
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
    }),
    getMe: builder.query<UserDto, void>({
      queryFn: async (_arg, api, _extraOptions, fetchWithBaseQuery) => {
        const cached = await getCachedResource<UserDto>(RESOURCE_CACHE_KEYS.AUTH_ME);

        const revalidate = async () => {
          if (meInFlight) return meInFlight;
          meInFlight = (async () => {
            try {
              const token = await getAccessToken();
              if (!token || token === "local-standalone-token") return;
              lastMeRevalidateAt = Date.now();
              const res = await fetchWithBaseQuery("/auth/me");
              if (res.data && typeof res.data === "object") {
                const fresh = res.data as UserDto;
                await setCachedResource(
                  RESOURCE_CACHE_KEYS.AUTH_ME,
                  fresh,
                  RESOURCE_CACHE_TTLS.AUTH_ME
                );
                api.dispatch(authApi.util.upsertQueryData("getMe", undefined, fresh));
                applyUserProfileToStore(api.dispatch, fresh);
              }
            } catch {
              // keep cached profile offline
            } finally {
              meInFlight = null;
            }
          })();
          return meInFlight;
        };

        if (cached) {
          const shouldRevalidate =
            cached.isExpired || Date.now() - lastMeRevalidateAt > REVALIDATE_COOLDOWN_MS;
          if (shouldRevalidate) {
            setTimeout(() => {
              void revalidate();
            }, 0);
          }
          return { data: cached.data };
        }

        const token = await getAccessToken();
        if (!token || token === "local-standalone-token") {
          return {
            error: {
              status: 401,
              statusText: "Unauthorized",
              data: { message: "Chưa đăng nhập" },
            },
          };
        }

        lastMeRevalidateAt = Date.now();
        const res = await fetchWithBaseQuery("/auth/me");
        if (res.data && typeof res.data === "object") {
          const fresh = res.data as UserDto;
          await setCachedResource(
            RESOURCE_CACHE_KEYS.AUTH_ME,
            fresh,
            RESOURCE_CACHE_TTLS.AUTH_ME
          );
          applyUserProfileToStore(api.dispatch, fresh);
          return { data: fresh };
        }
        return { error: res.error as never };
      },
      providesTags: ["User"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useGetMeQuery,
} = authApi;
