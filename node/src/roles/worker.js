// yhub worker. Drains redis streams into a Y.Doc, persists the merged document
// to the backend via JavaStorage, then compacts the stream. Run one or
// more workers alongside the server.

import 'dotenv/config'

if (!process.env.AUTH_PUBLIC_KEY && !process.env['auth-public-key']) {
  process.env.AUTH_PUBLIC_KEY = JSON.stringify({
    kty: 'EC',
    x: 'aUfgT3waVAQ-qprg-mzNcGIjXGc6808bgnIPeGQBAbcLInPgVaYCTFo2OB1yBmv_',
    y: '5gv7QwZ_D8AGw8Je0Gay8zDZhBux7oDocND2cCN4H9Z77Vdr1G2ANM98x0bO7um5',
    crv: 'P-384',
    key_ops: ['verify']
  })
}
if (!process.env.REDIS) {
  process.env.REDIS = 'redis://127.0.0.1:6379'
}

import { createWorker } from '@y/redis'
import { JavaStorage } from '../yjs/javaStorage.js'
import { createRevisionCallback } from '../yjs/revisions.js'
import { startReconstructServer } from '../yjs/reconstruct.js'

const redisPrefix = process.env.REDIS_PREFIX ?? 'yhub'
const baseUrl = process.env.YJS_JAVA_BASE_URL ?? 'http://127.0.0.1:8080/api/v1'
const sharedSecret = process.env.YJS_SERVICE_SHARED_SECRET ?? process.env.YJS_SECRET ?? 'tomo-local-dev-yjs-token-secret-2026'
const keyframeInterval = parseInt(process.env.KEYFRAME_INTERVAL ?? '20', 10)
const reconstructPort = parseInt(process.env.RECONSTRUCT_PORT ?? '1236', 10)

const store = new JavaStorage({ baseUrl, sharedSecret })

// After each merge (before persistDoc), append a keyframe/delta to the revision chain.
const updateCallback = createRevisionCallback({ baseUrl, sharedSecret, keyframeInterval })

// Host the reconstruct endpoint in-process (Go calls it to rebuild full docs from deltas).
startReconstructServer({ baseUrl, sharedSecret, port: reconstructPort })

await createWorker(store, redisPrefix, { updateCallback })
console.log(`[yhub-worker] started (prefix=${redisPrefix})`)
