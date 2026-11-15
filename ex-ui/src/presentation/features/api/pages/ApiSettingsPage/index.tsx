import React from "react";
import { Button, Input, Modal, Select, Switch } from "antd";
import { CircleIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useApiSettingsStore } from "../../store/apiSettingsStore";
import type { ThemeMode } from "../../types/apiSettings";
import "./ApiSettingsPage.scss";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "pt", label: "Português" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
];

const ACCENT_COLORS = [
  "#1677ff",
  "#52c41a",
  "#faad14",
  "#f5222d",
  "#722ed1",
  "#13c2c2",
  "#fa541c",
  "#eb2f96",
];

const THEME_MODES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <MonitorIcon size={13} /> },
  { value: "light", label: "Light", icon: <SunIcon size={13} /> },
  { value: "dark", label: "Dark", icon: <MoonIcon size={13} /> },
  { value: "black", label: "Black", icon: <CircleIcon size={13} /> },
];

function SettingsSection({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`settings-section${danger ? " settings-section--danger" : ""}`}>
      <div
        className={`settings-section-title${danger ? " settings-section-title--danger" : ""}`}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-label">
        <div className="setting-label">{label}</div>
        <div className="setting-description">{description}</div>
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

function ThemeModeSelector({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  return (
    <div className="theme-mode-selector">
      {THEME_MODES.map((m) => (
        <button
          key={m.value}
          className={`theme-mode-btn${value === m.value ? " active" : ""}`}
          onClick={() => onChange(m.value)}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}

function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="accent-color-picker">
      {ACCENT_COLORS.map((c) => (
        <div
          key={c}
          className={`accent-color-swatch${value === c ? " selected" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
      <input
        type="color"
        className="accent-color-custom"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Custom color"
      />
    </div>
  );
}

export function ApiSettingsPage() {
  const settings = useApiSettingsStore();

  return (
    <div className="api-settings-page">
      <div className="settings-content">
        <h2 className="settings-page-title">Settings</h2>

        <SettingsSection title="General">
          <SettingRow
            label="Language"
            description="Select the interface language"
          >
            <Select
              value={settings.language}
              onChange={settings.setLanguage}
              style={{ width: 220 }}
              options={LANGUAGES}
              size="small"
            />
          </SettingRow>
          <SettingRow
            label="Encode query parameters"
            description="Encode query parameter values when sending requests"
          >
            <Switch
              checked={settings.queryParamsEncoding}
              onChange={settings.setQueryParamsEncoding}
              size="small"
            />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="Theme">
          <SettingRow
            label="Background"
            description="Choose the application color scheme"
          >
            <ThemeModeSelector
              value={settings.theme.mode}
              onChange={settings.setThemeMode}
            />
          </SettingRow>
          <SettingRow
            label="Accent color"
            description="Select the primary accent color"
          >
            <AccentColorPicker
              value={settings.theme.accentColor}
              onChange={settings.setAccentColor}
            />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="Interceptor">
          <SettingRow
            label="Enable proxy"
            description="Route requests through a proxy server to bypass CORS restrictions"
          >
            <Switch
              checked={settings.interceptor.enabled}
              onChange={settings.setInterceptorEnabled}
              size="small"
            />
          </SettingRow>
          {settings.interceptor.enabled && (
            <SettingRow label="Proxy URL" description="URL of the proxy server">
              <Input
                value={settings.interceptor.proxyUrl}
                onChange={(e) => settings.setProxyUrl(e.target.value)}
                placeholder="https://proxy.example.com"
                size="small"
                style={{ width: 320 }}
              />
            </SettingRow>
          )}
        </SettingsSection>

        <SettingsSection title="Experiments ⚗" danger>
          <SettingRow
            label="Telemetry"
            description="Help improve by sending anonymous usage data"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Switch
                checked={settings.experiments.telemetry}
                onChange={(v) => settings.setExperiment("telemetry", v)}
                size="small"
              />
              {settings.experiments.telemetry && (
                <Button
                  size="small"
                  danger
                  onClick={() => {
                    Modal.confirm({
                      title: "Opt out of telemetry?",
                      content:
                        "This will disable anonymous usage data collection.",
                      onOk: () => settings.setExperiment("telemetry", false),
                    });
                  }}
                >
                  Opt out
                </Button>
              )}
            </div>
          </SettingRow>
          <SettingRow
            label="Expand navigation"
            description="Always show navigation labels"
          >
            <Switch
              checked={settings.experiments.expandNav}
              onChange={(v) => settings.setExperiment("expandNav", v)}
              size="small"
            />
          </SettingRow>
          <SettingRow
            label="Sidebar on left"
            description="Move the sidebar to the left side"
          >
            <Switch
              checked={settings.experiments.sidebarOnLeft}
              onChange={(v) => settings.setExperiment("sidebarOnLeft", v)}
              size="small"
            />
          </SettingRow>
          <SettingRow
            label="AI experiments"
            description="Enable AI-powered features"
          >
            <Switch
              checked={settings.experiments.aiEnabled}
              onChange={(v) => settings.setExperiment("aiEnabled", v)}
              size="small"
            />
          </SettingRow>
          {settings.experiments.aiEnabled && (
            <SettingRow
              label="AI request naming style"
              description="How AI names saved requests"
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Select
                  value={settings.experiments.aiNamingStyle}
                  onChange={(v) => settings.setExperiment("aiNamingStyle", v)}
                  size="small"
                  style={{ width: 180 }}
                  options={[
                    { value: "descriptive", label: "Descriptive" },
                    { value: "short", label: "Short" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
                {settings.experiments.aiNamingStyle === "custom" && (
                  <Input
                    value={settings.experiments.customAiStyle}
                    onChange={(e) =>
                      settings.setExperiment("customAiStyle", e.target.value)
                    }
                    placeholder="Describe naming style…"
                    size="small"
                    style={{ width: 320 }}
                  />
                )}
              </div>
            </SettingRow>
          )}
          <SettingRow
            label="Experimental scripting sandbox"
            description="Run pre/post request scripts in an isolated sandbox"
          >
            <Switch
              checked={settings.experiments.scriptingSandbox}
              onChange={(v) => settings.setExperiment("scriptingSandbox", v)}
              size="small"
            />
          </SettingRow>
          <SettingRow
            label="Mock servers"
            description="Enable mock server functionality"
          >
            <Switch
              checked={settings.experiments.mockServers}
              onChange={(v) => settings.setExperiment("mockServers", v)}
              size="small"
            />
          </SettingRow>
          <SettingRow
            label="Documentation"
            description="Enable API documentation generation"
          >
            <Switch
              checked={settings.experiments.documentation}
              onChange={(v) => settings.setExperiment("documentation", v)}
              size="small"
            />
          </SettingRow>
        </SettingsSection>
      </div>
    </div>
  );
}
