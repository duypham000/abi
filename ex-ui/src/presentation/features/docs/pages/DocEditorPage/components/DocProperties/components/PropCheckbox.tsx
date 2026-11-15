import "./PropCheckbox.scss";

interface PropCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function PropCheckbox({ checked, onChange }: PropCheckboxProps) {
  return (
    <input
      type="checkbox"
      className="prop-checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
