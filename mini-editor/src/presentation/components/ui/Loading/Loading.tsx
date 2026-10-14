import "./Loading.scss";

export interface LoadingProps {
  /** Optional text shown beneath the spinner. */
  label?: string;
  /** Spinner size. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /**
   * "inline"  — fills its parent (default, e.g. an editor area).
   * "fullscreen" — fixed overlay covering the viewport with a blurred backdrop.
   */
  variant?: "inline" | "fullscreen";
  className?: string;
}

export function Loading({
  label,
  size = "md",
  variant = "inline",
  className = "",
}: LoadingProps) {
  return (
    <div
      className={`tomo-loading tomo-loading--${variant} tomo-loading--${size} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="tomo-loading__spinner" aria-hidden="true">
        <span className="tomo-loading__ring" />
        <span className="tomo-loading__core" />
      </div>
      {label && <p className="tomo-loading__label">{label}</p>}
      <span className="tomo-loading__sr">{label ?? "Loading"}</span>
    </div>
  );
}
