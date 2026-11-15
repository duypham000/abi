import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState, AppDispatch } from "@/presentation/store";
import { setUser, decodeUser } from "@/presentation/store/authSlice";
import { goOffline } from "@/presentation/store/appSlice";
import * as authBridge from "@/infrastructure/tauri/authBridge";
import * as kvStore from "@/infrastructure/tauri/kvStore";
import { LoginRequest, AuthUser } from "@/core/interfaces/auth";
import { isMobile } from "@/infrastructure/platform";
import { authenticateWithDevice } from "@/infrastructure/platform/deviceAuth";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const LOCAL_USER: AuthUser = {
  userId: 0,
  username: "Local User",
  email: "local@device",
  role: "USER",
};

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
        dispatch(setUser(LOCAL_USER));
        dispatch(goOffline());
        await kvStore.setItem("user", JSON.stringify(LOCAL_USER));
        navigate("/");
        return true;
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
    loginLocalMode,
    logout,
    isLoggingIn,
    isLoggingOut,
    loginError,
  };
}
