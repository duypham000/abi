import { useEffect, useState } from "react";
import { Switch } from "antd";
import {
  isAutostartEnabled,
  setAutostart,
} from "@/infrastructure/tauri/autostartService";
import "@/presentation/features/settings/pages/SettingsPage/SettingsPage.scss";

export default function GeneralSection() {
  const [autostart, setAutostartState] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed the toggle from the live OS state (the registry is the source of truth).
  useEffect(() => {
    isAutostartEnabled()
      .then(setAutostartState)
      .catch(() => {});
  }, []);

  const handleToggle = async (next: boolean) => {
    setBusy(true);
    setAutostartState(next); // optimistic
    try {
      await setAutostart(next);
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
