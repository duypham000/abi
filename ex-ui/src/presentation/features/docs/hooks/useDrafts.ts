import { useCallback, useEffect, useState } from "react";
import {
  listDrafts,
  deleteDraft,
  type DraftSummary,
} from "@/infrastructure/tauri/docCacheService";

export function useDrafts() {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await listDrafts();
    // Most recently edited first
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    setDrafts(rows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const removeDraft = useCallback(
    async (localId: string) => {
      await deleteDraft(localId);
      await refresh();
    },
    [refresh]
  );

  return { drafts, isLoading, refresh, removeDraft };
}
