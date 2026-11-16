import "./PropToggle.scss";

interface ToggleOption {
  value: string;
  label: string;
}

interface PropToggleProps {
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export function PropToggle({ options, value, onChange }: PropToggleProps) {
  return (
    <div className="prop-toggle">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`prop-toggle__btn${value === opt.value ? " prop-toggle__btn--active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
