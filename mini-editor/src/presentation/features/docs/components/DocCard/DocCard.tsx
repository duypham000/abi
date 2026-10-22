import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import type { DocDto } from "@/core/interfaces/docs";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import { PopupWindowIcon } from "@/presentation/components/icons";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import { useGitTrackedEntities } from "@/presentation/hooks/useGitTrackedEntities";
import { EntityGitBadge } from "@/presentation/components/EntityGitBadge";
import "./DocCard.scss";

interface DocCardProps {
  doc: DocDto;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export default function DocCard({ doc, onDelete, isDeleting }: DocCardProps) {
  const navigate = useNavigate();
  const { openDocPopup } = useDocPopup();
  const { layout, openPanel } = useGoldenLayout();
  const { isDocOnGit, getDocGitStatus } = useGitTrackedEntities();

  const formattedDate = doc.lastSync
    ? new Date(doc.lastSync).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No changes yet";

  return (
    <div className="doc-card" onClick={() => layout
      ? openPanel(PANEL_TYPES.DOC_EDITOR, { id: doc.id }, { title: doc.title || "Document" })
      : navigate(`/docs/${doc.id}`)
    }>
      <div className="doc-card-body">
        <h3 className="doc-card-title">
          <span className="doc-card-title-text">{doc.title || "Untitled"}</span>
          <EntityGitBadge isOnGit={isDocOnGit(doc.id)} gitStatus={getDocGitStatus(doc.id)} size={12} />
          {doc.seriesName && (
            <span className="doc-card-badge doc-card-badge--series">
              {doc.seriesName}
            </span>
          )}
        </h3>
        <span className="doc-card-date">{formattedDate}</span>
      </div>
      <div className="doc-card-actions">
        <button
          className="doc-card-action"
          onClick={(e) => {
            e.stopPropagation();
            openDocPopup(doc.id, doc.title ?? undefined);
          }}
          aria-label="Open in popup window"
          title="Open in popup window"
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
