import { describe, expect, it } from 'vitest'
import { MONITOR_RULE_KINDS } from '@thealotta/contracts'
import { RULE_KIND } from '../src/pages/WatchPage.js'

describe('Regelarten', () => {
  it('beschreibt jede Regelart, die es im Vokabular gibt', () => {
    // Vorher standen in dieser Tabelle zwei Namen, die es nie gab (calendar_lead_time,
    // recurring). Jede tatsächlich angelegte Regel fiel deshalb still auf den
    // Platzhalter „Regelmäßige Prüfung" zurück – die Liste sagte nichts aus.
    for (const kind of MONITOR_RULE_KINDS) {
      expect(RULE_KIND[kind], kind).toBeTruthy()
    }
  })
})
