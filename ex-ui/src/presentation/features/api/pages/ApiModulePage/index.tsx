import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import {
  BracesIcon,
  NetworkIcon,
  PlugIcon,
  RadioIcon,
  RadioTowerIcon,
  Settings2Icon,
  ZapIcon,
} from "lucide-react";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { setPageTitle } from "@/presentation/store/appSlice";
import type { AppDispatch } from "@/presentation/store";
import { useApiPersistence } from "../../hooks/useApiPersistence";
import "./ApiModulePage.scss";

// Lazy-loaded sub-pages for panel mode (avoid importing all upfront)
import { RestPage } from "../RestPage";
import { GraphqlPage } from "../GraphqlPage";
import { WebSocketPage } from "../WebSocketPage";
import { SsePage } from "../SsePage";
import { SocketIoPage } from "../SocketIoPage";
import { MqttPage } from "../MqttPage";
import { ApiSettingsPage } from "../ApiSettingsPage";

type ApiTab = "rest" | "graphql" | "websocket" | "sse" | "socketio" | "mqtt" | "settings";

const NAV_ITEMS: { label: string; path: string; tab: ApiTab; icon: React.ReactNode }[] = [
  { label: "REST", path: "/api/rest", tab: "rest", icon: <ZapIcon size={13} /> },
  { label: "GraphQL", path: "/api/graphql", tab: "graphql", icon: <BracesIcon size={13} /> },
  { label: "WebSocket", path: "/api/realtime/websocket", tab: "websocket", icon: <RadioIcon size={13} /> },
  { label: "SSE", path: "/api/realtime/sse", tab: "sse", icon: <RadioTowerIcon size={13} /> },
  { label: "Socket.IO", path: "/api/realtime/socketio", tab: "socketio", icon: <PlugIcon size={13} /> },
  { label: "MQTT", path: "/api/realtime/mqtt", tab: "mqtt", icon: <NetworkIcon size={13} /> },
];

function PanelTabContent({ tab }: { tab: ApiTab }) {
  switch (tab) {
    case "rest": return <RestPage />;
    case "graphql": return <GraphqlPage />;
    case "websocket": return <WebSocketPage />;
    case "sse": return <SsePage />;
    case "socketio": return <SocketIoPage />;
    case "mqtt": return <MqttPage />;
    case "settings": return <ApiSettingsPage />;
  }
}

interface ApiModulePageProps {
  panelMode?: boolean;
  initialTab?: string;
}

export function ApiModulePage({ panelMode, initialTab }: ApiModulePageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ApiTab>((initialTab as ApiTab) ?? "rest");
  useApiPersistence();

  useEffect(() => {
    if (panelMode) {
      const found = NAV_ITEMS.find((i) => i.tab === activeTab);
      dispatch(setPageTitle(found?.label ?? "API Client"));
    } else {
      const active = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
      dispatch(setPageTitle(active?.label ?? "API Client"));
    }
  }, [panelMode, activeTab, location.pathname, dispatch]);

  if (panelMode) {
    return (
      <div className="api-module-main" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <nav className="api-top-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.tab}
              className={`api-nav-item${activeTab === item.tab ? " active" : ""}`}
              onClick={() => setActiveTab(item.tab)}
            >
              {item.icon}
              <span className="api-nav-label">{item.label}</span>
            </button>
          ))}
          <div className="api-nav-spacer" />
          <button
            className={`api-nav-item${activeTab === "settings" ? " active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Settings2Icon size={13} />
            <span className="api-nav-label">Settings</span>
          </button>
        </nav>
        <div className="api-module-content" style={{ flex: 1, overflow: "auto" }}>
          <PanelTabContent tab={activeTab} />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        <main className="dashboard-main api-module-main">
          <nav className="api-top-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `api-nav-item${isActive ? " active" : ""}`}
              >
                {item.icon}
                <span className="api-nav-label">{item.label}</span>
              </NavLink>
            ))}
            <div className="api-nav-spacer" />
            <NavLink
              to="/api/settings"
              className={({ isActive }) => `api-nav-item${isActive ? " active" : ""}`}
            >
              <Settings2Icon size={13} />
              <span className="api-nav-label">Settings</span>
            </NavLink>
          </nav>
          <div className="api-module-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
