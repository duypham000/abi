// src/presentation/features/git/utils/diffEngine.ts

export interface ParsedDiffLine {
  lineId: string;
  type: "add" | "del" | "context" | "header";
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
  changeGroupIndex?: number;
  oldWordParts?: { text: string; changed: boolean }[];
  newWordParts?: { text: string; changed: boolean }[];
}

export interface ChangeGroup {
  index: number;
  firstLineId: string;
  type: "add" | "del" | "modify";
  oldStart?: number;
  newStart?: number;
  linesCount: number;
  summary: string;
  positionPercent: number; // 0 to 100 for minimap
}

export interface SemanticBlockDiff {
  type: "added" | "deleted" | "modified";
  blockType: string;
  title?: string;
  previewText?: string;
  id: string;
  searchToken?: string;
}

export interface SemanticDocSummary {
  isDoc: boolean;
  titleChange?: { old: string; new: string };
  statusChange?: { old: string | number; new: string | number };
  blocksSummary?: {
    oldCount: number;
    newCount: number;
    addedCount: number;
    deletedCount: number;
    modifiedCount: number;
    items: SemanticBlockDiff[];
  };
}

// ── JSON Detection & Formatting ──────────────────────────────────────────────

export function isJsonString(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function formatJsonText(text: string): { formatted: string; isJson: boolean } {
  if (!text) return { formatted: "", isJson: false };
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { formatted: text, isJson: false };
  }
  try {
    const parsed = JSON.parse(trimmed);
    return {
      formatted: JSON.stringify(parsed, null, 2),
      isJson: true,
    };
  } catch {
    return { formatted: text, isJson: false };
  }
}

// ── Word-Level Diff ─────────────────────────────────────────────────────────

export function tokenizeWords(str: string): string[] {
  if (!str) return [];
  // Match unicode words, numbers, punctuation, or spaces
  const match = str.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+|\s+/gu);
  return match || [str];
}

export function diffWords(
  oldStr: string,
  newStr: string
): {
  oldParts: { text: string; changed: boolean }[];
  newParts: { text: string; changed: boolean }[];
} {
  const a = tokenizeWords(oldStr);
  const b = tokenizeWords(newStr);
  const m = a.length;
  const n = b.length;

  if (m === 0 && n === 0) {
    return { oldParts: [], newParts: [] };
  }
  if (m === 0) {
    return { oldParts: [], newParts: b.map((t) => ({ text: t, changed: true })) };
  }
  if (n === 0) {
    return { oldParts: a.map((t) => ({ text: t, changed: true })), newParts: [] };
  }

  // Safety check to avoid large matrix
  if (m * n > 400000) {
    return {
      oldParts: [{ text: oldStr, changed: true }],
      newParts: [{ text: newStr, changed: true }],
    };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const commonA = new Set<number>();
  const commonB = new Set<number>();

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      commonA.add(i - 1);
      commonB.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return {
    oldParts: a.map((text, idx) => ({ text, changed: !commonA.has(idx) })),
    newParts: b.map((text, idx) => ({ text, changed: !commonB.has(idx) })),
  };
}

// ── Line-Level LCS Diff ─────────────────────────────────────────────────────

export function diffLinesLCS(
  oldText: string,
  newText: string
): {
  lines: ParsedDiffLine[];
  changeGroups: ChangeGroup[];
  insertions: number;
  deletions: number;
} {
  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const newLines = newText === "" ? [] : newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;

  let rawDiffLines: {
    type: "add" | "del" | "context";
    oldNum?: number;
    newNum?: number;
    text: string;
  }[] = [];

  // If text is huge, fallback to simple compare
  if (m * n > 2500000) {
    let o = 0;
    let nw = 0;
    while (o < m || nw < n) {
      const oLine = o < m ? oldLines[o] : undefined;
      const nLine = nw < n ? newLines[nw] : undefined;
      if (oLine === nLine && oLine !== undefined) {
        rawDiffLines.push({ type: "context", oldNum: o + 1, newNum: nw + 1, text: oLine });
        o++;
        nw++;
      } else {
        if (oLine !== undefined) {
          rawDiffLines.push({ type: "del", oldNum: o + 1, text: oLine });
          o++;
        }
        if (nLine !== undefined) {
          rawDiffLines.push({ type: "add", newNum: nw + 1, text: nLine });
          nw++;
        }
      }
    }
  } else {
    // DP LCS for lines
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = m;
    let j = n;
    const matches: { oldIdx: number; newIdx: number }[] = [];
    while (i > 0 && j > 0) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        matches.push({ oldIdx: i - 1, newIdx: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    matches.reverse();

    let oldPtr = 0;
    let newPtr = 0;

    for (const match of matches) {
      while (oldPtr < match.oldIdx) {
        rawDiffLines.push({
          type: "del",
          oldNum: oldPtr + 1,
          text: oldLines[oldPtr],
        });
        oldPtr++;
      }
      while (newPtr < match.newIdx) {
        rawDiffLines.push({
          type: "add",
          newNum: newPtr + 1,
          text: newLines[newPtr],
        });
        newPtr++;
      }
      rawDiffLines.push({
        type: "context",
        oldNum: match.oldIdx + 1,
        newNum: match.newIdx + 1,
        text: oldLines[match.oldIdx],
      });
      oldPtr = match.oldIdx + 1;
      newPtr = match.newIdx + 1;
    }

    while (oldPtr < m) {
      rawDiffLines.push({
        type: "del",
        oldNum: oldPtr + 1,
        text: oldLines[oldPtr],
      });
      oldPtr++;
    }
    while (newPtr < n) {
      rawDiffLines.push({
        type: "add",
        newNum: newPtr + 1,
        text: newLines[newPtr],
      });
      newPtr++;
    }
  }

  // Group into change groups and parsed diff lines
  const parsedLines: ParsedDiffLine[] = [];
  const changeGroups: ChangeGroup[] = [];
  let currentGroup: ChangeGroup | null = null;
  let groupOldLines: { lineId: string; text: string }[] = [];
  let groupNewLines: { lineId: string; text: string }[] = [];
  let insertions = 0;
  let deletions = 0;

  const totalRawCount = rawDiffLines.length || 1;

  const finalizeGroup = () => {
    if (!currentGroup) return;

    // Check if modify and compute word diffs
    if (groupOldLines.length > 0 && groupNewLines.length > 0) {
      currentGroup.type = "modify";
      const pairCount = Math.min(groupOldLines.length, groupNewLines.length);
      for (let k = 0; k < pairCount; k++) {
        const oldEntry = groupOldLines[k];
        const newEntry = groupNewLines[k];
        const { oldParts, newParts } = diffWords(oldEntry.text, newEntry.text);

        const targetOld = parsedLines.find((l) => l.lineId === oldEntry.lineId);
        if (targetOld) targetOld.oldWordParts = oldParts;

        const targetNew = parsedLines.find((l) => l.lineId === newEntry.lineId);
        if (targetNew) targetNew.newWordParts = newParts;
      }
      currentGroup.summary = `Sửa đổi dòng ${currentGroup.oldStart || currentGroup.newStart} (${groupOldLines.length} xóa, ${groupNewLines.length} thêm)`;
    } else if (groupNewLines.length > 0) {
      currentGroup.type = "add";
      currentGroup.summary = `Thêm mới ${groupNewLines.length} dòng (tại dòng ${currentGroup.newStart})`;
    } else {
      currentGroup.type = "del";
      currentGroup.summary = `Xóa ${groupOldLines.length} dòng (tại dòng ${currentGroup.oldStart})`;
    }

    changeGroups.push(currentGroup);
    currentGroup = null;
    groupOldLines = [];
    groupNewLines = [];
  };

  rawDiffLines.forEach((raw, idx) => {
    const lineId = `diff-line-${idx}`;
    const percent = Math.round((idx / totalRawCount) * 100);

    if (raw.type === "context") {
      finalizeGroup();
      parsedLines.push({
        lineId,
        type: "context",
        oldLineNumber: raw.oldNum,
        newLineNumber: raw.newNum,
        text: raw.text,
      });
      return;
    }

    if (raw.type === "del") {
      deletions++;
      if (!currentGroup) {
        currentGroup = {
          index: changeGroups.length + 1,
          firstLineId: lineId,
          type: "del",
          oldStart: raw.oldNum,
          linesCount: 0,
          summary: `Xóa dòng ${raw.oldNum}`,
          positionPercent: percent,
        };
      }
      currentGroup.linesCount++;
      groupOldLines.push({ lineId, text: raw.text });

      parsedLines.push({
        lineId,
        type: "del",
        oldLineNumber: raw.oldNum,
        text: raw.text,
        changeGroupIndex: currentGroup.index,
      });
      return;
    }

    if (raw.type === "add") {
      insertions++;
      if (!currentGroup) {
        currentGroup = {
          index: changeGroups.length + 1,
          firstLineId: lineId,
          type: "add",
          newStart: raw.newNum,
          linesCount: 0,
          summary: `Thêm dòng ${raw.newNum}`,
          positionPercent: percent,
        };
      }
      if (!currentGroup.newStart) {
        currentGroup.newStart = raw.newNum;
      }
      currentGroup.linesCount++;
      groupNewLines.push({ lineId, text: raw.text });

      parsedLines.push({
        lineId,
        type: "add",
        newLineNumber: raw.newNum,
        text: raw.text,
        changeGroupIndex: currentGroup.index,
      });
      return;
    }
  });

  finalizeGroup();

  return { lines: parsedLines, changeGroups, insertions, deletions };
}

// ── Unified Patch Parser (Fallback) ─────────────────────────────────────────

export function parseUnifiedPatch(patch: string): {
  lines: ParsedDiffLine[];
  changeGroups: ChangeGroup[];
} {
  if (!patch) return { lines: [], changeGroups: [] };

  const rawLines = patch.split("\n");
  const parsedLines: ParsedDiffLine[] = [];
  const changeGroups: ChangeGroup[] = [];

  let currOld = 1;
  let currNew = 1;
  let currentGroup: ChangeGroup | null = null;
  let currentGroupTypes = new Set<"add" | "del">();

  const hunkHeaderRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/;
  const totalRawCount = rawLines.length || 1;

  rawLines.forEach((raw, idx) => {
    const lineId = `diff-line-${idx}`;
    const percent = Math.round((idx / totalRawCount) * 100);

    if (raw.startsWith("@@")) {
      const match = raw.match(hunkHeaderRegex);
      if (match) {
        currOld = parseInt(match[1], 10);
        currNew = parseInt(match[3], 10);
      }
      if (currentGroup) {
        changeGroups.push(currentGroup);
        currentGroup = null;
        currentGroupTypes.clear();
      }
      parsedLines.push({
        lineId,
        type: "header",
        text: raw,
      });
      return;
    }

    if (raw.startsWith("---") || raw.startsWith("+++")) {
      parsedLines.push({
        lineId,
        type: "header",
        text: raw,
      });
      return;
    }

    if (raw.startsWith("+")) {
      const newLineNum = currNew++;
      if (!currentGroup) {
        currentGroup = {
          index: changeGroups.length + 1,
          firstLineId: lineId,
          type: "add",
          newStart: newLineNum,
          linesCount: 0,
          summary: `Thêm mới tại dòng ${newLineNum}`,
          positionPercent: percent,
        };
      }
      currentGroupTypes.add("add");
      currentGroup.linesCount++;
      if (currentGroupTypes.has("del")) {
        currentGroup.type = "modify";
        currentGroup.summary = `Sửa đổi dòng ${currentGroup.oldStart || newLineNum}`;
      }

      parsedLines.push({
        lineId,
        type: "add",
        newLineNumber: newLineNum,
        text: raw.slice(1),
        changeGroupIndex: currentGroup.index,
      });
      return;
    }

    if (raw.startsWith("-")) {
      const oldLineNum = currOld++;
      if (!currentGroup) {
        currentGroup = {
          index: changeGroups.length + 1,
          firstLineId: lineId,
          type: "del",
          oldStart: oldLineNum,
          linesCount: 0,
          summary: `Xóa tại dòng ${oldLineNum}`,
          positionPercent: percent,
        };
      }
      currentGroupTypes.add("del");
      currentGroup.linesCount++;
      if (currentGroupTypes.has("add")) {
        currentGroup.type = "modify";
        currentGroup.summary = `Sửa đổi dòng ${currentGroup.oldStart || oldLineNum}`;
      }

      parsedLines.push({
        lineId,
        type: "del",
        oldLineNumber: oldLineNum,
        text: raw.slice(1),
        changeGroupIndex: currentGroup.index,
      });
      return;
    }

    // Context line
    if (currentGroup) {
      changeGroups.push(currentGroup);
      currentGroup = null;
      currentGroupTypes.clear();
    }

    const oldNum = currOld++;
    const newNum = currNew++;
    const text = raw.startsWith(" ") ? raw.slice(1) : raw;

    parsedLines.push({
      lineId,
      type: "context",
      oldLineNumber: oldNum,
      newLineNumber: newNum,
      text,
    });
  });

  if (currentGroup) {
    changeGroups.push(currentGroup);
  }

  return { lines: parsedLines, changeGroups };
}

// ── Semantic Document Diff ──────────────────────────────────────────────────

function extractBlockText(block: any): string {
  if (!block) return "";
  if (Array.isArray(block.content)) {
    return block.content
      .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
      .join(" ");
  }
  return "";
}

export function parseSemanticDocDiff(oldRaw?: string, newRaw?: string): SemanticDocSummary | null {
  if (!oldRaw && !newRaw) return null;
  try {
    const oldDoc = oldRaw ? JSON.parse(oldRaw) : null;
    const newDoc = newRaw ? JSON.parse(newRaw) : null;

    const isOldDoc = oldDoc && typeof oldDoc === "object" && ("content" in oldDoc || "title" in oldDoc);
    const isNewDoc = newDoc && typeof newDoc === "object" && ("content" in newDoc || "title" in newDoc);

    if (!isOldDoc && !isNewDoc) return null;

    const summary: SemanticDocSummary = { isDoc: true };

    // Title change
    const oldTitle = oldDoc?.title || "";
    const newTitle = newDoc?.title || "";
    if (oldTitle !== newTitle) {
      summary.titleChange = {
        old: oldTitle || "(Chưa đặt tiêu đề)",
        new: newTitle || "(Chưa đặt tiêu đề)",
      };
    }

    // Status change
    const oldStatus = oldDoc?.status;
    const newStatus = newDoc?.status;
    if (oldStatus !== undefined && newStatus !== undefined && oldStatus !== newStatus) {
      summary.statusChange = { old: oldStatus, new: newStatus };
    }

    // Block changes
    const oldBlocks: any[] = Array.isArray(oldDoc?.content)
      ? oldDoc.content
      : typeof oldDoc?.content === "string"
      ? JSON.parse(oldDoc.content || "[]")
      : [];

    const newBlocks: any[] = Array.isArray(newDoc?.content)
      ? newDoc.content
      : typeof newDoc?.content === "string"
      ? JSON.parse(newDoc.content || "[]")
      : [];

    const oldMap = new Map<string, any>();
    oldBlocks.forEach((b) => {
      if (b?.id) oldMap.set(b.id, b);
    });

    const newMap = new Map<string, any>();
    newBlocks.forEach((b) => {
      if (b?.id) newMap.set(b.id, b);
    });

    const items: SemanticBlockDiff[] = [];
    let addedCount = 0;
    let deletedCount = 0;
    let modifiedCount = 0;

    // Added or modified
    newBlocks.forEach((nb) => {
      if (!nb?.id) return;
      const ob = oldMap.get(nb.id);
      const textPreview = extractBlockText(nb);
      if (!ob) {
        addedCount++;
        items.push({
          type: "added",
          id: nb.id,
          blockType: nb.type || "paragraph",
          previewText: textPreview,
          searchToken: nb.id,
        });
      } else {
        const obJson = JSON.stringify(ob);
        const nbJson = JSON.stringify(nb);
        if (obJson !== nbJson) {
          modifiedCount++;
          items.push({
            type: "modified",
            id: nb.id,
            blockType: nb.type || "paragraph",
            previewText: textPreview,
            searchToken: nb.id,
          });
        }
      }
    });

    // Deleted
    oldBlocks.forEach((ob) => {
      if (!ob?.id) return;
      if (!newMap.has(ob.id)) {
        deletedCount++;
        items.push({
          type: "deleted",
          id: ob.id,
          blockType: ob.type || "paragraph",
          previewText: extractBlockText(ob),
          searchToken: ob.id,
        });
      }
    });

    summary.blocksSummary = {
      oldCount: oldBlocks.length,
      newCount: newBlocks.length,
      addedCount,
      deletedCount,
      modifiedCount,
      items: items.slice(0, 40),
    };

    return summary;
  } catch {
    return null;
  }
}
