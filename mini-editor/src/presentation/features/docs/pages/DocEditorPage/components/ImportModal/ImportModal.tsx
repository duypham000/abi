import { useRef, useState } from "react";
import { Modal, Tabs, Select, Input, Button, message } from "antd";
import {
  FileMarkdownOutlined,
  FileZipOutlined,
  Html5Outlined,
  DatabaseOutlined,
  FileOutlined,
  QuestionCircleOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import "./ImportModal.scss";

export type ImportFormat = "markdown" | "markdown-zip" | "html" | "notion" | "snapshot";
export type ImportTextFormat = "markdown" | "html" | "snapshot";

interface ImportOption {
  format: ImportFormat;
  label: string;
  accept: string;
  icon: React.ReactNode;
  showHelp?: boolean;
}

const IMPORT_OPTIONS: ImportOption[] = [
  { format: "markdown",     label: "Markdown files (.md)",            accept: ".md",   icon: <FileMarkdownOutlined /> },
  { format: "markdown-zip", label: "Markdown with media files (.zip)", accept: ".zip",  icon: <FileZipOutlined />, showHelp: true },
  { format: "html",         label: "HTML",                            accept: ".html,.htm", icon: <Html5Outlined />,   showHelp: true },
  { format: "notion",       label: "Notion (.zip)",                   accept: ".zip",  icon: <FileOutlined />,    showHelp: true },
  { format: "snapshot",     label: "Workspace snapshot (.json)",      accept: ".json", icon: <DatabaseOutlined />, showHelp: true },
];

function detectFormatFromFilename(name: string): ImportFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".json")) return "snapshot";
  // .zip is ambiguous (markdown-zip vs notion) → don't auto-pick
  return null;
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (format: ImportFormat, file: File) => void;
  onImportText: (format: ImportTextFormat, text: string) => void;
}

export function ImportModal({ open, onClose, onImport, onImportText }: ImportModalProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [dragOver, setDragOver] = useState(false);
  const [pasteFormat, setPasteFormat] = useState<ImportTextFormat>("markdown");
  const [pasteText, setPasteText] = useState("");

  function handleRowClick(format: ImportFormat) {
    fileInputRefs.current[format]?.click();
  }

  function handleFileChange(format: ImportFormat, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImport(format, file);
      onClose();
    }
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const fmt = detectFormatFromFilename(file.name);
    if (!fmt) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        message.warning("For .zip please click a specific row (Markdown zip or Notion zip)");
      } else {
        message.error(`Unsupported file type: ${file.name}`);
      }
      return;
    }
    onImport(fmt, file);
    onClose();
  }

  function validateText(format: ImportTextFormat, text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return "Content is empty";
    if (format === "html") {
      if (!/<[a-zA-Z!/]/.test(trimmed)) return "Content does not look like HTML (no tags found)";
    } else if (format === "snapshot") {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) return "Snapshot must be a JSON object";
        if (typeof parsed.content !== "string" && parsed.content !== null) {
          return "Snapshot is missing a valid 'content' field";
        }
      } catch (e) {
        return `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return null;
  }

  function handlePasteSubmit() {
    const err = validateText(pasteFormat, pasteText);
    if (err) {
      message.error(err);
      return;
    }
    onImportText(pasteFormat, pasteText);
    setPasteText("");
    onClose();
  }

  const fileTab = (
    <>
      <div
        className={`import-modal-dropzone${dragOver ? " is-drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <InboxOutlined className="import-modal-dropzone-icon" />
        <div className="import-modal-dropzone-text">
          Drag &amp; drop a file here (.md, .html, .json) — or pick a format below
        </div>
      </div>

      <div className="import-modal-list">
        {IMPORT_OPTIONS.map(({ format, label, accept, icon, showHelp }) => (
          <div
            key={format}
            className="import-modal-row"
            onClick={() => handleRowClick(format)}
          >
            <input
              ref={(el) => { fileInputRefs.current[format] = el; }}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => handleFileChange(format, e)}
            />
            <span className="import-modal-row-icon">{icon}</span>
            <span className="import-modal-row-label">{label}</span>
            {showHelp && (
              <span className="import-modal-row-help" onClick={(e) => e.stopPropagation()}>
                <QuestionCircleOutlined />
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );

  const pasteTab = (
    <div className="import-modal-paste">
      <div className="import-modal-paste-controls">
        <span className="import-modal-paste-label">Format:</span>
        <Select<ImportTextFormat>
          value={pasteFormat}
          onChange={setPasteFormat}
          style={{ width: 200 }}
          options={[
            { value: "markdown", label: "Markdown" },
            { value: "html", label: "HTML" },
            { value: "snapshot", label: "Snapshot (JSON)" },
          ]}
        />
      </div>
      <Input.TextArea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder={
          pasteFormat === "markdown"
            ? "# Heading\n\nParagraph text…"
            : pasteFormat === "html"
              ? "<h1>Heading</h1><p>Paragraph…</p>"
              : '{ "title": "…", "content": "[]", "metadata": null }'
        }
        autoSize={{ minRows: 12, maxRows: 20 }}
      />
      <div className="import-modal-paste-actions">
        <Button type="primary" onClick={handlePasteSubmit} disabled={!pasteText.trim()}>
          Import
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      title="Import"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      classNames={{ body: "import-modal-body" }}
    >
      <Tabs
        defaultActiveKey="file"
        className="import-modal-tabs"
        items={[
          { key: "file", label: "From file", children: fileTab },
          { key: "paste", label: "Paste content", children: pasteTab },
        ]}
      />
    </Modal>
  );
}
