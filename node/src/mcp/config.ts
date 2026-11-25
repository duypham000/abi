import dotenv from 'dotenv';

dotenv.config();

export interface McpConfig {
  apiBase: string;
  wsUrl: string;
  apiKey: string;
  authToken: string;
  yjsSecret: string;
  wsSyncTimeoutMs: number;
  wsMaxPayloadBytes: number;
}

function normalizeApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (
    trimmed.endsWith('/api/v1') ||
    trimmed.endsWith('/go/v1') ||
    trimmed.endsWith('/go/api/v1')
  ) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/ws/yjs')) {
    return trimmed;
  }
  return `${trimmed}/ws/yjs`;
}

export function getMcpConfig(): McpConfig {
  const rawApiBase =
    process.env.TOMO_API_BASE ||
    process.env.YJS_JAVA_BASE_URL ||
    process.env.VITE_GO_API_URL ||
    'http://127.0.0.1:8080/api/v1';

  const rawWsUrl =
    process.env.TOMO_WS_URL ||
    process.env.NODE_WS_URL ||
    process.env.VITE_NODE_WS_URL ||
    'ws://127.0.0.1:1234/ws/yjs';

  const yjsSecret =
    process.env.YJS_SERVICE_SHARED_SECRET ||
    process.env.YJS_SECRET ||
    'dev-yjs-token-secret-tomo';

  return {
    apiBase: normalizeApiBase(rawApiBase),
    wsUrl: normalizeWsUrl(rawWsUrl),
    apiKey: (process.env.TOMO_API_KEY || '').trim(),
    authToken: (process.env.TOMO_AUTH_TOKEN || process.env.TOMO_API_KEY || '').trim(),
    yjsSecret,
    wsSyncTimeoutMs: Number(process.env.MCP_YJS_TIMEOUT_MS || 8000),
    wsMaxPayloadBytes: Number(process.env.MCP_YJS_MAX_PAYLOAD_BYTES || 10 * 1024 * 1024),
  };
}
