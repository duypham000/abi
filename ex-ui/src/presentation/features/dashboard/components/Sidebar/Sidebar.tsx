import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { NavLink, useLocation } from "react-router-dom";
import { RootState, AppDispatch } from "@/presentation/store";
import { setSidebarOpen } from "@/presentation/store/appSlice";
import { useAuth } from "@/presentation/features/auth/hooks/useAuth";
import { useTouchDevice } from "@/presentation/hooks/useTouchDevice";
import "./Sidebar.scss";

export default function Sidebar() {
  const dispatch = useDispatch<AppDispatch>();
  const sidebarOpen = useSelector((state: RootState) => state.app.sidebarOpen);
  const { user, logout, isLoggingOut } = useAuth();
  const isTouch = useTouchDevice();
  const location = useLocation();

  // Auto-close sidebar on route change when on mobile
  useEffect(() => {
    if (isTouch) {
      dispatch(setSidebarOpen(false));
    }
  }, [location.pathname, isTouch, dispatch]);

  if (!sidebarOpen) return null;

  return (
    <>
      {isTouch && (
        <div
          className="sidebar-backdrop"
          onClick={() => dispatch(setSidebarOpen(false))}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-logo">Tomo</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Dashboard
          </NavLink>
          <NavLink to="/docs" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Docs
          </NavLink>
          <NavLink to="/canvas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Canvas
          </NavLink>
          <NavLink to="/ports" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Ports
          </NavLink>
          <NavLink to="/scripts" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Scripts
          </NavLink>
          <NavLink to="/secrets" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Secrets
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Chat
          </NavLink>
          <NavLink to="/api" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            API Client
          </NavLink>
          <NavLink to="/translate" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Translate
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="user-info">
              <span className="user-name">{user.username}</span>
              <span className="user-email">{user.email}</span>
            </div>
          )}
          <button
            onClick={logout}
            disabled={isLoggingOut}
            className="btn-logout"
          >
            {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        </div>
      </aside>
    </>
  );
}
