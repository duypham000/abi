import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../../config.js';
import { translate } from '../controllers/translate.controller.js';

/**
 * Encapsulated plugin: the per-IP rate limiter is registered in this scope so
 * it guards only the translate route(s), leaving /health (registered at the
 * root in api.ts) unthrottled for k8s probes.
 */
export default async function translateRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });

  fastify.get(
    '/translate',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            sl: { type: 'string' },
            tl: { type: 'string' },
          },
        },
      },
    },
    translate,
  );
}
