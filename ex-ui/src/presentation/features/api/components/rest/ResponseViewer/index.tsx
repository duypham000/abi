import { Spin, Tabs } from "antd";
import { useRestStore } from "../../../store/restStore";
import { StatusBar } from "../../shared/StatusBar";
import { ResponseBody } from "./ResponseBody";
import { TestResults } from "./TestResults";
import type { ResponseTab } from "../../../types/rest";

function EmptyState() {
  return (
    <div className="response-empty">
      <div className="response-empty-icon">⬆</div>
      <p>Send a request to see the response here</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="response-loading">
      <Spin size="large" />
      <p>Sending request…</p>
    </div>
  );
}

export function ResponseViewer() {
  const response = useRestStore((s) => s.response);
  const isLoading = useRestStore((s) => s.isLoading);
  const activeResponseTab = useRestStore((s) => s.activeResponseTab);
  const setActiveResponseTab = useRestStore((s) => s.setActiveResponseTab);

  if (isLoading) return <LoadingState />;
  if (!response) return <EmptyState />;

  const contentType = response.headers["content-type"] ?? response.headers["Content-Type"] ?? "";

  const responseHeaderRows = Object.entries(response.headers).map(([k, v]) => ({
    key: k,
    value: v,
  }));

  const tabItems = [
    {
      key: "body",
      label: "Body",
      children: (
        <ResponseBody body={response.body} contentType={contentType} />
      ),
    },
    {
      key: "headers",
      label: `Headers (${responseHeaderRows.length})`,
      children: (
        <div className="response-headers">
          <table className="response-headers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {responseHeaderRows.map(({ key, value }) => (
                <tr key={key}>
                  <td className="header-key">{key}</td>
                  <td className="header-value">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: "test-results",
      label: "Test Results",
      children: <TestResults assertions={[]} />,
    },
  ];

  return (
    <div className="response-viewer">
      <div className="response-status-bar">
        <StatusBar
          status={response.status}
          statusText={response.statusText}
          timeMs={response.timeMs}
          sizeBytes={response.sizeBytes}
        />
      </div>
      <Tabs
        activeKey={activeResponseTab}
        onChange={(k) => setActiveResponseTab(k as ResponseTab)}
        items={tabItems}
        size="small"
        className="response-tabs"
      />
    </div>
  );
}
