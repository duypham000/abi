import type { LayoutConfig } from "golden-layout";
import { PANEL_TYPES } from "./panelRegistry";

export const defaultGoldenLayoutConfig: LayoutConfig = {
  root: {
    type: "row",
    content: [
      {
        type: "stack",
        width: 25,
        content: [
          { type: "component", componentType: PANEL_TYPES.DASHBOARD, title: "Dashboard" },
          { type: "component", componentType: PANEL_TYPES.DOCS_LIST, title: "Docs" },
          { type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" },
        ],
      },
      {
        type: "column",
        width: 75,
        content: [
          {
            type: "stack",
            height: 60,
            content: [
              { type: "component", componentType: PANEL_TYPES.DOCS_LIST, title: "Docs" },
            ],
          },
          {
            type: "stack",
            height: 40,
            content: [
              { type: "component", componentType: PANEL_TYPES.TRANSLATE, title: "Translate" },
              { type: "component", componentType: PANEL_TYPES.SETTINGS,  title: "Settings" },
            ],
          },
        ],
      },
    ],
  },
};

export const rowDemoLayout: LayoutConfig = {
  root: {
    type: "row",
    content: [
      { type: "stack", width: 33, content: [{ type: "component", componentType: PANEL_TYPES.DASHBOARD,   title: "Dashboard" }] },
      { type: "stack", width: 33, content: [{ type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" }] },
      { type: "stack", width: 34, content: [{ type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" }] },
    ],
  },
};

export const columnDemoLayout: LayoutConfig = {
  root: {
    type: "column",
    content: [
      { type: "stack", height: 33, content: [{ type: "component", componentType: PANEL_TYPES.DASHBOARD,   title: "Dashboard" }] },
      { type: "stack", height: 33, content: [{ type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" }] },
      { type: "stack", height: 34, content: [{ type: "component", componentType: PANEL_TYPES.TRANSLATE,   title: "Translate" }] },
    ],
  },
};

export const stackDemoLayout: LayoutConfig = {
  root: {
    type: "stack",
    content: [
      { type: "component", componentType: PANEL_TYPES.DASHBOARD,   title: "Dashboard" },
      { type: "component", componentType: PANEL_TYPES.DOCS_LIST,   title: "Docs" },
      { type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" },
      { type: "component", componentType: PANEL_TYPES.TRANSLATE,   title: "Translate" },
      { type: "component", componentType: PANEL_TYPES.SETTINGS,    title: "Settings" },
    ],
  },
};

export const goldenSpiralLayout: LayoutConfig = {
  root: {
    type: "row",
    content: [
      {
        type: "stack",
        width: 50,
        content: [{ type: "component", componentType: PANEL_TYPES.DASHBOARD, title: "Dashboard" }],
      },
      {
        type: "column",
        width: 50,
        content: [
          {
            type: "stack",
            height: 50,
            content: [{ type: "component", componentType: PANEL_TYPES.DOCS_LIST, title: "Docs" }],
          },
          {
            type: "row",
            height: 50,
            content: [
              {
                type: "stack",
                width: 50,
                content: [{ type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" }],
              },
              {
                type: "column",
                width: 50,
                content: [
                  {
                    type: "stack",
                    height: 50,
                    content: [{ type: "component", componentType: PANEL_TYPES.TRANSLATE, title: "Translate" }],
                  },
                  {
                    type: "stack",
                    height: 50,
                    content: [{ type: "component", componentType: PANEL_TYPES.SETTINGS, title: "Settings" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

export const nestedStacksLayout: LayoutConfig = {
  root: {
    type: "row",
    content: [
      {
        type: "stack",
        width: 50,
        content: [
          { type: "component", componentType: PANEL_TYPES.DASHBOARD, title: "Dashboard" },
          { type: "component", componentType: PANEL_TYPES.DOCS_LIST, title: "Docs" },
        ],
      },
      {
        type: "stack",
        width: 50,
        content: [
          { type: "component", componentType: PANEL_TYPES.CANVAS_LIST, title: "Canvas" },
          { type: "component", componentType: PANEL_TYPES.TRANSLATE,   title: "Translate" },
        ],
      },
    ],
  },
};
