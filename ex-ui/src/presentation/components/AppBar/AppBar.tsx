import { useDispatch, useSelector } from "react-redux";
import { invoke } from "@tauri-apps/api/core";
import { AppDispatch, RootState } from "@/presentation/store";
import { setActiveSidebar, selectIsOnline } from "@/presentation/store/appSlice";
import { useWindowControls } from "@/presentation/hooks/useWindowControls";
import { isMobile } from "@/infrastructure/platform";
import {
  CloseIcon,
  HamburgerIcon,
  MaximizeIcon,
  MinimizeIcon,
  RestoreIcon,
} from "@/presentation/components/icons";
import "./AppBar.scss";

interface AppBarProps {
  variant?: "dashboard" | "auth";
}

export function AppBar({ variant = "dashboard" }: AppBarProps) {
  const dispatch = useDispatch<AppDispatch>();
  const pageTitle = useSelector((state: RootState) => state.app.pageTitle);
  const isOnline = useSelector(selectIsOnline);
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  // The auth window is a modal gate: minimizing it hides the WHOLE app (handled
  // by the Rust coordinator), not just this window.
  const handleMinimize = () => {
    if (variant === "auth" && isTauri) {
      void invoke("coord_login_minimize");
    } else {
      minimize();
    }
  };

  return (
    <header
      className="appbar appbar--light"
    >
      <div className="appbar-left" data-tauri-drag-region>
        {variant === "dashboard" && (
          <button
            className="appbar-btn"
            onClick={() => dispatch(setActiveSidebar(null))}
            title="Toggle sidebar"
          >
            <HamburgerIcon />
          </button>
        )}
      </div>

      <div className="appbar-center" data-tauri-drag-region>
        {variant === "dashboard" && (
          <span className="appbar-title" data-tauri-drag-region>{pageTitle}</span>
        )}
        {!isOnline && (
          <span className="appbar-offline-badge">Offline</span>
        )}
      </div>

      <div className="appbar-right">
        {/* No OS window chrome on mobile (single webview) — these controls would
            be dead. Desktop keeps minimize/maximize/close. */}
        {!isMobile() && (
          <div className="window-controls">
            <button
              className="window-btn window-btn--close"
              onClick={close}
              title="Close"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
            <button
              className="window-btn window-btn--minimize"
              onClick={handleMinimize}
              title="Minimize"
              aria-label="Minimize"
            >
              <MinimizeIcon />
            </button>
            <button
              className="window-btn window-btn--maximize"
              onClick={toggleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
              aria-label={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
