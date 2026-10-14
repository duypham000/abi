/**
 * Shown when connectivity === 'connection-lost'.
 * Asks the user: go offline (read from cache) or retry connecting.
 */

import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "@/presentation/store";
import { goOffline, setOnline, selectConnectivity } from "@/presentation/store/appSlice";

export function OfflineModePrompt() {
  const dispatch = useDispatch<AppDispatch>();
  const connectivity = useSelector(selectConnectivity);

  if (connectivity !== "connection-lost") return null;

  const handleGoOffline = () => dispatch(goOffline());

  const handleRetry = () => {
    // Optimistically mark online; if the next API call fails, connectionLost fires again.
    dispatch(setOnline(true));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: 12,
          padding: "28px 32px",
          maxWidth: 420,
          width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>
          Mất kết nối tới server
        </h2>
        <p style={{ margin: "0 0 24px", color: "var(--color-text-secondary, #666)", fontSize: 14, lineHeight: 1.5 }}>
          Không thể liên lạc với server. Bạn có muốn chuyển sang{" "}
          <strong>chế độ offline</strong> không?
          <br />
          Dữ liệu đã lưu vẫn xem được; thay đổi sẽ tự đồng bộ khi có mạng lại.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={handleRetry}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid var(--color-border, #ddd)",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Thử lại
          </button>
          <button
            onClick={handleGoOffline}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "var(--color-primary, #5c6bc0)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Chuyển offline
          </button>
        </div>
      </div>
    </div>
  );
}
