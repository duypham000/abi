import { create } from "zustand";
import type { RunningProcess } from "@/core/interfaces/script";

interface ScriptsUiStore {
  runningProcesses: RunningProcess[];
  addProcess: (p: RunningProcess) => void;
  removeProcess: (instanceId: string) => void;
  setHidden: (instanceId: string, isHidden: boolean) => void;
  getByScript: (scriptId: string) => RunningProcess[];
}

export const useScriptsStore = create<ScriptsUiStore>((set, get) => ({
  runningProcesses: [],

  addProcess: (p) =>
    set((state) => ({ runningProcesses: [...state.runningProcesses, p] })),

  removeProcess: (instanceId) =>
    set((state) => ({
      runningProcesses: state.runningProcesses.filter(
        (p) => p.instanceId !== instanceId
      ),
    })),

  setHidden: (instanceId, isHidden) =>
    set((state) => ({
      runningProcesses: state.runningProcesses.map((p) =>
        p.instanceId === instanceId ? { ...p, isHidden } : p
      ),
    })),

  getByScript: (scriptId) =>
    get().runningProcesses.filter((p) => p.scriptId === scriptId),
}));
