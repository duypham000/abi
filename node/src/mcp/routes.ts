import { FastifyPluginAsync } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getMcpConfig } from './config.js';
import { GoClient } from './goClient.js';
import { createTomoMcpServer } from './server.js';

function extractAuthToken(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown>,
): string {
  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  if (typeof query.token === 'string' && query.token.trim()) {
    return query.token.trim();
  }
  return getMcpConfig().authToken;
}

const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/mcp', async (request, reply) => {
    const token = extractAuthToken(
      request.headers,
      (request.query as Record<string, unknown>) || {},
    );
    if (!token) {
      return reply.status(401).send({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: provide Authorization: Bearer <jwt>, ?token=, or TOMO_AUTH_TOKEN',
        },
        id: null,
      });
    }

    const cfg = getMcpConfig();
    const goClient = new GoClient({
      apiBase: cfg.apiBase,
      authToken: token,
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
