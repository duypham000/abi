import { parseDocMetadata } from "@/core/interfaces/docs";

/**
 * Utility hashing SHA-256 (FIPS 180-4) đồng bộ thuần JS + canonicalization cho dữ liệu tài liệu.
 * Đảm bảo hash nhất quán trên mọi môi trường (Tauri, Web HTTP/HTTPS) và không có async race.
 */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const textEncoder = new TextEncoder();

function rotr(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

/**
 * Tính SHA-256 đồng bộ theo chuẩn FIPS 180-4, trả về chuỗi hex 64 ký tự viết thường.
 */
export function sha256Sync(text: string): string {
  const msg = textEncoder.encode(text);
  const msgLen = msg.length;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(msg);
  padded[msgLen] = 0x80;

  const bitLen = msgLen * 8;
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, hi, false);
  view.setUint32(paddedLen - 4, lo, false);

  const hash = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += hash[i].toString(16).padStart(8, "0");
  }
  return hex;
}

export async function sha256(text: string): Promise<string> {
  return sha256Sync(text);
}

/**
 * Serialize JSON theo thứ tự key cố định (deterministic), bỏ qua property undefined.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return stableStringify((value as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined || typeof item === "function" || typeof item === "symbol"
        ? "null"
        : stableStringify(item)
    );
    return `[${items.join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (val === undefined || typeof val === "function" || typeof val === "symbol") {
      continue;
    }
    entries.push(`${JSON.stringify(key)}:${stableStringify(val)}`);
  }
  return `{${entries.join(",")}}`;
}

export function normalizeDocStatusValue(status: unknown): 0 | 1 {
  if (
    status === 1 ||
    status === "1" ||
    (typeof status === "string" && status.toUpperCase() === "PUBLISHED")
  ) {
    return 1;
  }
  return 0;
}

function isDefaultEmptyParagraph(block: unknown): boolean {
  if (!block || typeof block !== "object") return false;
  const b = block as Record<string, unknown>;
  if (b.type !== "paragraph") return false;
  if (Array.isArray(b.content) && b.content.length > 0) return false;
  if (b.content != null && !Array.isArray(b.content)) return false;
  if (Array.isArray(b.children) && b.children.length > 0) return false;
  if (b.children != null && !Array.isArray(b.children)) return false;

  if (b.props && typeof b.props === "object") {
    const props = b.props as Record<string, unknown>;
    for (const [key, val] of Object.entries(props)) {
      if (val === undefined) continue;
      if (key === "textColor" && val === "default") continue;
      if (key === "backgroundColor" && val === "default") continue;
      if (key === "textAlignment" && val === "left") continue;
      return false;
    }
  }
  return true;
}

/**
 * Chuẩn hóa nội dung JSON của BlockNote để tránh báo sai thay đổi khi rỗng
 * hoặc khác thứ tự key trong object.
 */
export function canonicalizeDocContent(content: string | null | undefined): string {
  if (content == null || content.trim() === "") {
    return "[]";
  }
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "[]";
      if (parsed.length === 1 && isDefaultEmptyParagraph(parsed[0])) return "[]";
      return stableStringify(parsed);
    }
    if (parsed && typeof parsed === "object") {
      return stableStringify(parsed);
    }
  } catch {
    // Plain text fallback
  }
  return content;
}

/**
 * Chuẩn hóa metadata của Doc so sánh đồng nhất giữa null, rỗng và object mặc định.
 */
export function canonicalizeDocMetadata(metadata: string | null | undefined): string {
  return stableStringify(parseDocMetadata(metadata ?? null));
}

export interface DocLocalHashFields {
  title?: string | null;
  content?: string | null;
  metadata?: string | null;
  seriesId?: number | null;
  status?: number | string | null;
}

export interface DocRemoteHashFields {
  title?: string | null;
  content?: string | null;
  status?: number | string | null;
}

/**
 * Hash toàn bộ trạng thái lưu ở SQLite local (bao gồm metadata & seriesId).
 */
export function computeDocLocalHashSync(fields: DocLocalHashFields): string {
  return sha256Sync(
    stableStringify({
      title: fields.title ?? "",
      content: canonicalizeDocContent(fields.content),
      metadata: canonicalizeDocMetadata(fields.metadata),
      seriesId: fields.seriesId ?? null,
      status: normalizeDocStatusValue(fields.status),
    })
  );
}

/**
 * Hash đúng tập trường mà Go backend lưu (title, content, status) để không lệch giả
 * khi chỉ sửa metadata/series cục bộ.
 */
export function computeDocRemoteHashSync(fields: DocRemoteHashFields): string {
  return sha256Sync(
    stableStringify({
      title: fields.title || "Untitled",
      content: canonicalizeDocContent(fields.content),
      status: normalizeDocStatusValue(fields.status),
    })
  );
}

export async function computeDocHash(fields: {
  title?: string | null;
  content?: string | null;
  metadata?: string | null;
}): Promise<string> {
  return sha256Sync(
    `${fields.title ?? ""}||${canonicalizeDocContent(fields.content)}||${canonicalizeDocMetadata(fields.metadata)}`
  );
}

export async function computeCanvasHash(fields: {
  title?: string | null;
  scene?: string | null;
  metadata?: string | null;
}): Promise<string> {
  return sha256Sync(`${fields.title ?? ""}||${fields.scene ?? ""}||${fields.metadata ?? ""}`);
}

export async function computeNoteHash(fields: {
  title?: string | null;
  content?: string | null;
  metadata?: string | null;
}): Promise<string> {
  return sha256Sync(`${fields.title ?? ""}||${fields.content ?? ""}||${fields.metadata ?? ""}`);
}
