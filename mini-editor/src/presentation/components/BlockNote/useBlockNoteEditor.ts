import { useEffect, useMemo, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import type { PartialBlock } from "@blocknote/core";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createCodeBlockEnhanced, type OnAskAI } from "./blocks/code-block-enhanced";
import { excalidrawBlock } from "./blocks/excalidraw-block";

function buildWorkspaceSchema(askAIRef: { current: OnAskAI | null }) {
  const { codeBlock: _defaultCodeBlock, ...rest } = defaultBlockSpecs;
  return BlockNoteSchema.create({
    blockSpecs: {
      ...rest,
      codeBlock: createCodeBlockEnhanced(askAIRef),
      excalidraw: excalidrawBlock,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });
}

// Shared schema for non-React usages (importers, headless editors).
// Ask AI is unavailable in these contexts — a null ref is fine.
const staticAskAIRef: { current: OnAskAI | null } = { current: null };
export const workspaceSchema = buildWorkspaceSchema(staticAskAIRef);

// Y.Doc fragment that BlockNote binds to when collaboration is active.
export const COLLAB_FRAGMENT = "document-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkspaceEditor = ReturnType<typeof useCreateBlockNote<any>>;

interface UseBlockNoteEditorOptions {
  docId: string;
  initialBlocks: PartialBlock[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (docId: string, blocks: any[]) => void;
  onAskAI?: OnAskAI;
}

export function useWorkspaceBlockNoteEditor({
  docId,
  initialBlocks,
  onChange,
  onAskAI,
}: UseBlockNoteEditorOptions) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const askAIRef = useRef<OnAskAI | null>(onAskAI ?? null);
  askAIRef.current = onAskAI ?? null;

  // schema is intentionally built once per editor instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schema = useMemo(() => buildWorkspaceSchema(askAIRef), []);

  
  const initialContent = initialBlocks.length > 0 ? initialBlocks : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useCreateBlockNote({
    schema,
    initialContent,
    // Inside a code block, paste the clipboard's plain text verbatim instead of
    // letting BlockNote parse it as Markdown (which turns lines like `#`, `-` or
    // fenced ``` blocks into new blocks, breaking out of the code block).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pasteHandler: ({ event, editor: ed, defaultPasteHandler }: any) => {
      const block = ed.getTextCursorPosition?.().block;
      if (block?.type === "codeBlock") {
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
          const view = ed.prosemirrorView;
          view.dispatch(view.state.tr.insertText(text).scrollIntoView());
          return true; // handled — bypass markdown parsing
        }
      }
      return defaultPasteHandler();
    },
    // Convert pasted/dropped files to data URLs so the image is stored
    // inline with the document — no upload, no expiry, works offline.
    uploadFile: (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as any;

  
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsub = (editor as any).onChange(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = (editor as any).document;
      onChangeRef.current(docId, blocks);
    });
    return () => {
      unsub();
    };
  }, [editor, docId]);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = (editor as any).document;
      onChangeRef.current(docId, blocks);
    };
  }, [editor, docId]);

  // Scope Ctrl/Cmd+A to the current code block: by default BlockNote selects
  // every block in the document, which is rarely what you want while editing
  // code. When the caret is inside a code block, select only that block's text.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = (editor as any).prosemirrorView;
    if (!view) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "a") return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const block = (editor as any).getTextCursorPosition?.().block;
      if (block?.type !== "codeBlock") return;
      const { state } = view;
      const $from = state.selection.$from;
      // The caret inside a code block is always a ProseMirror TextSelection;
      // reuse its class (prosemirror-state is not a hoisted dependency here) to
      // build a selection spanning only this block's inline content.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TextSel = state.selection.constructor as any;
      view.dispatch(
        state.tr.setSelection(TextSel.create(state.doc, $from.start(), $from.end()))
      );
      e.preventDefault();
      e.stopPropagation();
    };
    view.dom.addEventListener("keydown", onKeyDown, true);
    return () => view.dom.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  return editor as WorkspaceEditor;
}
