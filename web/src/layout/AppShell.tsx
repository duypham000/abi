import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FileText, LogOut, Menu, Palette } from "lucide-react";
import type { AppDispatch, RootState } from "@/store";
import { setSidebarOpen, toggleSidebar } from "@/store/appSlice";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useTouchDevice } from "@/hooks/useTouchDevice";
import "./AppShell.scss";

export function AppShell() {
  const dispatch = useDispatch<AppDispatch>();
  const sidebarOpen = useSelector((state: RootState) => state.app.sidebarOpen);
  const pageTitle = useSelector((state: RootState) => state.app.pageTitle);
  const { user, logout, isLoggingOut } = useAuth();
  const isTouch = useTouchDevice();
  const location = useLocation();

  useEffect(() => {
    if (isTouch) {
      dispatch(setSidebarOpen(false));
    }
  }, [location.pathname, isTouch, dispatch]);

  return (
    <div className="app-shell">
      <header className="app-shell-topbar">
        <div className="app-shell-topbar-left">
          <button
            type="button"
            className="app-shell-icon-btn"
            onClick={() => dispatch(toggleSidebar())}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <Menu size={18} />
          </button>
          <span className="app-shell-brand">Tomo</span>
          {pageTitle && (
            <>
              <span className="app-shell-sep">/</span>
              <span className="app-shell-title" title={pageTitle}>
                {pageTitle}
              </span>
            </>
          )}
        </div>

        <div className="app-shell-topbar-right">
          {user && (
            <span className="app-shell-user" title={user.email}>
              {user.username}
            </span>
          )}
          <button
            type="button"
            className="app-shell-logout-btn"
            onClick={() => void logout()}
            disabled={isLoggingOut}
            title="Đăng xuất"
          >
            <LogOut size={15} />
            <span>{isLoggingOut ? "Đang thoát..." : "Đăng xuất"}</span>
          </button>
        </div>
      </header>

      <div className="app-shell-body">
        {sidebarOpen && isTouch && (
          <div
            className="app-shell-backdrop"
            onClick={() => dispatch(setSidebarOpen(false))}
          />
        )}

        {sidebarOpen && (
          <aside className="app-shell-sidebar">
            <nav className="app-shell-nav">
              <NavLink
                to="/docs"
                className={({ isActive }) =>
                  isActive ? "app-shell-nav-item active" : "app-shell-nav-item"
                }
              >
                <FileText size={16} />
                <span>Docs</span>
              </NavLink>
              <NavLink
                to="/canvas"
                className={({ isActive }) =>
                  isActive ? "app-shell-nav-item active" : "app-shell-nav-item"
                }
              >
                <Palette size={16} />
                <span>Canvas</span>
              </NavLink>
            </nav>
          </aside>
        )}

        <main className="app-shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
