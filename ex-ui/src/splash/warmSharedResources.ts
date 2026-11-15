/**
 * Best-effort prefetch + caching run once on the splash window, while the init
 * screen is visible. Everything cached here lives in resources that are SHARED
 * across every webview the app later opens (main + popups):
 *   - the SQLite doc cache (docCacheService) — so opening a recent doc is instant
 *   - the WebView2 disk HTTP cache (same user-data-dir) — so the same GETs in
 *     other windows are served from cache
 *
 * It must never block startup: any failure is swallowed and the splash proceeds
 * to open the main window regardless (the app works fully online afterwards).
 */
import { cacheDoc } from "@/infrastructure/tauri/docCacheService";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import type { DocDto } from "@/core/interfaces/docs";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1/api/v1";

/** Number of most-recent docs to pull into the local cache during warm-up. */
const WARM_DOCS = 20;

async function authedJson<T>(path: string): Promise<T | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { data?: T } | null;
    return body?.data ?? null;
  } catch {
    return null;
  }
}

/** Prefetch the recent docs list and cache each doc into the shared SQLite store. */
async function warmRecentDocs(): Promise<void> {
  const docs = await authedJson<DocDto[]>(
    `/base/docs/list?page=0&size=${WARM_DOCS}&sortBy=id&sortDirection=DESC`
  );
  if (!docs || !Array.isArray(docs)) return;
  await Promise.all(docs.map((d) => cacheDoc(d).catch(() => {})));
}

/**
 * Run all warm-up tasks. Resolves once they settle (or fail) — never throws.
 * No-op when there is no access token (unauthenticated launch).
 */
export async function warmSharedResources(): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    await Promise.allSettled([warmRecentDocs()]);
  } catch {
    // Ignore network or connection errors during warm-up
  }
}
