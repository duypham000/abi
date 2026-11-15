
interface ScriptEditorProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  readOnly?: boolean;
}

export function ScriptEditor({
  value,
  onChange,
  label,
  hint,
  placeholder = "// Write your script here",
  readOnly = false,
}: ScriptEditorProps) {
  return (
    <div className="script-editor">
      {label && <div className="script-editor-label">{label}</div>}
      <textarea
        className="script-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
      />
      {hint && <div className="script-editor-hint">{hint}</div>}
    </div>
  );
}
