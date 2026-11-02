/**
 * Utility hashing SHA-256 dùng WebCrypto API tích hợp sẵn.
 * Nhanh, chuẩn xác cao, không phụ thuộc thư viện ngoài.
 */

export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeDocHash(fields: {
  title?: string | null;
  content?: string | null;
  metadata?: string | null;
}): Promise<string> {
  return sha256(`${fields.title ?? ""}||${fields.content ?? ""}||${fields.metadata ?? ""}`);
}

export async function computeCanvasHash(fields: {
  title?: string | null;
  scene?: string | null;
  metadata?: string | null;
}): Promise<string> {
  return sha256(`${fields.title ?? ""}||${fields.scene ?? ""}||${fields.metadata ?? ""}`);
}

export async function computeNoteHash(fields: {
  title?: string | null;
  content?: string | null;
  metadata?: string | null;
}): Promise<string> {
  return sha256(`${fields.title ?? ""}||${fields.content ?? ""}||${fields.metadata ?? ""}`);
}

