import { Badge, Tabs } from "antd";
import { useRestStore } from "../../../../store/restStore";
import { ParamsTab } from "./ParamsTab";
import { HeadersTab } from "./HeadersTab";
import { AuthTab } from "./AuthTab";
import { BodyTab } from "./BodyTab";
import { ScriptTab } from "./ScriptTab";
import { VariablesTab } from "./VariablesTab";
import type { RequestTab } from "../../../../types/rest";

function DotIndicator() {
  return <span className="tab-dot">●</span>;
}

export function RequestTabs() {
  const activeRequestTab = useRestStore((s) => s.activeRequestTab);
  const setActiveRequestTab = useRestStore((s) => s.setActiveRequestTab);
  const currentRequest = useRestStore((s) => s.currentRequest);

  const activeParams = currentRequest.params.filter((p) => p.enabled && p.key).length;
  const activeHeaders = currentRequest.headers.filter((h) => h.enabled && h.key).length;
  const activeVars = currentRequest.variables.filter((v) => v.enabled && v.key).length;
  const hasBody = currentRequest.body.type !== "none";
  const hasAuth = currentRequest.auth.type !== "none" && currentRequest.auth.type !== "inherit";

  const tabItems = [
    {
      key: "params",
      label: (
        <span>
          Params{" "}
          {activeParams > 0 && (
            <Badge count={activeParams} size="small" style={{ fontSize: 10 }} />
          )}
        </span>
      ),
      children: <ParamsTab />,
    },
    {
      key: "body",
      label: (
        <span>
          Body{hasBody && <DotIndicator />}
        </span>
      ),
      children: <BodyTab />,
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
      children: <HeadersTab />,
    },
    {
      key: "auth",
      label: (
        <span>
          Authorization{hasAuth && <DotIndicator />}
        </span>
      ),
      children: <AuthTab />,
    },
    {
      key: "pre-request",
      label: "Pre-request Script",
      children: <ScriptTab mode="pre-request" />,
    },
    {
      key: "tests",
      label: "Tests",
      children: <ScriptTab mode="tests" />,
    },
    {
      key: "variables",
      label: (
        <span>
          Variables{" "}
          {activeVars > 0 && (
            <Badge count={activeVars} size="small" style={{ fontSize: 10 }} />
          )}
        </span>
      ),
      children: <VariablesTab />,
    },
  ];

  return (
    <Tabs
      activeKey={activeRequestTab}
      onChange={(key) => setActiveRequestTab(key as RequestTab)}
      items={tabItems}
      size="small"
      className="request-tabs"
    />
  );
}
