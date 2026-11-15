import { Select, Input } from "antd";
import { useRestStore } from "../../../../store/restStore";
import { KeyValueEditor } from "../../../shared/KeyValueEditor";
import type { BodyType } from "../../../../types/rest";

const BODY_TYPE_OPTIONS = [
  { label: "None", value: "none" },
  {
    label: "Structured",
    options: [
      { label: "multipart/form-data", value: "multipart/form-data" },
      { label: "application/x-www-form-urlencoded", value: "application/x-www-form-urlencoded" },
    ],
  },
  {
    label: "Raw",
    options: [
      { label: "application/json", value: "application/json" },
      { label: "application/xml", value: "application/xml" },
      { label: "text/html", value: "text/html" },
      { label: "text/plain", value: "text/plain" },
    ],
  },
  {
    label: "Binary",
    options: [
      { label: "application/octet-stream", value: "application/octet-stream" },
    ],
  },
];

function getRawPlaceholder(type: BodyType): string {
  if (type === "application/json") return '{\n  "key": "value"\n}';
  if (type === "application/xml") return '<?xml version="1.0"?>\n<root></root>';
  if (type === "text/html") return "<!DOCTYPE html>\n<html></html>";
  return "Enter raw body";
}

export function BodyTab() {
  const body = useRestStore((s) => s.currentRequest.body);
  const headers = useRestStore((s) => s.currentRequest.headers);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);

  const hasContentTypeOverride = headers.some(
    (h) => h.enabled && h.key.toLowerCase() === "content-type"
  );

  const setBodyType = (type: BodyType) => {
    setCurrentRequest({ body: { ...body, type } });
  };

  const isRaw = ["application/json", "application/xml", "text/html", "text/plain"].includes(
    body.type
  );

  return (
    <div className="request-tab-content body-tab">
      <div className="body-type-bar">
        <span className="body-type-label">Content type</span>
        <Select
          value={body.type}
          onChange={setBodyType}
          size="small"
          options={BODY_TYPE_OPTIONS}
          style={{ width: 260 }}
        />
        {hasContentTypeOverride && (
          <span className="body-override-badge">⚠ Overridden by Headers tab</span>
        )}
      </div>

      {body.type === "none" && (
        <div className="body-empty">
          <p>This request has no body.</p>
          <p className="body-empty-hint">Select a content type to add a body.</p>
        </div>
      )}

      {isRaw && (
        <textarea
          className="body-raw-textarea"
          value={body.content}
          onChange={(e) => setCurrentRequest({ body: { ...body, content: e.target.value } })}
          placeholder={getRawPlaceholder(body.type)}
          spellCheck={false}
        />
      )}

      {body.type === "multipart/form-data" && (
        <KeyValueEditor
          rows={body.formData ?? []}
          onChange={(rows) => setCurrentRequest({ body: { ...body, formData: rows } })}
          keyPlaceholder="Field name"
          valuePlaceholder="Value"
          showDescription
        />
      )}

      {body.type === "application/x-www-form-urlencoded" && (
        <KeyValueEditor
          rows={body.urlEncoded ?? []}
          onChange={(rows) => setCurrentRequest({ body: { ...body, urlEncoded: rows } })}
          keyPlaceholder="Key"
          valuePlaceholder="Value"
          showDescription
        />
      )}

      {body.type === "application/octet-stream" && (
        <div className="body-binary">
          <Input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setCurrentRequest({ body: { ...body, content: file.name, binaryFile: file } });
            }}
          />
          {body.content && (
            <span className="body-binary-filename">{body.content}</span>
          )}
        </div>
      )}
    </div>
  );
}
