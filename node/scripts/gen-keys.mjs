// Generate ONE P-384 (ES384) keypair and print it in the three encodings the
// system needs, so Java's signing key and y-redis's verifying key are the same
// keypair:
//
//   YJS_AUTH_PRIVATE_KEY  PKCS#8 PEM  -> Java application-local.yaml (yjs.auth.private-key)
//   YJS_AUTH_PUBLIC_KEY   SPKI PEM    -> Java application-local.yaml (yjs.auth.public-key)
//   YJS_AUTH_PUBLIC_JWK   JWK JSON    -> y-redis AUTH_PUBLIC_KEY env (must have crv "P-384")
//
// Usage: node scripts/gen-keys.mjs
//
// NOTE: y-redis (lib0) ONLY accepts ES384 / P-384. Do not switch to ES256/P-256.

import { generateKeyPair, exportPKCS8, exportSPKI, exportJWK } from 'jose'

const { publicKey, privateKey } = await generateKeyPair('ES384', { extractable: true })

const pkcs8 = await exportPKCS8(privateKey)
const spki = await exportSPKI(publicKey)
const jwk = await exportJWK(publicKey)
// lib0 (@y/redis) imports the JWK with `jwk.key_ops || ['sign','verify']`. A public
// key can't carry 'sign' usage, so without explicit key_ops the import throws
// "Unsupported key usage for a ECDSA key". Pin it to verify-only.
jwk.key_ops = ['verify']

const oneLine = (pem) => pem.trim().replace(/\n/g, '\\n')

console.log('# ---- Java (application-local.yaml under yjs.auth) ----')
console.log('# Paste as-is (multi-line block scalar) OR use the \\n one-liner forms below.')
console.log('\nprivate-key (PKCS#8 PEM):\n' + pkcs8)
console.log('public-key (SPKI PEM):\n' + spki)
console.log('# One-liner forms (for env vars):')
console.log('YJS_AUTH_PRIVATE_KEY=' + oneLine(pkcs8))
console.log('YJS_AUTH_PUBLIC_KEY=' + oneLine(spki))

console.log('\n# ---- y-redis AUTH_PUBLIC_KEY env (JWK JSON, crv must be P-384) ----')
console.log('YJS_AUTH_PUBLIC_JWK=' + JSON.stringify(jwk))
