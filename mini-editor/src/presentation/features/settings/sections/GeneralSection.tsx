import { useEffect, useState } from "react";
import { Switch } from "antd";
import {
  isAutostartEnabled,
  setAutostart,
} from "@/infrastructure/tauri/autostartService";
import {
  getCachedResourceSync,
  RESOURCE_CACHE_KEYS,
  RESOURCE_CACHE_TTLS,
  setCachedResource,
} from "@/infrastructure/tauri/resourceCacheService";
import "@/presentation/features/settings/pages/SettingsPage/SettingsPage.scss";

export default function GeneralSection() {
  const [autostart, setAutostartState] = useState<boolean>(
    () => getCachedResourceSync<boolean>(RESOURCE_CACHE_KEYS.SETTINGS_AUTOSTART)?.data ?? false
  );
  const [busy, setBusy] = useState(false);

  // Seed the toggle from the live OS state (the registry is the source of truth)
  // and update SQLite resource_cache for instant display on next open.
  useEffect(() => {
    isAutostartEnabled()
      .then((enabled) => {
        setAutostartState(enabled);
        void setCachedResource(
          RESOURCE_CACHE_KEYS.SETTINGS_AUTOSTART,
          enabled,
          RESOURCE_CACHE_TTLS.SETTINGS_AUTOSTART
        );
      })
      .catch(() => {});
  }, []);

  const handleToggle = async (next: boolean) => {
    setBusy(true);
    setAutostartState(next); // optimistic
    try {
      await setAutostart(next);
      void setCachedResource(
        RESOURCE_CACHE_KEYS.SETTINGS_AUTOSTART,
        next,
        RESOURCE_CACHE_TTLS.SETTINGS_AUTOSTART
      );
    } catch {
      setAutostartState(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="settings-section-title">General</h2>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Theme</div>
            <div className="settings-row-desc">Light</div>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Start with Windows</div>
            <div className="settings-row-desc">
              Launch Tomo automatically at login (starts hidden in the tray)
            </div>
          </div>
          <Switch
            checked={autostart}
            disabled={busy}
            onChange={handleToggle}
          />
        </div>
      </div>
    </div>
  );
}
