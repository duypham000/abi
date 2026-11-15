import type React from "react";
import "./EmbeddedFrameChrome.scss";

interface EmbeddedFrameChromeProps {
  children: React.ReactNode;
  isCollapsed?: boolean;
  title?: string;
  strokeColor?: string;
  backgroundColor?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: unknown | null;
}

function stop<T extends { stopPropagation: () => void }>(e: T) {
  e.stopPropagation();
}

export function EmbeddedFrameChrome({
  children,
  isCollapsed,
  title,
  strokeColor,
  backgroundColor,
  opacity,
  strokeWidth,
  strokeStyle,
  roundness,
}: EmbeddedFrameChromeProps) {
  const collapsed = !!isCollapsed;

  const style: React.CSSProperties & Record<string, string | number> = {};
  if (strokeColor) style.borderColor = strokeColor;
  if (backgroundColor) {
    style.background = backgroundColor;
    style["--tomo-shape-bg"] = backgroundColor;
  }
  if (typeof opacity === "number") style.opacity = Math.max(0, Math.min(100, opacity)) / 100;
  if (typeof strokeWidth === "number" && strokeWidth >= 0) style.borderWidth = `${strokeWidth}px`;
  if (strokeStyle) style.borderStyle = strokeStyle;
  if (roundness === null) style.borderRadius = 0;

  return (
    <div
      className={`embedded-frame-chrome${collapsed ? " is-collapsed" : ""}`}
      style={style}
      onKeyDown={stop}
      onKeyUp={stop}
      onKeyPress={stop}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onWheel={stop}
    >
      {collapsed ? (
        <div className="embedded-frame-collapsed-chip" title={title}>
          {title || "Untitled"}
        </div>
      ) : (
        <div className="embedded-frame-content">{children}</div>
      )}
    </div>
  );
}
