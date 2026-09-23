import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * §15 (Playbooks), §14.3 (Kalenderkontrolle) und §34 (Datenkontrolle durch Nutzer).
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
let playbookId: string

const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'playbooks')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Schuhe' })).id
}, 180_000)
afterAll(async () => h.stop())

describe('Playbooks', () => {
  it('eine Vorlage mit Schritten lässt sich anlegen', async () => {
    const created = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/playbooks`, {
      domainId,
      title: 'Neue Schuhe',
      triggerDescription: 'Schuhe zu klein, kaputt oder fehlen',
      steps: [
        { title: 'Füße messen', estimatedMinutes: 5, mentalEnergy: 'low' },
        { title: 'Notwendige Schuhart bestimmen', estimatedMinutes: 5, mentalEnergy: 'medium' },
        { title: 'Modelle auswählen', estimatedMinutes: 20, mentalEnergy: 'medium' },
        { title: 'Bestellen oder kaufen', estimatedMinutes: 30, mentalEnergy: 'medium' },
        { title: 'Anprobieren und Passform beurteilen', estimatedMinutes: 10, mentalEnergy: 'low' },
        { title: 'Gegebenenfalls retournieren', estimatedMinutes: 15, mentalEnergy: 'medium' },
        { title: 'Zustand aktualisieren', estimatedMinutes: 2, mentalEnergy: 'low' },
        { title: 'Alte Schuhe aussortieren', estimatedMinutes: 10, mentalEnergy: 'low' },
      ],
    })
    playbookId = created.id

    const list = await h.json<{ items: { id: string; title: string; steps: { position: number; title: string }[] }[]; note: string }>(
      family.anna,
      'GET',
      `${base()}/playbooks`,
    )
    const playbook = list.items.find((p) => p.id === playbookId)!
    expect(playbook.steps).toHaveLength(8)
    expect(playbook.steps[0]!.title).toBe('Füße messen')
    // Die Vorlage ist ausdrücklich kein laufender Vorgang (§15).
    expect(list.note).toContain('Vorlage')
  })

  it('aus der Vorlage entsteht ein Vorgang mit verketteten Schritten', async () => {
    const process = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/playbooks/${playbookId}/instantiate`,
      { domainId, title: 'Neue Schuhe für Kind A' },
    )

    const detail = await h.json<{
      process: { title: string; state: string }
      tasks: { title: string; state: string }[]
      nextActions: { title: string }[]
    }>(family.anna, 'GET', `${base()}/processes/${process.id}`)

    expect(detail.process.title).toBe('Neue Schuhe für Kind A')
    expect(detail.tasks).toHaveLength(8)
    // Nur der erste Schritt ist ausführbar – der Rest wartet auf seine Vorbedingung.
    expect(detail.nextActions.map((t) => t.title)).toEqual(['Füße messen'])
    expect(detail.tasks.filter((t) => t.state === 'blocked')).toHaveLength(7)
  })

  it('die Vorlage bleibt nach der Instanziierung unverändert wiederverwendbar', async () => {
    const list = await h.json<{ items: { id: string; steps: unknown[] }[] }>(family.anna, 'GET', `${base()}/playbooks`)
    expect(list.items.find((p) => p.id === playbookId)!.steps).toHaveLength(8)

    const second = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/playbooks/${playbookId}/instantiate`, {
      domainId,
    })
    expect(second.id).toBeTruthy()
  })

  it('das System schlägt passende Vorlagen vor, entscheidet aber nicht', async () => {
    const suggestions = await h.json<{ items: { title: string; reason: string; score: number }[] }>(
      family.anna,
      'GET',
      `${base()}/playbook-suggestions?domainId=${domainId}&title=${encodeURIComponent('Neue Schuhe besorgen')}`,
    )
    expect(suggestions.items.length).toBeGreaterThan(0)
    expect(suggestions.items[0]!.reason.length).toBeGreaterThan(10)
  })
})

describe('Bereichs-Detailansicht', () => {
  it('liefert Zustand, Wissen, Regeln und Vorgänge in einer Anfrage', async () => {
    await h.json(family.anna, 'POST', `${base()}/domains/${domainId}/state-definitions`, {
      key: 'shoe_size',
      label: 'Schuhgröße',
      dataType: 'number',
      freshnessInterval: 'P6W',
    })
    await h.json(family.anna, 'POST', `${base()}/knowledge`, { domainId, title: 'Marke X passt gut', body: 'Weite mittel.' })
    await h.json(family.anna, 'POST', `${base()}/questions`, { domainId, body: 'Passen die Gummistiefel noch?' })

    const detail = await h.json<{
      domain: { name: string }
      states: { definition: { label: string }; valueKind: string }[]
      knowledge: unknown[]
      questions: unknown[]
      processes: unknown[]
    }>(family.anna, 'GET', `${base()}/domains/${domainId}/detail`)

    expect(detail.domain.name).toBe('Schuhe')
    expect(detail.states[0]!.definition.label).toBe('Schuhgröße')
    // INV-010: ein frisch angelegter Zustand ist ausdrücklich „unbekannt", nicht leer.
    expect(detail.states[0]!.valueKind).toBe('unknown')
    expect(detail.knowledge).toHaveLength(1)
    expect(detail.questions).toHaveLength(1)
    expect(detail.processes.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Einstellungen', () => {
  it('erklärt jede Option im Klartext', async () => {
    const settings = await h.json<{
      name: string
      notificationContentLevel: string
      balanceViewEnabled: boolean
      explanations: Record<string, string>
    }>(family.anna, 'GET', `${base()}/settings`)

    expect(settings.notificationContentLevel).toBe('minimal')
    // §32: die Balance-Ansicht ist bewusst standardmäßig aus.
    expect(settings.balanceViewEnabled).toBe(false)
    expect(settings.explanations['notificationContentLevel']).toContain('Sperrbildschirm')
  })

  it('lässt Haushaltseinstellungen ändern', async () => {
    const updated = await h.json<{ name: string; notificationContentLevel: string }>(
      family.anna,
      'PATCH',
      `${base()}/settings`,
      { name: 'Familie Muster', notificationContentLevel: 'titles' },
    )
    expect(updated.name).toBe('Familie Muster')
    expect(updated.notificationContentLevel).toBe('titles')
  })

  it('verhindert, dass die letzte verwaltende Person sich herabstuft', async () => {
    const response = await h.request(family.anna, 'PATCH', `${base()}/members/${family.annaMembershipId}/role`, {
      role: 'adult',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json<{ code: string }>().code).toBe('last_admin')
  })

  it('listet alle Benachrichtigungsarten mit Erklärung – auch die nicht konfigurierten', async () => {
    const prefs = await h.json<{
      items: { notificationKind: string; channels: string[]; configurable: boolean; explanation: string }[]
      note: string
    }>(family.anna, 'GET', `${base()}/notification-preferences`)

    expect(prefs.items.length).toBeGreaterThan(15)
    for (const item of prefs.items) expect(item.explanation.length).toBeGreaterThan(10)

    const security = prefs.items.find((i) => i.notificationKind === 'security.new_login')!
    expect(security.configurable, 'Sicherheitsmeldungen sind nicht abwählbar').toBe(false)
    expect(prefs.note).toContain('geht nie verloren')
  })

  it('speichert geänderte Benachrichtigungseinstellungen', async () => {
    await h.json(family.anna, 'PUT', `${base()}/notification-preferences`, [
      { notificationKind: 'attention.new', priorityFloor: 'high', channels: ['in_app'], quietHours: null },
    ])
    const prefs = await h.json<{ items: { notificationKind: string; priorityFloor: string; channels: string[] }[] }>(
      family.anna,
      'GET',
      `${base()}/notification-preferences`,
    )
    const entry = prefs.items.find((i) => i.notificationKind === 'attention.new')!
    expect(entry.priorityFloor).toBe('high')
    expect(entry.channels).toEqual(['in_app'])
  })

  it('lehnt es ab, Sicherheitsmeldungen vollständig abzuschalten', async () => {
    const response = await h.request(family.anna, 'PUT', `${base()}/notification-preferences`, [
      { notificationKind: 'security.new_login', priorityFloor: 'low', channels: [], quietHours: null },
    ])
    expect(response.statusCode).toBe(422)
  })
})

describe('Push', () => {
  /**
   * Die Oberfläche muss vor dem Anbieten wissen, ob dieser Server überhaupt Push kann –
   * sonst verspricht sie etwas, das nie ankommt (docs/44, Befund C2).
   */
  it('nennt den öffentlichen Schlüssel oder sagt ehrlich, dass keiner konfiguriert ist', async () => {
    const config = await h.json<{ publicKey: string | null }>(family.anna, 'GET', '/api/v1/push/config')
    expect(config).toHaveProperty('publicKey')
    expect(config.publicKey === null || typeof config.publicKey === 'string').toBe(true)
  })

  it('gibt niemals den privaten Schlüssel heraus', async () => {
    const response = await h.request(family.anna, 'GET', '/api/v1/push/config')
    expect(response.body).not.toMatch(/private/i)
    expect(Object.keys(JSON.parse(response.body) as object)).toEqual(['publicKey'])
  })
})

describe('Kalenderverbindungen', () => {
  let connectionId: string

  it('legt eine ICS-Verbindung an und verschlüsselt die Adresse', async () => {
    const created = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/calendar-connections`, {
      provider: 'ics',
      displayName: 'Familienkalender',
      config: { url: 'https://example.invalid/family.ics' },
    })
    connectionId = created.id

    const list = await h.json<{ own: { id: string; provider: string; selections: { shareLevel: string }[] }[]; note: string }>(
      family.anna,
      'GET',
      `${base()}/calendar-connections`,
    )
    const connection = list.own.find((c) => c.id === connectionId)!
    expect(connection.provider).toBe('ics')
    // §22.8: Inhalte sind per Default verborgen.
    expect(connection.selections[0]!.shareLevel).toBe('busy')
    expect(list.note).toContain('verborgen')

    const { calendarConnections, withTenant } = await import('@thealotta/db')
    const { eq } = await import('drizzle-orm')
    const [row] = await withTenant(h.app.db, [family.householdId], async (tx) =>
      tx.select().from(calendarConnections).where(eq(calendarConnections.id, connectionId)),
    )
    expect(row!.credentialsCiphertext).not.toBeNull()
    expect(row!.credentialsCiphertext!.toString('utf8')).not.toContain('example.invalid')
    expect(row!.credentialsKeyId).toBe('k1')
  })

  it('lässt die Sichtbarkeit je Kalender einstellen', async () => {
    await h.json(family.anna, 'PATCH', `${base()}/calendar-connections/${connectionId}/selection`, {
      externalCalendarId: 'primary',
      readEnabled: true,
      writeEnabled: false,
      shareLevel: 'title',
    })
    const list = await h.json<{ own: { id: string; selections: { shareLevel: string }[] }[] }>(
      family.anna,
      'GET',
      `${base()}/calendar-connections`,
    )
    expect(list.own.find((c) => c.id === connectionId)!.selections[0]!.shareLevel).toBe('title')
  })

  it('erlaubt keinen Zugriff auf fremde Kalenderverbindungen – auch Admins nicht', async () => {
    const response = await h.request(family.ben, 'DELETE', `${base()}/calendar-connections/${connectionId}`)
    expect(response.statusCode).toBe(404)
  })

  it('trennt die Verbindung, ohne die gespiegelten Termine zu löschen (INV-012)', async () => {
    await h.request(family.anna, 'DELETE', `${base()}/calendar-connections/${connectionId}`)
    const list = await h.json<{ own: { id: string; state: string }[] }>(
      family.anna,
      'GET',
      `${base()}/calendar-connections`,
    )
    expect(list.own.find((c) => c.id === connectionId)!.state).toBe('disconnected')
  })
})
