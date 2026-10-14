import type { ReactNode } from "react";
import "./PropRow.scss";

interface PropRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
  removable?: boolean;
  onRemove?: () => void;
}

export function PropRow({ icon, label, children, className = "", removable, onRemove }: PropRowProps) {
  return (
    <div className={`prop-row ${className}`.trim()}>
      <div className="prop-row__header">
        <span className="prop-row__icon">{icon}</span>
        <span className="prop-row__label">{label}</span>
      </div>
      <div className="prop-row__value-group">
        <div className="prop-row__value">{children}</div>
        {removable && (
          <button className="prop-row__remove" onClick={onRemove} title="Remove">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
