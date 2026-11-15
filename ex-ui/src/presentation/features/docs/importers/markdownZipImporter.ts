import { BlockNoteEditor } from "@blocknote/core";
import { workspaceSchema } from "@/presentation/components/BlockNote/useBlockNoteEditor";

interface ImportedDoc {
  title: string;
  blocks: unknown[];
}

/** Unzip a .zip containing markdown files + assets, parse each .md into BlockNote blocks. */
export async function importMarkdownZip(file: File): Promise<ImportedDoc[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const editor = BlockNoteEditor.create({ schema: workspaceSchema as any });

  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));

  const docs: ImportedDoc[] = [];

  for (const [path, data] of Object.entries(unzipped)) {
    if (path.includes("__MACOSX")) continue;
    if (!path.endsWith(".md")) continue;

    const markdown = strFromU8(data);
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    const title = path.split("/").pop()?.replace(/\.md$/, "") ?? "Untitled";
    docs.push({ title, blocks });
  }

  return docs;
}
