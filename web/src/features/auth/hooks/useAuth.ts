import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AppDispatch, RootState } from "@/store";
import { decodeUser, setUser } from "@/store/authSlice";
import { baseApi } from "@/infrastructure/api/baseApi";
import * as authClient from "@/infrastructure/auth/authClient";
import type { LoginRequest } from "@/core/interfaces/auth";

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = !!user;

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [loginError, setLoginError] = useState<unknown>(null);

  const login = async (credentials: LoginRequest) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const accessToken = await authClient.login(
        credentials.identifier,
        credentials.password
      );
      dispatch(setUser(decodeUser(accessToken)));
      dispatch(baseApi.util.resetApiState());
      const redirect = searchParams.get("redirect");
      navigate(redirect && redirect.startsWith("/") ? redirect : "/docs", {
        replace: true,
      });
    } catch (err) {
      setLoginError(err);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      await authClient.logout();
    } finally {
      dispatch(setUser(null));
      dispatch(baseApi.util.resetApiState());
      setIsLoggingOut(false);
      navigate("/login", { replace: true });
    }
  };

  return {
    user,
    isAuthenticated,
    login,
    logout,
    isLoggingIn,
    isLoggingOut,
    loginError,
  };
}
