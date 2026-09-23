import { describe, expect, it } from 'vitest'
import { parseQueues, schedulesRepeatables } from '../src/queues.js'

/**
 * Die Aufteilung der Warteschlangen trägt INV-006 und INV-012.
 *
 * Solange jeder Prozess alle drei Schlangen bediente, war die Rollentrennung eine Behauptung:
 * Drei Container mit je eigener Datenbankrolle hätten sich die Jobs weggenommen. Erst wenn
 * `WORKER_QUEUES` wirklich gelesen wird, kann ein Zusteller mit `thealotta_notifier` laufen –
 * einer Rolle, die fachliche Tabellen nur lesen darf.
 */
describe('WORKER_QUEUES', () => {
  it('nimmt die drei bekannten Namen', () => {
    expect([...parseQueues('default,sync,notify')]).toEqual(['default', 'sync', 'notify'])
  })

  it('erlaubt einen einzelnen – das ist der Sinn der Sache', () => {
    expect([...parseQueues('notify')]).toEqual(['notify'])
  })

  it('verträgt Leerzeichen und leere Glieder', () => {
    expect([...parseQueues(' default , , sync ')]).toEqual(['default', 'sync'])
  })

  it('bricht bei einem Tippfehler ab, statt ihn zu verschlucken', () => {
    /*
     * Der teuerste Fehler wäre ein stiller: `WORKER_QUEUES=notifiy` – der Prozess liefe,
     * meldete nichts, und die Zustellung stünde, ohne dass jemand es bemerkt.
     */
    expect(() => parseQueues('notifiy')).toThrow(/unbekannte Warteschlangen: notifiy/)
    expect(() => parseQueues('default,alles')).toThrow(/alles/)
  })

  it('bricht bei leerer Angabe ab', () => {
    expect(() => parseQueues('')).toThrow(/leer/)
    expect(() => parseQueues('  ,  ')).toThrow(/leer/)
  })

  it('nur wer „default" bedient, stellt die Wiederholungen ein', () => {
    expect(schedulesRepeatables(parseQueues('default,sync'))).toBe(true)
    expect(schedulesRepeatables(parseQueues('sync,notify'))).toBe(false)
  })
})
