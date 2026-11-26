import { FastifyPluginAsync } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getMcpConfig } from './config.js';
import { GoClient } from './goClient.js';
import { createTomoMcpServer } from './server.js';

export interface ExtractedCredentials {
  apiKey: string;
  authToken: string;
}

function firstHeaderString(val: string | string[] | undefined): string {
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0].trim();
  return '';
}

function isUnexpandedPlaceholder(val: string): boolean {
  return /^\$\{[^}]+\}$/.test(val.trim());
}

export function extractAuthCredentials(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown>,
  cfg = getMcpConfig(),
): ExtractedCredentials {
  const xApiKey =
    firstHeaderString(headers['x-api-key']) ||
    firstHeaderString(headers['x-agent-api-key']) ||
    (typeof query.api_key === 'string' ? query.api_key.trim() : '');
  if (xApiKey && !isUnexpandedPlaceholder(xApiKey)) {
    return { apiKey: xApiKey, authToken: '' };
  }

  const authHeader = firstHeaderString(headers.authorization);
  if (authHeader) {
    const apiKeyMatch = authHeader.match(/^ApiKey\s+(.+)$/i);
    if (apiKeyMatch && apiKeyMatch[1].trim() && !isUnexpandedPlaceholder(apiKeyMatch[1])) {
      return { apiKey: apiKeyMatch[1].trim(), authToken: '' };
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token && !isUnexpandedPlaceholder(token)) {
      if (token.startsWith('tomo_ak_')) {
        return { apiKey: token, authToken: '' };
      }
      return { apiKey: '', authToken: token };
    }
  }

  if (typeof query.token === 'string' && query.token.trim()) {
    const token = query.token.trim();
    if (!isUnexpandedPlaceholder(token)) {
      if (token.startsWith('tomo_ak_')) {
        return { apiKey: token, authToken: '' };
      }
      return { apiKey: '', authToken: token };
    }
  }

  if (cfg.apiKey) {
    return { apiKey: cfg.apiKey, authToken: '' };
  }
  return { apiKey: '', authToken: cfg.authToken };
}

const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/mcp', async (request, reply) => {
    const cfg = getMcpConfig();
    const creds = extractAuthCredentials(
      request.headers,
      (request.query as Record<string, unknown>) || {},
      cfg,
    );
    if (!creds.apiKey && !creds.authToken) {
      return reply.status(401).send({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Unauthorized: provide X-Api-Key, Authorization: Bearer <api_key|jwt>, ?api_key=, or TOMO_API_KEY',
        },
        id: null,
      });
    }

    const goClient = new GoClient({
      apiBase: cfg.apiBase,
      apiKey: creds.apiKey,
      authToken: creds.authToken,
      yjsSecret: cfg.yjsSecret,
    });
    const mcpServer = createTomoMcpServer(goClient);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.setHeader(
      'Access-Control-Expose-Headers',
      'Mcp-Session-Id',
    );
    reply.hijack();

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      reply.raw.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });
    } catch (err) {
      fastify.log.error({ err }, '[tomo-node-mcp] request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      }
    }
  });

  fastify.get('/mcp', async (_request, reply) => {
    reply.header('Allow', 'POST, DELETE');
    return reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed on stateless MCP endpoint; use POST.',
      },
      id: null,
    });
  });

  fastify.delete('/mcp', async (_request, reply) => {
    return reply.status(204).send();
  });
};

export default mcpRoutes;
