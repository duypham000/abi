/**
 * Dynamic API & Endpoint Configuration.
 *
 * Resolves Go / Node / WebSocket URLs at call-time rather than module load-time,
 * supporting:
 * 1. Runtime overrides (`localStorage["tomo_api_url"]` or `window.__TOMO_CONFIG__`)
 * 2. Vite environment variables (`VITE_GO_API_URL`, `TOMO_API_BASE`, `VITE_API_BASE_URL`)
 * 3. Automatic detection of proxied Vite dev server vs packaged Tauri / static builds
 */

const RUNTIME_API_URL_KEY = "tomo_api_url";

interface RuntimeConfigWindow extends Window {
  __TOMO_CONFIG__?: {
    apiUrl?: string;
    apiBasePath?: string;
  };
}

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

function getRuntimeOverrideUrl(): string | null {
  if (typeof window === "undefined") return null;
  const winCfg = (window as RuntimeConfigWindow).__TOMO_CONFIG__?.apiUrl;
  if (winCfg && /^https?:\/\//i.test(winCfg.trim())) {
    return trimTrailingSlashes(winCfg.trim());
  }
  try {
    const stored = window.localStorage?.getItem(RUNTIME_API_URL_KEY);
    if (stored && /^https?:\/\//i.test(stored.trim())) {
      return trimTrailingSlashes(stored.trim());
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

export function setRuntimeGoApiUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (url && url.trim()) {
      window.localStorage?.setItem(RUNTIME_API_URL_KEY, trimTrailingSlashes(url.trim()));
    } else {
      window.localStorage?.removeItem(RUNTIME_API_URL_KEY);
    }
  } catch {
    // ignore storage access errors
  }
}

export function getConfiguredApiBasePath(): string {
  if (typeof window !== "undefined") {
    const winPath = (window as RuntimeConfigWindow).__TOMO_CONFIG__?.apiBasePath;
    if (winPath && winPath.trim()) {
      const normalized = winPath.trim();
      return normalized.startsWith("/") ? trimTrailingSlashes(normalized) : `/${trimTrailingSlashes(normalized)}`;
    }
  }
  const envPath = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envPath) {
    return envPath.startsWith("/") ? trimTrailingSlashes(envPath) : `/${trimTrailingSlashes(envPath)}`;
  }
  return "/api/v1";
}

/**
 * True when running on Vite's HTTP dev server where `/api/*` and `/actuator/*`
 * are handled by Vite's reverse proxy (avoiding CORS during local dev).
 * False in Tauri packaged builds (`tauri.localhost` / `tauri:`) and static prod builds.
 */
export function isProxiedDevEnvironment(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  return /^https?:$/i.test(protocol) && hostname !== "tauri.localhost";
}

/**
 * Combines a server root/base URL with the API prefix using the standard URL parser
 * so it never duplicates `/api/v1` or `/v1`.
 */
export function buildApiBaseUrl(serverUrl: string, apiPath = getConfiguredApiBasePath()): string {
  const cleanServer = trimTrailingSlashes(serverUrl.trim());
  if (!cleanServer) return apiPath;

  try {
    const parsed = new URL(cleanServer);
    let pathname = trimTrailingSlashes(parsed.pathname);
    if (pathname.endsWith(apiPath) || pathname.endsWith("/api/v1")) {
      parsed.pathname = pathname;
      return trimTrailingSlashes(parsed.toString());
    }
    if (pathname.endsWith("/v1")) {
      pathname = pathname.slice(0, -"/v1".length);
    }
    parsed.pathname = `${pathname}${apiPath}`;
    return trimTrailingSlashes(parsed.toString());
  } catch {
    if (cleanServer.endsWith(apiPath) || cleanServer.endsWith("/api/v1")) {
      return cleanServer;
    }
    if (cleanServer.endsWith("/v1")) {
      return `${cleanServer.slice(0, -"/v1".length)}${apiPath}`;
    }
    return `${cleanServer}${apiPath}`;
  }
}

function resolveConfiguredServerUrl(): string | null {
  const runtimeUrl = getRuntimeOverrideUrl();
  if (runtimeUrl) return runtimeUrl;

  const viteGoUrl = (import.meta.env.VITE_GO_API_URL as string | undefined)?.trim();
  if (viteGoUrl && /^https?:\/\//i.test(viteGoUrl)) {
    return trimTrailingSlashes(viteGoUrl);
  }

  const tomoApiBase = (import.meta.env.TOMO_API_BASE as string | undefined)?.trim();
  if (tomoApiBase && /^https?:\/\//i.test(tomoApiBase)) {
    return trimTrailingSlashes(tomoApiBase);
  }

  return null;
}

/**
 * Resolves an absolute Go API base URL (with `http://` or `https://`),
 * bypassing dev proxy detection. Required for native Rust `reqwest` calls.
 */
export function getGoAbsoluteApiBaseUrl(): string {
  const apiPath = getConfiguredApiBasePath();
  const configured = resolveConfiguredServerUrl();
  if (configured) {
    return buildApiBaseUrl(configured, apiPath);
  }
  if (
    typeof window !== "undefined" &&
    /^https?:$/i.test(window.location.protocol) &&
    window.location.hostname !== "tauri.localhost"
  ) {
    return buildApiBaseUrl(window.location.origin, apiPath);
  }
  return buildApiBaseUrl("http://127.0.0.1:8080", apiPath);
}

/**
 * Resolves the Go API base URL dynamically at call-time.
 */
export function getGoApiBaseUrl(): string {
  const apiPath = getConfiguredApiBasePath();
  const runtimeOverride = getRuntimeOverrideUrl();
  if (runtimeOverride) {
    return buildApiBaseUrl(runtimeOverride, apiPath);
  }
  if (isProxiedDevEnvironment()) {
    return apiPath;
  }
  const configured = resolveConfiguredServerUrl();
  if (configured) {
    return buildApiBaseUrl(configured, apiPath);
  }
  if (typeof window !== "undefined" && /^https?:$/i.test(window.location.protocol) && window.location.hostname !== "tauri.localhost") {
    return `${window.location.origin}${apiPath}`;
  }
  return apiPath;
}

/**
 * Resolves the Go server root URL (without `/api/v1` or `/v1`) for root-level
 * endpoints such as `/health`, `/healthz`, and `/actuator/health`.
 */
export function getGoRootUrl(): string {
  const runtimeOverride = getRuntimeOverrideUrl();
  if (!runtimeOverride && isProxiedDevEnvironment()) {
    return "";
  }
  const apiBase = getGoApiBaseUrl();
  if (!/^https?:\/\//i.test(apiBase)) {
    return "";
  }
  try {
    const parsed = new URL(apiBase);
    const apiPath = getConfiguredApiBasePath();
    let p = trimTrailingSlashes(parsed.pathname);
    if (p.endsWith(apiPath)) {
      p = p.slice(0, -apiPath.length);
    } else if (p.endsWith("/api/v1")) {
      p = p.slice(0, -"/api/v1".length);
    } else if (p.endsWith("/v1")) {
      p = p.slice(0, -"/v1".length);
    }
    parsed.pathname = p || "/";
    return trimTrailingSlashes(parsed.toString());
  } catch {
    return "";
  }
}
