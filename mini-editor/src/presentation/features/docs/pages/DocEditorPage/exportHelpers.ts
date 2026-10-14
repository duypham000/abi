import type { DocDto } from "@/core/interfaces/docs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function blocksToMarkdown(editor: any, blocks?: any[]): Promise<string> {
  const src = blocks ?? editor?.document ?? [];
  return await editor.blocksToMarkdownLossy(src);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function blocksToHTML(editor: any, blocks?: any[]): Promise<string> {
  const src = blocks ?? editor?.document ?? [];
  return await editor.blocksToFullHTML(src);
}

export function docToSnapshot(doc: DocDto): string {
  return JSON.stringify(
    {
      title: doc.title,
      content: doc.content,
      metadata: doc.metadata,
    },
    null,
    2
  );
}

export async function captureElementAsPNG(element: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(element).backgroundColor || "#ffffff",
    scale: window.devicePixelRatio || 1,
    useCORS: true,
  });
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to render PNG"));
    }, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}
