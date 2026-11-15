import { Group, Panel, Separator } from "react-resizable-panels";
import { CollectionsSidebar } from "../../components/rest/CollectionsSidebar";
import { RequestBuilder } from "../../components/rest/RequestBuilder";
import { ResponseViewer } from "../../components/rest/ResponseViewer";
import { EnvironmentSelector } from "../../components/rest/EnvironmentSelector";
import { RestTabBar } from "../../components/rest/RestTabBar";
import { useRestStore } from "../../store/restStore";
import "./RestPage.scss";

export function RestPage() {
  const leftPanelCollapsed = useRestStore((s) => s.leftPanelCollapsed);

  return (
    <div className="rest-page">
      <div className="rest-page-topbar">
        <EnvironmentSelector />
      </div>
      <div className="rest-page-body">
        <Group orientation="horizontal" id="rest-panel-layout">
          {!leftPanelCollapsed && (
            <>
              <Panel
                defaultSize="20%"
                minSize="14%"
                maxSize="35%"
                id="rest-left"
              >
                <CollectionsSidebar />
              </Panel>
              <Separator style={{ width: 4 }} />
            </>
          )}

          <Panel defaultSize="45%" minSize="30%" id="rest-middle">
            <div className="rest-middle-panel">
              <RestTabBar />
              <RequestBuilder />
            </div>
          </Panel>

          <Separator style={{ width: 4 }} />

          <Panel defaultSize="35%" minSize="25%" id="rest-right">
            <ResponseViewer />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
