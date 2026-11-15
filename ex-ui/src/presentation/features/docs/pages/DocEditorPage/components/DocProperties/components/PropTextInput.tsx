import { useState, useRef } from "react";
import "./PropTextInput.scss";

interface PropTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function PropTextInput({ value, onChange, placeholder = "Empty" }: PropTextInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    onChange(draft);
    setEditing(false);
  }

  function discard() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        className="prop-text-input__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") discard();
        }}
      />
    );
  }

  return (
    <span
      className={`prop-text-input__display${!value ? " prop-text-input__display--empty" : ""}`}
      onClick={startEdit}
    >
      {value || placeholder}
    </span>
  );
}
