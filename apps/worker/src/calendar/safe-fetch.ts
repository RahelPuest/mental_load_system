import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF-Schutz für nutzergesteuerte Kalender-URLs (docs/25, Grenze 4).
 *
 * Eine ICS-URL kommt vom Nutzer und zeigt potenziell auf interne Adressen – Metadaten-Endpunkte
 * von Cloud-Anbietern sind der klassische Fall. Geprüft werden Schema, aufgelöste IP,
 * Redirect-Kette und Antwortgröße; die Auflösung geschieht vor dem Verbindungsaufbau und
 * die Verbindung geht an genau diese IP (Schutz gegen DNS-Rebinding).
 */
export class SsrfBlockedError extends Error {
  constructor(readonly reason: string, readonly target: string) {
    super(`Zieladresse ist nicht erlaubt: ${reason}`)
    this.name = 'SsrfBlockedError'
  }
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data'])

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    const [a, b] = parts as [number, number, number, number]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local, inkl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // Multicast und reserviert
    return false
  }
  if (version === 6) {
    const normalized = ip.toLowerCase()
    if (normalized === '::1' || normalized === '::') return true
    if (normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    // IPv4-mapped: ::ffff:127.0.0.1
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
    if (mapped) return isBlockedIp(mapped[1]!)
    return false
  }
  return true
}

export async function assertSafeUrl(rawUrl: string): Promise<{ url: URL; address: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError('keine gültige URL', rawUrl)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SsrfBlockedError(`Schema ${url.protocol} ist nicht erlaubt`, rawUrl)
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new SsrfBlockedError('interner Hostname', rawUrl)
  }

  const address = isIP(hostname) ? hostname : (await lookup(hostname)).address
  if (isBlockedIp(address)) throw new SsrfBlockedError(`Adresse ${address} liegt in einem internen Bereich`, rawUrl)

  return { url, address }
}

export interface SafeFetchOptions {
  timeoutMs: number
  maxBytes: number
  maxRedirects?: number
  headers?: Record<string, string>
}

export interface SafeFetchResult {
  status: number
  body: string
  etag: string | null
  lastModified: string | null
}

export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  let current = rawUrl
  const maxRedirects = opts.maxRedirects ?? 3

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafeUrl(current)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/calendar, text/plain', ...opts.headers },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new SsrfBlockedError('Weiterleitung ohne Ziel', current)
        current = new URL(location, current).toString()
        continue
      }

      const declared = Number(response.headers.get('content-length') ?? '0')
      if (declared > opts.maxBytes) throw new SsrfBlockedError('Antwort zu groß', current)

      const text = await readLimited(response, opts.maxBytes)
      return {
        status: response.status,
        body: text,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new SsrfBlockedError('zu viele Weiterleitungen', rawUrl)
}

/** Liest höchstens `maxBytes` – schützt gegen unbegrenzte Antworten. */
async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new SsrfBlockedError('Antwort überschreitet das Größenlimit', response.url)
      }
      chunks.push(value)
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}
