import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import { RootState } from "@/presentation/store";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import { useOnlineStatus } from "@/presentation/hooks/useOnlineStatus";
import { useSyncOnReconnect } from "@/presentation/hooks/useSyncOnReconnect";
import { useConnectivityMonitor } from "@/presentation/hooks/useConnectivityMonitor";
import { useSyncEngine } from "@/presentation/hooks/useSyncEngine";
import { OfflineModePrompt } from "@/presentation/features/sync/OfflineModePrompt";
import { ConflictDialog } from "@/presentation/features/sync/ConflictDialog";
import { isMobile } from "@/infrastructure/platform";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function ProtectedShell() {
  // Window/shortcut/tray orchestration now lives entirely in the Rust
  // coordinator — windows only render their own content here.
  useOnlineStatus();
  useSyncOnReconnect(); // handles docs (Yjs merge); will be replaced by useSyncEngine later
  useConnectivityMonitor();
  useSyncEngine(); // handles canvas/note/secret/secret_group outbox replay

  return (
    <>
      <Outlet />
      <OfflineModePrompt />
      <ConflictDialog />
    </>
  );
}

/**
 * Non-destructive overlay shown in a popup window when the session is lost.
 * It keeps the underlying editor mounted (preserving unsaved work) and nudges
 * the user to the main window to sign in; it disappears automatically once auth
 * is restored (MainGate re-syncs the user on the `auth://changed` event).
 */
function SessionLostOverlay() {
  const focusMain = useCallback(async () => {
    if (!isTauri()) return;
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const main = await WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.setFocus();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        color: "#fff",
        textAlign: "center",
        padding: 24,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>Phiên đăng nhập đã hết hạn</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
        Đăng nhập lại ở cửa sổ chính — nội dung của bạn được giữ nguyên.
      </p>
      <button
        type="button"
        onClick={focusMain}
        style={{
          marginTop: 4,
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background: "#6c6cff",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Mở cửa sổ đăng nhập
      </button>
    </div>
  );
}

export function ProtectedRoute() {
  const status = useSelector((state: RootState) => state.auth.status);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setLabel("web");
      return;
    }
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      setLabel(getCurrentWindow().label);
    });
  }, []);

  if (status === "authed") {
    return <ProtectedShell />;
  }

  const isPopup = label !== null && label !== "main" && label !== "web";

  // Popups are local-first: render their content immediately regardless of auth
  // (a draft needs no session). When the session is confirmed gone, lay a
  // non-destructive overlay on top — the editor stays mounted, work preserved.
  if (isPopup) {
    return (
      <>
        <Outlet />
        {status === "guest" && <SessionLostOverlay />}
      </>
    );
  }

  // Mobile is single-webview: there is no separate login window, so a confirmed
  // guest is routed to the in-app login (see App.tsx public routes). While auth
  // is still resolving ("unknown") we hold a loader to avoid a flash.
  if (isMobile() && status === "guest") {
    return <Navigate to="/login" replace />;
  }

  // Main window (or web/desktop), unknown or signed out: the login lives in a
  // separate window opened by the Rust coordinator, so we never navigate to an
  // in-app login route — just hold a loading state.
  return <Loading variant="fullscreen" />;
}
