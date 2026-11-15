import { create } from "zustand";
import { nanoid } from "nanoid";
import type { LogEntry, SseState } from "../types/realtime";

interface SseStoreState {
  url: string;
  eventType: string;
  connectionState: SseState;
  log: LogEntry[];
  // Actions
  setUrl: (url: string) => void;
  setEventType: (t: string) => void;
  setConnectionState: (s: SseState) => void;
  addLogEntry: (entry: Omit<LogEntry, "id">) => void;
  clearLog: () => void;
}

export const useSseStore = create<SseStoreState>((set) => ({
  url: "",
  eventType: "message",
  connectionState: "STOPPED",
  log: [],

  setUrl: (url) => set({ url }),
  setEventType: (t) => set({ eventType: t }),
  setConnectionState: (s) => set({ connectionState: s }),
  addLogEntry: (entry) =>
    set((s) => ({ log: [...s.log, { ...entry, id: nanoid() }] })),
  clearLog: () => set({ log: [] }),
}));
