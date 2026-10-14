import { useRef, useEffect, type KeyboardEvent } from "react";
import { Input, Tooltip } from "antd";
import {
  CloseOutlined,
  UpOutlined,
  DownOutlined,
  RightOutlined,
  DownCircleOutlined,
} from "@ant-design/icons";
import "./FindReplaceBar.scss";

interface FindReplaceBarProps {
  mode: "find" | "replace";
  onModeChange: (mode: "find" | "replace") => void;
  searchText: string;
  replaceText: string;
  isCaseSensitive: boolean;
  isRegex: boolean;
  regexError: string | null;
  matchCount: number;
  currentIndex: number;
  onSearchChange: (v: string) => void;
  onReplaceChange: (v: string) => void;
  onCaseSensitiveToggle: () => void;
  onRegexToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export function FindReplaceBar({
  mode,
  onModeChange,
  searchText,
  replaceText,
  isCaseSensitive,
  isRegex,
  regexError,
  matchCount,
  currentIndex,
  onSearchChange,
  onReplaceChange,
  onCaseSensitiveToggle,
  onRegexToggle,
  onPrev,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: FindReplaceBarProps) {
  const searchInputRef = useRef<any>(null);

  useEffect(() => {
    // Delay slightly so the DOM is ready after conditional render
    const id = setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);

  const hasMatches = matchCount > 0;
  const noResults = searchText.length > 0 && matchCount === 0 && !regexError;

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  function handleReplaceKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onReplaceCurrent();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  const countLabel =
    !searchText ? "" :
    regexError ? "Invalid regex" :
    matchCount === 0 ? "No results" :
    `${currentIndex + 1} of ${matchCount}`;

  return (
    <div className="find-replace-bar">
      {/* Mode toggle chevron */}
      <button
        className="find-replace-bar__mode-btn"
        onClick={() => onModeChange(mode === "find" ? "replace" : "find")}
        title={mode === "find" ? "Expand to replace" : "Collapse to find only"}
      >
        {mode === "replace" ? <DownCircleOutlined /> : <RightOutlined />}
      </button>

      {/* Find row */}
      <div className="find-replace-bar__rows">
        <div className="find-replace-bar__row">
          <Input
            ref={searchInputRef}
            className={`find-replace-bar__input${noResults ? " find-replace-bar__input--no-results" : ""}${regexError ? " find-replace-bar__input--error" : ""}`}
            value={searchText}
            placeholder="Find"
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            variant="borderless"
            size="small"
          />

          <Tooltip title="Match case (Alt+C)">
            <button
              className={`find-replace-bar__btn${isCaseSensitive ? " find-replace-bar__btn--active" : ""}`}
              onClick={onCaseSensitiveToggle}
            >
              Aa
            </button>
          </Tooltip>

          <Tooltip title={regexError ?? "Use regular expression (Alt+R)"}>
            <button
              className={`find-replace-bar__btn${isRegex ? " find-replace-bar__btn--active" : ""}${regexError ? " find-replace-bar__btn--error" : ""}`}
              onClick={onRegexToggle}
            >
              .*
            </button>
          </Tooltip>

          <span className={`find-replace-bar__count${(noResults || regexError) ? " find-replace-bar__count--no-match" : ""}`}>
            {countLabel}
          </span>

          <Tooltip title="Previous match (Shift+Enter)">
            <button
              className="find-replace-bar__btn"
              onClick={onPrev}
              disabled={!hasMatches}
            >
              <UpOutlined />
            </button>
          </Tooltip>

          <Tooltip title="Next match (Enter)">
            <button
              className="find-replace-bar__btn"
              onClick={onNext}
              disabled={!hasMatches}
            >
              <DownOutlined />
            </button>
          </Tooltip>

          <Tooltip title="Close (Escape)">
            <button className="find-replace-bar__btn" onClick={onClose}>
              <CloseOutlined />
            </button>
          </Tooltip>
        </div>

        {/* Replace row */}
        {mode === "replace" && (
          <div className="find-replace-bar__row">
            <Input
              className="find-replace-bar__input"
              value={replaceText}
              placeholder="Replace"
              onChange={(e) => onReplaceChange(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              variant="borderless"
              size="small"
            />
            <button
              className="find-replace-bar__btn find-replace-bar__btn--text"
              onClick={onReplaceCurrent}
              disabled={!hasMatches}
            >
              Replace
            </button>
            <button
              className="find-replace-bar__btn find-replace-bar__btn--text"
              onClick={onReplaceAll}
              disabled={!hasMatches}
            >
              All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
