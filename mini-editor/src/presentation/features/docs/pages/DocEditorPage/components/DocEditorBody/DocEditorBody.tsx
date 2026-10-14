import { memo, useEffect } from "react";
import { useSelector } from "react-redux";
import { SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import type { RootState } from "@/presentation/store";
import "@blocknote/mantine/style.css";
import "@/presentation/components/BlockNote/code-block-affine.css";
import { useWorkspaceBlockNoteEditor } from "@/presentation/components/BlockNote/useBlockNoteEditor";
import type { AskAIPayload } from "@/presentation/components/BlockNote/blocks/code-block-enhanced";
import "./DocEditorBody.scss";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExcalidrawIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 17L10 13L13 15L16 10L19 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="9" r="1.5" fill="currentColor" />
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertExcalidrawItem(editor: any) {
  return {
    title: "Excalidraw",
    subtext: "Nhúng canvas Excalidraw vào tài liệu",
    onItemClick: () => {
      const pos = editor.getTextCursorPosition();
      editor.insertBlocks(
        [{ type: "excalidraw", props: { canvasId: "" } }],
        pos.block,
        "after"
      );
    },
    group: "Media",
    icon: <ExcalidrawIcon />,
    aliases: ["excalidraw", "canvas", "whiteboard", "draw", "vẽ"],
  };
}

interface DocEditorBodyProps {
  docId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialBlocks: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBlocksChange: (blocks: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEditorReady?: (editor: any) => void;
  onAskAI?: (payload: AskAIPayload) => void;
  readonly?: boolean;
}

export const DocEditorBody = memo(function DocEditorBody({
  docId,
  initialBlocks,
  onBlocksChange,
  onEditorReady,
  onAskAI,
  readonly = false,
}: DocEditorBodyProps) {
  const theme = useSelector((s: RootState) => s.app.theme) as "light" | "dark";
  const editor = useWorkspaceBlockNoteEditor({
    docId: String(docId),
    initialBlocks,
    onChange: (_id, blocks) => onBlocksChange(blocks),
    onAskAI,
  });

  useEffect(() => {
    onEditorReady?.(editor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className="doc-editor-body">
      <BlockNoteView editor={editor as any} editable={!readonly} theme={theme} spellCheck={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [...getDefaultReactSlashMenuItems(editor as any), insertExcalidrawItem(editor)],
              query
            )
          }
        />
      </BlockNoteView>
    </div>
  );
});
