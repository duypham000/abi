import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import type { CanvasDto } from "@/core/interfaces/canvas";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import "./CanvasCard.scss";

interface CanvasCardProps {
  canvas: CanvasDto;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export default function CanvasCard({ canvas, onDelete, isDeleting }: CanvasCardProps) {
  const navigate = useNavigate();
  const { layout, openPanel } = useGoldenLayout();

  const formattedDate = canvas.lastSync
    ? new Date(canvas.lastSync).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No changes yet";

  return (
    <div className="canvas-card" onClick={() => layout
      ? openPanel(PANEL_TYPES.CANVAS_EDITOR, { id: canvas.id }, { title: canvas.title || "Canvas" })
      : navigate(`/canvas/${canvas.id}`)
    }>
      <div className="canvas-card-body">
        <h3 className="canvas-card-title">{canvas.title || "Untitled"}</h3>
        <span className="canvas-card-date">{formattedDate}</span>
      </div>
      <button
        className="canvas-card-delete"
        onClick={(e) => {
          e.stopPropagation();
          Modal.confirm({
            title: "Xoá canvas?",
            content: `"${canvas.title || "Untitled"}" sẽ bị xoá vĩnh viễn.`,
            okText: "Xoá",
            okType: "danger",
            cancelText: "Huỷ",
            onOk: () => onDelete(canvas.id),
          });
        }}
        disabled={isDeleting}
        aria-label="Delete canvas"
      >
        ×
      </button>
    </div>
  );
}
