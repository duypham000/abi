import * as Y from 'yjs'
import { parseDocId, parseRoom, toBase64 } from './utils.js'

/**
 * Extract searchable plain text from a Yjs XML fragment (used by BlockNote).
 * Recursively collects all XmlText leaf nodes.
 *
 * @param {Y.Doc} ydoc
 * @param {string} fragmentName
 * @returns {string}
 */
function extractPlainText(ydoc, fragmentName) {
  const fragment = ydoc.getXmlFragment(fragmentName)
  const parts = []

  function collect(type) {
    if (type instanceof Y.XmlText) {
      const text = type.toString()
      if (text) parts.push(text)
    } else {
      const children = type.toArray ? type.toArray() : []
      for (const child of children) collect(child)
    }
  }

  collect(fragment)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * y-redis `AbstractStorage` implementation that persists opaque Yjs bytes to
 * the Java backend (`/yjs/internal/docs/{docId}/snapshot`), which in turn
 * stores them in Telegram + MySQL (Phase 1).
 *
 * Java never parses Yjs. All CRDT encoding happens here. We use the **V2**
 * update format because y-redis applies snapshots with `Y.applyUpdateV2`
 * (see `@y/redis/src/api.js#getDoc`).
 *
 * @implements {import('@y/redis/src/storage.js').AbstractStorage}
 */
export class JavaStorage {
  /**
   * @param {Object} opts
   * @param {string} opts.baseUrl - e.g. http://host.docker.internal:8080/api/v1/base
   * @param {string} opts.sharedSecret - Bearer token for /yjs/internal/**
   */
  constructor({ baseUrl, sharedSecret }) {
    if (!baseUrl) throw new Error('JavaStorage: baseUrl is required (YJS_JAVA_BASE_URL)')
    if (!sharedSecret) throw new Error('JavaStorage: sharedSecret is required (YJS_SERVICE_SHARED_SECRET)')
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.authHeader = `Bearer ${sharedSecret}`
  }

  /**
   * @param {string} type
   * @param {string} id
   * @returns {string}
   */
  _snapshotUrl(type, id) {
    const plural = type === 'canvas' ? 'canvases' : 'docs'
    return `${this.baseUrl}/yjs/internal/${plural}/${id}/snapshot?branch=main`
  }

  /**
   * @param {string} type
   * @param {string} id
   * @returns {string}
   */
  _stateVectorUrl(type, id) {
    const plural = type === 'canvas' ? 'canvases' : 'docs'
    return `${this.baseUrl}/yjs/internal/${plural}/${id}/state-vector?branch=main`
  }

  /**
   * @param {string} id
   * @returns {string}
   */
  _metaUrl(id) {
    return `${this.baseUrl}/yjs/internal/docs/${id}/meta`
  }

  /**
   * Fire-and-forget update of plainText in the Java doc cache for ES indexing.
   * Failures are logged but do not block the snapshot persist path.
   *
   * @param {string} docId
   * @param {string} plainText
   * @returns {Promise<void>}
   */
  async _updateMeta(docId, plainText) {
    const res = await fetch(this._metaUrl(docId), {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plainText })
    })
    if (!res.ok) {
      throw new Error(`_updateMeta(${docId}) failed: ${res.status} ${res.statusText}`)
    }
  }

  /**
   * Persist the full document state. Called by the worker after flushing
   * redis-streamed updates into a Y.Doc.
   *
   * @param {string} room
   * @param {string} _docname
   * @param {Y.Doc} ydoc
   * @returns {Promise<void>}
   */
  async persistDoc(room, _docname, ydoc) {
    const roomInfo = parseRoom(room)
    if (!roomInfo) return
    const { type, id } = roomInfo

    const update = Y.encodeStateAsUpdateV2(ydoc)
    const stateVector = Y.encodeStateVector(ydoc)

    const res = await fetch(this._snapshotUrl(type, id), {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/octet-stream',
        'X-Yjs-State-Vector': toBase64(stateVector)
      },
      body: update
    })
    if (!res.ok) {
      throw new Error(`persistDoc(${room}) failed: ${res.status} ${res.statusText}`)
    }

    // Extract plainText and push to Java cache for ES indexing only for docs.
    if (type === 'doc') {
      const plainText = extractPlainText(ydoc, 'document-store')
      if (plainText) {
        this._updateMeta(id, plainText).catch(err =>
          console.warn(`[JavaStorage] meta update skipped for doc ${id}: ${err.message}`)
        )
      }
    }
  }

  /**
   * Retrieve the latest persisted document/canvas state. Returns null when no
   * snapshot exists yet.
   *
   * @param {string} room
   * @param {string} _docname
   * @returns {Promise<{ doc: Uint8Array, references: Array<any> } | null>}
   */
  async retrieveDoc(room, _docname) {
    const roomInfo = parseRoom(room)
    if (!roomInfo) return null
    const { type, id } = roomInfo

    const res = await fetch(this._snapshotUrl(type, id), {
      headers: { Authorization: this.authHeader }
    })
    if (res.status === 204 || res.status === 404) return null
    if (!res.ok) {
      throw new Error(`retrieveDoc(${room}) failed: ${res.status} ${res.statusText}`)
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) return null
    // Single latest snapshot per (doc, branch); no granular store references.
    return { doc: new Uint8Array(buf), references: [] }
  }

  /**
   * Retrieve only the state vector (cheaper than the full doc).
   *
   * @param {string} room
   * @param {string} _docname
   * @returns {Promise<Uint8Array | null>}
   */
  async retrieveStateVector(room, _docname) {
    const roomInfo = parseRoom(room)
    if (!roomInfo) return null
    const { type, id } = roomInfo

    const res = await fetch(this._stateVectorUrl(type, id), {
      headers: { Authorization: this.authHeader }
    })
    if (res.status === 204 || res.status === 404) return null
    if (!res.ok) {
      throw new Error(`retrieveStateVector(${room}) failed: ${res.status} ${res.statusText}`)
    }
    const buf = await res.arrayBuffer()
    return buf.byteLength === 0 ? null : new Uint8Array(buf)
  }

  /**
   * Delete redis store references. We keep only a single latest snapshot in
   * Java (old seqs are pruned server-side), so there is nothing to delete here.
   *
   * @param {string} _room
   * @param {string} _docname
   * @param {Array<any>} _storeReferences
   * @returns {Promise<void>}
   */
  async deleteReferences(_room, _docname, _storeReferences) {}

  async destroy() {}
}
