import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import type { DocDto } from "@/core/interfaces/docs";
import type { DraftSummary } from "@/infrastructure/tauri/docCacheService";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import { PopupWindowIcon } from "@/presentation/components/icons";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import "./DocCard.scss";

type DocCardProps =
  | {
      kind?: "doc";
      doc: DocDto;
      onDelete: (id: number) => void;
      isDeleting?: boolean;
    }
  | {
      kind: "draft";
      draft: DraftSummary;
      onDelete: (localId: string) => void;
      isDeleting?: boolean;
    };

export default function DocCard(props: DocCardProps) {
  const navigate = useNavigate();
  const { openDocPopup, openDraftPopup } = useDocPopup();
  const { layout, openPanel } = useGoldenLayout();

  if (props.kind === "draft") {
    const { draft, onDelete, isDeleting } = props;
    const title = draft.title || "Untitled";
    const formattedDate = new Date(draft.updated_at).toLocaleDateString(
      undefined,
      { year: "numeric", month: "short", day: "numeric" }
    );

    return (
      <div
        className="doc-card"
        onClick={() => layout
          ? openPanel(PANEL_TYPES.DOC_DRAFT, { localId: draft.id }, { title: draft.title || "Draft" })
          : navigate(`/docs/draft/${draft.id}`)
        }
      >
        <div className="doc-card-body">
          <h3 className="doc-card-title">
            {title}
            <span className="doc-card-badge">Draft</span>
          </h3>
          <span className="doc-card-date">{formattedDate}</span>
        </div>
        <div className="doc-card-actions">
          <button
            className="doc-card-action"
            onClick={(e) => {
              e.stopPropagation();
              openDraftPopup(draft.id, title);
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
                title: "Xoá draft?",
                content: `"${title}" sẽ bị xoá vĩnh viễn.`,
                okText: "Xoá",
                okType: "danger",
                cancelText: "Huỷ",
                onOk: () => onDelete(draft.id),
              });
            }}
            disabled={isDeleting}
            aria-label="Delete draft"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const { doc, onDelete, isDeleting } = props;

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
          {doc.title || "Untitled"}
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
