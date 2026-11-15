import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { RootState, AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import GeneralSection from "../../sections/GeneralSection";
import AccountSection from "../../sections/AccountSection";
import ShortcutSection from "../../sections/ShortcutSection";
import AboutSection from "../../sections/AboutSection";
import SearchSection from "../../sections/SearchSection";
import "./SettingsPage.scss";

type SettingsSection = "general" | "account" | "shortcut" | "search" | "about";

function SectionContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case "general": return <GeneralSection />;
    case "account": return <AccountSection />;
    case "shortcut": return <ShortcutSection />;
    case "search": return <SearchSection />;
    case "about": return <AboutSection />;
  }
}

interface SettingsPageProps {
  panelMode?: boolean;
  initialSection?: string;
}

export default function SettingsPage({ panelMode, initialSection }: SettingsPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);
  const { user } = useSelector((state: RootState) => state.auth);
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    (initialSection as SettingsSection) ?? "general"
  );

  useEffect(() => {
    dispatch(setPageTitle("Settings"));
  }, [dispatch]);

  const sections = [
    { path: "general", label: "General" },
    { path: "account", label: "Account" },
    { path: "shortcut", label: "Shortcut" },
    ...(user?.role === "ADMIN" ? [{ path: "search", label: "Search" }] : []),
    { path: "about", label: "About" },
  ];

  if (panelMode) {
    return (
      <div className="settings-page-container" style={{ height: "100%", width: "100%" }}>
        <div className="settings-layout" style={{ height: "100%", overflow: "hidden" }}>
          <nav className="settings-sidebar">
            <h3 className="settings-sidebar-title">Settings</h3>
            {sections.map((s) => (
              <button
                key={s.path}
                className={`settings-nav-item${activeSection === s.path ? " active" : ""}`}
                onClick={() => setActiveSection(s.path as SettingsSection)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="settings-content" style={{ overflow: "auto" }}>
            <SectionContent section={activeSection} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        <main className="dashboard-main settings-main settings-page-container">
          <div className="settings-layout">
            <nav className="settings-sidebar">
              <h3 className="settings-sidebar-title">Settings</h3>
              {sections.map((s) => (
                <NavLink
                  key={s.path}
                  to={`/settings/${s.path}`}
                  className={({ isActive }) =>
                    isActive ? "settings-nav-item active" : "settings-nav-item"
                  }
                >
                  {s.label}
                </NavLink>
              ))}
            </nav>
            <div className="settings-content">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
