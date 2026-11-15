import { Tabs } from "antd";
import { useGraphqlStore } from "../../../store/graphqlStore";
import { ResponseBody } from "../../rest/ResponseViewer/ResponseBody";
import { SubscriptionLog } from "./SubscriptionLog";
import type { GqlTab } from "../../../types/graphql";

interface GqlResponseViewerProps {
  tab: GqlTab;
}

export function GqlResponseViewer({ tab }: GqlResponseViewerProps) {
  const updateTab = useGraphqlStore((s) => s.updateTab);

  if (!tab.response || tab.response.length === 0) {
    return (
      <div className="gql-response-empty">
        Run a query to see the response
      </div>
    );
  }

  const latest = tab.response[tab.response.length - 1];
  const isSubscription = tab.request.query.trim().toLowerCase().startsWith("subscription");

  const tabItems = [
    {
      key: "body",
      label: "Body",
      children: (
        <ResponseBody body={latest.data} contentType="application/json" />
      ),
    },
    ...(isSubscription
      ? [
          {
            key: "subscription-log",
            label: `Subscription Log (${tab.response.length})`,
            children: (
              <SubscriptionLog
                events={tab.response}
                onClear={() => updateTab(tab.id, { response: null })}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="gql-response">
      <div className="gql-response-meta">
        <span className="gql-op-name">{latest.operationName}</span>
      </div>
      <Tabs items={tabItems} size="small" className="gql-response-tabs" />
    </div>
  );
}
