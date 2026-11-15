import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "@/presentation/store";
import { setOnline, selectIsOnline } from "@/presentation/store/appSlice";
import { setTrayStatus } from "@/infrastructure/tauri/trayStatus";

export function useOnlineStatus() {
  const dispatch = useDispatch<AppDispatch>();
  const isOnline = useSelector(selectIsOnline);

  useEffect(() => {
    const goOnline = () => dispatch(setOnline(true));
    const goOffline = () => dispatch(setOnline(false));
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [dispatch]);

  // Keep the tray status dot in sync with connectivity for the whole session.
  useEffect(() => {
    setTrayStatus(isOnline ? "online" : "offline");
  }, [isOnline]);

  return isOnline;
}
