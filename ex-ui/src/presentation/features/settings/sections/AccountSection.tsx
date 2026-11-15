import { useSelector } from "react-redux";
import { RootState } from "@/presentation/store";
import { useAuth } from "@/presentation/features/auth/hooks/useAuth";

export default function AccountSection() {
  const { user } = useSelector((state: RootState) => state.auth);
  const { logout, isLoggingOut } = useAuth();

  return (
    <div>
      <h2 className="settings-section-title">Account</h2>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Username</div>
          </div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            {user?.username ?? "—"}
          </span>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email</div>
          </div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            {user?.email ?? "—"}
          </span>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Role</div>
          </div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            {user?.role ?? "—"}
          </span>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Sign out</div>
            <div className="settings-row-desc">
              Log out of your account on this device
            </div>
          </div>
          <button
            className="settings-btn"
            onClick={logout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
