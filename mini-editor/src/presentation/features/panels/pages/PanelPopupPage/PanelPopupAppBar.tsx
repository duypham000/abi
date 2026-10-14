import { useCallback, useState } from "react";
import { CloseIcon, PinIcon, PinFilledIcon, MinimizeIcon, MaximizeIcon, RestoreIcon } from "@/presentation/components/icons";
import { useWindowControls } from "@/presentation/hooks/useWindowControls";
import "./PanelPopupAppBar.scss";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface PanelPopupAppBarProps {
  title: string;
}

export function PanelPopupAppBar({ title }: PanelPopupAppBarProps) {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  const toggleAlwaysOnTop = useCallback(async () => {
    if (!isTauri()) return;
    const next = !isAlwaysOnTop;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setAlwaysOnTop(next);
    setIsAlwaysOnTop(next);
  }, [isAlwaysOnTop]);

  return (
    <header className="panel-popup-appbar">
      <span className="panel-popup-appbar-title" data-tauri-drag-region>
        {title}
      </span>

      <span className="panel-popup-appbar-spacer" data-tauri-drag-region />

      <div className="panel-popup-window-controls">
        <button
          className={`panel-popup-btn ${isAlwaysOnTop ? "panel-popup-btn--active" : ""}`}
          onClick={toggleAlwaysOnTop}
          title={isAlwaysOnTop ? "Unpin" : "Pin (always on top)"}
        >
          {isAlwaysOnTop ? <PinFilledIcon /> : <PinIcon />}
        </button>
        <button
          className="panel-popup-btn"
          onClick={minimize}
          title="Minimize to taskbar"
        >
          <MinimizeIcon />
        </button>
        <button
          className="panel-popup-btn"
          onClick={toggleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          className="panel-popup-btn panel-popup-btn--close"
          onClick={close}
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
