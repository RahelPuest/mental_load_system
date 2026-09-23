import { describe, expect, it } from 'vitest'
import { classify, readDate } from '../src/services/intake.service.js'

// Ein Montag, damit die Wochentagsrechnung nachvollziehbar bleibt.
const NOW = new Date('2026-09-07T08:00:00.000Z')
const KEINE_BEREICHE: { id: string; name: string; path: string }[] = []

describe('readDate – Zeitangaben aus dem Rohtext (Audit 2, M7)', () => {
  const tag = (v: { date: Date } | null) => (v ? v.date.toISOString().slice(0, 10) : null)

  it('versteht heute, morgen und übermorgen', () => {
    expect(tag(readDate('heute Müll rausbringen', NOW))).toBe('2026-09-07')
    expect(tag(readDate('morgen anrufen', NOW))).toBe('2026-09-08')
    expect(tag(readDate('übermorgen abholen', NOW))).toBe('2026-09-09')
  })

  it('nimmt bei einem Wochentag den nächsten dieses Namens', () => {
    expect(tag(readDate('Donnerstag Müll rausbringen', NOW))).toBe('2026-09-10')
    // Am Montag „Montag" gesagt meint den kommenden, nicht heute.
    expect(tag(readDate('Montag Wäsche', NOW))).toBe('2026-09-14')
  })

  it('liest ein geschriebenes Datum und schiebt Vergangenes ins nächste Jahr', () => {
    expect(tag(readDate('Termin am 20.9.', NOW))).toBe('2026-09-20')
    expect(tag(readDate('Termin am 3.2.', NOW))).toBe('2027-02-03')
    expect(tag(readDate('Termin am 15.12.2026', NOW))).toBe('2026-12-15')
  })

  it('rät nicht: ohne eindeutige Angabe bleibt es leer', () => {
    expect(readDate('Schuhe besorgen', NOW)).toBeNull()
    expect(readDate('irgendwann mal streichen', NOW)).toBeNull()
    expect(readDate('Termin am 45.13.', NOW)).toBeNull()
  })
})

describe('classify – der erkannte Zeitpunkt landet im Vorschlag', () => {
  it('hängt dueAt an eine Aufgabe und nennt den Grund', () => {
    const s = classify('Donnerstag Müll rausbringen', KEINE_BEREICHE, NOW)
    expect(s.targetType).toBe('task')
    expect(String(s.fields['dueAt']).slice(0, 10)).toBe('2026-09-10')
    expect(s.reason, 'der Nutzer muss sehen, woher das Datum kommt').toContain('Donnerstag')
  })

  it('lässt Aufgaben ohne Zeitangabe unverändert', () => {
    const s = classify('Schuhe besorgen', KEINE_BEREICHE, NOW)
    expect(s.fields['dueAt']).toBeUndefined()
  })
})
