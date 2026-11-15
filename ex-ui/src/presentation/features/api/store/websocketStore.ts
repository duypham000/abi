import { create } from "zustand";
import { nanoid } from "nanoid";
import type { LogEntry, WsProtocol, RealtimeConnectionState } from "../types/realtime";

interface WebSocketState {
  url: string;
  protocols: WsProtocol[];
  connectionState: RealtimeConnectionState;
  log: LogEntry[];
  messageInput: string;
  contentType: "json" | "raw";
  // Actions
  setUrl: (url: string) => void;
  setConnectionState: (s: RealtimeConnectionState) => void;
  addLogEntry: (entry: Omit<LogEntry, "id">) => void;
  clearLog: () => void;
  setMessageInput: (v: string) => void;
  setContentType: (t: "json" | "raw") => void;
  addProtocol: () => void;
  updateProtocol: (id: string, value: string) => void;
  toggleProtocol: (id: string) => void;
  removeProtocol: (id: string) => void;
  clearProtocols: () => void;
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  url: "",
  protocols: [],
  connectionState: "DISCONNECTED",
  log: [],
  messageInput: "",
  contentType: "json",

  setUrl: (url) => set({ url }),
  setConnectionState: (s) => set({ connectionState: s }),
  addLogEntry: (entry) =>
    set((s) => ({ log: [...s.log, { ...entry, id: nanoid() }] })),
  clearLog: () => set({ log: [] }),
  setMessageInput: (v) => set({ messageInput: v }),
  setContentType: (t) => set({ contentType: t }),
  addProtocol: () =>
    set((s) => ({
      protocols: [...s.protocols, { id: nanoid(), value: "", enabled: true }],
    })),
  updateProtocol: (id, value) =>
    set((s) => ({
      protocols: s.protocols.map((p) => (p.id === id ? { ...p, value } : p)),
    })),
  toggleProtocol: (id) =>
    set((s) => ({
      protocols: s.protocols.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    })),
  removeProtocol: (id) =>
    set((s) => ({
      protocols: s.protocols.filter((p) => p.id !== id),
    })),
  clearProtocols: () => set({ protocols: [] }),
}));
