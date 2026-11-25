import { isTokenExpired } from "@/core/utils/jwt";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const TOKEN_KEY = "tomo_access_token";
const REFRESH_TOKEN_KEY = "tomo.refreshToken";

let refreshInFlight: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export async function login(
  identifier: string,
  password: string
): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier,
      username: identifier,
      email: identifier,
      password,
    }),
  });

  if (!res.ok) {
    let errMsg = `Đăng nhập thất bại (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.message) errMsg = errJson.message;
    } catch {
      // non-json response
    }
    throw new Error(errMsg);
  }

  const json = await res.json();
  const token: string =
    json.data?.accessToken ||
    json.data?.access_token ||
    json.data?.token ||
    "";

  if (!token) {
    throw new Error("Không nhận được access token từ server");
  }

  localStorage.setItem(TOKEN_KEY, token);
  const rt = json.data?.refreshToken || json.data?.refresh_token;
  if (rt) {
    localStorage.setItem(REFRESH_TOKEN_KEY, rt);
  }
  notify();
  return token;
}

export function peekAccessToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  // If a refresh token exists and access token is expired, force refresh
  if (localStorage.getItem(REFRESH_TOKEN_KEY) && isTokenExpired(token)) {
    return null;
  }
  return token;
}

export async function getAccessToken(): Promise<string | null> {
  const cached = peekAccessToken();
  if (cached) return cached;

  const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!rt) return null;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          notify();
          return null;
        }
        throw new Error(`Refresh failed (${res.status})`);
      }
      const { data } = await res.json();
      const nextToken: string =
        data?.accessToken || data?.access_token || data?.token || "";
      if (nextToken) {
        localStorage.setItem(TOKEN_KEY, nextToken);
      }
      const nextRt = data?.refreshToken || data?.refresh_token;
      if (nextRt) {
        localStorage.setItem(REFRESH_TOKEN_KEY, nextRt);
      }
      return nextToken || null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  notify();
  if (token) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: rt ? JSON.stringify({ refresh_token: rt, refreshToken: rt }) : undefined,
    }).catch(() => {});
  }
}

export function onAuthChanged(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === REFRESH_TOKEN_KEY) {
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
