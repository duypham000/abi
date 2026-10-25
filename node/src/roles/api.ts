// tomo-node `api` role — Fastify HTTP service. Currently hosts the translate
// dictionary endpoint; the home for future Node REST APIs.
//
// Read here:
//   PORT                  default 8006
//   CACHE_TTL_SECONDS     parsed translation cache TTL (default 3 days)
//   RATE_LIMIT_WINDOW_MS  per-IP window (default 60000)
//   RATE_LIMIT_MAX        per-IP max requests / window (default 15)
//   CORS_ORIGIN           allowed origin(s) (default "*")
//   DEFAULT_SOURCE_LANG / DEFAULT_TARGET_LANG  fallback languages

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config.js';
import translateRoutes from '../translate/routes/translate.route.js';

const fastify = Fastify({
  logger: true,
  // Behind Kong/nginx — read the real client IP from X-Forwarded-For so the
  // per-IP rate limiter keys on the caller, not the proxy.
  trustProxy: true,
});

await fastify.register(cors, { origin: config.corsOrigin });

// Liveness check (support both root /health and prefixed /node/health)
fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/node/health', async () => ({ status: 'ok' }));

// Translate routes (support both standard /api/v1 and prefixed /node/api/v1, /node/v1, /node)
await fastify.register(translateRoutes, { prefix: '/api/v1' });
await fastify.register(translateRoutes, { prefix: '/node/api/v1' });
await fastify.register(translateRoutes, { prefix: '/node/v1' });
await fastify.register(translateRoutes, { prefix: '/node' });

try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(
    `[tomo-node-api] listening on :${config.port} — try /api/v1/translate?q=run&sl=en&tl=vi`,
  );
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
