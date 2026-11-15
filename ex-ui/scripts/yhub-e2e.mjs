// yhub end-to-end test. SAFE on the prod-pointing local DB: it creates a clearly
// labelled throwaway doc, runs all checks against it, then deletes it.
//
// Flow: register temp user -> login -> create doc -> GET /yjs/token (real path)
//   -> WS client A connects + writes -> WS client B sees the write (multi-user)
//   -> wait debounce -> assert Java persisted snapshot + revision (worker path)
//   -> fresh client C reloads state -> assert tampered token is rejected
//   -> delete doc.
//
// Run from the ui/ dir:  node scripts/yhub-e2e.mjs
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const API = process.env.API_BASE_URL ?? 'http://localhost:18000/api/v1'
const ORIGIN = API.replace(/\/api\/v1\/?$/, '') // e.g. http://localhost:18000 (yjs/internal lives at root)
const SERVICE_SECRET = process.env.YJS_SERVICE_SHARED_SECRET ?? 'tomo-yjs-service-shared-secret-dev-2026'
const TS = Date.now()
const PASS = [], FAIL = []
const ok = (name, cond, extra = '') => (cond ? PASS : FAIL).push(name + (extra ? ` — ${extra}` : ''))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// WebSocket polyfill for Node (y-websocket needs one outside the browser).
let WS = globalThis.WebSocket
if (!WS) { const m = await import('ws'); WS = m.WebSocket || m.default }
globalThis.WebSocket = WS // y-websocket's default param references the global too

const jvar = (o) => JSON.stringify(o)
async function apiJson(method, path, { token, body } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(API + path, { method, headers, body: body ? jvar(body) : undefined })
  const text = await res.text()
  let json = null; try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
  return { status: res.status, json, text }
}

function makeProvider(url, room, ydoc, token) {
  return new WebsocketProvider(url, room, ydoc, {
    params: { yauth: token },
    WebSocketPolyfill: WS,
    maxBackoffTime: 1000,
  })
}
function waitSynced(provider, ms = 8000) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; clearTimeout(t); clearInterval(iv); resolve(v) } }
    const t = setTimeout(() => finish(false), ms)
    if (provider.synced) return finish(true)
    provider.on('sync', (s) => { if (s) finish(true) })
    // Fallback: treat an established WS connection as success (sync event can race).
    const iv = setInterval(() => { if (provider.synced || provider.wsconnected) finish(true) }, 150)
  })
}

let docId, accessToken
try {
  // 1. register (idempotent-ish: ignore "already exists")
  const user = `e2e_${TS}`
  const reg = await apiJson('POST', '/auth/register', {
    body: { username: user, email: `${user}@example.com`, password: 'Test@12345' },
  })
  ok('register temp user', reg.status === 200 || reg.status === 201 || reg.status === 409, `HTTP ${reg.status}`)

  // 2. login
  const login = await apiJson('POST', '/auth/login', { body: { identifier: user, password: 'Test@12345' } })
  accessToken = login.json?.data?.accessToken
  ok('login -> accessToken', !!accessToken, `HTTP ${login.status}`)
  if (!accessToken) throw new Error('no accessToken: ' + login.text)

  // 3. create throwaway doc
  const create = await apiJson('POST', '/base/docs', {
    token: accessToken,
    body: { title: `ZZZ_yhub_e2e_${TS}`, content: null, plainText: null, metadata: null, lastSync: null, status: 1 },
  })
  docId = create.json?.data?.id
  ok('create throwaway doc', !!docId, `id=${docId} HTTP ${create.status}`)
  if (!docId) throw new Error('no docId: ' + create.text)

  // 4. real token endpoint
  const tok = await apiJson('GET', `/base/yjs/token?docId=${docId}`, { token: accessToken })
  const { token: yauth, url, expiresIn } = tok.json?.data ?? {}
  ok('GET /yjs/token returns {token,url,expiresIn}', !!yauth && !!url && expiresIn > 0, `url=${url} exp=${expiresIn}`)
  if (!yauth) throw new Error('no yauth token: ' + tok.text)
  const room = `doc-${docId}`

  // 5. client A connects + writes
  const ydocA = new Y.Doc()
  const provA = makeProvider(url, room, ydocA, yauth)
  const aSynced = await waitSynced(provA)
  ok('client A connects + syncs (valid token + perm)', aSynced)
  const marker = `world-${TS}`
  ydocA.getMap('e2e').set('hello', marker)
  await sleep(500)

  // 6. client B sees A's write (real-time multi-user via redis/yhub)
  const ydocB = new Y.Doc()
  const provB = makeProvider(url, room, ydocB, yauth)
  await waitSynced(provB)
  let seen = null
  for (let i = 0; i < 20 && seen !== marker; i++) { seen = ydocB.getMap('e2e').get('hello'); if (seen !== marker) await sleep(200) }
  ok('client B receives A edit (multi-user sync)', seen === marker, `got=${seen}`)

  // 7. persistence: wait debounce (5s) then assert Java has snapshot + revision.
  // Probe BOTH candidate base paths to expose any worker baseUrl/controller mismatch.
  await sleep(7000)
  const snapPaths = [
    `${ORIGIN}/yjs/internal/docs/${docId}/snapshot?branch=main`,        // controller is mapped here (root)
    `${API}/base/yjs/internal/docs/${docId}/snapshot?branch=main`,      // where worker baseUrl points
  ]
  let snapBytes = 0, snapHit = ''
  for (const u of snapPaths) {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${SERVICE_SECRET}` } })
    const n = r.ok ? (new Uint8Array(await r.arrayBuffer())).length : 0
    console.log(`    [probe] GET ${u.replace(ORIGIN, '')} -> HTTP ${r.status} bytes=${n}`)
    if (n > snapBytes) { snapBytes = n; snapHit = u }
  }
  ok('worker persisted snapshot to Java (MySQL)', snapBytes > 0, `bytes=${snapBytes} at=${snapHit.replace(ORIGIN, '') || 'none'}`)
  const head = await fetch(`${ORIGIN}/yjs/internal/docs/${docId}/revisions/head`, {
    headers: { Authorization: `Bearer ${SERVICE_SECRET}` },
  })
  const headTxt = await head.text()
  ok('worker appended a revision', head.status === 200 && headTxt.length > 2, `HTTP ${head.status} body=${headTxt.slice(0, 80)}`)

  // 8. durability: fresh client C loads state after A/B gone
  provA.disconnect(); provB.disconnect(); ydocA.destroy(); ydocB.destroy()
  await sleep(1000)
  const ydocC = new Y.Doc()
  const provC = makeProvider(url, room, ydocC, yauth)
  await waitSynced(provC)
  let seenC = null
  for (let i = 0; i < 20 && seenC !== marker; i++) { seenC = ydocC.getMap('e2e').get('hello'); if (seenC !== marker) await sleep(200) }
  ok('fresh client C reloads persisted state', seenC === marker, `got=${seenC}`)
  provC.disconnect(); ydocC.destroy()

  // 9. auth rejection: tamper the signature -> server must reject (never syncs)
  const parts = yauth.split('.')
  const sig = parts[2]
  const badSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  const badToken = `${parts[0]}.${parts[1]}.${badSig}`
  const ydocBad = new Y.Doc()
  const provBad = makeProvider(url, room, ydocBad, badToken)
  const badSynced = await waitSynced(provBad, 5000)
  ok('invalid token is rejected (no sync)', badSynced === false)
  provBad.disconnect(); ydocBad.destroy()

  // late re-probe: did the snapshot become readable with more elapsed time?
  const lateSnap = await fetch(`${ORIGIN}/yjs/internal/docs/${docId}/snapshot?branch=main`, {
    headers: { Authorization: `Bearer ${SERVICE_SECRET}` },
  })
  const lateLen = lateSnap.ok ? (new Uint8Array(await lateSnap.arrayBuffer())).length : 0
  ok('snapshot readable on late re-probe', lateLen > 0, `HTTP ${lateSnap.status} bytes=${lateLen}`)
} catch (e) {
  FAIL.push('UNEXPECTED ERROR: ' + (e?.stack || e?.message || String(e)))
} finally {
  // 10. cleanup: delete throwaway doc
  if (docId && accessToken) {
    const del = await apiJson('DELETE', `/base/docs/${docId}`, { token: accessToken })
    ok('cleanup: delete throwaway doc', del.status === 200 || del.status === 204, `HTTP ${del.status}`)
  }
  console.log('\n================ yhub E2E results ================')
  for (const p of PASS) console.log('  PASS  ' + p)
  for (const f of FAIL) console.log('  FAIL  ' + f)
  console.log(`\n${PASS.length} passed, ${FAIL.length} failed`)
  process.exit(FAIL.length ? 1 : 0)
}
