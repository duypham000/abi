// yhub worker. Drains redis streams into a Y.Doc, persists the merged document
// to the Java backend via JavaStorage, then compacts the stream. Run one or
// more workers alongside the server.
//
// Required env (read internally by @y/redis at import time):
//   REDIS            redis://:pass@host:6379
//   AUTH_PUBLIC_KEY  P-384 public key JWK (the worker re-exports server.js,
//                    which loads the key at module init even though the worker
//                    does not verify tokens itself)
// Read here / by @y/redis:
//   REDIS_PREFIX               default "yhub"
//   REDIS_TASK_DEBOUNCE        ms before a worker picks up a task (default 10000)
//   YJS_JAVA_BASE_URL          e.g. http://host:8080/api/v1/base
//   YJS_SERVICE_SHARED_SECRET  Bearer token for /yjs/internal/**
//   KEYFRAME_INTERVAL          revisions per segment (default 20)
//   RECONSTRUCT_PORT           reconstruct HTTP endpoint port (default 1236)

import { createWorker } from '@y/redis'
import { JavaStorage } from '../yjs/javaStorage.js'
import { createRevisionCallback } from '../yjs/revisions.js'
import { startReconstructServer } from '../yjs/reconstruct.js'

const redisPrefix = process.env.REDIS_PREFIX ?? 'yhub'
const baseUrl = process.env.YJS_JAVA_BASE_URL
const sharedSecret = process.env.YJS_SERVICE_SHARED_SECRET
const keyframeInterval = parseInt(process.env.KEYFRAME_INTERVAL ?? '20', 10)
const reconstructPort = parseInt(process.env.RECONSTRUCT_PORT ?? '1236', 10)

const store = new JavaStorage({ baseUrl, sharedSecret })

// After each merge (before persistDoc), append a keyframe/delta to the Java revision chain.
const updateCallback = createRevisionCallback({ baseUrl, sharedSecret, keyframeInterval })

// Host the reconstruct endpoint in-process (Java calls it to rebuild full docs from deltas).
startReconstructServer({ baseUrl, sharedSecret, port: reconstructPort })

await createWorker(store, redisPrefix, { updateCallback })
console.log(`[yhub-worker] started (prefix=${redisPrefix})`)
