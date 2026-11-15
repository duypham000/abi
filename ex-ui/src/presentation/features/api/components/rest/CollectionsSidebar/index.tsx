import { Tabs } from "antd";
import { useRestStore } from "../../../store/restStore";
import { CollectionTree } from "./CollectionTree";
import { HistoryPanel } from "../HistoryPanel";
import type { LeftPanelTab } from "../../../types/rest";

export function CollectionsSidebar() {
  const leftPanelTab = useRestStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useRestStore((s) => s.setLeftPanelTab);

  return (
    <div className="collections-sidebar">
      <Tabs
        activeKey={leftPanelTab}
        onChange={(k) => setLeftPanelTab(k as LeftPanelTab)}
        size="small"
        className="sidebar-tabs"
        items={[
          {
            key: "collections",
            label: "Collections",
            children: <CollectionTree />,
          },
          {
            key: "history",
            label: "History",
            children: <HistoryPanel />,
          },
        ]}
      />
    </div>
  );
}
