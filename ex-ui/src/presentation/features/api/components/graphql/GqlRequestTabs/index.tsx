import { Badge, Tabs } from "antd";
import { useGraphqlStore } from "../../../store/graphqlStore";
import { KeyValueEditor } from "../../shared/KeyValueEditor";
import { ScriptEditor } from "../../shared/ScriptEditor";
import { AuthTab } from "../../rest/RequestBuilder/RequestTabs/AuthTab";
import { QueryEditor } from "../QueryEditor";
import type { GqlOptionTab } from "../../../types/graphql";

interface GqlRequestTabsProps {
  tabId: string;
  onRun: () => void;
}

export function GqlRequestTabs({ tabId, onRun }: GqlRequestTabsProps) {
  const activeOptionTab = useGraphqlStore((s) => s.activeOptionTab);
  const setActiveOptionTab = useGraphqlStore((s) => s.setActiveOptionTab);
  const tab = useGraphqlStore((s) => s.tabs.find((t) => t.id === tabId));
  const updateTabRequest = useGraphqlStore((s) => s.updateTabRequest);

  if (!tab) return null;

  const { request } = tab;
  const activeHeaders = request.headers.filter((h) => h.enabled && h.key).length;

  const tabItems = [
    {
      key: "query",
      label: "Query",
      children: (
        <QueryEditor tabId={tabId} query={request.query} onRun={onRun} />
      ),
    },
    {
      key: "variables",
      label: "Variables",
      children: (
        <ScriptEditor
          value={request.variables}
          onChange={(v) => updateTabRequest(tabId, { variables: v })}
          placeholder={"{\n  \n}"}
          hint='JSON variables — e.g. { "id": "1" }'
        />
      ),
    },
    {
      key: "headers",
      label: (
        <span>
          Headers{" "}
          {activeHeaders > 0 && (
            <Badge count={activeHeaders} size="small" style={{ fontSize: 10 }} />
          )}
        </span>
      ),
      children: (
        <div style={{ padding: 12 }}>
          <KeyValueEditor
            rows={request.headers}
            onChange={(rows) => updateTabRequest(tabId, { headers: rows })}
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
          />
        </div>
      ),
    },
    {
      key: "auth",
      label: "Authorization",
      children: (
        <AuthTab
          auth={request.auth}
          onChange={(auth) => updateTabRequest(tabId, { auth })}
        />
      ),
    },
  ];

  return (
    <Tabs
      activeKey={activeOptionTab}
      onChange={(k) => setActiveOptionTab(k as GqlOptionTab)}
      items={tabItems}
      size="small"
      className="gql-request-tabs"
    />
  );
}
