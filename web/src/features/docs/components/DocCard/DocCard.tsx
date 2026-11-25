import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import type { DocDto } from "@/core/interfaces/docs";
import { PopupWindowIcon } from "@/components/icons";
import "./DocCard.scss";

interface DocCardProps {
  doc: DocDto;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}

export default function DocCard({
  doc,
  onDelete,
  isDeleting,
  selected,
  onToggleSelect,
}: DocCardProps) {
  const navigate = useNavigate();

  const formattedDate = doc.lastSync
    ? new Date(doc.lastSync).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No changes yet";

  return (
    <div
      className={`doc-card${selected ? " is-selected" : ""}`}
      onClick={() => navigate(`/docs/${doc.id}`)}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          className="doc-card-checkbox"
          checked={Boolean(selected)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(doc.id)}
          aria-label="Select document"
        />
      )}
      <div className="doc-card-icon">
        <FileText size={16} />
      </div>
      <div className="doc-card-body">
        <h3 className="doc-card-title">
          <span className="doc-card-title-text">{doc.title || "Untitled"}</span>
          {doc.seriesName && (
            <span className="doc-card-badge doc-card-badge--series">
              {doc.seriesName}
            </span>
          )}
        </h3>
        <div className="doc-card-meta">
          <span className="doc-card-date">{formattedDate}</span>
        </div>
      </div>
      <div className="doc-card-actions">
        <button
          className="doc-card-action"
          onClick={(e) => {
            e.stopPropagation();
            window.open(`/docs/${doc.id}`, "_blank", "noopener,noreferrer");
          }}
          aria-label="Mở trong tab mới"
          title="Mở trong tab mới"
        >
          <PopupWindowIcon />
        </button>
        <button
          className="doc-card-delete"
          onClick={(e) => {
            e.stopPropagation();
            Modal.confirm({
              title: "Xoá tài liệu?",
              content: `"${doc.title || "Untitled"}" sẽ bị xoá vĩnh viễn.`,
              okText: "Xoá",
              okType: "danger",
              cancelText: "Huỷ",
              onOk: () => onDelete(doc.id),
            });
          }}
          disabled={isDeleting}
          aria-label="Delete document"
        >
          ×
        </button>
      </div>
    </div>
  );
}
