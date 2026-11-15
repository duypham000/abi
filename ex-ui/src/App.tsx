import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "katex/dist/katex.min.css";
import { ProtectedRoute } from "@/presentation/components/ProtectedRoute";
import { WorkspaceShell } from "@/presentation/layout/WorkspaceShell";
import { AuthLayout } from "@/presentation/layouts/AuthLayout";
import LoginPage from "@/presentation/features/auth/pages/LoginPage";
import RegisterPage from "@/presentation/features/auth/pages/RegisterPage";
import VerifyPage from "@/presentation/features/auth/pages/VerifyPage";
import DocPopupPage from "@/presentation/features/docs/pages/DocPopupPage";
import PanelPopupPage from "@/presentation/features/panels/pages/PanelPopupPage/PanelPopupPage";
import SettingsPage from "@/presentation/features/settings/pages/SettingsPage/SettingsPage";
import GeneralSection from "@/presentation/features/settings/sections/GeneralSection";
import AccountSection from "@/presentation/features/settings/sections/AccountSection";
import ShortcutSection from "@/presentation/features/settings/sections/ShortcutSection";
import AboutSection from "@/presentation/features/settings/sections/AboutSection";
import SearchSection from "@/presentation/features/settings/sections/SearchSection";
import { isMobile } from "@/infrastructure/platform";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Mobile: auth lives in-app as public routes (desktop handles auth in a separate window) */}
        {isMobile() && (
          <>
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
          </>
        )}

        {/* Doc popup: still a separate Tauri window / route */}
        <Route element={<ProtectedRoute />}>
          <Route path="/doc-popup/:id" element={<DocPopupPage />} />
          <Route path="/doc-popup/draft/:localId" element={<DocPopupPage />} />
        </Route>

        {/* Generic panel popup: opened via coord_open_panel for any non-doc panel type */}
        <Route element={<ProtectedRoute />}>
          <Route path="/panel-popup/:panelType" element={<PanelPopupPage />} />
        </Route>

        {/* Settings: keep router-driven version for deep-links when not in panel mode */}
        <Route element={<ProtectedRoute />}>
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="/settings/general" replace />} />
            <Route path="general" element={<GeneralSection />} />
            <Route path="account" element={<AccountSection />} />
            <Route path="shortcut" element={<ShortcutSection />} />
            <Route path="search" element={<SearchSection />} />
            <Route path="about" element={<AboutSection />} />
          </Route>
        </Route>

        {/* Main workspace — Golden Layout dock shell catches all other routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/*" element={<WorkspaceShell />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
