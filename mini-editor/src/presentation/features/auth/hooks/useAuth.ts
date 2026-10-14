import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState, AppDispatch } from "@/presentation/store";
import { setUser, decodeUser, LOCAL_USER } from "@/presentation/store/authSlice";
import { goOffline } from "@/presentation/store/appSlice";
import * as authBridge from "@/infrastructure/tauri/authBridge";
import * as kvStore from "@/infrastructure/tauri/kvStore";
import { LoginRequest } from "@/core/interfaces/auth";
import { isMobile } from "@/infrastructure/platform";
import { authenticateWithDevice } from "@/infrastructure/platform/deviceAuth";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export { LOCAL_USER };

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = !!user;

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [loginError, setLoginError] = useState<unknown>(null);

  const login = async (credentials: LoginRequest) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const accessToken = await authBridge.login(
        credentials.identifier,
        credentials.password
      );
      dispatch(setUser(decodeUser(accessToken)));
      if (!isTauri() || isMobile()) navigate("/");
    } catch (err) {
      setLoginError(err);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Explicit Go Offline Mode — skips login on desktop, web, or mobile.
   * Enters local offline SQLite mode directly.
   */
  const goOfflineMode = async (): Promise<boolean> => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      dispatch(setUser(LOCAL_USER));
      dispatch(goOffline());
      await kvStore.setItem("user", JSON.stringify(LOCAL_USER));

      if (isTauri()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("coord_finish_login");
        } catch (err) {
          console.warn("coord_finish_login failed:", err);
        }
      }
      navigate("/");
      return true;
    } catch (err) {
      setLoginError(err);
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Local Mode Authentication (Device Biometrics / Screen Lock Passcode)
   * Used when server is unreachable or offline on mobile devices.
   */
  const loginLocalMode = async (): Promise<boolean> => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const verified = await authenticateWithDevice(
        "Xác thực bằng Sinh trắc học hoặc Mật khẩu máy để truy cập Chế độ Cục bộ"
      );
      if (verified) {
        return await goOfflineMode();
      }
      return false;
    } catch (err) {
      setLoginError(err);
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      await authBridge.logout();
    } finally {
      dispatch(setUser(null));
      setIsLoggingOut(false);
      if (!isTauri() || isMobile()) navigate("/login");
    }
  };

  return {
    user,
    isAuthenticated,
    login,
    goOfflineMode,
    loginLocalMode,
    logout,
    isLoggingIn,
    isLoggingOut,
    loginError,
  };
}
