/**
 * ActivityBar — left icon rail.
 *
 * Three nav items toggle their own sidebar (features / docs / demo).
 * Re-clicking the active item closes the sidebar.
 * Settings and user avatar remain at the bottom and open GL panels directly.
 */
import {
  LayoutGridIcon,
  FileTextIcon,
  FlaskConicalIcon,
  BookOpenIcon,
  SettingsIcon,
  GripVerticalIcon,
  GitBranchIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useGoldenLayout } from "../golden/GoldenLayoutContext";
import { PANEL_TYPES, PANEL_TITLES } from "../golden/panelRegistry";
import { toggleActiveSidebar, type SidebarKey } from "@/presentation/store/appSlice";
import type { RootState, AppDispatch } from "@/presentation/store";
import { useRef, useEffect } from "react";
import type { DragSource } from "golden-layout";
import { useAuth } from "@/presentation/features/auth/hooks/useAuth";
import { useAgentStore } from "@/presentation/features/agent/store/agentStore";
import {
  preloadAgentPanel,
  preloadWorkflowPanel,
} from "@/presentation/features/agent/preloadAgentResources";
import "./ActivityBar.scss";

// ── Drag source hook (kept for Settings which still opens a GL panel) ──────
function useDragHandle(type: string) {
  const { registerDragSource, layout } = useGoldenLayout();
  const handleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = handleRef.current;
    if (!el || !layout) return;
    let ds: DragSource | null = null;
    const tid = setTimeout(() => {
      ds = registerDragSource(el, type as never, {}, PANEL_TITLES[type as keyof typeof PANEL_TITLES] ?? type);
    }, 200);
    return () => {
      clearTimeout(tid);
      if (ds) {
        try { layout.removeDragSource(ds); } catch { /* ignore */ }
      }
    };
  }, [layout, type, registerDragSource]);

  return handleRef;
}

// ── Nav items (sidebar toggles) ───────────────────────────────────────────
const NAV_ITEMS: { icon: React.ReactNode; label: string; sidebarKey: SidebarKey }[] = [
  { icon: <LayoutGridIcon size={20} />,    label: "Features",       sidebarKey: "features" },
  { icon: <FileTextIcon size={20} />,      label: "Docs",           sidebarKey: "docs" },
  { icon: <BookOpenIcon size={20} />,      label: "Series",         sidebarKey: "series" },
  { icon: <GitBranchIcon size={20} />,     label: "Source Control", sidebarKey: "git" },
  { icon: <FlaskConicalIcon size={20} />,  label: "Demo",           sidebarKey: "demo" },
];

// ── Sidebar nav item ──────────────────────────────────────────────────────
function SidebarNavItem({
  icon,
  label,
  sidebarKey,
  isActive,
}: {
  icon: React.ReactNode;
  label: string;
  sidebarKey: SidebarKey;
  isActive: boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();

  return (
    <div className={`activity-item${isActive ? " is-active" : ""}`}>
      <button
        className="activity-item__btn"
        title={label}
        onClick={() => dispatch(toggleActiveSidebar(sidebarKey))}
        aria-label={label}
        aria-pressed={isActive}
      >
        <span className="activity-item__icon">{icon}</span>
      </button>
    </div>
  );
}

// ── Settings item (opens GL panel directly, keeps drag handle) ────────────
function SettingsItem({ isActive, onOpen }: { isActive: boolean; onOpen: () => void }) {
  const dragRef = useDragHandle(PANEL_TYPES.SETTINGS);

  return (
    <div className={`activity-item${isActive ? " is-active" : ""}`}>
      <button
        className="activity-item__btn"
        title="Settings"
        onClick={onOpen}
        aria-label="Settings"
        aria-pressed={isActive}
      >
        <span className="activity-item__icon"><SettingsIcon size={20} /></span>
      </button>
      <span
        ref={dragRef}
        className="activity-item__drag"
        title="Drag to open Settings in a new panel"
        draggable={false}
      >
        <GripVerticalIcon size={10} />
      </span>
    </div>
  );
}

// ── Workflow tab item (opens Workflow DAG in a GoldenLayout tab) ───────────
function WorkflowTabItem({ onOpen }: { onOpen: () => void }) {
  const dragRef = useDragHandle(PANEL_TYPES.WORKFLOW);

  return (
    <div className="activity-item">
      <button
        className="activity-item__btn"
        title="Workflow (Open in Tab)"
        onClick={onOpen}
        onMouseEnter={() => void preloadWorkflowPanel()}
        onFocus={() => void preloadWorkflowPanel()}
        aria-label="Workflow"
      >
        <span className="activity-item__icon"><WorkflowIcon size={20} /></span>
      </button>
      <span
        ref={dragRef}
        className="activity-item__drag"
        title="Drag to open Workflow in a GoldenLayout tab"
        draggable={false}
      >
        <GripVerticalIcon size={10} />
      </span>
    </div>
  );
}

// ── Agent dock item (toggles right Agent Dock + keeps drag handle for GL tab) ──
function AgentDockItem({ isActive, onToggle }: { isActive: boolean; onToggle: () => void }) {
  const dragRef = useDragHandle(PANEL_TYPES.AGENT);

  return (
    <div className={`activity-item${isActive ? " is-active" : ""}`}>
      <button
        className="activity-item__btn"
        title="AI Agent (Ctrl+Shift+A)"
        onClick={onToggle}
        onMouseEnter={() => void preloadAgentPanel()}
        onFocus={() => void preloadAgentPanel()}
        aria-label="AI Agent"
        aria-pressed={isActive}
      >
        <span className="activity-item__icon"><SparklesIcon size={20} /></span>
      </button>
      <span
        ref={dragRef}
        className="activity-item__drag"
        title="Drag to open Agent in a GoldenLayout tab"
        draggable={false}
      >
        <GripVerticalIcon size={10} />
      </span>
    </div>
  );
}

// ── ActivityBar ───────────────────────────────────────────────────────────
export function ActivityBar() {
  const { openPanel } = useGoldenLayout();
  const { user, logout, isLoggingOut } = useAuth();
  const activeSidebar = useSelector((s: RootState) => s.app.activeSidebar);
  const isAgentDockOpen = useAgentStore((s) => s.isDockOpen);
  const toggleAgentDock = useAgentStore((s) => s.toggleDock);

  return (
    <aside className="activity-bar">
      <div className="activity-bar__top">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.sidebarKey}
            icon={item.icon}
            label={item.label}
            sidebarKey={item.sidebarKey}
            isActive={activeSidebar === item.sidebarKey}
          />
        ))}
      </div>

      <div className="activity-bar__bottom">
        <WorkflowTabItem
          onOpen={() => openPanel(PANEL_TYPES.WORKFLOW, {}, { title: PANEL_TITLES[PANEL_TYPES.WORKFLOW], singleton: true })}
        />
        <AgentDockItem
          isActive={isAgentDockOpen}
          onToggle={toggleAgentDock}
        />
        <SettingsItem
          isActive={false}
          onOpen={() => openPanel(PANEL_TYPES.SETTINGS, {}, { title: PANEL_TITLES[PANEL_TYPES.SETTINGS], singleton: true })}
        />
        {user && (
          <button
            className="activity-item activity-item--avatar"
            title={`${user.username} — click to logout`}
            onClick={logout}
            disabled={isLoggingOut}
            aria-label="Logout"
          >
            <span className="activity-item__avatar">
              {user.username.charAt(0).toUpperCase()}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
