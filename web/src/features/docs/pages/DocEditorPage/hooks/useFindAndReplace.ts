import { useState, useEffect, useCallback, useRef } from "react";

interface Match {
  from: number;
  to: number;
}

interface ComputeResult {
  matches: Match[];
  regexError: string | null;
}

function computeMatches(
  doc: any,
  searchText: string,
  opts: { caseSensitive: boolean; isRegex: boolean }
): ComputeResult {
  if (!searchText) return { matches: [], regexError: null };

  if (opts.isRegex) {
    let regex: RegExp;
    try {
      regex = new RegExp(searchText, opts.caseSensitive ? "g" : "gi");
    } catch (e) {
      return { matches: [], regexError: (e as Error).message };
    }
    const matches: Match[] = [];
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(node.text)) !== null) {
        if (m[0].length === 0) { regex.lastIndex++; continue; }
        matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      }
    });
    return { matches, regexError: null };
  }

  const matches: Match[] = [];
  const needle = opts.caseSensitive ? searchText : searchText.toLowerCase();
  doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return;
    const haystack = opts.caseSensitive ? node.text : (node.text as string).toLowerCase();
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + needle.length });
      idx += needle.length;
    }
  });
  return { matches, regexError: null };
}

function resolveReplacement(
  replaceText: string,
  searchText: string,
  match: Match,
  state: any,
  opts: { isRegex: boolean; caseSensitive: boolean }
): string {
  if (!opts.isRegex) return replaceText;
  const nodeText = state.doc.textBetween(match.from, match.to);
  try {
    const regex = new RegExp(searchText, opts.caseSensitive ? "" : "i");
    return nodeText.replace(regex, replaceText);
  } catch {
    return replaceText;
  }
}

function scrollToMatch(tt: any, match: Match) {
  const { state, view } = tt;
  const docSize = state.doc.content.size;
  const from = Math.max(0, Math.min(match.from, docSize));
  const to = Math.max(from, Math.min(match.to, docSize));

  tt.chain().setTextSelection({ from, to }).run();

  requestAnimationFrame(() => {
    try {
      const domInfo = view.domAtPos(from);
      if (!domInfo) return;
      const node = domInfo.node;
      const el: HTMLElement | null =
        node.nodeType === Node.TEXT_NODE
          ? (node as Text).parentElement
          : (node as HTMLElement);
      el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    } catch (_) {}
  });
}

// CSS Custom Highlight API — highlights are painted by the browser directly on top
// of the DOM without touching ProseMirror's state or transactions at all.
const HIGHLIGHT_ALL = "find-match";
const HIGHLIGHT_CURRENT = "find-match-current";

function clearCSSHighlights() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CSS as any).highlights?.delete(HIGHLIGHT_ALL);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CSS as any).highlights?.delete(HIGHLIGHT_CURRENT);
  } catch (_) {}
}

function applyCSSHighlights(view: any, matches: Match[], currentIndex: number) {
  clearCSSHighlights();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hl = (CSS as any).highlights;
  if (!hl || matches.length === 0) return;

  const otherRanges: Range[] = [];
  let currentRange: Range | null = null;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    try {
      const startInfo = view.domAtPos(match.from);
      const endInfo = view.domAtPos(match.to);
      if (!startInfo || !endInfo) continue;
      const range = document.createRange();
      range.setStart(startInfo.node, startInfo.offset);
      range.setEnd(endInfo.node, endInfo.offset);
      if (i === currentIndex) {
        currentRange = range;
      } else {
        otherRanges.push(range);
      }
    } catch (_) {}
  }

  try {
    if (otherRanges.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hl.set(HIGHLIGHT_ALL, new (window as any).Highlight(...otherRanges));
    }
    if (currentRange) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hl.set(HIGHLIGHT_CURRENT, new (window as any).Highlight(currentRange));
    }
  } catch (_) {}
}

interface UseFindAndReplaceOptions {
  editor: any | null;
}

export interface UseFindAndReplaceReturn {
  isOpen: boolean;
  mode: "find" | "replace";
  open: (mode?: "find" | "replace") => void;
  close: () => void;
  searchText: string;
  replaceText: string;
  isCaseSensitive: boolean;
  isRegex: boolean;
  regexError: string | null;
  setSearchText: (v: string) => void;
  setReplaceText: (v: string) => void;
  setIsCaseSensitive: (v: boolean) => void;
  setIsRegex: (v: boolean) => void;
  matches: Match[];
  currentIndex: number;
  goToNext: () => void;
  goToPrev: () => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
}

export function useFindAndReplace({ editor }: UseFindAndReplaceOptions): UseFindAndReplaceReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"find" | "replace">("find");
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [regexError, setRegexError] = useState<string | null>(null);

  // Refs so the transaction listener reads current values without re-subscribing
  const searchRef = useRef(searchText);
  const caseSensitiveRef = useRef(isCaseSensitive);
  const isRegexRef = useRef(isRegex);
  const isOpenRef = useRef(isOpen);
  const currentIndexRef = useRef(currentIndex);
  searchRef.current = searchText;
  caseSensitiveRef.current = isCaseSensitive;
  isRegexRef.current = isRegex;
  isOpenRef.current = isOpen;
  currentIndexRef.current = currentIndex;

  // Effect A: recompute + scroll when search params or open state change.
  useEffect(() => {
    const tt = editor?._tiptapEditor;
    if (!tt) return;

    if (!isOpen || !searchText) {
      setMatches([]);
      setRegexError(null);
      setCurrentIndex(-1);
      return;
    }

    const { matches: newMatches, regexError: err } = computeMatches(
      tt.state.doc, searchText, { caseSensitive: isCaseSensitive, isRegex }
    );
    setMatches(newMatches);
    setRegexError(err);

    if (newMatches.length > 0) {
      setCurrentIndex(0);
      scrollToMatch(tt, newMatches[0]);
    } else {
      setCurrentIndex(-1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, searchText, isCaseSensitive, isRegex, isOpen]);

  // Effect B: sync CSS highlights whenever matches or currentIndex change.
  // Runs after React commits — ProseMirror has already updated the DOM by then.
  // No ProseMirror transactions or state mutations here.
  useEffect(() => {
    const view = editor?._tiptapEditor?.view;
    if (!view || !isOpen) {
      clearCSSHighlights();
      return;
    }
    applyCSSHighlights(view, matches, currentIndex);
    return () => { clearCSSHighlights(); };
  }, [editor, matches, currentIndex, isOpen]);

  // Effect C: transaction listener — recomputes match positions after doc edits.
  // Only updates React state; never dispatches any ProseMirror transaction.
  useEffect(() => {
    const tt = editor?._tiptapEditor;
    if (!tt) return;

    const handler = (data: any) => {
      const tr = data?.transaction ?? data;
      if (!tr?.docChanged) return;
      if (!isOpenRef.current || !searchRef.current) return;

      const { matches: newMatches, regexError: err } = computeMatches(
        tt.state.doc,
        searchRef.current,
        { caseSensitive: caseSensitiveRef.current, isRegex: isRegexRef.current }
      );
      const newIndex =
        newMatches.length === 0
          ? -1
          : Math.min(Math.max(0, currentIndexRef.current), newMatches.length - 1);

      setMatches(newMatches);
      setRegexError(err);
      setCurrentIndex(newIndex);
    };

    tt.on("transaction", handler);
    return () => { tt.off("transaction", handler); };
  }, [editor]);

  const open = useCallback((newMode: "find" | "replace" = "find") => {
    setIsOpen(true);
    setMode(newMode);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setCurrentIndex(-1);
    setMatches([]);
  }, []);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    const nextIndex = currentIndex < matches.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(nextIndex);
    const tt = editor?._tiptapEditor;
    if (tt) scrollToMatch(tt, matches[nextIndex]);
  }, [matches, currentIndex, editor]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : matches.length - 1;
    setCurrentIndex(prevIndex);
    const tt = editor?._tiptapEditor;
    if (tt) scrollToMatch(tt, matches[prevIndex]);
  }, [matches, currentIndex, editor]);

  const replaceCurrent = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= matches.length) return;
    const tt = editor?._tiptapEditor;
    if (!tt) return;
    const match = matches[currentIndex];
    const { state, view } = tt;
    const resolved = resolveReplacement(replaceText, searchText, match, state, { isRegex, caseSensitive: isCaseSensitive });
    const tr = state.tr;
    if (resolved) {
      tr.replaceWith(match.from, match.to, state.schema.text(resolved));
    } else {
      tr.delete(match.from, match.to);
    }
    view.dispatch(tr);
    // Effect C's transaction listener recomputes matches after the dispatch
  }, [matches, currentIndex, editor, replaceText, searchText, isRegex, isCaseSensitive]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;
    const tt = editor?._tiptapEditor;
    if (!tt) return;
    const { state, view } = tt;
    let tr = state.tr;
    for (const match of [...matches].reverse()) {
      const resolved = resolveReplacement(replaceText, searchText, match, state, { isRegex, caseSensitive: isCaseSensitive });
      if (resolved) {
        tr = tr.replaceWith(match.from, match.to, state.schema.text(resolved));
      } else {
        tr = tr.delete(match.from, match.to);
      }
    }
    view.dispatch(tr);
    setMatches([]);
    setCurrentIndex(-1);
  }, [matches, editor, replaceText, searchText, isRegex, isCaseSensitive]);

  return {
    isOpen, mode, open, close,
    searchText, replaceText, isCaseSensitive, isRegex, regexError,
    setSearchText, setReplaceText, setIsCaseSensitive, setIsRegex,
    matches, currentIndex,
    goToNext, goToPrev, replaceCurrent, replaceAll,
  };
}
