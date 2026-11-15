import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  LogEntry,
  MqttConfig,
  MqttSubscription,
  MqttQos,
  RealtimeConnectionState,
} from "../types/realtime";

const SUBSCRIPTION_COLORS = [
  "#1677ff",
  "#52c41a",
  "#faad14",
  "#f5222d",
  "#722ed1",
  "#13c2c2",
];

const DEFAULT_CONFIG: MqttConfig = {
  username: "",
  password: "",
  keepAlive: 60,
  cleanSession: true,
  lastWill: { topic: "", message: "", qos: 0, retain: false },
};

interface MqttState {
  url: string;
  clientId: string;
  config: MqttConfig;
  connectionState: RealtimeConnectionState;
  subscriptions: MqttSubscription[];
  logs: Record<string, LogEntry[]>;
  activeTopicTab: string;
  publishTopic: string;
  publishMessage: string;
  publishQos: MqttQos;
  publishRetain: boolean;
  configCollapsed: boolean;
  subscribeModalOpen: boolean;
  subscribeModalTopic: string;
  subscribeModalQos: MqttQos;
  // Actions
  setUrl: (url: string) => void;
  setClientId: (id: string) => void;
  setConfig: (patch: Partial<MqttConfig>) => void;
  setLastWill: (patch: Partial<MqttConfig["lastWill"]>) => void;
  setConnectionState: (s: RealtimeConnectionState) => void;
  addSubscription: (topic: string, qos: MqttQos) => void;
  removeSubscription: (id: string) => void;
  addLogEntry: (topics: string[], entry: Omit<LogEntry, "id">) => void;
  clearLog: (topic: string) => void;
  setActiveTopicTab: (topic: string) => void;
  setPublishTopic: (t: string) => void;
  setPublishMessage: (m: string) => void;
  setPublishQos: (q: MqttQos) => void;
  setPublishRetain: (r: boolean) => void;
  setConfigCollapsed: (v: boolean) => void;
  openSubscribeModal: () => void;
  closeSubscribeModal: () => void;
  setSubscribeModalTopic: (t: string) => void;
  setSubscribeModalQos: (q: MqttQos) => void;
}

export const useMqttStore = create<MqttState>((set) => ({
  url: "",
  clientId: `mqtt-${nanoid(6)}`,
  config: DEFAULT_CONFIG,
  connectionState: "DISCONNECTED",
  subscriptions: [],
  logs: { all: [] },
  activeTopicTab: "all",
  publishTopic: "",
  publishMessage: "",
  publishQos: 0,
  publishRetain: false,
  configCollapsed: false,
  subscribeModalOpen: false,
  subscribeModalTopic: "",
  subscribeModalQos: 0,

  setUrl: (url) => set({ url }),
  setClientId: (id) => set({ clientId: id }),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setLastWill: (patch) =>
    set((s) => ({
      config: {
        ...s.config,
        lastWill: { ...s.config.lastWill, ...patch },
      },
    })),
  setConnectionState: (s) => set({ connectionState: s }),

  addSubscription: (topic, qos) =>
    set((s) => {
      if (s.subscriptions.find((sub) => sub.topic === topic)) return {};
      const color =
        SUBSCRIPTION_COLORS[s.subscriptions.length % SUBSCRIPTION_COLORS.length];
      return {
        subscriptions: [
          ...s.subscriptions,
          { id: nanoid(), topic, qos, color },
        ],
        logs: { ...s.logs, [topic]: [] },
      };
    }),

  removeSubscription: (id) =>
    set((s) => {
      const sub = s.subscriptions.find((sub) => sub.id === id);
      if (!sub) return {};
      const newLogs = { ...s.logs };
      delete newLogs[sub.topic];
      return {
        subscriptions: s.subscriptions.filter((sub) => sub.id !== id),
        logs: newLogs,
        activeTopicTab:
          s.activeTopicTab === sub.topic ? "all" : s.activeTopicTab,
      };
    }),

  addLogEntry: (topics, entry) =>
    set((s) => {
      const newEntry = { ...entry, id: nanoid() };
      const updatedLogs = { ...s.logs };
      updatedLogs.all = [...(updatedLogs.all ?? []), newEntry];
      topics.forEach((topic) => {
        if (topic !== "all") {
          updatedLogs[topic] = [...(updatedLogs[topic] ?? []), newEntry];
        }
      });
      return { logs: updatedLogs };
    }),

  clearLog: (topic) =>
    set((s) => ({ logs: { ...s.logs, [topic]: [] } })),

  setActiveTopicTab: (topic) => set({ activeTopicTab: topic }),
  setPublishTopic: (t) => set({ publishTopic: t }),
  setPublishMessage: (m) => set({ publishMessage: m }),
  setPublishQos: (q) => set({ publishQos: q }),
  setPublishRetain: (r) => set({ publishRetain: r }),
  setConfigCollapsed: (v) => set({ configCollapsed: v }),
  openSubscribeModal: () =>
    set({ subscribeModalOpen: true, subscribeModalTopic: "", subscribeModalQos: 0 }),
  closeSubscribeModal: () => set({ subscribeModalOpen: false }),
  setSubscribeModalTopic: (t) => set({ subscribeModalTopic: t }),
  setSubscribeModalQos: (q) => set({ subscribeModalQos: q }),
}));
