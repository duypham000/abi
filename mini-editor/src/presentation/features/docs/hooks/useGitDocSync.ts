import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { docsApi } from "@/infrastructure/api/docsApi";
import { githubApi } from "@/infrastructure/api/githubApi";
import { cacheDoc } from "@/infrastructure/tauri/docCacheService";
import type { AppDispatch } from "@/presentation/store";

export type GitSyncStatus = "idle" | "syncing" | "synced" | "failed" | "not-on-git";

export interface GitSyncResult {
  /** Real backend UUID for the doc, available after successful sync */
  backendDocId: string | null;
  status: GitSyncStatus;
}

/**
 * When a doc exists on GitHub (isDocOnGit=true) but is missing on the Go backend
 * (isSavedOnline=false), this hook reads the git file from the workspace and
 * registers it on the backend via POST /api/v1/docs/sync-from-git.
 *
 * @param localDocId   Numeric local doc ID (e.g. 180015)
 * @param gitFilePath  File path in workspace (e.g. "docs/doc-180015.json")
 * @param enabled      Only run when isDocOnGit=true && !isSavedOnline
 */
export function useGitDocSync(
  localDocId: number,
  gitFilePath: string,
  enabled: boolean
): GitSyncResult {
  const dispatch = useDispatch<AppDispatch>();
  const [status, setStatus] = useState<GitSyncStatus>("idle");
  const [backendDocId, setBackendDocId] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || localDocId <= 0 || ranRef.current) return;
    ranRef.current = true;
    setStatus("syncing");

    (async () => {
      try {
        // 1. Fetch git file content from workspace
        const fileRes = await dispatch(
          githubApi.endpoints.getGitFile.initiate(gitFilePath, { forceRefetch: true })
        ).unwrap();

        if (!fileRes?.content) {
          setStatus("not-on-git");
          return;
        }

        // Parse JSON content if necessary
        let fileContent = fileRes.content as any;
        if (typeof fileContent === "string") {
          try {
            fileContent = JSON.parse(fileContent);
          } catch {
            // Raw text format
          }
        }

        const title: string =
          (typeof fileContent === "object" && fileContent?.title)
            ? fileContent.title
            : `doc-${localDocId}`;

        let contentStr = "";
        if (typeof fileContent === "object" && fileContent?.content !== undefined) {
          contentStr = typeof fileContent.content === "string"
            ? fileContent.content
            : JSON.stringify(fileContent.content);
        } else if (typeof fileRes.content === "string") {
          contentStr = fileRes.content;
        }

        // 2. Register/idempotently fetch doc on backend
        const gitSlug = `doc-${localDocId}`;
        const doc = await dispatch(
          docsApi.endpoints.syncDocFromGit.initiate({
            title,
            content: contentStr,
            gitSlug,
            status: 1,
          })
        ).unwrap();

        if (doc && doc.id) {
          const docIdStr = String(doc.id);
          // 3. Cache into local SQLite
          try {
            await cacheDoc({
              ...doc,
              backendUuid: docIdStr,
            });
          } catch (e) {
            console.warn("[useGitDocSync] cacheDoc failed:", e);
          }

          setBackendDocId(docIdStr);
          setStatus("synced");
        } else {
          setStatus("failed");
        }
      } catch (err) {
        console.warn("[useGitDocSync] sync failed:", err);
        setStatus("failed");
      }
    })();
  }, [enabled, localDocId, gitFilePath, dispatch]);

  // Reset when switching to a different doc
  useEffect(() => {
    ranRef.current = false;
    setStatus("idle");
    setBackendDocId(null);
  }, [localDocId]);

  return { backendDocId, status };
}

