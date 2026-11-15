import { store } from "@/presentation/store";
import { canvasApi } from "@/infrastructure/api/canvasApi";
import { DRAFT_PREFIX } from "@/presentation/components/BlockNote/blocks/excalidraw-block";

interface FlushResult {
  updatedBlocks: unknown[];
  createdCount: number;
}

function isDraftCanvasId(canvasId: unknown): boolean {
  return typeof canvasId === "string" && canvasId.startsWith(DRAFT_PREFIX);
}

// Returns [updatedBlock, numberOfCanvasesCreated]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function walkBlock(block: any): Promise<[any, number]> {
  if (block.type === "excalidraw" && isDraftCanvasId(block.props?.canvasId)) {
    const result = await store.dispatch(
      canvasApi.endpoints.createCanvas.initiate({
        title: "Untitled Canvas",
        scene: null,
        metadata: null,
        lastSync: null,
        status: 1,
      })
    );
    if ("data" in result && result.data) {
      return [
        { ...block, props: { ...block.props, canvasId: String(result.data.id) } },
        1,
      ];
    }
    return [block, 0];
  }

  if (Array.isArray(block.children) && block.children.length > 0) {
    const results = await Promise.all(block.children.map(walkBlock));
    const created = results.reduce((sum, [, n]) => sum + n, 0);
    if (created > 0) {
      return [{ ...block, children: results.map(([b]) => b) }, created];
    }
  }

  return [block, 0];
}

/**
 * Finds excalidraw blocks with draft IDs (draft-<uuid>), creates real canvas
 * entries via API, and returns updated blocks with real IDs.
 * Called before explicit doc save (Ctrl+S).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function flushDraftCanvases(blocks: any[]): Promise<FlushResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasDraft = (b: any): boolean =>
    (b.type === "excalidraw" && isDraftCanvasId(b.props?.canvasId)) ||
    (Array.isArray(b.children) && b.children.some(hasDraft));

  if (!blocks.some(hasDraft)) {
    return { updatedBlocks: blocks, createdCount: 0 };
  }

  const results = await Promise.all(blocks.map(walkBlock));
  const createdCount = results.reduce((sum, [, n]) => sum + n, 0);
  const updatedBlocks = results.map(([b]) => b);

  return { updatedBlocks, createdCount };
}
