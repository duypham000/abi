// One-off: convert an existing SPKI public-key PEM (yjs.auth.public-key) into the
// P-384 JWK that yhub needs (AUTH_PUBLIC_KEY / YJS_AUTH_PUBLIC_JWK), with key_ops:["verify"].
// Unlike gen-keys.mjs this does NOT mint a new keypair — it derives the JWK from the
// key already in use so signing/verifying stay the same keypair.
//
// Usage: node scripts/spki-to-jwk.mjs "<SPKI PEM>"
import { importSPKI, exportJWK } from 'jose'

const spki = process.argv[2]
if (!spki) {
  console.error('Pass the SPKI PEM as the first argument.')
  process.exit(1)
}

const key = await importSPKI(spki, 'ES384', { extractable: true })
const jwk = await exportJWK(key)
jwk.key_ops = ['verify']
console.log(JSON.stringify(jwk))
