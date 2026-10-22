import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Segmented, Button, Tooltip, Tag, Select } from "antd";
import {
  ChevronUp,
  ChevronDown,
  Columns,
  AlignJustify,
  FileText,
  Plus,
  Minus,
  Edit3,
  CheckCircle2,
  Navigation,
  ArrowUp,
  ArrowDown,
  FileCode,
  Filter,
  ExternalLink,
} from "lucide-react";
import type { GitFileDiff } from "@/core/interfaces/github";
import {
  diffLinesLCS,
  parseUnifiedPatch,
  parseSemanticDocDiff,
  formatJsonText,
  isJsonString,
  type ParsedDiffLine,
} from "../utils/diffEngine";
import "./GitVisualDiffViewer.scss";

interface GitVisualDiffViewerProps {
  diff: GitFileDiff | null;
  oldContent?: string;
  newContent?: string;
  filePath?: string;
}

export function GitVisualDiffViewer({
  diff,
  oldContent,
  newContent,
  filePath,
}: GitVisualDiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"unified" | "split" | "visual">("unified");
  const [activeChangeIdx, setActiveChangeIdx] = useState<number>(1);
  const [onlyChanges, setOnlyChanges] = useState<boolean>(false);

  const rawOld = oldContent ?? diff?.oldContent ?? diff?.old_content ?? "";
  const rawNew = newContent ?? diff?.newContent ?? diff?.new_content ?? "";
  const patchText = diff?.patch ?? "";

  // Auto-detect JSON and provide pretty-format toggle
  const isOldJson = useMemo(() => isJsonString(rawOld), [rawOld]);
  const isNewJson = useMemo(() => isJsonString(rawNew), [rawNew]);
  const isJsonContent = isOldJson || isNewJson;

  const [prettyJson, setPrettyJson] = useState<boolean>(isJsonContent);

  // Computed content for diffing
  const { processedOld, processedNew } = useMemo(() => {
    if (!prettyJson) {
      return { processedOld: rawOld, processedNew: rawNew };
    }
    const oldFmt = isOldJson ? formatJsonText(rawOld).formatted : rawOld;
    const newFmt = isNewJson ? formatJsonText(rawNew).formatted : rawNew;
    return { processedOld: oldFmt, processedNew: newFmt };
  }, [rawOld, rawNew, prettyJson, isOldJson, isNewJson]);

  // Compute diff lines and change groups using LCS differ, or fallback to patch parser
  const { lines, changeGroups, totalIns, totalDels } = useMemo(() => {
    if (processedOld || processedNew) {
      const res = diffLinesLCS(processedOld, processedNew);
      return {
        lines: res.lines,
        changeGroups: res.changeGroups,
        totalIns: res.insertions,
        totalDels: res.deletions,
      };
    }
    if (patchText) {
      const res = parseUnifiedPatch(patchText);
      return {
        lines: res.lines,
        changeGroups: res.changeGroups,
        totalIns: diff?.insertions ?? 0,
        totalDels: diff?.deletions ?? 0,
      };
    }
    return { lines: [], changeGroups: [], totalIns: 0, totalDels: 0 };
  }, [processedOld, processedNew, patchText, diff]);

  // Parse semantic document summary (for blocknote / doc files)
  const semanticDoc = useMemo(() => parseSemanticDocDiff(rawOld, rawNew), [rawOld, rawNew]);

  const totalChanges = changeGroups.length;

  // Filter lines if "only changes" (context folding) is enabled
  const displayedLines = useMemo(() => {
    if (!onlyChanges || totalChanges === 0) return lines;
    // Keep 3 context lines around every change
    const keepIndices = new Set<number>();
    lines.forEach((line, idx) => {
      if (line.type === "add" || line.type === "del") {
        for (let k = Math.max(0, idx - 3); k <= Math.min(lines.length - 1, idx + 3); k++) {
          keepIndices.add(k);
        }
      }
    });
    return lines.filter((_, idx) => keepIndices.has(idx));
  }, [lines, onlyChanges, totalChanges]);

  // Precise scrolling to active change
  const scrollToChange = useCallback(
    (targetIdx: number) => {
      if (targetIdx < 1 || targetIdx > totalChanges) return;
      setActiveChangeIdx(targetIdx);

      const targetGroup = changeGroups.find((g) => g.index === targetIdx);
      if (!targetGroup) return;

      const targetEl = document.getElementById(targetGroup.firstLineId);
      const container = containerRef.current;
      if (targetEl && container) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const targetTop =
          targetRect.top - containerRect.top + container.scrollTop - (container.clientHeight / 2 - targetRect.height / 2);
        container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      }
    },
    [changeGroups, totalChanges]
  );

  const handleNextChange = () => {
    if (activeChangeIdx < totalChanges) {
      scrollToChange(activeChangeIdx + 1);
    } else {
      scrollToChange(1); // wrap around
    }
  };

  const handlePrevChange = () => {
    if (activeChangeIdx > 1) {
      scrollToChange(activeChangeIdx - 1);
    } else {
      scrollToChange(totalChanges); // wrap around
    }
  };

  const handleScrollTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleScrollBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Keyboard navigation: N for Next, P for Prev, Alt+Up/Down
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (
        e.key === "n" ||
        e.key === "N" ||
        (e.key === "ArrowDown" && (e.altKey || e.ctrlKey))
      ) {
        e.preventDefault();
        handleNextChange();
      } else if (
        e.key === "p" ||
        e.key === "P" ||
        (e.key === "ArrowUp" && (e.altKey || e.ctrlKey))
      ) {
        e.preventDefault();
        handlePrevChange();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeChangeIdx, totalChanges, changeGroups]);

  // Jump from semantic block to code diff line
  const jumpToSemanticBlock = (searchToken?: string) => {
    setViewMode("unified");
    if (!searchToken) return;
    setTimeout(() => {
      const matchIndex = lines.findIndex(
        (l) => l.text.includes(searchToken) && (l.type === "add" || l.type === "del")
      );
      if (matchIndex !== -1) {
        const line = lines[matchIndex];
        if (line.changeGroupIndex) {
          scrollToChange(line.changeGroupIndex);
        } else {
          const el = document.getElementById(line.lineId);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, 120);
  };

  // Pair lines for Side-by-Side (Split) View
  const splitRows = useMemo(() => {
    if (viewMode !== "split") return [];
    const rows: {
      left?: ParsedDiffLine;
      right?: ParsedDiffLine;
      isHeader?: boolean;
      headerText?: string;
    }[] = [];

    let i = 0;
    while (i < displayedLines.length) {
      const line = displayedLines[i];
      if (line.type === "header") {
        rows.push({ isHeader: true, headerText: line.text });
        i++;
        continue;
      }

      if (line.type === "context") {
        rows.push({ left: line, right: line });
        i++;
        continue;
      }

      if (line.type === "del") {
        const dels: ParsedDiffLine[] = [];
        while (i < displayedLines.length && displayedLines[i].type === "del") {
          dels.push(displayedLines[i]);
          i++;
        }
        const adds: ParsedDiffLine[] = [];
        while (i < displayedLines.length && displayedLines[i].type === "add") {
          adds.push(displayedLines[i]);
          i++;
        }

        const maxCount = Math.max(dels.length, adds.length);
        for (let k = 0; k < maxCount; k++) {
          rows.push({
            left: dels[k],
            right: adds[k],
          });
        }
        continue;
      }

      if (line.type === "add") {
        rows.push({ right: line });
        i++;
        continue;
      }

      i++;
    }

    return rows;
  }, [displayedLines, viewMode]);

  // Options for jump-to-change dropdown
  const changeSelectOptions = useMemo(() => {
    return changeGroups.map((g) => ({
      value: g.index,
      label: (
        <span className="change-option-row">
          <span className={`option-type-tag option-type-tag--${g.type}`}>
            {g.type === "add" ? "+ Thêm" : g.type === "del" ? "- Xóa" : "~ Sửa"}
          </span>
          <span className="option-title">Thay đổi #{g.index}:</span>
          <span className="option-desc">{g.summary}</span>
        </span>
      ),
    }));
  }, [changeGroups]);

  return (
    <div className="git-visual-diff-viewer">
      {/* Diff Controls Header */}
      <div className="diff-controls-header">
        <div className="controls-left">
          {/* Change Navigation Controls */}
          <div className="change-nav-group">
            <span className="change-nav-title">
              <Navigation size={13} className="nav-icon" />
              <span>Thay đổi:</span>
            </span>

            {totalChanges > 0 ? (
              <>
                <div className="change-counter-badge">
                  <span className="current-idx">{activeChangeIdx}</span>
                  <span className="divider">/</span>
                  <span className="total-idx">{totalChanges}</span>
                </div>

                <div className="btn-nav-pair">
                  <Tooltip title="Thay đổi trước (P / Alt+↑)">
                    <Button
                      size="small"
                      icon={<ChevronUp size={13} />}
                      onClick={handlePrevChange}
                      className="btn-change-nav"
                    />
                  </Tooltip>
                  <Tooltip title="Thay đổi tiếp theo (N / Alt+↓)">
                    <Button
                      size="small"
                      icon={<ChevronDown size={13} />}
                      onClick={handleNextChange}
                      className="btn-change-nav"
                    />
                  </Tooltip>
                </div>

                {/* Dropdown jump list */}
                <Select
                  size="small"
                  value={activeChangeIdx}
                  onChange={(val) => scrollToChange(val)}
                  options={changeSelectOptions}
                  className="change-quick-select"
                  dropdownMatchSelectWidth={false}
                  popupMatchSelectWidth={false}
                />
              </>
            ) : (
              <span className="no-changes-badge">Không có thay đổi</span>
            )}
          </div>

          {/* Quick insertions / deletions stats */}
          <div className="diff-counts-tags">
            {totalIns > 0 && (
              <span className="count-tag count-tag--ins" title={`${totalIns} dòng thêm mới`}>
                <Plus size={11} /> {totalIns}
              </span>
            )}
            {totalDels > 0 && (
              <span className="count-tag count-tag--del" title={`${totalDels} dòng đã xóa`}>
                <Minus size={11} /> {totalDels}
              </span>
            )}
            {filePath && (
              <span className="diff-file-badge" title={filePath}>
                {filePath.split("/").pop()}
              </span>
            )}
          </div>

          {/* Options: Format JSON & Fold Context */}
          <div className="extra-options-row">
            {isJsonContent && (
              <Tooltip title="Định dạng thụt lề JSON để so sánh trực quan từng trường và khối nội dung">
                <Button
                  size="small"
                  type={prettyJson ? "primary" : "default"}
                  icon={<FileCode size={12} />}
                  onClick={() => setPrettyJson(!prettyJson)}
                  className={`btn-toggle-option ${prettyJson ? "active" : ""}`}
                >
                  Định dạng JSON
                </Button>
              </Tooltip>
            )}

            {totalChanges > 0 && viewMode !== "visual" && (
              <Tooltip title="Chỉ hiển thị các dòng có thay đổi và các dòng ngữ cảnh xung quanh">
                <Button
                  size="small"
                  type={onlyChanges ? "primary" : "default"}
                  icon={<Filter size={12} />}
                  onClick={() => setOnlyChanges(!onlyChanges)}
                  className={`btn-toggle-option ${onlyChanges ? "active" : ""}`}
                >
                  {onlyChanges ? "Đang lọc thay đổi" : "Thu gọn dòng tĩnh"}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="controls-right">
          <Segmented
            size="small"
            value={viewMode}
            onChange={(val) => setViewMode(val as "unified" | "split" | "visual")}
            options={[
              {
                value: "unified",
                label: (
                  <span className="mode-tab-label">
                    <AlignJustify size={13} />
                    <span>Dòng chảy (Unified)</span>
                  </span>
                ),
              },
              {
                value: "split",
                label: (
                  <span className="mode-tab-label">
                    <Columns size={13} />
                    <span>Hai cột (Split)</span>
                  </span>
                ),
              },
              ...(semanticDoc?.isDoc
                ? [
                    {
                      value: "visual",
                      label: (
                        <span className="mode-tab-label">
                          <FileText size={13} />
                          <span>Tổng quan tài liệu</span>
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {/* Main Diff Content Container */}
      <div className="diff-view-content" ref={containerRef}>
        {/* 1. UNIFIED VIEW */}
        {viewMode === "unified" && (
          <div className="unified-diff-table">
            {displayedLines.length === 0 ? (
              <div className="diff-empty-notice">Không có thay đổi văn bản giữa 2 phiên bản.</div>
            ) : (
              displayedLines.map((line) => {
                const isHeader = line.type === "header";
                const isAdd = line.type === "add";
                const isDel = line.type === "del";
                const isActive = line.changeGroupIndex === activeChangeIdx;

                if (isHeader) {
                  return (
                    <div key={line.lineId} id={line.lineId} className="diff-row diff-row--header">
                      <div className="line-num line-num--old">...</div>
                      <div className="line-num line-num--new">...</div>
                      <div className="line-sign">@@</div>
                      <div className="line-text">{line.text}</div>
                    </div>
                  );
                }

                return (
                  <div
                    key={line.lineId}
                    id={line.lineId}
                    className={`diff-row diff-row--${line.type} ${isActive ? "is-active-change" : ""}`}
                    onClick={() => {
                      if (line.changeGroupIndex) setActiveChangeIdx(line.changeGroupIndex);
                    }}
                  >
                    <div className="line-num line-num--old">
                      {line.oldLineNumber ?? ""}
                    </div>
                    <div className="line-num line-num--new">
                      {line.newLineNumber ?? ""}
                    </div>
                    <div className="line-sign">
                      {isAdd ? "+" : isDel ? "-" : " "}
                    </div>
                    <div className="line-text">
                      {isDel && line.oldWordParts ? (
                        line.oldWordParts.map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className={part.changed ? "diff-word-del" : undefined}
                          >
                            {part.text}
                          </span>
                        ))
                      ) : isAdd && line.newWordParts ? (
                        line.newWordParts.map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className={part.changed ? "diff-word-add" : undefined}
                          >
                            {part.text}
                          </span>
                        ))
                      ) : (
                        line.text || " "
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 2. SPLIT / SIDE-BY-SIDE VIEW */}
        {viewMode === "split" && (
          <div className="split-diff-table">
            <div className="split-header-row">
              <div className="split-pane-title split-pane-title--left">Phiên bản trước (Old)</div>
              <div className="split-pane-title split-pane-title--right">Phiên bản sau (New)</div>
            </div>

            {splitRows.map((row, rIdx) => {
              if (row.isHeader) {
                return (
                  <div key={rIdx} className="split-row split-row--header">
                    <div className="split-header-text">{row.headerText}</div>
                  </div>
                );
              }

              const left = row.left;
              const right = row.right;
              const isActive =
                left?.changeGroupIndex === activeChangeIdx ||
                right?.changeGroupIndex === activeChangeIdx;

              return (
                <div
                  key={rIdx}
                  className={`split-row ${isActive ? "is-active-change" : ""}`}
                  onClick={() => {
                    const group = left?.changeGroupIndex || right?.changeGroupIndex;
                    if (group) setActiveChangeIdx(group);
                  }}
                >
                  {/* Left Cell */}
                  <div
                    className={`split-cell split-cell--left ${left ? `diff-cell--${left.type}` : "diff-cell--empty"}`}
                    id={left?.lineId}
                  >
                    <div className="cell-num">{left?.oldLineNumber ?? ""}</div>
                    <div className="cell-sign">{left?.type === "del" ? "-" : " "}</div>
                    <div className="cell-text">
                      {left?.oldWordParts ? (
                        left.oldWordParts.map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className={part.changed ? "diff-word-del" : undefined}
                          >
                            {part.text}
                          </span>
                        ))
                      ) : (
                        left?.text || " "
                      )}
                    </div>
                  </div>

                  {/* Right Cell */}
                  <div
                    className={`split-cell split-cell--right ${right ? `diff-cell--${right.type}` : "diff-cell--empty"}`}
                    id={right?.lineId}
                  >
                    <div className="cell-num">{right?.newLineNumber ?? ""}</div>
                    <div className="cell-sign">{right?.type === "add" ? "+" : " "}</div>
                    <div className="cell-text">
                      {right?.newWordParts ? (
                        right.newWordParts.map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className={part.changed ? "diff-word-add" : undefined}
                          >
                            {part.text}
                          </span>
                        ))
                      ) : (
                        right?.text || " "
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. VISUAL DOC SUMMARY */}
        {viewMode === "visual" && semanticDoc && (
          <div className="visual-doc-diff-summary">
            {/* Title Change Card */}
            {semanticDoc.titleChange && (
              <div className="summary-card summary-card--title">
                <div className="card-header">
                  <Edit3 size={15} className="header-icon" />
                  <span className="card-title">Thay đổi tiêu đề tài liệu</span>
                </div>
                <div className="card-body">
                  <div className="title-comparison">
                    <div className="title-box title-box--old">
                      <span className="title-label">Tiêu đề cũ:</span>
                      <span className="title-value">{semanticDoc.titleChange.old}</span>
                    </div>
                    <div className="title-arrow">→</div>
                    <div className="title-box title-box--new">
                      <span className="title-label">Tiêu đề mới:</span>
                      <span className="title-value">{semanticDoc.titleChange.new}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Status Change Card */}
            {semanticDoc.statusChange && (
              <div className="summary-card summary-card--status">
                <div className="card-header">
                  <CheckCircle2 size={15} className="header-icon" />
                  <span className="card-title">Thay đổi trạng thái tài liệu</span>
                </div>
                <div className="card-body">
                  <span className="status-badge status-badge--old">
                    {String(semanticDoc.statusChange.old)}
                  </span>
                  <span className="status-arrow">→</span>
                  <span className="status-badge status-badge--new">
                    {String(semanticDoc.statusChange.new)}
                  </span>
                </div>
              </div>
            )}

            {/* Blocks Change Card */}
            {semanticDoc.blocksSummary && (
              <div className="summary-card summary-card--blocks">
                <div className="card-header">
                  <FileText size={15} className="header-icon" />
                  <span className="card-title">Chi tiết các khối nội dung thay đổi</span>
                  <div className="block-stats-chips">
                    <Tag color="green">+{semanticDoc.blocksSummary.addedCount} thêm mới</Tag>
                    <Tag color="red">-{semanticDoc.blocksSummary.deletedCount} đã xóa</Tag>
                    <Tag color="orange">{semanticDoc.blocksSummary.modifiedCount} đã sửa</Tag>
                  </div>
                </div>

                <div className="card-body">
                  <div className="blocks-change-list">
                    {semanticDoc.blocksSummary.items.map((item, idx) => (
                      <div key={idx} className={`block-change-item block-change-item--${item.type}`}>
                        <div className="block-type-badge">{item.blockType}</div>
                        <div className="block-preview">
                          {item.previewText || `[Khối ${item.blockType}]`}
                        </div>
                        <div className="block-status-tag">
                          {item.type === "added"
                            ? "Thêm mới"
                            : item.type === "deleted"
                            ? "Đã xóa"
                            : "Chỉnh sửa"}
                        </div>
                        <Button
                          size="small"
                          type="link"
                          icon={<ExternalLink size={12} />}
                          className="btn-jump-code"
                          onClick={() => jumpToSemanticBlock(item.searchToken)}
                        >
                          Xem trong code
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Quick Navigation Pill */}
      {totalChanges > 0 && viewMode !== "visual" && (
        <div className="floating-diff-nav">
          <Tooltip title="Cuộn lên đầu trang">
            <button className="btn-floating" onClick={handleScrollTop}>
              <ArrowUp size={13} />
            </button>
          </Tooltip>
          <div className="floating-divider" />
          <Tooltip title="Thay đổi trước (P / Alt+↑)">
            <button className="btn-floating" onClick={handlePrevChange}>
              <ChevronUp size={14} />
            </button>
          </Tooltip>
          <div
            className="floating-badge"
            title={`Đang xem thay đổi ${activeChangeIdx} trên tổng số ${totalChanges} thay đổi`}
          >
            {activeChangeIdx} / {totalChanges}
          </div>
          <Tooltip title="Thay đổi tiếp theo (N / Alt+↓)">
            <button className="btn-floating" onClick={handleNextChange}>
              <ChevronDown size={14} />
            </button>
          </Tooltip>
          <div className="floating-divider" />
          <Tooltip title="Cuộn xuống cuối trang">
            <button className="btn-floating" onClick={handleScrollBottom}>
              <ArrowDown size={13} />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Mini-track / Minimap Change Jump Bar */}
      {totalChanges > 0 && viewMode !== "visual" && (
        <div
          className="diff-minimap-rail"
          title="Thanh định vị thay đổi: bấm vào các vạch để cuộn nhanh đến vị trí thay đổi"
        >
          {changeGroups.map((group) => {
            const isActive = group.index === activeChangeIdx;
            return (
              <div
                key={group.index}
                style={{ top: `${group.positionPercent}%` }}
                className={`minimap-tick minimap-tick--${group.type} ${isActive ? "is-active" : ""}`}
                title={`Thay đổi #${group.index}: ${group.summary}`}
                onClick={() => scrollToChange(group.index)}
              >
                {isActive && <div className="active-marker-pointer" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
