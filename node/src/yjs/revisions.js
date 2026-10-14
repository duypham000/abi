// Phase 4 — delta revision history. Produces the worker `updateCallback` that, after each
// merge (before persistDoc), appends a keyframe or delta to the Java revision chain.
//
// V2 throughout (matching javaStorage.js / @y/redis): keyframes are full
// `Y.encodeStateAsUpdateV2(ydoc)`; deltas are `Y.encodeStateAsUpdateV2(ydoc, prevStateVector)`.
// Java owns throttling (returns 204 to skip) and version assignment; Node only decides
// keyframe-vs-delta from the head metadata it fetches.

import * as Y from 'yjs'
import { parseDocId, toBase64, fromBase64 } from './utils.js'

/**
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.sharedSecret
 * @param {number} [opts.keyframeInterval] revisions per segment (default 20)
 * @returns {(room: string, ydoc: Y.Doc) => Promise<void>}
 */
export function createRevisionCallback({ baseUrl, sharedSecret, keyframeInterval = 20 }) {
  if (!baseUrl) throw new Error('createRevisionCallback: baseUrl is required')
  if (!sharedSecret) throw new Error('createRevisionCallback: sharedSecret is required')
  const base = baseUrl.replace(/\/$/, '')
  const authHeader = `Bearer ${sharedSecret}`

  return async function updateCallback(room, ydoc) {
    const docId = parseDocId(room)
    if (!docId) return

    // 1. Fetch the current head (throttle + keyframe decision inputs).
    const headRes = await fetch(`${base}/yjs/internal/docs/${docId}/revisions/head`, {
      headers: { Authorization: authHeader }
    })
    let head = null
    if (headRes.status === 200) {
      head = await headRes.json()
    } else if (headRes.status !== 204) {
      console.error(`[revisions] head ${room} failed: ${headRes.status}`)
      return
    }

    // 2. Keyframe when there is no head, the head has no usable state vector,
    //    or the current segment has reached the keyframe interval.
    const isKeyframe = !head || !head.stateVector || head.revisionsSinceKeyframe >= keyframeInterval

    let blob
    let keyframe
    let baseVersion
    if (isKeyframe) {
      blob = Y.encodeStateAsUpdateV2(ydoc)
      keyframe = true
    } else {
      const prevSV = fromBase64(head.stateVector)
      const delta = Y.encodeStateAsUpdateV2(ydoc, prevSV)
      const full = Y.encodeStateAsUpdateV2(ydoc)
      // Degenerate delta (≥ 90% of full) → just store a keyframe instead.
      if (delta.length >= full.length * 0.9) {
        blob = full
        keyframe = true
      } else {
        blob = delta
        keyframe = false
        baseVersion = head.versionNumber
      }
    }

    // 3. POST the revision. Java throttles (204) and assigns the version number.
    const headers = {
      Authorization: authHeader,
      'Content-Type': 'application/octet-stream',
      'X-Yjs-State-Vector': toBase64(Y.encodeStateVector(ydoc)),
      'X-Yjs-Is-Keyframe': String(keyframe)
    }
    if (baseVersion != null) headers['X-Yjs-Base-Version'] = String(baseVersion)

    const res = await fetch(`${base}/yjs/internal/docs/${docId}/revisions`, {
      method: 'POST',
      headers,
      body: blob
    })
    if (res.status !== 201 && res.status !== 204) {
      console.error(`[revisions] append ${room} failed: ${res.status} ${res.statusText}`)
    }
  }
}
