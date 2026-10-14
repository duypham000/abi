import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "katex/dist/katex.min.css";
import { ProtectedRoute } from "@/presentation/components/ProtectedRoute";
import { WorkspaceShell } from "@/presentation/layout/WorkspaceShell";
import DocPopupPage from "@/presentation/features/docs/pages/DocPopupPage";
import PanelPopupPage from "@/presentation/features/panels/pages/PanelPopupPage/PanelPopupPage";
import SettingsPage from "@/presentation/features/settings/pages/SettingsPage/SettingsPage";
import GeneralSection from "@/presentation/features/settings/sections/GeneralSection";
import AccountSection from "@/presentation/features/settings/sections/AccountSection";
import ShortcutSection from "@/presentation/features/settings/sections/ShortcutSection";
import AboutSection from "@/presentation/features/settings/sections/AboutSection";
import SearchSection from "@/presentation/features/settings/sections/SearchSection";

import { isMobile } from "@/infrastructure/platform";
import { MobileShell } from "@/presentation/layout/MobileShell";

function App() {
  const mobile = isMobile();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/doc-popup/:id" element={<DocPopupPage />} />
          <Route path="/panel-popup/:panelType" element={<PanelPopupPage />} />
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="/settings/general" replace />} />
            <Route path="general" element={<GeneralSection />} />
            <Route path="account" element={<AccountSection />} />
            <Route path="shortcut" element={<ShortcutSection />} />
            <Route path="search" element={<SearchSection />} />
            <Route path="about" element={<AboutSection />} />
          </Route>
          <Route path="/*" element={mobile ? <MobileShell /> : <WorkspaceShell />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
