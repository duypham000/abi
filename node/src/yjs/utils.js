/**
 * Parse a y-redis room name into a Tomo doc id.
 *
 * Rooms are named `doc-{id}` where `{id}` is the numeric doc id. Any room that
 * does not match this shape returns `null`, signalling callers to skip
 * persistence (e.g. internal / awareness-only rooms).
 *
 * @param {string} room
 * @returns {string | null} the numeric doc id as a string, or null
 */
export function parseDocId(room) {
  if (typeof room !== 'string') return null
  const m = room.match(/^doc-([a-zA-Z0-9_\-]+)$/)
  return m ? m[1] : null
}

/**
 * Parse a room name into a type ('doc' or 'canvas') and an ID.
 * Matches `doc-{id}` and `canvas-{id}`.
 *
 * @param {string} room
 * @returns {{ type: string, id: string } | null}
 */
export function parseRoom(room) {
  if (typeof room !== 'string') return null
  const m = room.match(/^(doc|canvas)-([a-zA-Z0-9_\-]+)$/)
  return m ? { type: m[1], id: m[2] } : null
}


/**
 * Base64-encode a byte array (standard, not url-safe). Used for the
 * `X-Yjs-State-Vector` header expected by the Java storage controller.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Decode a standard base64 string into a byte array.
 *
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function fromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}
