import { useCallback, useState } from "react";

export function usePersistedState<T extends object>(
  key: string,
  defaultValue: T
): [T, (next: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return { ...defaultValue, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return defaultValue;
  });

  const setAndPersist = useCallback(
    (next: T) => {
      setState(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key]
  );

  return [state, setAndPersist];
}
