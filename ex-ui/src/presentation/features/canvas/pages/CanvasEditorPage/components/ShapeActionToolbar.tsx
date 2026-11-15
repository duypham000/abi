import type React from "react";
import {
  ArrowsAltOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  ExportOutlined,
  ShrinkOutlined,
} from "@ant-design/icons";
import "./ShapeActionToolbar.scss";

export interface ToolbarSnapshot {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isCollapsed: boolean;
  link: string | null;
  scrollX: number;
  scrollY: number;
  zoom: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface ShapeActionToolbarProps {
  snapshot: ToolbarSnapshot;
  fullPagePath?: string | null;
  onOpenFullPage?: () => void;
  onToggleCollapse: () => void;
  onUnlink?: () => void;
  onDelete: () => void;
}

const TOOLBAR_GAP = 8;

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export function ShapeActionToolbar({
  snapshot,
  fullPagePath,
  onOpenFullPage,
  onToggleCollapse,
  onUnlink,
  onDelete,
}: ShapeActionToolbarProps) {
  const { x, y, width, zoom, scrollX, scrollY, offsetLeft, offsetTop, isCollapsed } = snapshot;
  const screenLeft = offsetLeft + scrollX + x * zoom;
  const screenTop = offsetTop + scrollY + y * zoom;
  const shapeWidthScreen = width * zoom;

  const style: React.CSSProperties = {
    left: screenLeft + shapeWidthScreen / 2,
    top: screenTop - TOOLBAR_GAP,
    transform: "translate(-50%, -100%)",
  };

  return (
    <div
      className="shape-action-toolbar"
      style={style}
      onPointerDown={stop}
      onPointerUp={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onWheel={stop}
    >
      {fullPagePath && onOpenFullPage && (
        <button
          type="button"
          className="shape-action-toolbar__btn"
          onClick={onOpenFullPage}
          title="Open full page"
          aria-label="Open full page"
        >
          <ExportOutlined />
        </button>
      )}
      <button
        type="button"
        className="shape-action-toolbar__btn"
        onClick={onToggleCollapse}
        title={isCollapsed ? "Expand" : "Collapse"}
        aria-label={isCollapsed ? "Expand" : "Collapse"}
      >
        {isCollapsed ? <ArrowsAltOutlined /> : <ShrinkOutlined />}
      </button>
      {onUnlink && (
        <button
          type="button"
          className="shape-action-toolbar__btn"
          onClick={onUnlink}
          title="Remove this embed (keeps the doc)"
          aria-label="Unlink embed"
        >
          <DisconnectOutlined />
        </button>
      )}
      <button
        type="button"
        className="shape-action-toolbar__btn shape-action-toolbar__btn--danger"
        onClick={onDelete}
        title="Delete shape"
        aria-label="Delete shape"
      >
        <DeleteOutlined />
      </button>
    </div>
  );
}
