import { create } from "zustand";
import { nanoid } from "nanoid";
import type { LogEntry, SioAuthConfig, RealtimeConnectionState } from "../types/realtime";

type SioVersion = "v4" | "v3" | "v2";
type SioActiveTab = "communication" | "authorization";

interface SocketIOState {
  url: string;
  path: string;
  version: SioVersion;
  auth: SioAuthConfig;
  connectionState: RealtimeConnectionState;
  log: LogEntry[];
  activeTab: SioActiveTab;
  eventName: string;
  messageInput: string;
  contentType: "json" | "raw";
  // Actions
  setUrl: (url: string) => void;
  setPath: (path: string) => void;
  setVersion: (v: SioVersion) => void;
  setAuth: (auth: Partial<SioAuthConfig>) => void;
  setConnectionState: (s: RealtimeConnectionState) => void;
  addLogEntry: (entry: Omit<LogEntry, "id">) => void;
  clearLog: () => void;
  setActiveTab: (t: SioActiveTab) => void;
  setEventName: (e: string) => void;
  setMessageInput: (v: string) => void;
  setContentType: (t: "json" | "raw") => void;
}

export const useSocketIOStore = create<SocketIOState>((set) => ({
  url: "",
  path: "/socket.io",
  version: "v4",
  auth: { type: "none", token: "", enabled: true },
  connectionState: "DISCONNECTED",
  log: [],
  activeTab: "communication",
  eventName: "message",
  messageInput: "",
  contentType: "json",

  setUrl: (url) => set({ url }),
  setPath: (path) => set({ path }),
  setVersion: (v) => set({ version: v }),
  setAuth: (auth) => set((s) => ({ auth: { ...s.auth, ...auth } })),
  setConnectionState: (s) => set({ connectionState: s }),
  addLogEntry: (entry) =>
    set((s) => ({ log: [...s.log, { ...entry, id: nanoid() }] })),
  clearLog: () => set({ log: [] }),
  setActiveTab: (t) => set({ activeTab: t }),
  setEventName: (e) => set({ eventName: e }),
  setMessageInput: (v) => set({ messageInput: v }),
  setContentType: (t) => set({ contentType: t }),
}));
