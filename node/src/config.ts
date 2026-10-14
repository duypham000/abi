import dotenv from 'dotenv';

dotenv.config();

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Config for the `api` role (translate HTTP service). The `server`/`worker`
 * (yjs) roles read their own env inline at module init — see src/roles/*.js.
 */
export const config = {
  port: num(process.env.PORT, 8006),
  cacheTtlSeconds: num(process.env.CACHE_TTL_SECONDS, 259200), // 3 days
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 15),
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  defaultSourceLang: process.env.DEFAULT_SOURCE_LANG || 'en',
  defaultTargetLang: process.env.DEFAULT_TARGET_LANG || 'vi',
  googleEndpoint: 'https://translate.googleapis.com/translate_a/single',
  googleTimeoutMs: 8000,
} as const;
