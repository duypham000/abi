// yhub WS server (stateless). Accepts websocket connections, authenticates the
// `yauth` JWT (ES384/P-384, verified internally by @y/redis using AUTH_PUBLIC_KEY),
// and distributes updates via redis streams. Document state is loaded/saved
// through the JavaStorage provider.
//
// Required env (read internally by @y/redis at import time):
//   REDIS            redis://:pass@host:6379
//   AUTH_PUBLIC_KEY  P-384 public key as a JWK JSON string
// Read here:
//   PORT                       default 1235
//   REDIS_PREFIX               default "yhub"
//   AUTH_PERM_CALLBACK         e.g. http://host:8080/yjs/auth/perm
//   YJS_JAVA_BASE_URL          e.g. http://host:8080/api/v1/base
//   YJS_SERVICE_SHARED_SECRET  Bearer token for /yjs/internal/**

import { createYWebsocketServer } from '@y/redis'
import { JavaStorage } from '../yjs/javaStorage.js'

const port = parseInt(process.env.PORT ?? '1235', 10)
const redisPrefix = process.env.REDIS_PREFIX ?? 'yhub'
const checkPermCallbackUrl = process.env.AUTH_PERM_CALLBACK

if (!checkPermCallbackUrl) {
  throw new Error('AUTH_PERM_CALLBACK is required')
}

const store = new JavaStorage({
  baseUrl: process.env.YJS_JAVA_BASE_URL,
  sharedSecret: process.env.YJS_SERVICE_SHARED_SECRET
})

await createYWebsocketServer({ port, store, checkPermCallbackUrl, redisPrefix })
console.log(`[yhub-server] listening on :${port} (prefix=${redisPrefix})`)
