import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { Modal } from "antd";
import { RootState } from "@/presentation/store";
import { useAuth } from "@/presentation/features/auth/hooks/useAuth";
import { useGetMeQuery } from "@/infrastructure/api/authApi";
import LoginForm from "@/presentation/features/auth/components/LoginForm";

export default function AccountSection() {
  const { user: storeUser } = useSelector((state: RootState) => state.auth);
  const { logout, isLoggingOut } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginStep, setLoginStep] = useState<1 | 2>(1);

  // LOCAL_USER always has email "local@device" — that is the only reliable signal
  // that the user is in offline/local mode (the userId can be 0 or a UUID string).
  const isLocalUser = !storeUser || storeUser.email === "local@device";

  // Automatically close modal when user successfully logs in
  useEffect(() => {
    if (!isLocalUser && showLoginModal) {
      setShowLoginModal(false);
      setLoginStep(1);
    }
  }, [isLocalUser, showLoginModal]);

  const {
    data: profile,
    isLoading,
    isError,
  } = useGetMeQuery(undefined, { skip: isLocalUser });

  // Prefer the fresh API profile; fall back to the JWT-decoded store user.
  const user = profile
    ? {
        username: profile.username,
        email: profile.email,
        role: profile.role,
        fullName: profile.fullName ?? profile.full_name,
        createdAt: profile.createdAt ?? profile.createdDate,
      }
    : storeUser
    ? {
        username: storeUser.username,
        email: storeUser.email,
        role: storeUser.role,
        fullName: storeUser.fullName,
        createdAt: storeUser.createdAt,
      }
    : null;

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div>
      <h2 className="settings-section-title">Account</h2>

      <div className="settings-card">
        {isLocalUser && (
          <div className="settings-row">
            <span
              style={{
                fontSize: "0.8rem",
                opacity: 0.55,
                fontStyle: "italic",
              }}
            >
              Offline / Local mode — no server profile available.
            </span>
          </div>
        )}

        {isError && !isLocalUser && (
          <div className="settings-row">
            <span style={{ fontSize: "0.8rem", color: "#ef4444" }}>
              Could not fetch profile from server. Showing cached data.
            </span>
          </div>
        )}

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Username</div>
          </div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            {isLoading ? "…" : user?.username ?? "—"}
          </span>
        </div>

        {user?.fullName && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Full name</div>
            </div>
            <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
              {user.fullName}
            </span>
          </div>
        )}

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email</div>
          </div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            {isLoading ? "…" : user?.email ?? "—"}
          </span>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Role</div>
          </div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            {isLoading ? "…" : user?.role ?? "—"}
          </span>
        </div>

        {user?.createdAt && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Member since</div>
            </div>
            <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
              {formatDate(user.createdAt)}
            </span>
          </div>
        )}
      </div>

      {/* Account actions: Sign in if local guest, Sign out if authenticated */}
      {isLocalUser ? (
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Sign in to server</div>
              <div className="settings-row-desc">
                Log in with your Tomo account to sync documents, Git integrations, and preferences from server
              </div>
            </div>
            <button
              className="settings-btn"
              onClick={() => {
                setLoginStep(1);
                setShowLoginModal(true);
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {/* Login Modal */}
      <Modal
        open={showLoginModal}
        onCancel={() => setShowLoginModal(false)}
        footer={null}
        width={420}
        destroyOnClose
      >
        <div style={{ padding: "16px 8px" }}>
          <LoginForm step={loginStep} setStep={setLoginStep} />
        </div>
      </Modal>
    </div>
  );
}
