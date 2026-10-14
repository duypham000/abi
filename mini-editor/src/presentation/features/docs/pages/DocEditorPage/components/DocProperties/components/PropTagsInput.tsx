import { useState, useRef, useEffect } from "react";
import "./PropTagsInput.scss";

const TAG_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#9ca3af",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#ec4899",
];

function pickColor(existing: Record<string, string>): string {
  const used = new Set(Object.values(existing));
  const free = TAG_PALETTE.find((c) => !used.has(c));
  if (free) return free;
  return TAG_PALETTE[Object.keys(existing).length % TAG_PALETTE.length];
}

interface PropTagsInputProps {
  tags: string[];
  tagColors: Record<string, string>;
  onChange: (tags: string[], tagColors: Record<string, string>) => void;
}

export function PropTagsInput({ tags, tagColors, onChange }: PropTagsInputProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setInputValue("");
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    const color = tagColors[trimmed] ?? pickColor(tagColors);
    onChange([...tags, trimmed], { ...tagColors, [trimmed]: color });
    setInputValue("");
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t !== name), tagColors);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && inputValue.trim()) {
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setInputValue("");
    }
  }

  function handleConfirm() {
    if (inputValue.trim()) addTag(inputValue);
    setOpen(false);
    setInputValue("");
  }

  const filteredExisting = tags.filter((t) =>
    inputValue ? t.toLowerCase().includes(inputValue.toLowerCase()) : true
  );
  const canCreate = inputValue.trim() && !tags.includes(inputValue.trim());

  return (
    <div ref={containerRef} className="prop-tags-input">
      {/* Closed display */}
      {!open && (
        <div
          className={`prop-tags-input__chips${tags.length === 0 ? " prop-tags-input__chips--empty" : ""}`}
          onClick={() => setOpen(true)}
        >
          {tags.length === 0 ? (
            <span className="prop-tags-input__empty">Empty</span>
          ) : (
            <>
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="prop-tags-input__chip"
                  style={{ "--tag-color": tagColors[tag] ?? "#9ca3af" } as React.CSSProperties}
                >
                  <span className="prop-tags-input__chip-dot" />
                  <span className="prop-tags-input__chip-text">{tag}</span>
                </span>
              ))}
              {tags.length > 2 && (
                <span className="prop-tags-input__more">+{tags.length - 2}</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Open: inline editor + dropdown */}
      {open && (
        <div className="prop-tags-input__dropdown">
          {/* Input row */}
          <div className="prop-tags-input__editor">
            <div className="prop-tags-input__editor-chips">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="prop-tags-input__chip prop-tags-input__chip--editable"
                  style={{ "--tag-color": tagColors[tag] ?? "#9ca3af" } as React.CSSProperties}
                >
                  <span className="prop-tags-input__chip-dot" />
                  {tag}
                  <button
                    className="prop-tags-input__chip-remove"
                    onMouseDown={(e) => { e.preventDefault(); removeTag(tag); }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                className="prop-tags-input__input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tags.length === 0 ? "Type here ..." : ""}
              />
            </div>
            <button className="prop-tags-input__confirm" onMouseDown={(e) => { e.preventDefault(); handleConfirm(); }}>
              ✓
            </button>
          </div>

          {/* List */}
          <div className="prop-tags-input__list">
            <div className="prop-tags-input__list-label">Select tag or create one</div>

            {canCreate && (
              <div
                className="prop-tags-input__list-item prop-tags-input__list-item--create"
                onMouseDown={(e) => { e.preventDefault(); addTag(inputValue); }}
              >
                <span className="prop-tags-input__list-create-label">Create</span>
                <span
                  className="prop-tags-input__chip prop-tags-input__chip--small"
                  style={{ "--tag-color": pickColor(tagColors) } as React.CSSProperties}
                >
                  <span className="prop-tags-input__chip-dot" />
                  {inputValue.trim()}
                </span>
              </div>
            )}

            {filteredExisting.length > 0 && (
              filteredExisting.map((tag) => (
                <div
                  key={tag}
                  className="prop-tags-input__list-item"
                  onMouseDown={(e) => { e.preventDefault(); /* already added */ }}
                >
                  <span
                    className="prop-tags-input__chip prop-tags-input__chip--small"
                    style={{ "--tag-color": tagColors[tag] ?? "#9ca3af" } as React.CSSProperties}
                  >
                    <span className="prop-tags-input__chip-dot" />
                    {tag}
                  </span>
                </div>
              ))
            )}

            {filteredExisting.length === 0 && !canCreate && (
              <div className="prop-tags-input__list-empty">No tags found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
