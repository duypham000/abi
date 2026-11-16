import { useMemo } from "react";
import { parseOrHashId } from "@/core/utils/idUtils";
import {
  useGetWorkspaceStatusQuery,
  useGetWorkspaceManifestQuery,
} from "@/infrastructure/api/githubApi";

export type EntityGitStatus = "uptodate" | "modified" | "conflict" | "behind" | "untracked";

export function useGitTrackedEntities() {
  const { data: statusData } = useGetWorkspaceStatusQuery();
  const { data: manifest } = useGetWorkspaceManifestQuery();

  return useMemo(() => {
    const gitDocKeys = new Set<string>();
    const gitStatusMap = new Map<string, EntityGitStatus>();

    const registerItem = (
      itemId: string,
      status: EntityGitStatus,
      overwrite: boolean,
      slug?: string,
      path?: string
    ) => {
      const candidates = new Set<string>();
      const addCandidate = (val?: string) => {
        if (!val) return;
        const raw = val.replace(/^doc-/, "");
        const prefixed = val.startsWith("doc-") ? val : `doc-${raw}`;
        candidates.add(val);
        candidates.add(raw);
        candidates.add(prefixed);
        candidates.add(String(parseOrHashId(prefixed, "doc-")));
      };
      addCandidate(itemId);
      addCandidate(slug);
      if (path) {
        const base = path.split("/").pop()?.replace(/\.json$/i, "");
        addCandidate(base);
      }

      for (const key of candidates) {
        gitDocKeys.add(key);
        if (overwrite || !gitStatusMap.has(key)) {
          gitStatusMap.set(key, status);
        }
      }
    };

    // Priority 1: workspaceStatus (has real-time git status)
    if (statusData?.items) {
      for (const item of statusData.items) {
        if (item.type === "doc" || item.path.startsWith("docs/doc-")) {
          registerItem(item.id, item.status as EntityGitStatus, true, (item as any).slug, item.path);
        }
      }
    }

    // Priority 2: manifest items (if statusData not yet fetched)
    if (manifest?.items) {
      for (const item of manifest.items) {
        if (item.type === "doc" || item.path.startsWith("docs/doc-")) {
          registerItem(item.id, "uptodate", false, item.slug, item.path);
        }
      }
    }

    return {
      isDocOnGit: (...docIds: (number | string | null | undefined)[]): boolean =>
        docIds.some((id) => id != null && gitDocKeys.has(String(id))),
      getDocGitStatus: (...docIds: (number | string | null | undefined)[]): EntityGitStatus | undefined => {
        for (const id of docIds) {
          if (id == null) continue;
          const status = gitStatusMap.get(String(id));
          if (status) return status;
        }
        return undefined;
      },
    };
  }, [statusData, manifest]);
}
