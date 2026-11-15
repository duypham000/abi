export const PANEL_TYPES = {
  DASHBOARD: "dashboard",
  DOCS_LIST: "docs-list",
  DOC_EDITOR: "doc-editor",
  DOC_DRAFT: "doc-draft",
  CANVAS_LIST: "canvas-list",
  CANVAS_EDITOR: "canvas-editor",
  SERIES_DETAIL: "series-detail",
  PORTS: "ports",
  SECRETS: "secrets",
  CHAT: "chat",
  SCRIPTS: "scripts",
  API: "api",
  SETTINGS: "settings",
  SEARCH: "search",
  TRANSLATE: "translate",
  USERS: "users",
  POWERSHELL_RUNNER: "powershell-runner",
  BATCH_RENAME: "batch-rename",
} as const;

export type PanelType = (typeof PANEL_TYPES)[keyof typeof PANEL_TYPES];

export interface PanelState {
  [key: string]: unknown;
}

export const PANEL_TITLES: Record<PanelType, string> = {
  dashboard: "Dashboard",
  "docs-list": "Docs",
  "doc-editor": "Document",
  "doc-draft": "Draft",
  "canvas-list": "Canvas",
  "canvas-editor": "Canvas",
  "series-detail": "Series",
  ports: "Ports",
  secrets: "Secrets",
  chat: "Chat",
  scripts: "Scripts",
  api: "API Client",
  settings: "Settings",
  search: "Search",
  translate: "Translate",
  users: "Users",
  "powershell-runner": "PowerShell Runner",
  "batch-rename": "Đổi đuôi file",
};
