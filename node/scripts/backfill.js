// Phase 6 backfill: migrate legacy Doc.yjsState (written by the old y-websocket
// persistence hook as a Yjs V1 update) into yhub-native V2 snapshots in DocSnapshot.
//
// It pages through GET /yjs/internal/legacy-states, rebuilds each Y.Doc from the V1
// bytes, and re-persists via the SAME path yhub uses (JavaStorage.persistDoc →
// PUT /yjs/internal/docs/{id}/snapshot, V2 + state vector). Idempotent: re-running
// just overwrites the latest snapshot.
//
// Usage (run from yjs-server/):
//   YJS_JAVA_BASE_URL=http://localhost:8080 \
//   YJS_SERVICE_SHARED_SECRET=... \
//   node scripts/backfill.js [--dry-run] [--limit=50] [--after=0]
//
// IMPORTANT: YJS_JAVA_BASE_URL must be the ORIGIN (no /api/v1/base) — the
// /yjs/internal/** controllers are mapped at root.
import * as Y from 'yjs'
import { JavaStorage } from '../src/yjs/javaStorage.js'

const baseUrl = (process.env.YJS_JAVA_BASE_URL || '').replace(/\/$/, '')
const sharedSecret = process.env.YJS_SERVICE_SHARED_SECRET || ''
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 50
let afterId = Number((args.find((a) => a.startsWith('--after=')) || '').split('=')[1]) || 0

if (!baseUrl || !sharedSecret) {
  console.error('Missing YJS_JAVA_BASE_URL or YJS_SERVICE_SHARED_SECRET')
  process.exit(2)
}
if (/\/api\/v1/.test(baseUrl)) {
  console.error(`Refusing to run: YJS_JAVA_BASE_URL must be the origin (got "${baseUrl}"). Drop /api/v1/base.`)
  process.exit(2)
}

const store = new JavaStorage({ baseUrl, sharedSecret })
const authHeader = `Bearer ${sharedSecret}`

const base64ToBytes = (b64) => {
  const bin = Buffer.from(b64, 'base64')
  return new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
}

async function fetchPage(after) {
  const url = `${baseUrl}/yjs/internal/legacy-states?afterId=${after}&limit=${limit}`
  const res = await fetch(url, { headers: { Authorization: authHeader } })
  if (!res.ok) throw new Error(`legacy-states failed: ${res.status} ${res.statusText}`)
  return res.json()
}

console.log(`[backfill] baseUrl=${baseUrl} limit=${limit} after=${afterId} ${dryRun ? '(DRY RUN)' : ''}`)
let migrated = 0, scanned = 0, failed = 0
try {
  for (;;) {
    const page = await fetchPage(afterId)
    if (!page || page.length === 0) break
    for (const { docId, yjsStateBase64 } of page) {
      scanned++
      afterId = Math.max(afterId, Number(docId))
      if (!yjsStateBase64) continue
      try {
        const ydoc = new Y.Doc()
        Y.applyUpdate(ydoc, base64ToBytes(yjsStateBase64)) // legacy state is V1
        if (dryRun) {
          console.log(`  [dry] doc-${docId} (${yjsStateBase64.length} b64 chars)`)
        } else {
          await store.persistDoc(`doc-${docId}`, '', ydoc) // PUT V2 snapshot + state vector
          console.log(`  migrated doc-${docId}`)
        }
        ydoc.destroy()
        migrated++
      } catch (e) {
        failed++
        console.error(`  FAILED doc-${docId}: ${e.message}`)
      }
    }
  }
  console.log(`\n[backfill] done — scanned=${scanned} ${dryRun ? 'would-migrate' : 'migrated'}=${migrated} failed=${failed}`)
  process.exit(failed ? 1 : 0)
} catch (e) {
  console.error('[backfill] aborted:', e.message)
  process.exit(1)
}
