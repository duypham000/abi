import { Group, Panel, Separator } from "react-resizable-panels";
import { useGraphqlStore } from "../../store/graphqlStore";
import { GqlTabBar } from "../../components/graphql/GqlTabBar";
import { GqlRequestPanel } from "../../components/graphql/GqlRequestPanel";
import { GqlResponseViewer } from "../../components/graphql/GqlResponseViewer";
import { SchemaExplorer } from "../../components/graphql/SchemaExplorer";
import "./GraphqlPage.scss";

export function GraphqlPage() {
  const tabs = useGraphqlStore((s) => s.tabs);
  const activeTabId = useGraphqlStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId)!;

  if (!activeTab) return null;

  const isConnected = activeTab.connectionState === "CONNECTED";

  return (
    <div className="graphql-page">
      <GqlTabBar />
      <Group orientation="horizontal" className="gql-panels" id="gql-panel-layout">
        {isConnected && (
          <>
            <Panel defaultSize="25%" minSize="15%" maxSize="40%" id="gql-schema">
              <SchemaExplorer request={activeTab.request} />
            </Panel>
            <Separator style={{ width: 4 }} />
          </>
        )}

        <Panel id="gql-main">
          <Group orientation="vertical" id="gql-vert-layout">
            <Panel defaultSize="55%" minSize="25%" id="gql-request">
              <GqlRequestPanel tab={activeTab} />
            </Panel>
            <Separator style={{ height: 4 }} />
            <Panel defaultSize="45%" minSize="20%" id="gql-response">
              <GqlResponseViewer tab={activeTab} />
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  );
}
