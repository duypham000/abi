// Phase 4 — reconstruct endpoint, hosted inside the worker process (no extra container).
// Java cannot parse Yjs, so it delegates revision reconstruction here: given a {docId,
// revisionId}, fetch the ordered update chain (keyframe + deltas) from Java and merge it
// with Y.mergeUpdatesV2 into full V2 bytes.
//
// POST /reconstruct  { "docId": 1, "revisionId": 42 }  →  { "update": "<base64 V2>" }
// Internal only (localhost / host network); not exposed publicly.

import http from 'node:http'
import * as Y from 'yjs'
import { fromBase64, toBase64 } from './utils.js'

/**
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.sharedSecret
 * @param {number} opts.port
 * @returns {http.Server}
 */
export function startReconstructServer({ baseUrl, sharedSecret, port }) {
  if (!baseUrl) throw new Error('startReconstructServer: baseUrl is required')
  if (!sharedSecret) throw new Error('startReconstructServer: sharedSecret is required')
  const base = baseUrl.replace(/\/$/, '')
  const authHeader = `Bearer ${sharedSecret}`

  const server = http.createServer((req, res) => {
    const url = req.url || ''
    if (req.method !== 'POST') {
      res.writeHead(404).end()
      return
    }

    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        if (url.startsWith('/reconstruct')) {
          const { docId, revisionId } = JSON.parse(body || '{}')
          if (docId == null || revisionId == null) {
            res.writeHead(400).end()
            return
          }
          const chainRes = await fetch(
            `${base}/yjs/internal/docs/${docId}/revisions/${revisionId}/chain`,
            { headers: { Authorization: authHeader } }
          )
          if (!chainRes.ok) {
            res.writeHead(502).end()
            return
          }
          const { updates } = await chainRes.json()
          if (!Array.isArray(updates) || updates.length === 0) {
            res.writeHead(404).end()
            return
          }
          const merged = Y.mergeUpdatesV2(updates.map(fromBase64))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ update: toBase64(merged) }))
        } else if (url.startsWith('/analyze')) {
          const { update } = JSON.parse(body || '{}')
          if (!update) {
            res.writeHead(400).end()
            return
          }
          const bytes = fromBase64(update)
          const ydoc = new Y.Doc()
          let success = false
          try {
            Y.applyUpdateV2(ydoc, bytes)
            success = true
          } catch (e2) {
            try {
              Y.applyUpdate(ydoc, bytes)
              success = true
            } catch (e1) {
              console.warn('[analyze] Failed to apply update in both V1 and V2 formats', e1)
            }
          }

          if (!success) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              type: 'unknown',
              textLength: 0,
              previewText: '',
              canvasElementCount: 0,
              stateVector: ''
            }))
            return
          }

          let type = 'unknown'
          let textLength = 0
          let previewText = ''
          let canvasElementCount = 0

          const contentText = ydoc.getText('content')
          const elementsMap = ydoc.getMap('elements')

          if (contentText && contentText.toString().length > 0) {
            type = 'document'
            const fullText = contentText.toString()
            textLength = fullText.length
            previewText = fullText.substring(0, 200)
          } else if (elementsMap && elementsMap.size > 0) {
            type = 'canvas'
            canvasElementCount = elementsMap.size
          }

          const stateVector = Y.encodeStateVector(ydoc)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            type,
            textLength,
            previewText,
            canvasElementCount,
            stateVector: toBase64(stateVector)
          }))
        } else {
          res.writeHead(404).end()
        }
      } catch (e) {
        console.error('[reconstruct/analyze] error', e)
        res.writeHead(500).end()
      }
    })
  })

  server.listen(port, () => {
    console.log(`[yhub-worker] reconstruct listening on :${port}`)
  })
  return server
}
