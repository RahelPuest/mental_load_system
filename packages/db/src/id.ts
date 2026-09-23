import { randomBytes } from 'node:crypto'

/**
 * UUIDv7 – zeitlich sortierbar. Das hält B-Tree-Indizes auf `created_at`-ähnlichen Zugriffen
 * kompakt und macht Cursor-Paginierung ohne zusätzliche Sortierspalte möglich.
 *
 * Layout: 48 Bit Unix-Millisekunden | Version 7 | 12 Bit Zufall | Variante | 62 Bit Zufall
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(now, 0, 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const isUuid = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
