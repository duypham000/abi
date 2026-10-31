// yhub WS server (stateless). Accepts websocket connections, authenticates the
// `yauth` JWT (supports both HS256 via YJS_SERVICE_SHARED_SECRET and ES384/P-384 via AUTH_PUBLIC_KEY),
// and distributes updates via redis streams. Document state is loaded/saved
// through the JavaStorage provider.

import 'dotenv/config'

// Fallback env vars required by @y/redis imports
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

import * as uws from 'uws'
import * as jose from 'jose'
import { registerYWebsocketServer } from '@y/redis'
import { JavaStorage } from '../yjs/javaStorage.js'

// Priority: YJS_PORT -> NODE_YJS_PORT -> (server role PORT) -> 1234
const port = parseInt(
  process.env.YJS_PORT ??
  process.env.NODE_YJS_PORT ??
  (process.env.YHUB_ROLE === 'server' ? (process.env.PORT ?? '1234') : '1234'),
  10
)
const redisPrefix = process.env.REDIS_PREFIX ?? 'yhub'
const checkPermCallbackUrl = process.env.AUTH_PERM_CALLBACK ?? 'http://127.0.0.1:8080/api/v1/yjs/auth/perm'
const baseUrl = process.env.YJS_JAVA_BASE_URL ?? 'http://127.0.0.1:8080/api/v1'
const sharedSecret = process.env.YJS_SERVICE_SHARED_SECRET ?? process.env.YJS_SECRET ?? 'tomo-local-dev-yjs-token-secret-2026'

const store = new JavaStorage({
  baseUrl,
  sharedSecret
})

function extractRoom(req) {
  let room = req.getParameter(0)
  if (!room) {
    const url = req.getUrl()
    const m = url.match(/(?:^|\/)(doc-[a-zA-Z0-9_\-]+|canvas-[a-zA-Z0-9_\-]+)/)
    if (m) room = m[1]
  }
  return room
}

function extractToken(req) {
  const headerWsProtocol = req.getHeader('sec-websocket-protocol')
  if (headerWsProtocol) {
    const m = /(^|,)yauth-(((?!,).)*)/.exec(headerWsProtocol)
    if (m && m[2]) return m[2]
  }
  return req.getQuery('yauth') || null
}

async function verifyToken(token) {
  if (!token) return null

  // 1. Verify HS256 with sharedSecret (Go backend default)
  if (sharedSecret) {
    try {
      const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(sharedSecret))
      return payload
    } catch {
      // not HS256 with sharedSecret
    }
  }

  // 2. Verify ES384 with AUTH_PUBLIC_KEY (P-384 JWK)
  if (process.env.AUTH_PUBLIC_KEY) {
    try {
      const jwk = typeof process.env.AUTH_PUBLIC_KEY === 'string'
        ? JSON.parse(process.env.AUTH_PUBLIC_KEY)
        : process.env.AUTH_PUBLIC_KEY
      const publicKey = await jose.importJWK(jwk, 'ES384')
      const { payload } = await jose.jwtVerify(token, publicKey)
      return payload
    } catch {
      // not ES384 with AUTH_PUBLIC_KEY
    }
  }

  // 3. Fallback: decode without verification for local development
  try {
    return jose.decodeJwt(token)
  } catch {
    return null
  }
}

const checkAuth = async (req) => {
  const room = extractRoom(req)
  if (!room) {
    throw new Error('Room not found in request path')
  }

  const token = extractToken(req)
  const userToken = await verifyToken(token)

  const isDev = process.env.APP_ENV === 'development' || !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
  if (!userToken) {
    if (isDev) {
      return { hasWriteAccess: true, room, userid: 'dev-guest' }
    }
    throw new Error('Missing or invalid yauth token')
  }

  const userid = String(userToken.user_id || userToken.yuserid || userToken.sub || userToken.userId || 'user')
  const accessMode = String(userToken.access_mode || userToken.yaccess || 'write')
  let hasWriteAccess = accessMode === 'write' || accessMode === 'rw'

  if (checkPermCallbackUrl && userid) {
    try {
      const base = checkPermCallbackUrl.replace(/\/+$/, '')
      const permUrl = `${base}/${room}/${encodeURIComponent(userid)}`
      const res = await fetch(permUrl)
      if (res.ok) {
        const perm = await res.json()
        if (perm && perm.yaccess != null) {
          hasWriteAccess = perm.yaccess === 'rw'
        }
      }
    } catch (e) {
      // Keep mode from token if callback endpoint is unreachable
    }
  }

  return { hasWriteAccess, room, userid }
}

const app = uws.App({})

// Register all supported WebSocket paths:
// - `/:room` (standard y-redis root route, e.g. /doc-1)
// - `/ws/yjs/:room` (Vite dev proxy and explicit /ws/yjs path, e.g. /ws/yjs/doc-1)
// - `/ws/:room` (alternative prefix, e.g. /ws/doc-1)
await registerYWebsocketServer(app, '/:room', store, checkAuth, { redisPrefix })
await registerYWebsocketServer(app, '/ws/yjs/:room', store, checkAuth, { redisPrefix })
await registerYWebsocketServer(app, '/ws/:room', store, checkAuth, { redisPrefix })

// Health checks
app.get('/health', (res) => {
  res.writeStatus('200 OK')
     .writeHeader('Content-Type', 'application/json')
     .end(JSON.stringify({ status: 'ok', role: 'server', prefix: redisPrefix }))
})

app.get('/ws/yjs/health', (res) => {
  res.writeStatus('200 OK')
     .writeHeader('Content-Type', 'application/json')
     .end(JSON.stringify({ status: 'ok', role: 'server', prefix: redisPrefix }))
})

// HTTP fallback: return 426 Upgrade Required for non-WebSocket GETs to document paths
// to prevent client confusion from an accidental 200 OK
app.get('/*', (res) => {
  res.writeStatus('426 Upgrade Required')
     .writeHeader('Content-Type', 'text/plain')
     .end('WebSocket Upgrade Required')
})

await new Promise((resolve, reject) => {
  app.listen(port, (token) => {
    if (token) {
      console.log(`[yhub-server] listening on :${port} (prefix=${redisPrefix}) routes=[/:room, /ws/yjs/:room, /ws/:room]`)
      resolve()
    } else {
      const err = new Error(`[yhub-server] Failed to listen to port ${port}`)
      reject(err)
    }
  })
})
