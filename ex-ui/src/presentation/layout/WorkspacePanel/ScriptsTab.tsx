import { useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { EyeIcon, EyeOffIcon, XIcon, TerminalIcon } from "lucide-react";
import { useScriptsStore } from "@/presentation/features/scripts/store/scriptsStore";
import {
  killScript,
  showScriptWindow,
  hideScriptWindow,
} from "@/infrastructure/tauri/scriptService";

dayjs.extend(relativeTime);

export function ScriptsTab() {
  const { runningProcesses, removeProcess, setHidden } = useScriptsStore();
  const [pending, setPending] = useState<Set<string>>(new Set());

  if (runningProcesses.length === 0) {
    return (
      <div className="wp-scripts-empty">
        <TerminalIcon size={16} />
        <span>No scripts running</span>
      </div>
    );
  }

  const setBusy = (id: string, busy: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      busy ? next.add(id) : next.delete(id);
      return next;
    });

  const handleKill = async (instanceId: string, pid: number) => {
    setBusy(instanceId, true);
    try {
      await killScript(pid);
      removeProcess(instanceId);
    } catch {
      /* ignore */
    } finally {
      setBusy(instanceId, false);
    }
  };

  const handleToggleWindow = async (instanceId: string, pid: number, isHidden: boolean) => {
    setBusy(instanceId, true);
    try {
      if (isHidden) {
        await showScriptWindow(pid);
        setHidden(instanceId, false);
      } else {
        await hideScriptWindow(pid);
        setHidden(instanceId, true);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(instanceId, false);
    }
  };

  return (
    <div className="wp-scripts-view">
      <table className="wp-table">
        <thead>
          <tr>
            <th>Script</th>
            <th>PID</th>
            <th>Instance</th>
            <th>Mode</th>
            <th>Started</th>
            <th>Window</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runningProcesses.map((proc) => {
            const busy = pending.has(proc.instanceId);
            const mode = proc.isAdmin ? "admin" : proc.isHidden ? "hidden" : "normal";
            return (
              <tr key={proc.instanceId}>
                <td className="wp-scripts__title">{proc.scriptTitle}</td>
                <td><code className="wp-code">{proc.pid}</code></td>
                <td><code className="wp-code wp-scripts__iid">{proc.instanceId.slice(0, 8)}</code></td>
                <td>
                  <span className={`wp-badge wp-badge--${mode}`}>{mode}</span>
                </td>
                <td className="wp-scripts__time">{dayjs(proc.startedAt).fromNow()}</td>
                <td>
                  <span className={`wp-badge ${proc.isHidden ? "wp-badge--hidden" : "wp-badge--visible"}`}>
                    {proc.isHidden ? "hidden" : "visible"}
                  </span>
                </td>
                <td className="wp-scripts__actions">
                  <button
                    className="wp-icon-btn"
                    title={proc.isHidden ? "Show window" : "Hide window"}
                    disabled={busy}
                    onClick={() => handleToggleWindow(proc.instanceId, proc.pid, proc.isHidden)}
                  >
                    {proc.isHidden ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
                  </button>
                  <button
                    className="wp-icon-btn wp-icon-btn--danger"
                    title="Kill process"
                    disabled={busy}
                    onClick={() => handleKill(proc.instanceId, proc.pid)}
                  >
                    <XIcon size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
