/**
 * LayoutToolbar — thin strip above the GL panel area.
 *
 * Surfaces all GoldenLayout features from the examples page:
 *  ESSENTIALS:     Row / Column / Stack presets + Saving State (auto)
 *  CONFIGURATION:  Golden Spiral, Nested Stacks presets
 *  ADDING ITEMS:   By Selection (+ Add Panel dropdown)
 *  CUSTOM:         Extending Header (scroll/drop buttons live in headers),
 *                  Programmatic Reorder ← →, Move to New Stack,
 *                  Toggle Scroll, Toggle Drop on Header, Reset Layout
 */
import { useState, useRef, useEffect } from "react";
import {
  LayoutGridIcon,
  ColumnsIcon,
  Rows3Icon,
  PlusIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  MoveIcon,
  RotateCcwIcon,
  ChevronDownIcon,
} from "lucide-react";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { PANEL_TYPES, PANEL_TITLES, type PanelType } from "../golden/panelRegistry";
import {
  goldenSpiralLayout,
  nestedStacksLayout,
  rowDemoLayout,
  columnDemoLayout,
  stackDemoLayout,
} from "../golden/presetLayouts";
import "./LayoutToolbar.scss";

// ── Panel list for "Add Panel" dropdown ──────────────────────────────────
const ADD_PANEL_ITEMS: { type: PanelType; emoji: string }[] = [
  { type: PANEL_TYPES.DASHBOARD,   emoji: "⬡" },
  { type: PANEL_TYPES.DOCS_LIST,   emoji: "📄" },
  { type: PANEL_TYPES.CANVAS_LIST, emoji: "🎨" },
  { type: PANEL_TYPES.TRANSLATE,   emoji: "🌐" },
  { type: PANEL_TYPES.SEARCH,      emoji: "🔍" },
  { type: PANEL_TYPES.SETTINGS,    emoji: "⚙️" },
];

// ── Small button ──────────────────────────────────────────────────────────
function TBtn({
  icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`lt-btn${active ? " is-active" : ""}${danger ? " is-danger" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span className="lt-btn__label">{label}</span>
    </button>
  );
}

// ── Separator ─────────────────────────────────────────────────────────────
function Sep() {
  return <span className="lt-sep" aria-hidden />;
}

// ── Add Panel dropdown ────────────────────────────────────────────────────
function AddPanelMenu() {
  const { openPanel } = useGoldenLayout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="lt-dropdown" ref={ref}>
      <button
        className={`lt-btn lt-btn--accent${open ? " is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Add panel"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <PlusIcon size={13} />
        <span className="lt-btn__label">Add Panel</span>
        <ChevronDownIcon size={11} className={`lt-chevron${open ? " is-open" : ""}`} />
      </button>

      {open && (
        <div className="lt-dropdown__menu" role="menu">
          <div className="lt-dropdown__section-label">By Selection</div>
          {ADD_PANEL_ITEMS.map(({ type, emoji }) => (
            <button
              key={type}
              className="lt-dropdown__item"
              role="menuitem"
              onClick={() => {
                openPanel(type, {}, { singleton: true });
                setOpen(false);
              }}
            >
              <span className="lt-dropdown__emoji">{emoji}</span>
              {PANEL_TITLES[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Preset dropdown ───────────────────────────────────────────────────────
function PresetMenu() {
  const { loadPreset } = useGoldenLayout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const presets = [
    { label: "Row",           emoji: "↔",  config: rowDemoLayout },
    { label: "Column",        emoji: "↕",  config: columnDemoLayout },
    { label: "Stack",         emoji: "☰",  config: stackDemoLayout },
    { label: "Golden Spiral", emoji: "🌀", config: goldenSpiralLayout },
    { label: "Nested Stacks", emoji: "⊞",  config: nestedStacksLayout },
  ];

  return (
    <div className="lt-dropdown" ref={ref}>
      <button
        className={`lt-btn${open ? " is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Layout presets"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <LayoutGridIcon size={13} />
        <span className="lt-btn__label">Presets</span>
        <ChevronDownIcon size={11} className={`lt-chevron${open ? " is-open" : ""}`} />
      </button>

      {open && (
        <div className="lt-dropdown__menu" role="menu">
          <div className="lt-dropdown__section-label">Essentials</div>
          {presets.slice(0, 3).map(({ label, emoji, config }) => (
            <button
              key={label}
              className="lt-dropdown__item"
              role="menuitem"
              onClick={() => { loadPreset(config); setOpen(false); }}
            >
              <span className="lt-dropdown__emoji">{emoji}</span>
              {label}
            </button>
          ))}
          <div className="lt-dropdown__divider" />
          <div className="lt-dropdown__section-label">Configuration</div>
          {presets.slice(3).map(({ label, emoji, config }) => (
            <button
              key={label}
              className="lt-dropdown__item"
              role="menuitem"
              onClick={() => { loadPreset(config); setOpen(false); }}
            >
              <span className="lt-dropdown__emoji">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main toolbar ──────────────────────────────────────────────────────────
export function LayoutToolbar() {
  const {
    reorderActiveTab,
    moveActiveToNewStack,
    splitPanel,
    togglePanelScroll,
    toggleDropOnHeader,
    resetLayout,
  } = useGoldenLayout();

  return (
    <div className="layout-toolbar" role="toolbar" aria-label="Layout controls">
      {/* Preset layouts */}
      <PresetMenu />

      <Sep />

      {/* Add panel by selection */}
      <AddPanelMenu />

      <Sep />

      {/* Split active panel */}
      <TBtn
        icon={<ColumnsIcon size={13} />}
        label="Split Right"
        onClick={() => splitPanel("row")}
      />
      <TBtn
        icon={<Rows3Icon size={13} />}
        label="Split Down"
        onClick={() => splitPanel("column")}
      />

      <Sep />

      {/* Programmatic Reorder */}
      <TBtn
        icon={<ArrowLeftIcon size={13} />}
        label="Move Tab Left"
        onClick={() => reorderActiveTab("left")}
      />
      <TBtn
        icon={<ArrowRightIcon size={13} />}
        label="Move Tab Right"
        onClick={() => reorderActiveTab("right")}
      />
      <TBtn
        icon={<MoveIcon size={13} />}
        label="Move to New Stack"
        onClick={() => moveActiveToNewStack()}
      />

      <Sep />

      {/* Panel Scrolling */}
      <TBtn
        icon={<span className="lt-icon-text">↕</span>}
        label="Toggle Scroll"
        onClick={() => togglePanelScroll()}
      />

      {/* Disable Drop on Header */}
      <TBtn
        icon={<span className="lt-icon-text">⊘</span>}
        label="Toggle Drop"
        onClick={() => toggleDropOnHeader()}
      />

      <Sep />

      {/* Reset layout */}
      <TBtn
        icon={<RotateCcwIcon size={13} />}
        label="Reset Layout"
        onClick={() => resetLayout()}
        danger
      />
    </div>
  );
}
