import { useCallback, useEffect, useState } from "react";
import { getItem, setItem } from "@/infrastructure/tauri/kvStore";

/**
 * useState backed by SQLite (Tauri) or localStorage (web).
 * Renders with defaultValue immediately, then hydrates from store async.
 */
export function usePersistedState<T extends object>(
  key: string,
  defaultValue: T
): [T, (next: T) => void] {
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    getItem(key).then((raw) => {
      if (!raw) return;
      try {
        setState((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setAndPersist = useCallback(
    (next: T) => {
      setState(next);
      setItem(key, JSON.stringify(next));
    },
    [key]
  );

  return [state, setAndPersist];
}
