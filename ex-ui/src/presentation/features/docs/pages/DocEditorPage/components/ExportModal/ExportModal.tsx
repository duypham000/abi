import { useEffect, useState } from "react";
import { Modal, Button, message, Spin } from "antd";
import {
  FileMarkdownOutlined,
  Html5Outlined,
  DatabaseOutlined,
  FileImageOutlined,
  PrinterOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import type { DocDto } from "@/core/interfaces/docs";
import {
  blocksToHTML,
  blocksToMarkdown,
  captureElementAsPNG,
  docToSnapshot,
  downloadBlob,
  downloadText,
} from "../../exportHelpers";
import "./ExportModal.scss";

export type ExportFormat = "markdown" | "html" | "snapshot" | "png" | "print";

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { format: "markdown", label: "Markdown (.md)",     description: "Plain markdown text",         icon: <FileMarkdownOutlined /> },
  { format: "html",     label: "HTML (.html)",       description: "Standalone HTML document",    icon: <Html5Outlined /> },
  { format: "snapshot", label: "Snapshot (.json)",   description: "Full doc JSON (title + content + metadata)", icon: <DatabaseOutlined /> },
  { format: "png",      label: "Image (.png)",       description: "Render the editor as image",  icon: <FileImageOutlined /> },
  { format: "print",    label: "Print",              description: "Open browser print dialog",   icon: <PrinterOutlined /> },
];

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  doc: DocDto | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
  /** Returns the DOM element to capture for PNG export. */
  getCaptureElement?: () => HTMLElement | null;
}

export function ExportModal({ open, onClose, doc, editor, getCaptureElement }: ExportModalProps) {
  const [selected, setSelected] = useState<ExportFormat | null>(null);
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState<string>("");
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [pngUrl, setPngUrl] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setTextContent("");
      setPngBlob(null);
      if (pngUrl) URL.revokeObjectURL(pngUrl);
      setPngUrl("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSelect(format: ExportFormat) {
    if (format === "print") {
      onClose();
      setTimeout(() => window.print(), 100);
      return;
    }

    if (!doc) {
      message.warning("Document not ready");
      return;
    }

    setSelected(format);
    setLoading(true);
    try {
      if (format === "markdown") {
        if (!editor) throw new Error("Editor not ready");
        setTextContent(await blocksToMarkdown(editor));
      } else if (format === "html") {
        if (!editor) throw new Error("Editor not ready");
        setTextContent(await blocksToHTML(editor));
      } else if (format === "snapshot") {
        setTextContent(docToSnapshot(doc));
      } else if (format === "png") {
        const el = getCaptureElement?.();
        if (!el) throw new Error("Editor element not available");
        const blob = await captureElementAsPNG(el);
        setPngBlob(blob);
        setPngUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error("[Export] generate failed:", format, err);
      message.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setSelected(null);
    setTextContent("");
    setPngBlob(null);
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    setPngUrl("");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(textContent);
      message.success("Copied to clipboard");
    } catch {
      message.error("Copy failed");
    }
  }

  function handleDownload() {
    if (!doc) return;
    const baseName = doc.title || "untitled";
    if (selected === "markdown") downloadText(textContent, `${baseName}.md`, "text/markdown");
    else if (selected === "html") downloadText(textContent, `${baseName}.html`, "text/html");
    else if (selected === "snapshot") downloadText(textContent, `${baseName}.json`, "application/json");
    else if (selected === "png" && pngBlob) downloadBlob(pngBlob, `${baseName}.png`);
  }

  return (
    <Modal
      title={
        selected ? (
          <div className="export-modal-title">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} />
            <span>Export · {EXPORT_OPTIONS.find((o) => o.format === selected)?.label}</span>
          </div>
        ) : (
          "Export"
        )
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={selected ? 720 : 480}
      classNames={{ body: "export-modal-body" }}
    >
      {!selected && (
        <div className="export-modal-list">
          {EXPORT_OPTIONS.map(({ format, label, description, icon }) => (
            <div
              key={format}
              className="export-modal-row"
              onClick={() => handleSelect(format)}
            >
              <span className="export-modal-row-icon">{icon}</span>
              <div className="export-modal-row-text">
                <div className="export-modal-row-label">{label}</div>
                <div className="export-modal-row-desc">{description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="export-modal-preview">
          {loading ? (
            <div className="export-modal-loading">
              <Spin /> <span>Generating…</span>
            </div>
          ) : (
            <>
              {selected === "png" ? (
                pngUrl ? (
                  <div className="export-modal-image-wrap">
                    <img src={pngUrl} alt="Export preview" />
                  </div>
                ) : null
              ) : (
                <textarea
                  className="export-modal-textarea"
                  readOnly
                  value={textContent}
                  onFocus={(e) => e.currentTarget.select()}
                />
              )}

              <div className="export-modal-actions">
                {selected !== "png" && (
                  <Button icon={<CopyOutlined />} onClick={handleCopy}>
                    Copy
                  </Button>
                )}
                <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
                  Download
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
