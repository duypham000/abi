import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/presentation/store";
import { AuthLayout } from "@/presentation/layouts/AuthLayout";
import LoginPage from "@/presentation/features/auth/pages/LoginPage";
import RegisterPage from "@/presentation/features/auth/pages/RegisterPage";
import VerifyPage from "@/presentation/features/auth/pages/VerifyPage";
import "@/App.css";
import "@/index.css";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Dedicated login window entry — auth flow only, fully decoupled from the main
 * app router. Uses MemoryRouter so navigation (login → register → verify) works
 * without depending on the URL (reload-safe; always starts at /login).
 */
function LoginApp() {
  // The window was created hidden (no white flash while the webview boots).
  // Reveal it after first paint and dismiss the splash → seamless hand-off.
  useEffect(() => {
    if (!isTauri()) return;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void invoke("coord_ready").catch(() => {});
      })
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route
          path="/login"
          element={
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          }
        />
        <Route
          path="/register"
          element={
            <AuthLayout>
              <RegisterPage />
            </AuthLayout>
          }
        />
        <Route
          path="/verify"
          element={
            <AuthLayout>
              <VerifyPage />
            </AuthLayout>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

ReactDOM.createRoot(document.getElementById("login-root") as HTMLElement).render(
  <Provider store={store}>
    <LoginApp />
  </Provider>
);
