import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import * as Y from 'yjs'
import { createRevisionCallback } from '../src/yjs/revisions.js'
import { fromBase64 } from '../src/yjs/utils.js'

/**
 * In-memory stand-in for the Java revision endpoints, mirroring the segment logic of
 * YjsRevisionServiceImpl (no throttle — the test drives appends back-to-back).
 */
function startJavaStub() {
  /** @type {Array<{id:number,versionNumber:number,isKeyframe:boolean,baseVersion:number|null,stateVector:Buffer,blob:Buffer}>} */
  const revs = []
  let nextId = 1

  const headJson = () => {
    if (revs.length === 0) return null
    const head = revs[revs.length - 1]
    let kfIdx = -1
    for (let i = revs.length - 1; i >= 0; i--) {
      if (revs[i].isKeyframe) { kfIdx = i; break }
    }
    const since = kfIdx === -1 ? Number.MAX_SAFE_INTEGER : revs.length - kfIdx
    return {
      revisionId: head.id,
      versionNumber: head.versionNumber,
      isKeyframe: head.isKeyframe,
      stateVector: head.stateVector.toString('base64'),
      revisionsSinceKeyframe: since
    }
  }

  const server = http.createServer((req, res) => {
    assert.equal(req.headers['authorization'], 'Bearer test-secret')
    const url = req.url

    if (req.method === 'GET' && /\/revisions\/head$/.test(url)) {
      const h = headJson()
      if (!h) { res.statusCode = 204; res.end(); return }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(h))
      return
    }

    if (req.method === 'POST' && /\/revisions$/.test(url)) {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const isKeyframe = req.headers['x-yjs-is-keyframe'] === 'true'
        const baseVersion = req.headers['x-yjs-base-version']
          ? parseInt(req.headers['x-yjs-base-version'], 10)
          : null
        const stateVector = Buffer.from(req.headers['x-yjs-state-vector'], 'base64')
        const rev = {
          id: nextId++,
          versionNumber: revs.length + 1,
          isKeyframe,
          baseVersion,
          stateVector,
          blob: Buffer.concat(chunks)
        }
        revs.push(rev)
        res.writeHead(201, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ revisionId: rev.id, versionNumber: rev.versionNumber }))
      })
      return
    }

    const chainMatch = url.match(/\/revisions\/(\d+)\/chain$/)
    if (req.method === 'GET' && chainMatch) {
      const targetId = parseInt(chainMatch[1], 10)
      const target = revs.find((r) => r.id === targetId)
      if (!target) { res.statusCode = 404; res.end(); return }
      // latest keyframe at or before target version
      let kf = null
      for (const r of revs) {
        if (r.isKeyframe && r.versionNumber <= target.versionNumber) kf = r
      }
      const start = kf ? kf.versionNumber : target.versionNumber
      const segment = revs.filter(
        (r) => r.versionNumber >= start && r.versionNumber <= target.versionNumber
      )
      const updates = segment.map((r) => r.blob.toString('base64'))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ updates }))
      return
    }

    res.statusCode = 404
    res.end()
  })

  return { server, revs }
}

test('revision callback builds a V2 keyframe+delta chain that reconstructs each version', async () => {
  const { server, revs } = startJavaStub()
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  try {
    const updateCallback = createRevisionCallback({
      baseUrl,
      sharedSecret: 'test-secret',
      keyframeInterval: 3 // small → exercise multiple segments
    })

    const doc = new Y.Doc()
    const text = doc.getText('content')
    const ROUNDS = 8
    const expected = {}

    for (let round = 1; round <= ROUNDS; round++) {
      text.insert(text.length, `line${round} `)
      await updateCallback('doc-5', doc)
      expected[round] = text.toString()
    }

    assert.equal(revs.length, ROUNDS, 'one revision per round')
    assert.equal(revs[0].isKeyframe, true, 'first revision is a keyframe')
    assert.equal(revs[3].isKeyframe, true, 'keyframe recurs at the interval (v4)')
    assert.ok(revs.some((r) => !r.isKeyframe), 'deltas are produced between keyframes')

    // Reconstruct each version from its chain and compare to the doc at that point in time.
    for (let v = 1; v <= ROUNDS; v++) {
      const rev = revs[v - 1]
      const chainRes = await fetch(`${baseUrl}/yjs/internal/docs/5/revisions/${rev.id}/chain`, {
        headers: { Authorization: 'Bearer test-secret' }
      })
      const { updates } = await chainRes.json()
      const merged = Y.mergeUpdatesV2(updates.map(fromBase64))
      const restored = new Y.Doc()
      Y.applyUpdateV2(restored, merged)
      assert.equal(restored.getText('content').toString(), expected[v], `version ${v} reconstructs`)
    }

    // Delta chain stores far less than N independent full snapshots.
    const totalStored = revs.reduce((sum, r) => sum + r.blob.length, 0)
    const finalFull = Y.encodeStateAsUpdateV2(doc).length
    assert.ok(
      totalStored < finalFull * ROUNDS,
      `chain (${totalStored}B) should be cheaper than ${ROUNDS}× full snapshots (${finalFull * ROUNDS}B)`
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
