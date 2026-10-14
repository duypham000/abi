import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config.js';
import { cacheKey, getCached, setCached } from '../services/cache.service.js';
import {
  fetchTranslation,
  RateLimitedError,
  UpstreamError,
} from '../services/google-translate.service.js';

const MAX_QUERY_LENGTH = 1000;

export interface TranslateQuery {
  q?: string;
  sl?: string;
  tl?: string;
}

/**
 * GET /api/translate?q=run&sl=en&tl=vi
 * Returns the full dictionary result, served from cache when available.
 */
export async function translate(
  request: FastifyRequest<{ Querystring: TranslateQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const rawQuery = (request.query.q ?? '').toString();
  const query = rawQuery.trim();
  const sourceLang = (request.query.sl ?? config.defaultSourceLang).toString();
  const targetLang = (request.query.tl ?? config.defaultTargetLang).toString();

  if (!query) {
    reply.code(400).send({ error: 'Query parameter "q" is required.' });
    return;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    reply.code(400).send({
      error: `Query too long (max ${MAX_QUERY_LENGTH} characters).`,
    });
    return;
  }

  const key = cacheKey(sourceLang, targetLang, query);

  const cached = getCached(key);
  if (cached) {
    reply.send({ ...cached, cached: true });
    return;
  }

  try {
    const result = await fetchTranslation(query, sourceLang, targetLang);
    setCached(key, result);
    reply.send({ ...result, cached: false });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      reply.code(429).send({
        error: 'Upstream translation service is rate limiting. Try again later.',
      });
      return;
    }
    if (error instanceof UpstreamError) {
      reply.code(502).send({ error: 'Failed to reach the translation service.' });
      return;
    }
    reply.code(500).send({ error: 'Unexpected error.' });
  }
}
