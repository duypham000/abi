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

// Liveness check (not rate limited — k8s probes hit this directly on the pod).
fastify.get('/health', async () => ({ status: 'ok' }));

// Mounted at /api/v1 so the in-app path equals the public Kong path
// (api.tomoo.uk/api/v1/translate) — Kong forwards with strip-path:false, no rewrite.
await fastify.register(translateRoutes, { prefix: '/api/v1' });

try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(
    `[tomo-node-api] listening on :${config.port} — try /api/v1/translate?q=run&sl=en&tl=vi`,
  );
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
