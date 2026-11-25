import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseCanvasMetadata, type CanvasDto } from "@/core/interfaces/canvas";
import type { DeleteScope } from "@/infrastructure/api/docsApi";
import { confirmDeleteWithScope } from "@/presentation/components/ui/ConfirmDeleteModal/confirmDeleteModal";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import {
  generateLowResCanvasThumbnail,
  getCachedCanvasThumbnail,
  setCachedCanvasThumbnail,
} from "../../utils/canvasThumbnail";
import "./CanvasCard.scss";

interface CanvasCardProps {
  canvas: CanvasDto;
  onDelete: (id: number, scope?: DeleteScope) => void;
  isDeleting?: boolean;
}

export default function CanvasCard({ canvas, onDelete, isDeleting }: CanvasCardProps) {
  const navigate = useNavigate();
  const { layout, openPanel } = useGoldenLayout();
  const cardRef = useRef<HTMLDivElement>(null);

  const savedThumbnail =
    parseCanvasMetadata(canvas.metadata).thumbnail ||
    canvas.preview ||
    getCachedCanvasThumbnail(canvas.id);

  const [isVisible, setIsVisible] = useState(false);
  const [generatedThumb, setGeneratedThumb] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const thumbnailUrl = savedThumbnail || generatedThumb;

  useEffect(() => {
    const el = cardRef.current;
    if (!el || isVisible) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || savedThumbnail || !canvas.scene) return;
    let cancelled = false;
    void generateLowResCanvasThumbnail(canvas.scene).then((thumb) => {
      if (!cancelled && thumb) {
        setCachedCanvasThumbnail(canvas.id, thumb);
        setGeneratedThumb(thumb);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isVisible, savedThumbnail, canvas.id, canvas.scene]);

  const formattedDate = canvas.lastSync
    ? new Date(canvas.lastSync).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No changes yet";

  return (
    <div
      ref={cardRef}
      className="canvas-card"
      onClick={() =>
        layout
          ? openPanel(PANEL_TYPES.CANVAS_EDITOR, { id: canvas.id }, { title: canvas.title || "Canvas" })
          : navigate(`/canvas/${canvas.id}`)
      }
    >
      <div className="canvas-card-preview">
        {isVisible && thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={canvas.title || "Untitled Canvas"}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            className={`canvas-card-image${imgLoaded ? " is-loaded" : ""}`}
          />
        ) : (
          <div className="canvas-card-placeholder" aria-hidden="true">
            <svg viewBox="0 0 160 100" className="canvas-card-placeholder-svg">
              <rect x="24" y="22" width="46" height="30" rx="4" />
              <circle cx="110" cy="60" r="18" />
              <path d="M40 72 Q75 40 108 58" />
            </svg>
          </div>
        )}

        <button
          className="canvas-card-delete"
          onClick={(e) => {
            e.stopPropagation();
            confirmDeleteWithScope({
              entityLabel: "canvas",
              title: canvas.title || "Untitled Canvas",
              onConfirm: (scope) => onDelete(canvas.id, scope),
            });
          }}
          disabled={isDeleting}
          aria-label="Delete canvas"
          title="Xoá canvas"
        >
          ×
        </button>
      </div>

      <div className="canvas-card-footer">
        <h3 className="canvas-card-title">{canvas.title || "Untitled Canvas"}</h3>
        <span className="canvas-card-date">{formattedDate}</span>
      </div>
    </div>
  );
}
