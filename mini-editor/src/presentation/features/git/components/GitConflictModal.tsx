import { useState } from "react";
import {
  useGetConflictsQuery,
  useResolveConflictMutation,
} from "@/infrastructure/api/githubApi";
import { AlertTriangle, X, FileWarning, Check } from "lucide-react";
import "./GitConflictModal.scss";

interface GitConflictModalProps {
  onClose: () => void;
}

export function GitConflictModal({ onClose }: GitConflictModalProps) {
  const { data, isLoading, refetch } = useGetConflictsQuery();
  const [resolveConflict, { isLoading: isResolving }] = useResolveConflictMutation();

  const conflicts = data?.conflicts || [];
  const [selectedPath, setSelectedPath] = useState<string>(conflicts[0]?.path || "");
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const activeConflict = conflicts.find((c) => c.path === selectedPath) || conflicts[0];

  const handleSelectFile = (path: string) => {
    setSelectedPath(path);
    setIsManualMode(false);
    setStatusMsg(null);
  };

  const handleResolve = async (strategy: "ours" | "theirs" | "manual") => {
    if (!activeConflict) return;
    setStatusMsg(null);
    try {
      await resolveConflict({
        filePath: activeConflict.path,
        strategy,
        manualContent: strategy === "manual" ? manualText : undefined,
      }).unwrap();
      setStatusMsg(`Successfully resolved ${activeConflict.path} using ${strategy}!`);
      setIsManualMode(false);
      refetch();
    } catch (err: unknown) {
      setStatusMsg("Failed to resolve conflict: " + String(err));
    }
  };

  const startManualMode = () => {
    setIsManualMode(true);
    setManualText(activeConflict?.oursContent || activeConflict?.theirsContent || "");
  };

  return (
    <div className="git-conflict-overlay" onClick={onClose}>
      <div className="git-conflict-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conflict-header">
          <div className="conflict-title-group">
            <AlertTriangle size={20} />
            <span>Resolve Merge Conflicts ({conflicts.length})</span>
          </div>
          <button className="btn-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="conflict-body">
          {isLoading ? (
            <div style={{ padding: 30 }}>Loading conflict details…</div>
          ) : conflicts.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", width: "100%", color: "#059669" }}>
              <Check size={36} style={{ marginBottom: 10 }} />
              <div>No unresolved conflicts in repository. Working tree is clean!</div>
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="conflict-file-list">
                {conflicts.map((c) => (
                  <button
                    key={c.path}
                    className={`conflict-file-item ${c.path === (activeConflict?.path || selectedPath) ? "active" : ""}`}
                    onClick={() => handleSelectFile(c.path)}
                  >
                    <FileWarning size={14} color="#dc2626" />
                    <span>{c.path}</span>
                  </button>
                ))}
              </div>

              {/* Resolver details pane */}
              {activeConflict && (
                <div className="conflict-resolver-pane">
                  <div className="pane-actions">
                    <button
                      className="btn-strategy btn-strategy-ours"
                      onClick={() => handleResolve("ours")}
                      disabled={isResolving}
                    >
                      Accept Ours (Local)
                    </button>
                    <button
                      className="btn-strategy btn-strategy-theirs"
                      onClick={() => handleResolve("theirs")}
                      disabled={isResolving}
                    >
                      Accept Theirs (Remote)
                    </button>
                    {!isManualMode ? (
                      <button
                        className="btn-strategy"
                        onClick={startManualMode}
                        disabled={isResolving}
                      >
                        Edit Manually
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn-strategy"
                          style={{ background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}
                          onClick={() => handleResolve("manual")}
                          disabled={isResolving || !manualText.trim()}
                        >
                          Save Manual Resolution
                        </button>
                        <button
                          className="btn-strategy"
                          onClick={() => setIsManualMode(false)}
                          disabled={isResolving}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  {statusMsg && (
                    <div style={{ fontSize: "0.825rem", padding: "6px 10px", borderRadius: 4, background: "#f0fdf4", color: "#166534", marginBottom: 10 }}>
                      {statusMsg}
                    </div>
                  )}

                  {!isManualMode ? (
                    <div className="diff-columns">
                      <div className="diff-col diff-col--ours">
                        <div className="col-header">Ours (Local working tree)</div>
                        <div className="col-content">
                          {activeConflict.oursContent || "<Empty file>"}
                        </div>
                      </div>
                      <div className="diff-col diff-col--theirs">
                        <div className="col-header">Theirs (Incoming from Pull)</div>
                        <div className="col-content">
                          {activeConflict.theirsContent || "<Empty file>"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="manual-editor-area">
                      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>
                        Edit resolved content for: {activeConflict.path}
                      </label>
                      <textarea
                        value={manualText}
                        onChange={(e) => setManualText(e.target.value)}
                        placeholder="Write resolved content..."
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
