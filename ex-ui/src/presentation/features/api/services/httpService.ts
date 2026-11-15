import type {
  ApiRequest,
  ApiResponse,
  ApiEnvironment,
  AuthBasic,
  AuthDigest,
  AuthApiKey,
  AuthJwt,
} from "../types/rest";
import type { KeyValueRow } from "../types/common";

// ─── MD5 (pure-JS, RFC 1321) ──────────────────────────────────────────────────
function md5(str: string): string {
  const msg = new TextEncoder().encode(str);
  const origLen = msg.length;
  const zeros = (64 - (origLen + 9) % 64) % 64;
  const buf = new Uint8Array(origLen + 1 + zeros + 8);
  buf.set(msg);
  buf[origLen] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, (origLen * 8) >>> 0, true);
  view.setUint32(buf.length - 4, Math.floor(origLen / 0x20000000), true);

  const K = Array.from({ length: 64 }, (_, i) =>
    ((Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0)
  );
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let o = 0; o < buf.length; o += 64) {
    const M = Array.from({ length: 16 }, (_, j) => view.getUint32(o + j * 4, true));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16)      { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;           g = (3 * i + 5) % 16; }
      else             { F = C ^ (B | ~D);         g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }

  const le = (n: number) =>
    [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return le(a0) + le(b0) + le(c0) + le(d0);
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function toBase64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(auth: AuthJwt): Promise<string> {
  const header = { alg: auth.algorithm, typ: "JWT" };
  const signingInput = `${toBase64url(JSON.stringify(header))}.${toBase64url(auth.payload)}`;
  const keyBytes = auth.isBase64Encoded
    ? Uint8Array.from(atob(auth.secret), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(auth.secret);
  const algoMap: Record<string, string> = {
    HS256: "SHA-256",
    HS384: "SHA-384",
    HS512: "SHA-512",
  };
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: algoMap[auth.algorithm] ?? "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${toBase64url(new Uint8Array(sig))}`;
}

// ─── Response builder ─────────────────────────────────────────────────────────
function buildApiResponse(res: Response, body: string, timeMs: number): ApiResponse {
  const sizeBytes = new TextEncoder().encode(body).length;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { status: res.status, statusText: res.statusText, headers, body, timeMs, sizeBytes };
}

// ─── Digest Auth ──────────────────────────────────────────────────────────────
async function executeDigestAuth(
  request: ApiRequest,
  urlObj: URL,
  headers: Headers,
  body: BodyInit | undefined,
  signal: AbortSignal,
  auth: AuthDigest,
  allVars: KeyValueRow[]
): Promise<ApiResponse> {
  const method = request.method;

  // Round 1: get the challenge
  const t1 = Date.now();
  const res1 = await fetch(urlObj.toString(), { method, headers, signal });
  const time1 = Date.now() - t1;

  if (res1.status !== 401) {
    return buildApiResponse(res1, await res1.text(), time1);
  }

  const wwwAuth = res1.headers.get("WWW-Authenticate") ?? "";
  if (!wwwAuth.toLowerCase().startsWith("digest")) {
    return buildApiResponse(res1, await res1.text(), time1);
  }

  await res1.text(); // drain body

  const param = (key: string) => {
    const m = wwwAuth.match(new RegExp(`${key}="([^"]*)"`, "i"));
    return m?.[1] ?? "";
  };

  const realm  = param("realm");
  const nonce  = param("nonce");
  const opaque = param("opaque");
  const qop    = param("qop") || "auth";
  const algo   = param("algorithm") || auth.algorithm || "MD5";
  const uri    = urlObj.pathname + urlObj.search;
  const cnonce = Math.random().toString(36).substring(2, 10);
  const nc     = "00000001";

  const username = interpolateVariables(auth.username, allVars);
  const password = interpolateVariables(auth.password, allVars);

  let ha1 = md5(`${username}:${realm}:${password}`);
  if (algo.toUpperCase() === "MD5-SESS") ha1 = md5(`${ha1}:${nonce}:${cnonce}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const authHeader =
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `cnonce="${cnonce}", nc=${nc}, qop=${qop}, response="${response}"` +
    (opaque ? `, opaque="${opaque}"` : "") +
    `, algorithm=${algo}`;

  headers.set("Authorization", authHeader);

  // Round 2: actual request
  const t2 = Date.now();
  const res2 = await fetch(urlObj.toString(), {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : body,
    signal,
  });
  return buildApiResponse(res2, await res2.text(), Date.now() - t2);
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function interpolateVariables(template: string, vars: KeyValueRow[]): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const found = vars.find((v) => v.enabled && v.key === name);
    return found ? found.value : `{{${name}}}`;
  });
}

export async function executeRequest(
  request: ApiRequest,
  activeEnv: ApiEnvironment | null,
  signal: AbortSignal
): Promise<ApiResponse> {
  const allVars: KeyValueRow[] = [
    ...(activeEnv?.variables.filter((v) => v.enabled) ?? []),
    ...request.variables.filter((v) => v.enabled),
  ];

  // 1. Build URL
  const rawUrl = interpolateVariables(request.url, allVars);
  const fullUrl = rawUrl.match(/^https?:\/\//) ? rawUrl : `https://${rawUrl}`;
  const urlObj = new URL(fullUrl);

  // 2. Append params
  request.params
    .filter((p) => p.enabled && p.key)
    .forEach((p) =>
      urlObj.searchParams.append(
        interpolateVariables(p.key, allVars),
        interpolateVariables(p.value, allVars)
      )
    );

  // 3. Build headers
  const headers = new Headers();
  request.headers
    .filter((h) => h.enabled && h.key)
    .forEach((h) =>
      headers.set(
        interpolateVariables(h.key, allVars),
        interpolateVariables(h.value, allVars)
      )
    );

  // 4. Build body (before auth so digest can resend it)
  let body: BodyInit | undefined;
  const bt = request.body.type;

  if (["application/json", "application/xml", "text/html", "text/plain"].includes(bt)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", bt);
    body = interpolateVariables(request.body.content, allVars);
  } else if (bt === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams();
    (request.body.urlEncoded ?? [])
      .filter((r) => r.enabled && r.key)
      .forEach((r) =>
        params.append(
          interpolateVariables(r.key, allVars),
          interpolateVariables(r.value, allVars)
        )
      );
    body = params;
  } else if (bt === "multipart/form-data") {
    const fd = new FormData();
    (request.body.formData ?? [])
      .filter((r) => r.enabled && r.key)
      .forEach((r) => fd.append(r.key, r.value));
    body = fd;
  } else if (bt === "application/octet-stream" && request.body.binaryFile) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
    body = request.body.binaryFile;
  }

  // 5. Apply auth
  const auth = request.auth;

  if (auth.type === "bearer" && "token" in auth && auth.token) {
    headers.set("Authorization", `Bearer ${interpolateVariables(auth.token, allVars)}`);
  } else if (auth.type === "basic" && "username" in auth) {
    const user = interpolateVariables((auth as AuthBasic).username, allVars);
    const pass = interpolateVariables((auth as AuthBasic).password, allVars);
    headers.set("Authorization", `Basic ${btoa(`${user}:${pass}`)}`);
  } else if (auth.type === "digest" && "username" in auth) {
    return executeDigestAuth(request, urlObj, headers, body, signal, auth as AuthDigest, allVars);
  } else if (auth.type === "api-key" && "key" in auth) {
    const k = interpolateVariables((auth as AuthApiKey).key, allVars);
    const v = interpolateVariables((auth as AuthApiKey).value, allVars);
    if ((auth as AuthApiKey).addTo === "headers") {
      headers.set(k, v);
    } else {
      urlObj.searchParams.set(k, v);
    }
  } else if (auth.type === "jwt" && "secret" in auth) {
    const jwtAuth = auth as AuthJwt;
    const token = await signJwt(jwtAuth);
    const paramName = interpolateVariables(jwtAuth.paramName || "Authorization", allVars);
    headers.set(paramName, `${jwtAuth.headerPrefix || "Bearer"} ${token}`);
  }

  // 6. Fetch
  const startTime = Date.now();
  const res = await fetch(urlObj.toString(), {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : body,
    signal,
  });
  return buildApiResponse(res, await res.text(), Date.now() - startTime);
}
