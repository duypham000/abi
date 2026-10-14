# Tomo Translate Service

A small **Node.js + TypeScript (Express)** service that proxies Google
Translate's hidden `translate_a/single` dictionary API and returns clean JSON to
a frontend (e.g. React). It implements the anti-ban defenses described in
`ratelimit.md`: in-memory caching, per-IP rate limiting and User-Agent rotation.

## Features

- **Full dictionary** — main translation, alternative translations grouped by
  part of speech, synonyms (with register labels), definitions and example
  sentences (`dt=t,bd,ss,md,ex`).
- **In-memory cache** (`node-cache`, default 3-day TTL) — repeat lookups cost
  zero requests to Google.
- **Per-IP rate limiting** (`express-rate-limit`, default 15 req/min).
- **Random User-Agent rotation** on every upstream request.

## Setup

```bash
npm install
cp .env.example .env   # adjust if needed
npm run dev            # hot-reload dev server on port 8006
```

For production:

```bash
npm run build
npm start
```

## Configuration (`.env`)

| Variable               | Default  | Description                                |
| ---------------------- | -------- | ------------------------------------------ |
| `PORT`                 | `8006`   | HTTP port                                  |
| `CACHE_TTL_SECONDS`    | `259200` | Cache lifetime per entry (3 days)          |
| `RATE_LIMIT_WINDOW_MS` | `60000`  | Rate-limit window                          |
| `RATE_LIMIT_MAX`       | `15`     | Max requests per IP per window             |
| `CORS_ORIGIN`          | `*`      | Allowed CORS origin                        |
| `DEFAULT_SOURCE_LANG`  | `en`     | Default `sl` when not supplied             |
| `DEFAULT_TARGET_LANG`  | `vi`     | Default `tl` when not supplied             |

## API

### `GET /api/translate`

| Query | Required | Default | Description            |
| ----- | -------- | ------- | ---------------------- |
| `q`   | yes      | —       | Word/phrase to look up |
| `sl`  | no       | `en`    | Source language        |
| `tl`  | no       | `vi`    | Target language        |

Example:

```bash
curl "http://localhost:8006/api/translate?q=run&sl=en&tl=vi"
```

Response shape:

```jsonc
{
  "query": "run",
  "sourceLang": "en",
  "targetLang": "vi",
  "detectedSourceLanguage": "en",
  "mainTranslation": "chạy",
  "originalText": "run",
  "dictionary": [
    {
      "partOfSpeech": "động từ",
      "terms": ["chạy", "vận hành", "hoạt động"],
      "entries": [
        { "word": "chạy", "reverseTranslations": ["run", "operate", "race"], "score": 0.8 }
      ]
    }
  ],
  "definitions": [
    { "partOfSpeech": "verb", "items": [{ "definition": "...", "example": "..." }] }
  ],
  "synonyms": [
    {
      "partOfSpeech": "adjective",
      "clusters": [
        { "synonyms": ["contented", "cheerful", "joyful"] },
        { "register": "informal", "synonyms": ["chirpy", "tickled pink"] }
      ]
    }
  ],
  "examples": ["..."],
  "cached": false
}
```

`cached` is `true` when the result was served from the in-memory cache.

### `GET /health`

```json
{ "status": "ok" }
```

## Frontend notes (not implemented here)

Per `ratelimit.md` §1, the React client should also:

- **Debounce** input ~500–800ms (or translate only on Enter / button click).
- Keep a **client-side cache** so re-querying a word doesn't hit the server.

## Future scaling (`ratelimit.md` §3)

- Swap the in-memory cache for **Redis** (keep `cache.service.ts`'s
  getter/setter signatures) to share across instances.
- Add **proxy rotation** in `google-translate.service.ts` for very high volume.
