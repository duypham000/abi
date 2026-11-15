import React from "react";

interface MethodBadgeProps {
  method: string;
  size?: "xs" | "sm" | "md";
}

const METHOD_STYLES: Record<string, { bg: string; text: string }> = {
  GET:     { bg: "#f0fdf4", text: "#16a34a" },
  POST:    { bg: "#eff6ff", text: "#2563eb" },
  PUT:     { bg: "#fff7ed", text: "#ea580c" },
  PATCH:   { bg: "#faf5ff", text: "#9333ea" },
  DELETE:  { bg: "#fef2f2", text: "#dc2626" },
  HEAD:    { bg: "#f8fafc", text: "#64748b" },
  OPTIONS: { bg: "#f8fafc", text: "#64748b" },
  CONNECT: { bg: "#f8fafc", text: "#64748b" },
  TRACE:   { bg: "#f8fafc", text: "#64748b" },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  xs: { fontSize: 9, padding: "1px 4px", borderRadius: 3 },
  sm: { fontSize: 10, padding: "1px 5px", borderRadius: 3 },
  md: { fontSize: 11, padding: "2px 6px", borderRadius: 4 },
};

export function MethodBadge({ method, size = "sm" }: MethodBadgeProps) {
  const style = METHOD_STYLES[method] ?? { bg: "#f8fafc", text: "#64748b" };
  const sizeStyle = SIZE_STYLES[size];

  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: style.bg,
        color: style.text,
        fontWeight: 700,
        fontFamily: "monospace",
        letterSpacing: "0.02em",
        lineHeight: 1,
        flexShrink: 0,
        ...sizeStyle,
      }}
    >
      {method}
    </span>
  );
}
