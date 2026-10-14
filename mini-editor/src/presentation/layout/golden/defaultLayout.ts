import type { LayoutConfig } from "golden-layout";
import { PANEL_TYPES } from "./panelRegistry";

export const defaultLayoutConfig: LayoutConfig = {
  settings: {
    constrainDragToContainer: true,
    reorderEnabled: true,
    popoutWholeStack: false,
    blockedPopoutsThrowError: false,
    closePopoutsOnUnload: true,
    responsiveMode: "none",
    tabOverlapAllowance: 0,
    reorderOnTabMenuClick: true,
    tabControlOffset: 10,
  },
  dimensions: {
    borderWidth: 4,
    borderGrabWidth: 12,
    headerHeight: 36,
    minItemWidth: 120,
    minItemHeight: 80,
    dragProxyWidth: 280,
    dragProxyHeight: 180,
  },
  header: {
    show: "top",
    popout: "Open in new window",
    maximise: "Maximise",
    minimise: "Minimise",
    close: "Close",
    tabDropdown: false,
  },
  root: {
    type: "row",
    content: [
      {
        type: "stack",
        width: 100,
        content: [
          {
            type: "component",
            componentType: PANEL_TYPES.DASHBOARD,
            title: "Dashboard",
            isClosable: false,
          },
        ],
      },
    ],
  },
};
