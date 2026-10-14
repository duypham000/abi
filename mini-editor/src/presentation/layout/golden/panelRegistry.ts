export const PANEL_TYPES = {
  DASHBOARD: "dashboard",
  DOCS_LIST: "docs-list",
  DOC_EDITOR: "doc-editor",
  CANVAS_LIST: "canvas-list",
  CANVAS_EDITOR: "canvas-editor",
  SERIES_DETAIL: "series-detail",
  SETTINGS: "settings",
  SEARCH: "search",
  TRANSLATE: "translate",
} as const;

export type PanelType = (typeof PANEL_TYPES)[keyof typeof PANEL_TYPES];

export interface PanelState {
  [key: string]: unknown;
}

export const PANEL_TITLES: Record<PanelType, string> = {
  dashboard: "Dashboard",
  "docs-list": "Docs",
  "doc-editor": "Document",
  "canvas-list": "Canvas",
  "canvas-editor": "Canvas",
  "series-detail": "Series",
  settings: "Settings",
  search: "Search",
  translate: "Translate",
};
