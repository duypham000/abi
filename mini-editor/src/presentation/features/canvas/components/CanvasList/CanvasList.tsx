import type { CanvasDto } from "@/core/interfaces/canvas";
import type { DeleteScope } from "@/infrastructure/api/docsApi";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import CanvasCard from "../CanvasCard";
import "./CanvasList.scss";

interface CanvasListProps {
  canvases: CanvasDto[];
  onDelete: (id: number, scope?: DeleteScope) => void;
  isDeleting?: boolean;
  isLoading?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onRestore?: (id: number) => void;
  restoringId?: number | null;
}

export default function CanvasList({
  canvases,
  onDelete,
  isDeleting,
  isLoading,
  selectedIds,
  onToggleSelect,
  onRestore,
  restoringId,
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
          selected={selectedIds?.has(canvas.id)}
          onToggleSelect={onToggleSelect}
          onRestore={onRestore}
          isRestoring={restoringId === canvas.id}
        />
      ))}
    </div>
  );
}
