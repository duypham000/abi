import type { LayoutConfig } from "golden-layout";
import { PANEL_TYPES } from "./panelRegistry";

// ── Golden Spiral ─────────────────────────────────────────────────────────
// Panels arranged in a Fibonacci/golden-ratio spiral — largest left,
// progressively smaller subdivisions to the right.
export const goldenSpiralLayout: LayoutConfig = {
  root: {
    type: "row",
    content: [
      {
        type: "stack",
        width: 61.8,
        content: [
          { type: "component", componentType: PANEL_TYPES.DASHBOARD, title: "Dashboard" },
          { type: "component", componentType: PANEL_TYPES.CHAT,       title: "Chat" },
        ],
      },
      {
        type: "column",
        width: 38.2,
        content: [
          {
            type: "stack",
            height: 61.8,
            content: [
              { type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" },
              { type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" },
            ],
          },
          {
            type: "row",
            height: 38.2,
            content: [
              {
                type: "stack",
                width: 61.8,
                content: [
                  { type: "component", componentType: PANEL_TYPES.API,     title: "API Client" },
                  { type: "component", componentType: PANEL_TYPES.SCRIPTS, title: "Scripts" },
                ],
              },
              {
                type: "stack",
                width: 38.2,
                content: [
                  { type: "component", componentType: PANEL_TYPES.SETTINGS, title: "Settings" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ── Nested Stacks ─────────────────────────────────────────────────────────
// 2×2 grid of stacks, each with multiple tabs — demonstrates stacks within rows/columns.
export const nestedStacksLayout: LayoutConfig = {
  root: {
    type: "row",
    content: [
      {
        type: "column",
        width: 50,
        content: [
          {
            type: "stack",
            height: 55,
            content: [
              { type: "component", componentType: PANEL_TYPES.DASHBOARD, title: "Dashboard" },
              { type: "component", componentType: PANEL_TYPES.CHAT,      title: "Chat" },
              { type: "component", componentType: PANEL_TYPES.SEARCH,    title: "Search" },
            ],
          },
          {
            type: "stack",
            height: 45,
            content: [
              { type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" },
              { type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" },
            ],
          },
        ],
      },
      {
        type: "column",
        width: 50,
        content: [
          {
            type: "stack",
            height: 60,
            content: [
              { type: "component", componentType: PANEL_TYPES.API,     title: "API Client" },
              { type: "component", componentType: PANEL_TYPES.SCRIPTS, title: "Scripts" },
            ],
          },
          {
            type: "stack",
            height: 40,
            content: [
              { type: "component", componentType: PANEL_TYPES.PORTS,    title: "Ports" },
              { type: "component", componentType: PANEL_TYPES.SECRETS,  title: "Secrets" },
              { type: "component", componentType: PANEL_TYPES.SETTINGS, title: "Settings" },
            ],
          },
        ],
      },
    ],
  },
};

// ── Row demo ──────────────────────────────────────────────────────────────
// Three panels arranged horizontally in a single row.
export const rowDemoLayout: LayoutConfig = {
  root: {
    type: "row",
    content: [
      { type: "stack", width: 33, content: [{ type: "component", componentType: PANEL_TYPES.DASHBOARD,   title: "Dashboard" }] },
      { type: "stack", width: 33, content: [{ type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" }] },
      { type: "stack", width: 34, content: [{ type: "component", componentType: PANEL_TYPES.CHAT,        title: "Chat" }] },
    ],
  },
};

// ── Column demo ───────────────────────────────────────────────────────────
// Three panels stacked vertically in a single column.
export const columnDemoLayout: LayoutConfig = {
  root: {
    type: "column",
    content: [
      { type: "stack", height: 33, content: [{ type: "component", componentType: PANEL_TYPES.DASHBOARD,   title: "Dashboard" }] },
      { type: "stack", height: 33, content: [{ type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" }] },
      { type: "stack", height: 34, content: [{ type: "component", componentType: PANEL_TYPES.CHAT,        title: "Chat" }] },
    ],
  },
};

// ── Stack demo ────────────────────────────────────────────────────────────
// All panels in a single tabbed stack.
export const stackDemoLayout: LayoutConfig = {
  root: {
    type: "stack",
    content: [
      { type: "component", componentType: PANEL_TYPES.DASHBOARD,   title: "Dashboard" },
      { type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" },
      { type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" },
      { type: "component", componentType: PANEL_TYPES.API,         title: "API Client" },
      { type: "component", componentType: PANEL_TYPES.CHAT,        title: "Chat" },
    ],
  },
};
