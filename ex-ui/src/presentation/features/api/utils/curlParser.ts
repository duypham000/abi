import { nanoid } from "nanoid";
import type { ApiRequest, HttpMethod, BodyType, Auth } from "../types/rest";
import { createDefaultRequest } from "../types/rest";

function unquote(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;

    const ch = input[i];
    if (ch === "'" || ch === '"') {
      let end = i + 1;
      while (end < input.length && input[end] !== ch) {
        if (input[end] === "\\") end++;
        end++;
      }
      tokens.push(input.slice(i, end + 1));
      i = end + 1;
    } else if (ch === "$" && input[i + 1] === "'") {
      // ANSI-C quoting $'...'
      let end = i + 2;
      while (end < input.length && input[end] !== "'") {
        if (input[end] === "\\") end++;
        end++;
      }
      tokens.push(input.slice(i + 1, end + 1));
      i = end + 1;
    } else {
      let end = i;
      while (end < input.length && !/\s/.test(input[end])) end++;
      tokens.push(input.slice(i, end));
      i = end;
    }
  }
  return tokens;
}

export function parseCurl(input: string): Partial<ApiRequest> {
  const trimmed = input.trim().replace(/\\\s*\n/g, " ");
  const tokens = tokenize(trimmed);

  if (!tokens.length || tokens[0].toLowerCase() !== "curl") {
    return {};
  }

  const result: Partial<ApiRequest> & { body?: ApiRequest["body"]; auth?: Auth } = {};
  const headers: Array<{ id: string; key: string; value: string; enabled: boolean; description: string }> = [];
  let method: HttpMethod | undefined;
  let body: string | undefined;
  let bodyType: BodyType = "none";
  let url: string | undefined;
  let basicUsername: string | undefined;
  let basicPassword: string | undefined;

  let i = 1;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === "-X" || tok === "--request") {
      method = unquote(tokens[++i]) as HttpMethod;
    } else if (tok === "-H" || tok === "--header") {
      const raw = unquote(tokens[++i]);
      const sep = raw.indexOf(":");
      if (sep !== -1) {
        const key = raw.slice(0, sep).trim();
        const value = raw.slice(sep + 1).trim();
        headers.push({ id: nanoid(), key, value, enabled: true, description: "" });
      }
    } else if (
      tok === "-d" ||
      tok === "--data" ||
      tok === "--data-raw" ||
      tok === "--data-binary" ||
      tok === "--data-ascii"
    ) {
      body = unquote(tokens[++i]);
    } else if (tok === "--json") {
      body = unquote(tokens[++i]);
      // Ensure Content-Type: application/json is set
      if (!headers.find((h) => h.key.toLowerCase() === "content-type")) {
        headers.push({ id: nanoid(), key: "Content-Type", value: "application/json", enabled: true, description: "" });
      }
    } else if (tok === "-u" || tok === "--user") {
      const creds = unquote(tokens[++i]);
      const sep = creds.indexOf(":");
      if (sep !== -1) {
        basicUsername = creds.slice(0, sep);
        basicPassword = creds.slice(sep + 1);
      } else {
        basicUsername = creds;
        basicPassword = "";
      }
    } else if (tok === "--url") {
      url = unquote(tokens[++i]);
    } else if (!tok.startsWith("-") && !url) {
      url = unquote(tok);
    } else if (
      tok === "-L" || tok === "--location" ||
      tok === "-s" || tok === "--silent" ||
      tok === "-v" || tok === "--verbose" ||
      tok === "-i" || tok === "--include" ||
      tok === "-k" || tok === "--insecure" ||
      tok === "--compressed"
    ) {
      // skip flags with no value
    } else if (
      tok === "-o" || tok === "--output" ||
      tok === "-A" || tok === "--user-agent" ||
      tok === "--connect-timeout" ||
      tok === "--max-time" ||
      tok === "-e" || tok === "--referer"
    ) {
      i++; // skip flag + value
    }

    i++;
  }

  if (url) result.url = url;

  if (body !== undefined) {
    const ctHeader = headers.find((h) => h.key.toLowerCase() === "content-type");
    const ct = ctHeader?.value ?? "";

    if (ct.includes("application/json") || (ct === "" && body.trimStart().startsWith("{"))) {
      bodyType = "application/json";
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      bodyType = "application/x-www-form-urlencoded";
    } else if (ct.includes("text/")) {
      bodyType = "text/plain";
    } else {
      bodyType = "application/json";
    }

    result.body = { type: bodyType, content: body };
    if (!method) method = "POST";
  }

  if (method) result.method = method;
  if (headers.length) result.headers = headers;

  if (basicUsername !== undefined) {
    result.auth = { type: "basic", username: basicUsername, password: basicPassword ?? "" };
  }

  const base = createDefaultRequest();
  return {
    ...base,
    ...result,
    body: result.body ?? base.body,
    headers: result.headers ?? base.headers,
    auth: result.auth ?? base.auth,
  };
}
