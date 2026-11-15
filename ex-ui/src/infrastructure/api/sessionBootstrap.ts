/**
 * Plain-fetch helper used by the app bootstrap (init screen), independent of
 * RTK Query so we can run it before the React tree / store wiring is ready.
 *
 * Session restore/refresh is owned by the Rust auth core (see authBridge); this
 * module only exposes the public server health probe.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1/api/v1";

/**
 * Derive the `/actuator/health` URL from the API base. The health endpoint
 * lives at the host root (NOT under /api/v1).
 *  - absolute base "https://api.tomoo.uk/api/v1" -> "https://api.tomoo.uk/actuator/health"
 *  - relative base "/api/v1" (dev, proxied)      -> "/actuator/health"
 */
function healthUrl(): string {
  const base = API_BASE.replace(/\/api\/v1\/?$/, "");
  return `${base}/actuator/health`;
}

/** Probe the backend health endpoint. Returns true when the server answers `status: UP`. */
export async function pingServer(timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl(), {
      method: "GET",
      signal: controller.signal,
      // health is public; no credentials needed
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    return body?.status === "UP";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
