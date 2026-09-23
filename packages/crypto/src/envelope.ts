import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import type { KeyProvider } from './keys.js'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const VERSION = 1

export interface Ciphertext {
  keyId: string
  data: Buffer
}

/**
 * AES-256-GCM mit Additional Authenticated Data.
 *
 * `aad` bindet ein Chiffrat an seinen Kontext (z. B. die Connection-ID). Ein kopiertes
 * Token lässt sich dadurch nicht in einer anderen Zeile wiederverwenden.
 *
 * Layout: [version:1][ivLen:1][iv:12][tag:16][ciphertext]
 */
export function encrypt(provider: KeyProvider, plaintext: string | Buffer, aad?: string): Ciphertext {
  const keyId = provider.activeKeyId()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, provider.key(keyId), iv)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(Buffer.from(plaintext as string, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return { keyId, data: Buffer.concat([Buffer.from([VERSION, IV_BYTES]), iv, tag, body]) }
}

export function decrypt(provider: KeyProvider, ciphertext: Ciphertext, aad?: string): Buffer {
  const buf = ciphertext.data
  if (buf.length < 2 + IV_BYTES + TAG_BYTES) throw new Error('Chiffrat ist zu kurz oder beschädigt')
  const version = buf[0]
  if (version !== VERSION) throw new Error(`Unbekannte Chiffratversion ${version}`)
  const ivLen = buf[1]!
  const iv = buf.subarray(2, 2 + ivLen)
  const tag = buf.subarray(2 + ivLen, 2 + ivLen + TAG_BYTES)
  const body = buf.subarray(2 + ivLen + TAG_BYTES)

  const decipher = createDecipheriv(ALGO, provider.key(ciphertext.keyId), iv)
  decipher.setAuthTag(tag)
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  return Buffer.concat([decipher.update(body), decipher.final()])
}

export function decryptToString(provider: KeyProvider, ciphertext: Ciphertext, aad?: string): string {
  return decrypt(provider, ciphertext, aad).toString('utf8')
}

/* ── Token ────────────────────────────────────────────────────────────── */

/** Opakes Token mit 256 Bit Entropie. In der DB wird ausschließlich der Hash gespeichert. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Konstantzeit-Vergleich – schützt gegen Timing-Angriffe auf Session-/Reset-Token. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** IP-Adressen werden nie im Klartext protokolliert (§11.6). Salt rotiert täglich. */
export function hashIp(ip: string, dailySalt: string): string {
  return createHash('sha256').update(`${dailySalt}:${ip}`).digest('hex').slice(0, 32)
}
