import { create } from "zustand";
import type { ApiSettings, ThemeMode, AiNamingStyle } from "../types/apiSettings";

interface ApiSettingsState extends ApiSettings {
  setLanguage: (lang: string) => void;
  setQueryParamsEncoding: (v: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setExperiment: (
    key: keyof ApiSettings["experiments"],
    value: ApiSettings["experiments"][keyof ApiSettings["experiments"]]
  ) => void;
  setInterceptorEnabled: (v: boolean) => void;
  setProxyUrl: (url: string) => void;
}

const DEFAULT_SETTINGS: ApiSettings = {
  language: "en",
  queryParamsEncoding: true,
  experiments: {
    telemetry: true,
    expandNav: false,
    sidebarOnLeft: false,
    aiEnabled: false,
    aiNamingStyle: "descriptive" as AiNamingStyle,
    customAiStyle: "",
    scriptingSandbox: false,
    mockServers: false,
    documentation: false,
  },
  theme: { mode: "system", accentColor: "#1677ff" },
  interceptor: { enabled: false, proxyUrl: "" },
};

export const useApiSettingsStore = create<ApiSettingsState>((set) => ({
  ...DEFAULT_SETTINGS,

  setLanguage: (language) => set({ language }),
  setQueryParamsEncoding: (v) => set({ queryParamsEncoding: v }),
  setThemeMode: (mode) =>
    set((s) => ({ theme: { ...s.theme, mode } })),
  setAccentColor: (color) =>
    set((s) => ({ theme: { ...s.theme, accentColor: color } })),
  setExperiment: (key, value) =>
    set((s) => ({ experiments: { ...s.experiments, [key]: value } })),
  setInterceptorEnabled: (v) =>
    set((s) => ({ interceptor: { ...s.interceptor, enabled: v } })),
  setProxyUrl: (url) =>
    set((s) => ({ interceptor: { ...s.interceptor, proxyUrl: url } })),
}));
