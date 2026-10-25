import { useDispatch, useSelector } from "react-redux";
import { invoke } from "@tauri-apps/api/core";
import { Search } from "lucide-react";
import { AppDispatch, RootState } from "@/presentation/store";
import { toggleSidebar, selectIsOnline } from "@/presentation/store/appSlice";
import { useWindowControls } from "@/presentation/hooks/useWindowControls";
import { isMobile } from "@/infrastructure/platform";
import { openCommandPalette } from "@/presentation/features/command-palette";
import {
  CloseIcon,
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
  const activeSidebar = useSelector((state: RootState) => state.app.activeSidebar);
  const isSidebarOpen = activeSidebar !== null;
  const isOnline = useSelector(selectIsOnline);
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const isMac =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);

  // The auth window is a modal gate: minimizing it hides the WHOLE app (handled
  // by the Rust coordinator), not just this window.
  const handleMinimize = () => {
    if (variant === "auth" && isTauri) {
      void invoke("coord_login_minimize");
    } else {
      minimize();
    }
  };

  const handleToggleSidebar = () => {
    dispatch(toggleSidebar());
  };

  const handleOpenSearch = () => {
    openCommandPalette("quick-open");
  };

  return (
    <header className="appbar appbar--light" data-tauri-drag-region>
      {/* Left: Animated burger button to toggle sidebar */}
      <div className="appbar-left" data-tauri-drag-region>
        {variant === "dashboard" && (
          <button
            type="button"
            className={`appbar-burger-btn ${isSidebarOpen ? "is-open" : ""}`}
            onClick={handleToggleSidebar}
            title={isSidebarOpen ? "Đóng sidebar" : "Mở sidebar"}
            aria-label={isSidebarOpen ? "Đóng sidebar" : "Mở sidebar"}
            aria-expanded={isSidebarOpen}
          >
            <span className="burger-box">
              <span className="burger-line burger-line--top" />
              <span className="burger-line burger-line--mid" />
              <span className="burger-line burger-line--bot" />
            </span>
          </button>
        )}
      </div>

      {/* Center: Dummy search bar displaying current title, opens Ctrl+P modal on click */}
      <div className="appbar-center" data-tauri-drag-region>
        {variant === "dashboard" && (
          <button
            type="button"
            className="appbar-search"
            onClick={handleOpenSearch}
            title={`Tìm kiếm (${isMac ? "⌘P" : "Ctrl+P"})`}
            aria-label="Tìm kiếm hoặc điều hướng"
          >
            <Search size={13} className="appbar-search__icon" />
            <span className="appbar-search__text" data-tauri-drag-region={false}>
              {pageTitle || "Tìm kiếm tài liệu, canvas, lệnh..."}
            </span>
            <kbd className="appbar-search__kbd">
              {isMac ? "⌘P" : "Ctrl P"}
            </kbd>
          </button>
        )}
        {!isOnline && (
          <span className="appbar-offline-badge" title="Chế độ ngoại tuyến">
            Offline
          </span>
        )}
      </div>

      {/* Right: Friendly, accessible window control buttons */}
      <div className="appbar-right" data-tauri-drag-region>
        {!isMobile() && (
          <div className="window-controls">
            <button
              type="button"
              className="window-btn window-btn--minimize"
              onClick={handleMinimize}
              title="Thu nhỏ"
              aria-label="Thu nhỏ"
            >
              <MinimizeIcon />
            </button>
            <button
              type="button"
              className="window-btn window-btn--maximize"
              onClick={toggleMaximize}
              title={isMaximized ? "Khôi phục" : "Phóng to"}
              aria-label={isMaximized ? "Khôi phục" : "Phóng to"}
            >
              {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
            <button
              type="button"
              className="window-btn window-btn--close"
              onClick={close}
              title="Đóng"
              aria-label="Đóng"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
