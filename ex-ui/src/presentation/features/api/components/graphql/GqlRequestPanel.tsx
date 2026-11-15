import { useRef } from "react";
import { Button, Input, Spin } from "antd";
import { useGraphqlStore } from "../../store/graphqlStore";
import { executeGqlRequest, subscribeGql } from "../../services/gqlService";
import { GqlRequestTabs } from "./GqlRequestTabs";
import type { GqlTab } from "../../types/graphql";

interface GqlRequestPanelProps {
  tab: GqlTab;
}

export function GqlRequestPanel({ tab }: GqlRequestPanelProps) {
  const updateTab = useGraphqlStore((s) => s.updateTab);
  const updateTabRequest = useGraphqlStore((s) => s.updateTabRequest);
  const acRef = useRef<AbortController | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const { connectionState } = tab;
  const isSubscription = tab.request.query.trim().toLowerCase().startsWith("subscription");

  const handleConnect = async () => {
    if (!tab.request.url.trim()) return;

    if (isSubscription) {
      updateTab(tab.id, { connectionState: "CONNECTED", response: [] });
      const tabId = tab.id;
      unsubRef.current = subscribeGql(
        tab.request,
        (event) => {
          const store = useGraphqlStore.getState();
          const current = store.tabs.find((t) => t.id === tabId);
          const prev = current?.response ?? [];
          store.updateTab(tabId, { response: [...prev, event] });
        },
        () => {
          useGraphqlStore.getState().updateTab(tabId, { connectionState: "DISCONNECTED" });
          unsubRef.current = null;
        },
        (err) => {
          useGraphqlStore.getState().updateTab(tabId, {
            connectionState: "DISCONNECTED",
            response: [
              {
                time: Date.now(),
                data: JSON.stringify({ errors: [{ message: err }] }),
              },
            ],
          });
          unsubRef.current = null;
        }
      );
    } else {
      acRef.current = new AbortController();
      updateTab(tab.id, { connectionState: "CONNECTING" });
      try {
        const result = await executeGqlRequest(tab.request, acRef.current.signal);
        updateTab(tab.id, { response: result, connectionState: "CONNECTED" });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          updateTab(tab.id, { connectionState: "DISCONNECTED" });
        }
      }
    }
  };

  const handleDisconnect = () => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    } else {
      acRef.current?.abort();
    }
    updateTab(tab.id, { connectionState: "DISCONNECTED" });
  };

  return (
    <div className="gql-request-panel">
      <div className="gql-request-header">
        <Input
          value={tab.request.url}
          onChange={(e) => updateTabRequest(tab.id, { url: e.target.value })}
          placeholder="Enter GraphQL endpoint URL"
          size="small"
          className="gql-url-input"
          disabled={connectionState === "CONNECTING" || connectionState === "CONNECTED"}
          style={{ fontFamily: "monospace", flex: 1 }}
          onPressEnter={connectionState === "DISCONNECTED" ? handleConnect : undefined}
        />

        {connectionState === "DISCONNECTED" && (
          <Button type="primary" size="small" onClick={handleConnect}>
            {isSubscription ? "Subscribe" : "Connect"}
          </Button>
        )}
        {connectionState === "CONNECTING" && (
          <Button size="small" disabled>
            <Spin size="small" style={{ marginRight: 4 }} />
            Connecting…
          </Button>
        )}
        {connectionState === "CONNECTED" && (
          <Button danger size="small" onClick={handleDisconnect}>
            {isSubscription ? "Unsubscribe" : "Disconnect"}
          </Button>
        )}
      </div>

      <div className="gql-request-tabs-container">
        <GqlRequestTabs tabId={tab.id} onRun={handleConnect} />
      </div>
    </div>
  );
}
