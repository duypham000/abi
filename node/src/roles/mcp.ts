import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getMcpConfig } from '../mcp/config.js';
import { GoClient } from '../mcp/goClient.js';
import { createTomoMcpServer } from '../mcp/server.js';

async function main() {
  const cfg = getMcpConfig();
  if (!cfg.authToken) {
    console.error(
      '[tomo-node-mcp] Warning: TOMO_AUTH_TOKEN is empty. Protected Go backend calls will fail unless authenticated.',
    );
  }

  const goClient = new GoClient({
    apiBase: cfg.apiBase,
    authToken: cfg.authToken,
    yjsSecret: cfg.yjsSecret,
  });

  const server = createTomoMcpServer(goClient);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[tomo-node-mcp] stdio MCP server ready (apiBase=${cfg.apiBase}, wsUrl=${cfg.wsUrl})`,
  );
}

main().catch((err) => {
  console.error('[tomo-node-mcp] fatal error:', err);
  process.exit(1);
});
