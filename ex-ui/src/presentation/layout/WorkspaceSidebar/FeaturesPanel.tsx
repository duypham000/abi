import {
  LayoutDashboardIcon,
  FileTextIcon,
  FrameIcon,
  NetworkIcon,
  ShieldIcon,
  MessageSquareIcon,
  TerminalIcon,
  ZapIcon,
  SettingsIcon,
  SearchIcon,
  Languages,
  Users,
  Play,
  FileEdit,
} from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/presentation/store";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { PANEL_TYPES, PANEL_TITLES, type PanelType } from "../golden/panelRegistry";
import "./FeaturesPanel.scss";

const FEATURES: { type: PanelType; icon: React.ReactNode; emoji: string }[] = [
  { type: PANEL_TYPES.DASHBOARD,   icon: <LayoutDashboardIcon size={22} />, emoji: "⬡" },
  { type: PANEL_TYPES.DOCS_LIST,   icon: <FileTextIcon size={22} />,        emoji: "📄" },
  { type: PANEL_TYPES.CANVAS_LIST, icon: <FrameIcon size={22} />,           emoji: "🎨" },
  { type: PANEL_TYPES.BATCH_RENAME, icon: <FileEdit size={22} />,           emoji: "📝" },
  { type: PANEL_TYPES.PORTS,       icon: <NetworkIcon size={22} />,         emoji: "🔌" },
  { type: PANEL_TYPES.SECRETS,     icon: <ShieldIcon size={22} />,          emoji: "🔑" },
  { type: PANEL_TYPES.CHAT,        icon: <MessageSquareIcon size={22} />,   emoji: "💬" },
  { type: PANEL_TYPES.SCRIPTS,     icon: <TerminalIcon size={22} />,        emoji: "⚡" },
  { type: PANEL_TYPES.POWERSHELL_RUNNER, icon: <Play size={22} />,          emoji: "🐚" },
  { type: PANEL_TYPES.API,         icon: <ZapIcon size={22} />,             emoji: "🔗" },
  { type: PANEL_TYPES.TRANSLATE,   icon: <Languages size={22} />,           emoji: "🌐" },
  { type: PANEL_TYPES.SEARCH,      icon: <SearchIcon size={22} />,          emoji: "🔍" },
  { type: PANEL_TYPES.SETTINGS,    icon: <SettingsIcon size={22} />,        emoji: "⚙️" },
  { type: PANEL_TYPES.USERS,       icon: <Users size={22} />,               emoji: "👥" },
];

export function FeaturesPanel() {
  const { openPanel } = useGoldenLayout();
  const { user } = useSelector((state: RootState) => state.auth);
  const isAdmin = user?.role === "ADMIN";

  const filteredFeatures = FEATURES.filter(
    (feature) => feature.type !== PANEL_TYPES.USERS || isAdmin
  );

  return (
    <div className="features-panel">
      <div className="features-panel__header">
        <span className="features-panel__title">Features</span>
      </div>
      <div className="features-panel__grid">
        {filteredFeatures.map(({ type, icon }) => (
          <button
            key={type}
            className="feature-card"
            onClick={() => openPanel(type, {}, { singleton: true })}
            title={PANEL_TITLES[type]}
          >
            <span className="feature-card__icon">{icon}</span>
            <span className="feature-card__label">{PANEL_TITLES[type]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
