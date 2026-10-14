import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import * as Y from 'yjs'
import { JavaStorage } from '../src/yjs/javaStorage.js'
import { parseDocId } from '../src/yjs/utils.js'

test('parseDocId parses doc-{id} and rejects others', () => {
  assert.equal(parseDocId('doc-1'), '1')
  assert.equal(parseDocId('doc-42'), '42')
  assert.equal(parseDocId('doc-abc'), null)
  assert.equal(parseDocId('room-1'), null)
  assert.equal(parseDocId(''), null)
})

test('persistDoc -> retrieveDoc round-trips a Y.Doc via V2 update', async () => {
  // In-memory stub of the Java /yjs/internal storage controller.
  /** @type {Map<string, Buffer>} */
  const store = new Map()
  let lastStateVectorHeader = null

  const server = http.createServer((req, res) => {
    assert.equal(req.headers['authorization'], 'Bearer test-secret')
    const m = req.url.match(/\/yjs\/internal\/docs\/(\d+)\/(snapshot|state-vector)/)
    const docId = m?.[1]
    const kind = m?.[2]

    if (req.method === 'PUT' && kind === 'snapshot') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        store.set(docId, Buffer.concat(chunks))
        lastStateVectorHeader = req.headers['x-yjs-state-vector']
        res.statusCode = 204
        res.end()
      })
      return
    }
    if (req.method === 'GET' && kind === 'snapshot') {
      const buf = store.get(docId)
      if (!buf) { res.statusCode = 204; res.end(); return }
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.end(buf)
      return
    }
    res.statusCode = 404
    res.end()
  })

  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()

  try {
    const storage = new JavaStorage({
      baseUrl: `http://127.0.0.1:${port}`,
      sharedSecret: 'test-secret'
    })

    const doc = new Y.Doc()
    doc.getText('content').insert(0, 'hello yhub')

    assert.equal(await storage.retrieveDoc('doc-7', ''), null) // nothing yet

    await storage.persistDoc('doc-7', '', doc)
    assert.ok(lastStateVectorHeader, 'state vector header should be present')

    const result = await storage.retrieveDoc('doc-7', '')
    assert.ok(result, 'snapshot should be retrievable')

    const restored = new Y.Doc()
    Y.applyUpdateV2(restored, result.doc) // y-redis applies snapshots with V2
    assert.equal(restored.getText('content').toString(), 'hello yhub')

    // non-doc rooms are skipped (no throw, no write)
    await storage.persistDoc('awareness-x', '', doc)
    assert.equal(await storage.retrieveDoc('awareness-x', ''), null)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
