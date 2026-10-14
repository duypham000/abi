import { BlockNoteEditor } from "@blocknote/core";
import { workspaceSchema } from "@/presentation/components/BlockNote/useBlockNoteEditor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTempEditor(editor?: any): any {
  if (editor) return editor;
  return BlockNoteEditor.create({ schema: workspaceSchema as any });
}

/** Parse markdown string → BlockNote blocks. */
export async function blocknoteMarkdownToBlocks(
  markdown: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor?: any
): Promise<any[]> {
  return await getTempEditor(editor).tryParseMarkdownToBlocks(markdown);
}

/** Parse HTML string → BlockNote blocks. */
export async function blocknoteHTMLToBlocks(
  html: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor?: any
): Promise<any[]> {
  return await getTempEditor(editor).tryParseHTMLToBlocks(html);
}
