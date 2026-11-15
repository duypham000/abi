import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { CopyIcon, DownloadIcon, WrapTextIcon } from "lucide-react";
import { highlightToHtml } from "../../../../../components/BlockNote/blocks/code-block-highlighter";

interface ResponseBodyProps {
  body: string;
  contentType: string;
}

function detectLang(contentType: string): string {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("xml")) return "xml";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("css")) return "css";
  if (contentType.includes("javascript")) return "javascript";
  return "plaintext";
}

function tryPretty(body: string, lang: string): string {
  if (lang === "json") {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

export function ResponseBody({ body, contentType }: ResponseBodyProps) {
  const lang = detectLang(contentType);
  const [mode, setMode] = useState<"pretty" | "raw">("pretty");
  const [wrap, setWrap] = useState(false);
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const rendered = useRef(false);

  const displayBody = mode === "pretty" ? tryPretty(body, lang) : body;

  useEffect(() => {
    rendered.current = false;
    if (mode === "pretty" && lang !== "plaintext") {
      highlightToHtml(displayBody, lang).then((h) => {
        setHtml(h);
        rendered.current = true;
      });
    } else {
      setHtml("");
    }
  }, [displayBody, lang, mode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayBody).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleDownload = () => {
    const ext = lang === "json" ? "json" : lang === "xml" ? "xml" : lang === "html" ? "html" : "txt";
    const blob = new Blob([displayBody], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `response.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="response-body">
      <div className="response-body-toolbar">
        <div className="response-body-modes">
          <button
            className={`mode-btn ${mode === "pretty" ? "active" : ""}`}
            onClick={() => setMode("pretty")}
          >
            Pretty
          </button>
          <button
            className={`mode-btn ${mode === "raw" ? "active" : ""}`}
            onClick={() => setMode("raw")}
          >
            Raw
          </button>
        </div>
        <div className="response-body-actions">
          <Tooltip title="Wrap lines">
            <Button
              size="small"
              type={wrap ? "primary" : "text"}
              icon={<WrapTextIcon size={14} />}
              onClick={() => setWrap((w) => !w)}
            />
          </Tooltip>
          <Tooltip title={copied ? "Copied!" : "Copy"}>
            <Button
              size="small"
              type="text"
              icon={<CopyIcon size={14} />}
              onClick={handleCopy}
            />
          </Tooltip>
          <Tooltip title="Download">
            <Button
              size="small"
              type="text"
              icon={<DownloadIcon size={14} />}
              onClick={handleDownload}
            />
          </Tooltip>
        </div>
      </div>

      <div className={`response-body-content ${wrap ? "wrap" : ""}`}>
        {mode === "pretty" && html ? (
          <div
            className="shiki-wrapper"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="response-raw">{displayBody}</pre>
        )}
      </div>
    </div>
  );
}
