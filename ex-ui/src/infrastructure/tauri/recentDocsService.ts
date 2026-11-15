/**
 * Tracks recently opened docs (both local drafts and saved backend docs).
 * Persisted via the async kv store so the tray menu can surface the latest few.
 */
import { invoke } from "@tauri-apps/api/core";
import { getItem, setItem } from "@/infrastructure/tauri/kvStore";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const STORAGE_KEY = "recent-docs-v1";
const MAX_RECENTS = 8;

/** Push the latest recents into the Rust tray menu (coordinator owns the tray). */
async function syncTrayRecents(list: RecentDoc[]): Promise<void> {
  if (!isTauri()) return;
  const items = list
    .slice(0, 4)
    .map((r) => ({ kind: r.kind, id: r.id, title: r.title }));
  await invoke("cmd_set_tray_recents", { items }).catch(() => {});
}

export interface RecentDoc {
  kind: "draft" | "doc";
  id: string;
  title: string;
  openedAt: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to recents changes (e.g. to re-sync the tray menu). Returns an unsubscribe fn. */
export function onRecentDocsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyChange(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  });
}

export async function getRecentDocs(): Promise<RecentDoc[]> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as RecentDoc[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && (r.kind === "draft" || r.kind === "doc") && r.id)
      .sort((a, b) => (b.openedAt ?? "").localeCompare(a.openedAt ?? ""));
  } catch {
    return [];
  }
}

export async function pushRecentDoc(
  item: { kind: "draft" | "doc"; id: string; title?: string | null }
): Promise<void> {
  if (!item.id) return;
  const title = (item.title ?? "").trim() || "Untitled";
  const existing = await getRecentDocs();
  const deduped = existing.filter((r) => !(r.kind === item.kind && r.id === item.id));
  const next: RecentDoc[] = [
    { kind: item.kind, id: item.id, title, openedAt: new Date().toISOString() },
    ...deduped,
  ].slice(0, MAX_RECENTS);
  await setItem(STORAGE_KEY, JSON.stringify(next));
  notifyChange();
  void syncTrayRecents(next);
}

export async function removeRecentDoc(
  kind: "draft" | "doc",
  id: string
): Promise<void> {
  if (!id) return;
  const existing = await getRecentDocs();
  const next = existing.filter((r) => !(r.kind === kind && r.id === id));
  await setItem(STORAGE_KEY, JSON.stringify(next));
  notifyChange();
  void syncTrayRecents(next);
}
