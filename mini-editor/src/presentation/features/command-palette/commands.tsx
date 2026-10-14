import type { ReactNode } from "react";
import {
  LayoutDashboardIcon,
  FileTextIcon,
  FrameIcon,
  SettingsIcon,
  SearchIcon,
  Languages,
  FilePlusIcon,
  RotateCcwIcon,
  SquareSplitHorizontalIcon,
  SquareSplitVerticalIcon,
  PanelLeftIcon,
  PanelBottomIcon,
  SlidersHorizontalIcon,
  UserIcon,
  KeyboardIcon,
  InfoIcon,
} from "lucide-react";
import type { AppDispatch } from "@/presentation/store";
import { toggleSidebar, togglePanel } from "@/presentation/store/appSlice";
import {
  PANEL_TYPES,
  PANEL_TITLES,
  type PanelType,
  type PanelState,
} from "@/presentation/layout/golden/panelRegistry";
import type { OpenPanelOptions } from "@/presentation/layout/golden/GoldenLayoutContext";

export interface CommandContext {
  openPanel: (type: PanelType, state?: PanelState, options?: OpenPanelOptions) => void;
  resetLayout: () => void;
  splitPanel: (direction: "row" | "column") => void;
  dispatch: AppDispatch;
}

export interface Command {
  id: string;
  title: string;
  category: string;
  keywords?: string;
  icon?: ReactNode;
  run: (ctx: CommandContext) => void | Promise<void>;
}

const ICON = 16;

const FEATURE_PANELS: { type: PanelType; icon: ReactNode }[] = [
  { type: PANEL_TYPES.DASHBOARD,   icon: <LayoutDashboardIcon size={ICON} /> },
  { type: PANEL_TYPES.DOCS_LIST,   icon: <FileTextIcon size={ICON} /> },
  { type: PANEL_TYPES.CANVAS_LIST, icon: <FrameIcon size={ICON} /> },
  { type: PANEL_TYPES.TRANSLATE,   icon: <Languages size={ICON} /> },
  { type: PANEL_TYPES.SEARCH,      icon: <SearchIcon size={ICON} /> },
  { type: PANEL_TYPES.SETTINGS,    icon: <SettingsIcon size={ICON} /> },
];

const SETTINGS_SECTIONS: { section: string; label: string; icon: ReactNode }[] = [
  { section: "general",  label: "General",  icon: <SlidersHorizontalIcon size={ICON} /> },
  { section: "account",  label: "Account",  icon: <UserIcon size={ICON} /> },
  { section: "shortcut", label: "Shortcut", icon: <KeyboardIcon size={ICON} /> },
  { section: "about",    label: "About",    icon: <InfoIcon size={ICON} /> },
];

async function createNewDoc(ctx: CommandContext) {
  try {
    const { createDocInSqlite } = await import("@/infrastructure/tauri/docCacheService");
    const doc = await createDocInSqlite({ title: "Untitled", content: null, metadata: null, lastSync: null, status: 0 });
    ctx.openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title || "Document" });
  } catch (err) {
    console.error("[Command Palette New Doc] failed:", err);
  }
}

export const COMMANDS: Command[] = [
  ...FEATURE_PANELS.map(({ type, icon }) => ({
    id: `open:${type}`,
    title: `Open ${PANEL_TITLES[type]}`,
    category: "Go to",
    keywords: type,
    icon,
    run: (ctx: CommandContext) => ctx.openPanel(type, {}, { singleton: true }),
  })),

  {
    id: "doc:new",
    title: "New Doc",
    category: "Create",
    keywords: "create document add",
    icon: <FilePlusIcon size={ICON} />,
    run: createNewDoc,
  },

  ...SETTINGS_SECTIONS.map(({ section, label, icon }) => ({
    id: `settings:${section}`,
    title: `Settings: ${label}`,
    category: "Settings",
    keywords: `preferences ${section}`,
    icon,
    run: (ctx: CommandContext) =>
      ctx.openPanel(PANEL_TYPES.SETTINGS, { section }, { singleton: true }),
  })),

  {
    id: "layout:reset",
    title: "Reset Layout",
    category: "Layout",
    keywords: "default restore panels",
    icon: <RotateCcwIcon size={ICON} />,
    run: (ctx) => ctx.resetLayout(),
  },
  {
    id: "layout:split-right",
    title: "Split Right",
    category: "Layout",
    keywords: "row horizontal",
    icon: <SquareSplitHorizontalIcon size={ICON} />,
    run: (ctx) => ctx.splitPanel("row"),
  },
  {
    id: "layout:split-down",
    title: "Split Down",
    category: "Layout",
    keywords: "column vertical",
    icon: <SquareSplitVerticalIcon size={ICON} />,
    run: (ctx) => ctx.splitPanel("column"),
  },
  {
    id: "layout:toggle-sidebar",
    title: "Toggle Sidebar",
    category: "View",
    keywords: "show hide left",
    icon: <PanelLeftIcon size={ICON} />,
    run: (ctx) => ctx.dispatch(toggleSidebar()),
  },
  {
    id: "layout:toggle-panel",
    title: "Toggle Bottom Panel",
    category: "View",
    keywords: "show hide bottom terminal",
    icon: <PanelBottomIcon size={ICON} />,
    run: (ctx) => ctx.dispatch(togglePanel()),
  },
];
