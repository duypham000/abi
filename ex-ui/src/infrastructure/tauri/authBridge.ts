/**
 * Bridge to the Rust auth core (the single source of truth for the session).
 *
 * In Tauri the refresh token lives in the OS keychain and never reaches JS;
 * windows obtain a fresh access token via `auth_access_token` (Rust refreshes
 * transparently, single-flight). Outside Tauri (plain browser dev) we keep a
 * lightweight JS fallback that mirrors the same contract.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTokenExpired } from "@/core/utils/jwt";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1/api/v1";

// ── web fallback (non-Tauri) ─────────────────────────────────────────────────
const WEB_RT_KEY = "tomo.refreshToken";
let webAccess: string | null = null;
const webListeners = new Set<() => void>();
const notifyWeb = () => webListeners.forEach((l) => l());

async function webLogin(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const { data } = await res.json();
  webAccess = data.accessToken;
  localStorage.setItem(WEB_RT_KEY, data.refreshToken);
  notifyWeb();
  return data.accessToken;
}

async function webGetAccessToken(): Promise<string | null> {
  if (webAccess && !isTokenExpired(webAccess)) return webAccess;
  const rt = localStorage.getItem(WEB_RT_KEY);
  if (!rt) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        localStorage.removeItem(WEB_RT_KEY);
        webAccess = null;
        notifyWeb();
        return null;
      }
      throw new Error(`server error: ${res.status}`);
    }
    const { data } = await res.json();
    webAccess = data.accessToken;
    localStorage.setItem(WEB_RT_KEY, data.refreshToken);
    return webAccess;
  } catch (err) {
    throw err;
  }
}

async function webLogout(): Promise<void> {
  if (webAccess) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${webAccess}` },
    }).catch(() => {});
  }
  webAccess = null;
  localStorage.removeItem(WEB_RT_KEY);
  notifyWeb();
}

// ── public API ───────────────────────────────────────────────────────────────

/** Current valid access token (refreshing if needed), or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (isTauri()) return (await invoke("auth_access_token")) as string | null;
  return webGetAccessToken();
}

/**
 * Cached access token if still valid — NEVER performs a network refresh.
 * Used on the render path to resolve auth status instantly without blocking on
 * the network; follow up with getAccessToken() in the background.
 */
export async function peekAccessToken(): Promise<string | null> {
  if (isTauri()) return (await invoke("auth_peek_access_token")) as string | null;
  return webAccess && !isTokenExpired(webAccess) ? webAccess : null;
}

/** Sign in. Returns the access token (caller decodes the user from it). */
export async function login(
  identifier: string,
  password: string
): Promise<string> {
  if (isTauri())
    return (await invoke("auth_login", { identifier, password })) as string;
  return webLogin(identifier, password);
}

/** Sign out: revoke server-side (best-effort) and drop local tokens. */
export async function logout(): Promise<void> {
  if (isTauri()) {
    await invoke("auth_logout");
    return;
  }
  return webLogout();
}

/** Whether a refresh token exists (a session can potentially be restored). */
export async function isAuthenticated(): Promise<boolean> {
  if (isTauri()) return (await invoke("auth_is_authenticated")) as boolean;
  return !!localStorage.getItem(WEB_RT_KEY);
}

/** Subscribe to auth changes (login / logout / session expiry). */
export function onAuthChanged(cb: () => void): () => void {
  if (isTauri()) {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("auth://changed", () => cb()).then((fn) => {
        unlisten = fn;
      });
    });
    return () => unlisten?.();
  }
  webListeners.add(cb);
  return () => {
    webListeners.delete(cb);
  };
}
