import { describe, expect, it } from 'vitest'
import { SsrfBlockedError, assertSafeUrl, isBlockedIp } from '../src/calendar/safe-fetch.js'

/**
 * docs/25, Grenze 4: Eine ICS-URL kommt vom Nutzer. Ohne diese Prüfung wäre das Produkt
 * ein bequemer Weg, interne Dienste des Betreibers abzufragen.
 */
describe('SSRF-Schutz für nutzergesteuerte Kalender-URLs', () => {
  it('blockiert interne IPv4-Bereiche', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
  })

  it('erlaubt öffentliche IPv4-Adressen', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.15.0.1', '11.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(false)
    }
  })

  it('blockiert interne IPv6-Bereiche inklusive IPv4-Mapping', () => {
    for (const ip of ['::1', 'fe80::1', 'fd00::1', 'fc00::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false)
  })

  it('lehnt fremde Schemata ab', async () => {
    for (const url of ['file:///etc/passwd', 'gopher://x/', 'ftp://example.com/a.ics']) {
      await expect(assertSafeUrl(url), url).rejects.toThrowError(SsrfBlockedError)
    }
  })

  it('lehnt interne Hostnamen ab', async () => {
    for (const url of [
      'http://localhost/cal.ics',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://db.internal/x.ics',
      'http://printer.local/x.ics',
    ]) {
      await expect(assertSafeUrl(url), url).rejects.toThrowError(SsrfBlockedError)
    }
  })

  it('lehnt direkte interne IP-Adressen ab', async () => {
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrowError(SsrfBlockedError)
    await expect(assertSafeUrl('http://[::1]:8080/cal.ics')).rejects.toThrowError(SsrfBlockedError)
  })

  it('lehnt ungültige URLs ab', async () => {
    await expect(assertSafeUrl('nicht mal eine url')).rejects.toThrowError(SsrfBlockedError)
  })
})
