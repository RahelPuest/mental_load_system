import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { DOMAIN, installBackend, renderPage, settle } from './harness.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import fixtures from './fixtures/api.json' with { type: 'json' }

/**
 * Der Aufbau der Bereichsseite, ohne Browser.
 *
 * Eine Übersicht gab es hier zweimal: erst als Kopie der ersten fünf Einträge jedes
 * Abschnitts, dann als Zusammenfassung mit Zahlen. Die zweite stand neben einer linken
 * Spalte, die dieselben Zahlen an denselben Namen trug – zwei Auskünfte über denselben
 * Sachverhalt, untereinander. Sie ist entfallen (docs/61); der nackte Pfad führt auf den
 * ersten Abschnitt.
 */
const detail = (fixtures as { responses: Record<string, unknown> }).responses['domains/detail'] as Record<
  string,
  unknown
>

function mitNotizen(anzahl: number) {
  return {
    ...detail,
    knowledge: Array.from({ length: anzahl }, (_, i) => ({
      id: `k${i}`,
      title: `Notiz ${i}`,
      body: null,
      kind: 'fact',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    })),
  }
}

/** `/bereiche/:id` ohne Abschnitt – der Pfad bleibt gültig und zeigt „Was wir wissen". */
const ohneAbschnitt = () => ({ route: `/bereiche/${DOMAIN}`, path: '/bereiche/:domainId' })
const abschnitt = (k: string) => ({ route: `/bereiche/${DOMAIN}/${k}`, path: '/bereiche/:domainId/:section' })
const zeilen = () => document.querySelectorAll('.setting-row').length

describe('Ohne Abschnitt führt der Pfad auf den ersten', () => {
  it('zeigt die Einträge, nicht eine Zusammenfassung von ihnen', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen(25) } })
    renderPage(<DomainDetailPage />, ohneAbschnitt())
    await settle()

    /*
      Die frühere Übersicht sagte an dieser Stelle „25 Notizen" und verwies auf den
      Abschnitt. Die Zahl steht jetzt am Menüpunkt – hier stehen die Notizen selbst.
    */
    expect(screen.getByText('Notiz 0'), 'der nackte Pfad zeigt den ersten Abschnitt').toBeTruthy()
    expect(document.querySelectorAll('.ueberblick'), 'die Übersicht ist entfallen').toHaveLength(0)
  })

  it('trägt den Bereich im Kopf, nicht den Abschnitt', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen(3) } })
    renderPage(<DomainDetailPage />, ohneAbschnitt())
    await settle()

    /*
      Der Kopf wechselte vorher mit jedem Klick in der linken Spalte und war damit ein Echo
      des Menüpunkts, den man gerade selbst gedrückt hat. Wer verantwortlich ist, stand nur
      auf der Übersicht – auf den anderen fünf Abschnitten fehlte die Auskunft ganz.
    */
    const h1 = document.querySelector('.page-head h1')
    expect(h1?.textContent).toBe((detail['domain'] as { name: string }).name)
    expect(document.querySelector('.domain-meta .owner-badge'), 'keine Zuständigkeit im Kopf').toBeTruthy()
  })

  it('zeigt auf der Seite des Abschnitts alle Einträge', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen(25) } })
    renderPage(<DomainDetailPage />, abschnitt('wissen'))
    await settle()

    expect(zeilen()).toBeGreaterThan(20)
    expect(screen.getByText('Notiz 0')).toBeTruthy()
  })
})

describe('Die Leiste sagt, wo etwas liegt', () => {
  it('trägt Zahlen an den Abschnitten mit Inhalt', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen(7) } })
    renderPage(<DomainDetailPage />, ohneAbschnitt())
    await settle()

    const zahlen = [...document.querySelectorAll('.menue-zahl')].map((e) => e.textContent)
    expect(zahlen.length, 'nur Abschnitte mit Inhalt tragen eine Zahl').toBeGreaterThan(0)
    expect(zahlen).not.toContain('0')
  })

  it('schreibt keine Null, sondern dämpft den leeren Punkt', async () => {
    installBackend({
      routes: {
        'domains/detail': {
          ...detail,
          states: [],
          knowledge: [],
          questions: [],
          decisions: [],
          monitors: [],
          processes: [],
          tasks: [],
        },
      },
    })
    renderPage(<DomainDetailPage />, ohneAbschnitt())
    await settle()

    expect(document.querySelectorAll('.menue-zahl')).toHaveLength(0)
    expect(
      document.querySelectorAll('.ist-leer').length,
      'leere Abschnitte müssen als leer erkennbar sein, ohne sie zu öffnen',
    ).toBeGreaterThan(0)
  })
})
