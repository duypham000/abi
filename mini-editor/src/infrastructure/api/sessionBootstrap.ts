/**
 * Session Bootstrap & Server Connectivity Check.
 */

import { getGoRootUrl } from "./apiConfig";

export async function pingServer(timeoutMs = 4000): Promise<boolean> {
  const root = getGoRootUrl();
  const paths = ["/health", "/healthz", "/actuator/health"];
  const endpoints = root ? paths.map((p) => `${root}${p}`) : ["/health", "/go/health", "/healthz", "/actuator/health"];
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) continue;
      const body = (await res.json().catch(() => null)) as { status?: string; success?: boolean } | null;
      if (body && (body.status === "UP" || body.success === true)) return true;
    } catch {
      // try next
    }
  }
  return false;
}
