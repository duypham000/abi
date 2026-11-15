import { useState } from "react";
import { Button, Dropdown, Input, Select, Modal, message } from "antd";
import { SendIcon, XIcon, SaveIcon, MoreVerticalIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useRestStore } from "../../../store/restStore";
import { executeRequest } from "../../../services/httpService";
import { MethodBadge } from "../../shared/MethodBadge";
import { RequestTabs } from "./RequestTabs";
import { parseCurl } from "../../../utils/curlParser";
import type { HttpMethod } from "../../../types/rest";
import { createDefaultRequest } from "../../../types/rest";

const HTTP_METHODS: HttpMethod[] = [
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE",
];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "#16a34a", POST: "#2563eb", PUT: "#ea580c", PATCH: "#9333ea",
  DELETE: "#dc2626", HEAD: "#64748b", OPTIONS: "#64748b", CONNECT: "#64748b", TRACE: "#64748b",
};

function extractPathName(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || u.hostname || "Untitled";
  } catch {
    const parts = url.split("/").filter(Boolean);
    return parts[parts.length - 1] || "Untitled";
  }
}

export function RequestBuilder() {
  const currentRequest = useRestStore((s) => s.currentRequest);
  const isLoading = useRestStore((s) => s.isLoading);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);
  const replaceCurrentRequest = useRestStore((s) => s.replaceCurrentRequest);
  const collections = useRestStore((s) => s.collections);
  const saveRequestToCollection = useRestStore((s) => s.saveRequestToCollection);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCollectionId, setSaveCollectionId] = useState<string | undefined>();
  const [saveFolderId, setSaveFolderId] = useState<string | undefined>();

  const [curlOpen, setCurlOpen] = useState(false);
  const [curlInput, setCurlInput] = useState("");

  const handleSend = async () => {
    const store = useRestStore.getState();
    if (!store.currentRequest.url.trim()) {
      message.warning("Please enter a URL");
      return;
    }
    const ac = new AbortController();
    store.setAbortController(ac);
    store.setLoading(true);
    store.setResponse(null);

    try {
      const { currentRequest: req, environments, activeEnvironmentId } = useRestStore.getState();
      const activeEnv = environments.find((e) => e.id === activeEnvironmentId) ?? null;
      const response = await executeRequest(req, activeEnv, ac.signal);
      store.setResponse(response);
      store.pushHistory({
        id: nanoid(),
        request: { ...req },
        response,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        useRestStore.getState().setResponse({
          status: 0,
          statusText: "Network Error",
          headers: {},
          body: (err as Error).message,
          timeMs: 0,
          sizeBytes: 0,
        });
      }
    } finally {
      useRestStore.getState().setLoading(false);
      useRestStore.getState().setAbortController(null);
    }
  };

  const handleCancel = () => {
    useRestStore.getState().abortController?.abort();
  };

  const handleOpenSave = () => {
    setSaveName(extractPathName(currentRequest.url));
    setSaveCollectionId(undefined);
    setSaveFolderId(undefined);
    setSaveOpen(true);
  };

  const handleSaveOk = () => {
    if (!saveCollectionId) {
      message.warning("Please select a collection");
      return;
    }
    if (!saveName.trim()) {
      message.warning("Please enter a request name");
      return;
    }
    saveRequestToCollection(saveName.trim(), saveCollectionId, saveFolderId);
    message.success("Request saved");
    setSaveOpen(false);
  };

  const handleCurlOk = () => {
    if (!curlInput.trim()) return;
    const parsed = parseCurl(curlInput.trim());
    replaceCurrentRequest({ ...currentRequest, ...parsed } as typeof currentRequest);
    setCurlOpen(false);
    setCurlInput("");
    message.success("cURL imported");
  };

  const selectedCollection = collections.find((c) => c.id === saveCollectionId);
  const folderOptions = selectedCollection?.folders.map((f) => ({ value: f.id, label: f.name })) ?? [];

  const optionsMenuItems = [
    {
      key: "clear",
      label: "Clear All",
      onClick: () => replaceCurrentRequest({ ...createDefaultRequest(), id: currentRequest.id }),
    },
    {
      key: "curl",
      label: "Import cURL",
      onClick: () => { setCurlInput(""); setCurlOpen(true); },
    },
  ];

  return (
    <div className="request-builder">
      {/* URL bar */}
      <div className="request-url-bar">
        <Select
          value={currentRequest.method}
          onChange={(m) => setCurrentRequest({ method: m as HttpMethod })}
          size="small"
          className="method-select"
          optionLabelProp="label"
        >
          {HTTP_METHODS.map((m) => (
            <Select.Option key={m} value={m} label={<MethodBadge method={m} size="sm" />}>
              <span style={{ color: METHOD_COLORS[m], fontWeight: 700, fontFamily: "monospace" }}>
                {m}
              </span>
            </Select.Option>
          ))}
        </Select>

        <Input
          value={currentRequest.url}
          onChange={(e) => setCurrentRequest({ url: e.target.value })}
          placeholder="Enter URL or paste text"
          size="small"
          className="url-input"
          onPressEnter={handleSend}
          style={{ fontFamily: "monospace" }}
        />

        {isLoading ? (
          <Button
            size="small"
            danger
            icon={<XIcon size={14} />}
            onClick={handleCancel}
            className="send-btn"
          >
            Cancel
          </Button>
        ) : (
          <Button
            type="primary"
            size="small"
            icon={<SendIcon size={14} />}
            onClick={handleSend}
            className="send-btn"
          >
            Send
          </Button>
        )}

        <Button
          size="small"
          icon={<SaveIcon size={14} />}
          onClick={handleOpenSave}
          title="Save request to collection"
        >
          Save
        </Button>

        <Dropdown menu={{ items: optionsMenuItems }} trigger={["click"]}>
          <Button size="small" icon={<MoreVerticalIcon size={14} />} title="More options" />
        </Dropdown>
      </div>

      {/* Request tabs */}
      <div className="request-tabs-container">
        <RequestTabs />
      </div>

      {/* Save to Collection modal */}
      <Modal
        title="Save Request"
        open={saveOpen}
        onOk={handleSaveOk}
        onCancel={() => setSaveOpen(false)}
        okText="Save"
        width={420}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Request name</label>
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Request name"
              size="small"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Collection</label>
            <Select
              value={saveCollectionId}
              onChange={(v) => { setSaveCollectionId(v); setSaveFolderId(undefined); }}
              placeholder="Select collection"
              size="small"
              style={{ width: "100%" }}
              options={collections.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          {folderOptions.length > 0 && (
            <div>
              <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Folder (optional)</label>
              <Select
                value={saveFolderId}
                onChange={setSaveFolderId}
                placeholder="Root of collection"
                size="small"
                style={{ width: "100%" }}
                allowClear
                options={folderOptions}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Import cURL modal */}
      <Modal
        title="Import cURL"
        open={curlOpen}
        onOk={handleCurlOk}
        onCancel={() => setCurlOpen(false)}
        okText="Import"
        width={520}
      >
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Paste a cURL command to import method, URL, headers, and body.
          </p>
          <Input.TextArea
            rows={6}
            value={curlInput}
            onChange={(e) => setCurlInput(e.target.value)}
            placeholder={`curl 'https://example.com/api' -X POST -H 'Content-Type: application/json' -d '{"key":"value"}'`}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
        </div>
      </Modal>
    </div>
  );
}
