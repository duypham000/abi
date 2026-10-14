/** Extract all plain text from a BlockNote block array (for Elasticsearch indexing). */
export function extractBlocksPlainText(blocks: any[]): string {
  return blocks.map(extractBlockText).filter(Boolean).join("\n");
}

function extractBlockText(block: any): string {
  const lines: string[] = [];

  if (Array.isArray(block.content)) {
    const text = block.content
      .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
      .join("");
    if (text) lines.push(text);
  }

  if (block.type === "table" && Array.isArray(block.content?.rows)) {
    for (const row of block.content.rows) {
      for (const cell of row.cells ?? []) {
        if (Array.isArray(cell)) {
          const text = cell.map((c: any) => c.text ?? "").join("");
          if (text) lines.push(text);
        }
      }
    }
  }

  if (Array.isArray(block.children)) {
    lines.push(extractBlocksPlainText(block.children));
  }

  return lines.filter(Boolean).join("\n");
}
