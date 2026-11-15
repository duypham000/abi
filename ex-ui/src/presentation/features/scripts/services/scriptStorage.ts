import { getItem, setItem } from "@/infrastructure/tauri/kvStore";
import type { RunHistory, Script } from "@/core/interfaces/script";

const SCRIPTS_KEY = "scripts_v1";
const HISTORY_KEY = "script_history_v1";
const MAX_HISTORY = 200;

export async function loadScripts(): Promise<Script[]> {
  const raw = await getItem(SCRIPTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Script[];
  } catch {
    return [];
  }
}

export async function saveScripts(scripts: Script[]): Promise<void> {
  await setItem(SCRIPTS_KEY, JSON.stringify(scripts));
}

export async function loadHistory(): Promise<RunHistory[]> {
  const raw = await getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RunHistory[];
  } catch {
    return [];
  }
}

export async function appendHistory(entry: RunHistory): Promise<RunHistory[]> {
  const history = await loadHistory();
  const updated = [entry, ...history].slice(0, MAX_HISTORY);
  await setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function updateHistoryEndTime(
  id: string,
  endedAt: string
): Promise<RunHistory[]> {
  const history = await loadHistory();
  const updated = history.map((h) => (h.id === id ? { ...h, endedAt } : h));
  await setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearHistory(): Promise<void> {
  await setItem(HISTORY_KEY, JSON.stringify([]));
}
