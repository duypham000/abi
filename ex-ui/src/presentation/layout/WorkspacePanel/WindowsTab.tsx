import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCwIcon,
  PinIcon,
  PinOffIcon,
  MinusIcon,
  SquareIcon,
  CopyIcon,
  XIcon,
  MonitorIcon,
} from "lucide-react";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Never show these system windows in the list
const SYSTEM_LABELS = new Set(["splash", "login"]);

interface WinInfo {
  label: string;
  title: string;
  isMinimized: boolean;
  isMaximized: boolean;
  isAlwaysOnTop: boolean;
  isVisible: boolean;
}

function friendlyLabel(label: string): string {
  if (label === "main")           return "Main";
  if (label === "search-overlay") return "Search";
  if (label.startsWith("doc-popup-draft-")) return "Draft";
  if (label.startsWith("doc-popup-"))       return `Doc #${label.replace("doc-popup-", "")}`;
  if (label.startsWith("panel-popup-")) {
    // panel-popup-{type}-{uuid}
    const type = label.replace("panel-popup-", "").replace(/-[a-f0-9]{32}$/, "");
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ");
  }
  return label;
}

async function loadWindows(): Promise<WinInfo[]> {
  const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
  const all = await getAllWebviewWindows();
  const wins = all.filter((w) => !SYSTEM_LABELS.has(w.label));
  return Promise.all(
    wins.map(async (w) => {
      const [title, isMinimized, isMaximized, isAlwaysOnTop, isVisible] = await Promise.all([
        w.title().catch(() => ""),
        w.isMinimized().catch(() => false),
        w.isMaximized().catch(() => false),
        w.isAlwaysOnTop().catch(() => false),
        w.isVisible().catch(() => true),
      ]);
      return {
        label: w.label,
        title: title || friendlyLabel(w.label),
        isMinimized,
        isMaximized,
        isAlwaysOnTop,
        isVisible,
      };
    })
  );
}

async function getWin(label: string) {
  const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
  const all = await getAllWebviewWindows();
  return all.find((w) => w.label === label) ?? null;
}

export function WindowsTab() {
  const [windows, setWindows] = useState<WinInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    setLoading(true);
    const wins = await loadWindows();
    if (mountedRef.current) {
      setWindows(wins);
      setLoading(false);
    }
  }, []);

  // Initial load + re-fetch every 5 s to catch windows opening/closing
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const busy = (label: string) => pending.has(label);

  const withPending = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setPending((p) => new Set(p).add(label));
      try {
        await fn();
        await refresh();
      } catch {
        /* ignore */
      } finally {
        setPending((p) => { const n = new Set(p); n.delete(label); return n; });
      }
    },
    [refresh]
  );

  const handleFocus = (label: string) =>
    withPending(label, async () => {
      const w = await getWin(label);
      if (!w) return;
      if (await w.isMinimized()) await w.unminimize();
      await w.show();
      await w.setFocus();
    });

  const handleMinToggle = (info: WinInfo) =>
    withPending(info.label, async () => {
      const w = await getWin(info.label);
      if (!w) return;
      if (info.isMinimized) { await w.unminimize(); await w.setFocus(); }
      else await w.minimize();
    });

  const handleMaxToggle = (info: WinInfo) =>
    withPending(info.label, async () => {
      const w = await getWin(info.label);
      if (!w) return;
      await w.toggleMaximize();
    });

  const handlePin = (info: WinInfo) =>
    withPending(info.label, async () => {
      const w = await getWin(info.label);
      if (!w) return;
      await w.setAlwaysOnTop(!info.isAlwaysOnTop);
    });

  const handleClose = (label: string) =>
    withPending(label, async () => {
      const w = await getWin(label);
      await w?.close();
    });

  if (!isTauri()) {
    return (
      <div className="wp-win-empty">
        <MonitorIcon size={16} />
        <span>Window management is only available in the desktop app.</span>
      </div>
    );
  }

  if (windows.length === 0 && !loading) {
    return (
      <div className="wp-win-empty">
        <MonitorIcon size={16} />
        <span>No windows open</span>
      </div>
    );
  }

  return (
    <div className="wp-win-view">
      <div className="wp-win-toolbar">
        <span className="wp-win-count">{windows.length} window{windows.length !== 1 ? "s" : ""}</span>
        <button
          className="wp-icon-btn"
          title="Refresh"
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCwIcon size={12} className={loading ? "wp-spin" : ""} />
        </button>
      </div>

      <table className="wp-table">
        <thead>
          <tr>
            <th>Window</th>
            <th>Label</th>
            <th>State</th>
            <th>Controls</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((win) => {
            const isBusy = busy(win.label);
            return (
              <tr
                key={win.label}
                className={`wp-win-row${win.label === "main" ? " wp-win-row--main" : ""}`}
              >
                {/* Title — click to focus */}
                <td>
                  <button
                    className="wp-win-title-btn"
                    onClick={() => handleFocus(win.label)}
                    title="Focus window"
                    disabled={isBusy}
                  >
                    {win.title || friendlyLabel(win.label)}
                  </button>
                </td>

                {/* Label */}
                <td>
                  <code className="wp-code wp-win-label">{win.label}</code>
                </td>

                {/* State badges */}
                <td className="wp-win-badges">
                  {win.isAlwaysOnTop && (
                    <span className="wp-badge wp-badge--pinned">pinned</span>
                  )}
                  {win.isMinimized && (
                    <span className="wp-badge wp-badge--minimized">min</span>
                  )}
                  {win.isMaximized && !win.isMinimized && (
                    <span className="wp-badge wp-badge--maximized">max</span>
                  )}
                  {!win.isMinimized && !win.isMaximized && !win.isAlwaysOnTop && (
                    <span className="wp-badge wp-badge--normal">normal</span>
                  )}
                </td>

                {/* Controls */}
                <td>
                  <div className="wp-win-controls">
                    {/* Pin / always on top */}
                    <button
                      className={`wp-icon-btn${win.isAlwaysOnTop ? " wp-icon-btn--active" : ""}`}
                      title={win.isAlwaysOnTop ? "Unpin (remove always on top)" : "Pin (always on top)"}
                      disabled={isBusy}
                      onClick={() => handlePin(win)}
                    >
                      {win.isAlwaysOnTop ? <PinOffIcon size={12} /> : <PinIcon size={12} />}
                    </button>

                    {/* Minimize / restore */}
                    <button
                      className="wp-icon-btn"
                      title={win.isMinimized ? "Restore" : "Minimize"}
                      disabled={isBusy}
                      onClick={() => handleMinToggle(win)}
                    >
                      <MinusIcon size={12} />
                    </button>

                    {/* Maximize / restore */}
                    <button
                      className="wp-icon-btn"
                      title={win.isMaximized ? "Restore" : "Maximize"}
                      disabled={isBusy}
                      onClick={() => handleMaxToggle(win)}
                    >
                      {win.isMaximized ? <CopyIcon size={11} /> : <SquareIcon size={11} />}
                    </button>

                    {/* Close — disabled for the main window */}
                    <button
                      className="wp-icon-btn wp-icon-btn--danger"
                      title="Close"
                      disabled={isBusy || win.label === "main"}
                      onClick={() => handleClose(win.label)}
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
