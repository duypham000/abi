import { useEffect, useState, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { blocknoteMarkdownToBlocks } from "@/presentation/features/docs/pages/DocEditorPage/importHelpers";
import "@blocknote/mantine/style.css";
import "./MarkdownDocEditor.scss";

interface MarkdownDocEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  readonly?: boolean;
}

export function MarkdownDocEditor({ markdown, onChange, readonly = false }: MarkdownDocEditorProps) {
  const editor = useCreateBlockNote();
  const [isReady, setIsReady] = useState(false);
  const ignoreChangeRef = useRef(false);
  const prevMarkdownRef = useRef(markdown);

  // Synchronize incoming markdown changes (if changed from outside)
  useEffect(() => {
    if (!editor) return;
    
    // Only load if markdown actually changed from external state (not our own changes)
    if (markdown === prevMarkdownRef.current && isReady) return;
    
    let active = true;
    async function loadMarkdown() {
      ignoreChangeRef.current = true;
      try {
        const blocks = await blocknoteMarkdownToBlocks(markdown, editor);
        if (active) {
          editor.replaceBlocks(editor.document, blocks);
          prevMarkdownRef.current = markdown;
        }
      } catch (e) {
        console.error("Failed to parse markdown to blocks:", e);
      } finally {
        if (active) {
          setIsReady(true);
          ignoreChangeRef.current = false;
        }
      }
    }

    loadMarkdown();
    return () => {
      active = false;
    };
  }, [markdown, editor, isReady]);

  // Synchronize editor changes back to parent
  useEffect(() => {
    if (!editor || !isReady) return;

    const unsub = editor.onChange(async () => {
      if (ignoreChangeRef.current) return;
      try {
        const currentMarkdown = await editor.blocksToMarkdownLossy(editor.document);
        prevMarkdownRef.current = currentMarkdown;
        onChange(currentMarkdown);
      } catch (e) {
        console.error("Failed to export blocks to markdown:", e);
      }
    });

    return unsub;
  }, [editor, isReady, onChange]);

  if (!editor || !isReady) {
    return (
      <div className="markdown-editor-loading">
        <div className="spinner"></div>
        <span>Đang khởi tạo trình soạn thảo...</span>
      </div>
    );
  }

  return (
    <div className="markdown-doc-editor">
      <BlockNoteView editor={editor} theme="light" editable={!readonly} spellCheck={false} />
    </div>
  );
}
