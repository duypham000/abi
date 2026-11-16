import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { AppDispatch, RootState } from "@/store";
import { decodeUser, setUser } from "@/store/authSlice";
import {
  getAccessToken,
  onAuthChanged,
  peekAccessToken,
} from "@/infrastructure/auth/authClient";
import { Loading } from "@/components/ui/Loading/Loading";

export function RequireAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const status = useSelector((state: RootState) => state.auth.status);
  const location = useLocation();

  useEffect(() => {
    let active = true;

    const syncAuth = async () => {
      const cached = peekAccessToken();
      if (cached) {
        if (active) dispatch(setUser(decodeUser(cached)));
        return;
      }
      try {
        const token = await getAccessToken();
        if (!active) return;
        dispatch(setUser(token ? decodeUser(token) : null));
      } catch {
        if (active) dispatch(setUser(null));
      }
    };

    void syncAuth();
    const unsub = onAuthChanged(() => {
      void syncAuth();
    });

    return () => {
      active = false;
      unsub();
    };
  }, [dispatch]);

  if (status === "unknown") {
    return <Loading variant="fullscreen" />;
  }

  if (status === "guest") {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}
