import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import dayjs from "dayjs";
import { message } from "antd";
import type { RunHistory, RunMode, Script } from "@/core/interfaces/script";
import {
  hideScriptWindow,
  killScript,
  runScript,
  showScriptWindow,
} from "@/infrastructure/tauri/scriptService";
import {
  appendHistory,
  clearHistory,
  loadHistory,
  loadScripts,
  saveScripts,
  updateHistoryEndTime,
} from "../services/scriptStorage";
import { useScriptsStore } from "../store/scriptsStore";

export function useScripts() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const { runningProcesses, addProcess, removeProcess, setHidden } =
    useScriptsStore();

  useEffect(() => {
    Promise.all([loadScripts(), loadHistory()]).then(([s, h]) => {
      setScripts(s);
      setHistory(h);
      setLoading(false);
    });
  }, []);

  const createScript = useCallback(
    async (data: Omit<Script, "id" | "createdAt" | "updatedAt">) => {
      const now = dayjs().toISOString();
      const script: Script = { ...data, id: nanoid(), createdAt: now, updatedAt: now };
      const updated = [...scripts, script];
      setScripts(updated);
      await saveScripts(updated);
      return script;
    },
    [scripts]
  );

  const updateScript = useCallback(
    async (id: string, data: Partial<Omit<Script, "id" | "createdAt">>) => {
      const updated = scripts.map((s) =>
        s.id === id ? { ...s, ...data, updatedAt: dayjs().toISOString() } : s
      );
      setScripts(updated);
      await saveScripts(updated);
    },
    [scripts]
  );

  const deleteScript = useCallback(
    async (id: string) => {
      const updated = scripts.filter((s) => s.id !== id);
      setScripts(updated);
      await saveScripts(updated);
    },
    [scripts]
  );

  const handleRunScript = useCallback(
    async (script: Script, mode: RunMode) => {
      try {
        const pid = await runScript(
          script.body,
          mode === "hidden",
          mode === "admin"
        );
        const instanceId = nanoid();
        const startedAt = dayjs().toISOString();

        addProcess({
          instanceId,
          scriptId: script.id,
          scriptTitle: script.title,
          pid,
          isHidden: mode === "hidden",
          isAdmin: mode === "admin",
          startedAt,
        });

        const historyEntry: RunHistory = {
          id: instanceId,
          scriptId: script.id,
          scriptTitle: script.title,
          startedAt,
          endedAt: "",
          mode,
        };
        const updated = await appendHistory(historyEntry);
        setHistory(updated);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to run script: ${msg}`);
      }
    },
    [addProcess]
  );

  const handleKillProcess = useCallback(
    async (instanceId: string) => {
      const proc = runningProcesses.find((p) => p.instanceId === instanceId);
      if (!proc) return;
      try {
        await killScript(proc.pid);
        removeProcess(instanceId);
        const endedAt = dayjs().toISOString();
        const updated = await updateHistoryEndTime(instanceId, endedAt);
        setHistory(updated);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to kill process: ${msg}`);
      }
    },
    [runningProcesses, removeProcess]
  );

  const handleShowWindow = useCallback(
    async (instanceId: string) => {
      const proc = runningProcesses.find((p) => p.instanceId === instanceId);
      if (!proc) return;
      try {
        await showScriptWindow(proc.pid);
        setHidden(instanceId, false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to show window: ${msg}`);
      }
    },
    [runningProcesses, setHidden]
  );

  const handleHideWindow = useCallback(
    async (instanceId: string) => {
      const proc = runningProcesses.find((p) => p.instanceId === instanceId);
      if (!proc) return;
      try {
        await hideScriptWindow(proc.pid);
        setHidden(instanceId, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to hide window: ${msg}`);
      }
    },
    [runningProcesses, setHidden]
  );

  const handleRestartProcess = useCallback(
    async (instanceId: string, asAdmin = false) => {
      const proc = runningProcesses.find((p) => p.instanceId === instanceId);
      if (!proc) return;
      const script = scripts.find((s) => s.id === proc.scriptId);
      if (!script) return;
      await handleKillProcess(instanceId);
      const mode: RunMode = asAdmin ? "admin" : proc.isHidden ? "hidden" : "normal";
      await handleRunScript(script, mode);
    },
    [runningProcesses, scripts, handleKillProcess, handleRunScript]
  );

  const stopAllByScript = useCallback(
    async (scriptId: string) => {
      const procs = runningProcesses.filter((p) => p.scriptId === scriptId);
      await Promise.all(procs.map((p) => handleKillProcess(p.instanceId)));
    },
    [runningProcesses, handleKillProcess]
  );

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setHistory([]);
  }, []);

  return {
    scripts,
    history,
    loading,
    runningProcesses,
    createScript,
    updateScript,
    deleteScript,
    runScript: handleRunScript,
    killProcess: handleKillProcess,
    showWindow: handleShowWindow,
    hideWindow: handleHideWindow,
    restartProcess: handleRestartProcess,
    stopAllByScript,
    clearHistory: handleClearHistory,
  };
}
