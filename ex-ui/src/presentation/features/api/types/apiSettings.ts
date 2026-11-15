export type ThemeMode = "system" | "light" | "dark" | "black";
export type AiNamingStyle = "descriptive" | "short" | "custom";

export interface ApiSettings {
  language: string;
  queryParamsEncoding: boolean;
  experiments: {
    telemetry: boolean;
    expandNav: boolean;
    sidebarOnLeft: boolean;
    aiEnabled: boolean;
    aiNamingStyle: AiNamingStyle;
    customAiStyle: string;
    scriptingSandbox: boolean;
    mockServers: boolean;
    documentation: boolean;
  };
  theme: {
    mode: ThemeMode;
    accentColor: string;
  };
  interceptor: {
    enabled: boolean;
    proxyUrl: string;
  };
}
