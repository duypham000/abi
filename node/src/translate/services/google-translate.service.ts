import axios, { AxiosError } from 'axios';
import { config } from '../../config.js';
import { TranslationResult } from '../types/dictionary.js';
import { parseGoogleResponse } from '../utils/parse.js';
import { randomUserAgent } from '../utils/user-agents.js';

/** Raised when Google rate-limits us (HTTP 429). */
export class RateLimitedError extends Error {
  constructor(message = 'Upstream rate limit (Google) reached') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

/** Raised for any other upstream failure (network, 5xx, bad payload). */
export class UpstreamError extends Error {
  constructor(message = 'Failed to reach Google Translate') {
    super(message);
    this.name = 'UpstreamError';
  }
}

const CLIENTS = ['at', 'gtx'];

/**
 * Calls Google's internal translate_a/single endpoint with the full set of
 * dt flags (t, bd, md, ex) so we get the complete dictionary payload, then
 * unpacks it into a clean object. See docs/transdoc.md.
 */
export async function fetchTranslation(
  query: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslationResult> {
  let lastError: Error | null = null;

  for (const client of CLIENTS) {
    try {
      const response = await axios.get(config.googleEndpoint, {
        params: {
          client,
          sl: sourceLang,
          tl: targetLang,
          hl: targetLang, // localize POS labels ("danh từ", "động từ"...)
          q: query,
        },
        // Google needs the dt flag repeated; URLSearchParams preserves duplicates.
        paramsSerializer: (params: Record<string, string>) => {
          const search = new URLSearchParams();
          for (const key of Object.keys(params)) {
            search.append(key, params[key]);
          }
          search.append('dt', 't'); // main translation
          search.append('dt', 'bd'); // dictionary / alternatives
          search.append('dt', 'ss'); // synonyms
          search.append('dt', 'md'); // definitions
          search.append('dt', 'ex'); // examples
          return search.toString();
        },
        headers: {
          'User-Agent': randomUserAgent(),
          Accept: '*/*',
        },
        timeout: config.googleTimeoutMs,
      });

      return parseGoogleResponse(response.data, {
        query,
        sourceLang,
        targetLang,
      });
    } catch (error) {
      const axiosErr = error as AxiosError;
      if (axiosErr.response?.status === 429) {
        lastError = new RateLimitedError();
        continue;
      }
      lastError = new UpstreamError(axiosErr.message);
    }
  }

  throw lastError || new UpstreamError();
}
