/**
 * Recently-opened docs, persisted to localStorage.
 * Shared by DocsPanel (sidebar) and the global Command Palette quick-open.
 */
export const RECENT_KEY = "tomo:recent-docs";
export const MAX_RECENT = 5;

export interface RecentEntry {
  id: number;
  title: string;
}

export function getRecent(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecent(entry: RecentEntry) {
  const prev = getRecent().filter((r) => r.id !== entry.id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...prev].slice(0, MAX_RECENT)));
}
