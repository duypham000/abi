import type { CanvasDto } from "@/core/interfaces/canvas";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import CanvasCard from "../CanvasCard";
import "./CanvasList.scss";

interface CanvasListProps {
  canvases: CanvasDto[];
  onDelete: (id: number) => void;
  isDeleting?: boolean;
  isLoading?: boolean;
}

export default function CanvasList({
  canvases,
  onDelete,
  isDeleting,
  isLoading,
}: CanvasListProps) {
  if (isLoading) {
    return (
      <div className="canvas-list-empty">
        <Loading label="Đang tải…" />
      </div>
    );
  }

  if (canvases.length === 0) {
    return (
      <div className="canvas-list-empty">
        <p>No canvases yet. Create your first canvas!</p>
      </div>
    );
  }

  return (
    <div className="canvas-list">
      {canvases.map((canvas) => (
        <CanvasCard
          key={canvas.id}
          canvas={canvas}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  );
}
