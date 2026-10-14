import {
  LayoutDashboardIcon,
  FileTextIcon,
  FrameIcon,
  SettingsIcon,
  SearchIcon,
  Languages,
} from "lucide-react";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { PANEL_TYPES, PANEL_TITLES, type PanelType } from "../golden/panelRegistry";
import "./FeaturesPanel.scss";

const FEATURES: { type: PanelType; icon: React.ReactNode; emoji: string }[] = [
  { type: PANEL_TYPES.DASHBOARD,   icon: <LayoutDashboardIcon size={22} />, emoji: "⬡" },
  { type: PANEL_TYPES.DOCS_LIST,   icon: <FileTextIcon size={22} />,        emoji: "📄" },
  { type: PANEL_TYPES.CANVAS_LIST, icon: <FrameIcon size={22} />,           emoji: "🎨" },
  { type: PANEL_TYPES.TRANSLATE,   icon: <Languages size={22} />,           emoji: "🌐" },
  { type: PANEL_TYPES.SEARCH,      icon: <SearchIcon size={22} />,          emoji: "🔍" },
  { type: PANEL_TYPES.SETTINGS,    icon: <SettingsIcon size={22} />,        emoji: "⚙️" },
];

export function FeaturesPanel() {
  const { openPanel } = useGoldenLayout();

  return (
    <div className="features-panel">
      <div className="features-panel__header">
        <span className="features-panel__title">Features</span>
      </div>
      <div className="features-panel__grid">
        {FEATURES.map(({ type, icon }) => (
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
