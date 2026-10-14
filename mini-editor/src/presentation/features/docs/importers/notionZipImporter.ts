import { BlockNoteEditor } from "@blocknote/core";
import { workspaceSchema } from "@/presentation/components/BlockNote/useBlockNoteEditor";

interface ImportedDoc {
  title: string;
  blocks: unknown[];
}

/** Unzip a Notion export .zip, parse each .html page into BlockNote blocks. */
export async function importNotionZip(file: File): Promise<ImportedDoc[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const editor = BlockNoteEditor.create({ schema: workspaceSchema as any });

  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));

  const docs: ImportedDoc[] = [];

  for (const [path, data] of Object.entries(unzipped)) {
    if (path.includes("__MACOSX")) continue;
    if (!path.endsWith(".html")) continue;

    const html = strFromU8(data);
    const blocks = await editor.tryParseHTMLToBlocks(html);
    const title = path.split("/").pop()?.replace(/\.html?$/, "") ?? "Untitled";
    docs.push({ title, blocks });
  }

  return docs;
}
