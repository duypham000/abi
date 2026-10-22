import { useMemo } from "react";
import {
  useGetWorkspaceStatusQuery,
  useGetWorkspaceManifestQuery,
} from "@/infrastructure/api/githubApi";

export type EntityGitStatus = "uptodate" | "modified" | "conflict" | "behind" | "untracked";

export function useGitTrackedEntities() {
  const { data: statusData } = useGetWorkspaceStatusQuery();
  const { data: manifest } = useGetWorkspaceManifestQuery();

  return useMemo(() => {
    const gitDocIds = new Set<number>();
    const gitStatusMap = new Map<number, EntityGitStatus>();

    // Priority 1: workspaceStatus (has real-time git status)
    if (statusData?.items) {
      for (const item of statusData.items) {
        if (item.type === "doc" || item.path.startsWith("docs/doc-")) {
          const rawId = item.id.replace("doc-", "");
          const numId = Number(rawId);
          if (!isNaN(numId)) {
            gitDocIds.add(numId);
            gitStatusMap.set(numId, item.status as EntityGitStatus);
          }
        }
      }
    }

    // Priority 2: manifest items (if statusData not yet fetched)
    if (manifest?.items) {
      for (const item of manifest.items) {
        if (item.type === "doc" || item.path.startsWith("docs/doc-")) {
          const rawId = item.id.replace("doc-", "");
          const numId = Number(rawId);
          if (!isNaN(numId)) {
            gitDocIds.add(numId);
            if (!gitStatusMap.has(numId)) {
              gitStatusMap.set(numId, "uptodate");
            }
          }
        }
      }
    }

    return {
      isDocOnGit: (docId: number): boolean => gitDocIds.has(docId),
      getDocGitStatus: (docId: number): EntityGitStatus | undefined => gitStatusMap.get(docId),
    };
  }, [statusData, manifest]);
}
