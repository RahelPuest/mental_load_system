/**
 * Prüft genau die Endpunkte, die die Weboberfläche aufruft – Seite für Seite.
 *
 * Ergänzt den fachlichen Rauchtest um die Frage: Kann jede Seite ihre Daten laden und ihre
 * Aktionen ausführen?
 */
const BASE = process.env['SMOKE_BASE_URL'] ?? 'http://127.0.0.1:3001'
const EMAIL = process.env['SMOKE_EMAIL']!
const PASSWORD = process.env['SMOKE_PASSWORD'] ?? 'Korrekt-Pferd-Batterie-Klammer-7'

let cookies = ''
let csrf = ''
let failures = 0

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookies ? { cookie: cookies } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) cookies = setCookie.map((c) => c.split(';')[0]).join('; ')
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 200)}`)
  return (text ? JSON.parse(text) : {}) as T
}

async function check(page: string, label: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn()
    console.log(`  ✓ ${page.padEnd(16)} ${label}${detail ? ` → ${detail}` : ''}`)
  } catch (error) {
    failures += 1
    console.log(`  ✗ ${page.padEnd(16)} ${label} → ${error instanceof Error ? error.message : error}`)
  }
}

async function main(): Promise<void> {
  const login = await call<{ csrfToken: string }>('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
  csrf = login.csrfToken

  const households = await call<{ items: { id: string; name: string }[] }>('GET', '/api/v1/households')
  const id = households.items[0]!.id
  const hh = `/api/v1/households/${id}`
  console.log(`\nHaushalt: ${households.items[0]!.name}\n`)

  await check('Jetzt', 'Ansicht laden', async () => {
    const now = await call<{ sections: { key: string; items: unknown[] }[] }>('GET', `${hh}/now`)
    return `${now.sections.filter((s) => s.items.length).length} Abschnitte mit Inhalt`
  })
  await check('Erfassen', 'Notiz speichern', async () => {
    await call('POST', `${hh}/capture`, { text: 'Regenjacke Kind B prüfen' })
    return 'gespeichert'
  })
  await check('Eingang', 'Liste laden', async () => {
    const inbox = await call<{ items: unknown[] }>('GET', `${hh}/inbox`)
    return `${inbox.items.length} unverarbeitet`
  })

  const domains = await call<{ items: { id: string; name: string; path: string }[] }>('GET', `${hh}/domains`)
  await check('Bereiche', 'Baum laden', async () => `${domains.items.length} Bereiche`)

  const schuhe = domains.items.find((d) => d.path.endsWith('schuhe')) ?? domains.items[0]!
  await check('Bereich-Detail', 'Alles zu einem Bereich', async () => {
    const detail = await call<{
      states: unknown[]
      monitors: unknown[]
      knowledge: unknown[]
      questions: unknown[]
      processes: unknown[]
      attention: unknown[]
    }>('GET', `${hh}/domains/${schuhe.id}/detail`)
    return `${detail.states.length} Angaben, ${detail.monitors.length} Regeln, ${detail.knowledge.length} Wissen, ${detail.questions.length} Fragen, ${detail.processes.length} Vorgänge, ${detail.attention.length} Hinweise`
  })
  await check('Bereich-Detail', 'Verantwortungsverlauf', async () => {
    const history = await call<{ owners: unknown[] }>('GET', `${hh}/domains/${schuhe.id}/ownership-history`)
    return `${history.owners.length} Einträge`
  })

  await check('Aufmerksamkeit', 'Offene Hinweise', async () => {
    const attention = await call<{ items: unknown[] }>('GET', `${hh}/attention?state=open`)
    return `${attention.items.length} offen`
  })

  await check('Vorgänge', 'Laufende laden', async () => {
    const processes = await call<{ items: unknown[] }>('GET', `${hh}/processes?state=active`)
    return `${processes.items.length} laufend`
  })

  let playbookId = ''
  await check('Playbooks', 'Vorlage anlegen', async () => {
    const created = await call<{ id: string }>('POST', `${hh}/playbooks`, {
      domainId: schuhe.id,
      title: 'Neue Schuhe',
      triggerDescription: 'Schuhe zu klein, kaputt oder fehlen',
      steps: [
        { title: 'Füße messen', estimatedMinutes: 5, mentalEnergy: 'low' },
        { title: 'Schuhart bestimmen', estimatedMinutes: 5, mentalEnergy: 'medium' },
        { title: 'Größe bestimmen', estimatedMinutes: 5, mentalEnergy: 'low' },
        { title: 'Modelle auswählen', estimatedMinutes: 20, mentalEnergy: 'medium' },
        { title: 'Bestellen oder kaufen', estimatedMinutes: 30, mentalEnergy: 'medium' },
        { title: 'Anprobieren', estimatedMinutes: 10, mentalEnergy: 'low' },
        { title: 'Passform beurteilen', estimatedMinutes: 5, mentalEnergy: 'low' },
        { title: 'Gegebenenfalls retournieren', estimatedMinutes: 15, mentalEnergy: 'medium' },
        { title: 'Schuhgröße aktualisieren', estimatedMinutes: 2, mentalEnergy: 'low' },
        { title: 'Alte Schuhe aussortieren', estimatedMinutes: 10, mentalEnergy: 'low' },
      ],
    })
    playbookId = created.id
    return '10 Schritte'
  })
  await check('Playbooks', 'Liste laden', async () => {
    const list = await call<{ items: { steps: unknown[] }[] }>('GET', `${hh}/playbooks`)
    return `${list.items.length} Vorlagen`
  })
  await check('Playbooks', 'Vorgang daraus starten', async () => {
    const created = await call<{ id: string }>('POST', `${hh}/playbooks/${playbookId}/instantiate`, {
      domainId: schuhe.id,
    })
    const detail = await call<{ tasks: unknown[]; nextActions: { title: string }[] }>('GET', `${hh}/processes/${created.id}`)
    return `${detail.tasks.length} Schritte, als Nächstes: „${detail.nextActions[0]?.title}"`
  })

  await check('Wissen', 'Wissen, Fragen, Entscheidungen', async () => {
    const [k, q, d] = await Promise.all([
      call<{ items: unknown[] }>('GET', `${hh}/knowledge`),
      call<{ items: unknown[] }>('GET', `${hh}/questions?state=open`),
      call<{ items: unknown[] }>('GET', `${hh}/decisions`),
    ])
    return `${k.items.length} / ${q.items.length} / ${d.items.length}`
  })
  await check('Wissen', 'Entscheidung festhalten', async () => {
    await call('POST', `${hh}/decisions`, {
      title: 'Kinderschuhe bis etwa 70 €',
      body: 'Bei Winterstiefeln darf es mehr sein.',
      decisionKind: 'family_decision',
      bindingLevel: 'orientation',
      domainId: schuhe.id,
    })
    return 'gespeichert'
  })

  await check('Kalender', 'Verbindungen laden', async () => {
    const connections = await call<{ own: unknown[]; othersCount: number }>('GET', `${hh}/calendar-connections`)
    return `${connections.own.length} eigene, ${connections.othersCount} fremde`
  })
  await check('Kalender', 'Termine laden', async () => {
    const events = await call<{ items: unknown[] }>('GET', `${hh}/calendar-events`)
    return `${events.items.length} Termine`
  })

  await check('Familie', 'Übersicht', async () => {
    const overview = await call<{ domains: unknown[]; unownedCritical: unknown[]; reducedCapacity: unknown[] }>(
      'GET',
      `${hh}/overview`,
    )
    return `${overview.domains.length} Bereiche, ${overview.unownedCritical.length} ohne Zuständigkeit`
  })
  await check('Familie', 'Kapazität und Vertretungen', async () => {
    const [capacity, coverages, members] = await Promise.all([
      call<{ level: string }>('GET', `${hh}/capacity/me`),
      call<{ items: unknown[] }>('GET', `${hh}/coverages`),
      call<{ items: unknown[] }>('GET', `${hh}/members`),
    ])
    return `Kapazität ${capacity.level}, ${coverages.items.length} Vertretungen, ${members.items.length} Mitglieder`
  })

  await check('Einstellungen', 'Haushalt', async () => {
    const settings = await call<{ name: string; explanations: Record<string, string> }>('GET', `${hh}/settings`)
    return `${settings.name}, ${Object.keys(settings.explanations).length} Erklärungen`
  })
  await check('Einstellungen', 'Benachrichtigungen', async () => {
    const prefs = await call<{ items: unknown[] }>('GET', `${hh}/notification-preferences`)
    return `${prefs.items.length} Arten`
  })
  await check('Einstellungen', 'Geräte', async () => {
    const devices = await call<{ items: unknown[] }>('GET', `${hh}/push-subscriptions`)
    return `${devices.items.length} Geräte`
  })
  await check('Einstellungen', 'Personen', async () => {
    const persons = await call<{ items: unknown[] }>('GET', `${hh}/persons`)
    return `${persons.items.length} Personen`
  })
  await check('Suche', 'Globale Suche (⌘K)', async () => {
    const result = await call<{ items: { kind: string; title: string }[] }>('GET', `${hh}/search?q=schuh`)
    const kinds = [...new Set(result.items.map((i) => i.kind))]
    return `${result.items.length} Treffer über ${kinds.length} Arten (${kinds.join(', ')})`
  })
  await check('Einstellungen', 'Wer sieht was', async () => {
    const grants = await call<{ items: unknown[] }>('GET', `${hh}/grants`)
    return `${grants.items.length} zusätzliche Zugänge`
  })
  await check('Jetzt', 'Rückgängig nach Erledigt', async () => {
    const now = await call<{ sections: { key: string; items: { subjectType: string; subjectId: string }[] }[] }>(
      'GET',
      `${hh}/now`,
    )
    const task = now.sections.flatMap((s) => s.items).find((i) => i.subjectType === 'task')
    if (!task) return 'keine Aufgabe zum Prüfen vorhanden'
    await call('POST', `${hh}/tasks/${task.subjectId}/complete`, {})
    await call('POST', `${hh}/tasks/${task.subjectId}/reopen`, {})
    return 'erledigt und zurückgenommen'
  })

  await check('Einstellungen', 'Sicherheitsprotokoll', async () => {
    const audit = await call<{ items: unknown[] }>('GET', `${hh}/audit`)
    return `${audit.items.length} Einträge`
  })

  // ── Zweiter Durchgang: die nachgezogenen Funktionen ──
  await check('Familie', 'Care Mode', async () => {
    const members = await call<{ items: { id: string; displayName: string }[] }>('GET', `${hh}/members`)
    const care = await call<{ needsHandover: unknown[]; canPause: unknown[]; alreadyCovered: unknown[] }>(
      'GET',
      `${hh}/care-mode/${members.items[0]!.id}`,
    )
    return `${care.needsHandover.length} zu übernehmen, ${care.alreadyCovered.length} vertreten, ${care.canPause.length} darf ruhen`
  })
  await check('Familie', 'Verteilung (Bänder)', async () => {
    const balance = await call<{ dimensions: { label: string }[]; dataQuality: { domainsWithOwner: number } }>(
      'GET',
      `${hh}/balance`,
    )
    return `${balance.dimensions.length} Dimensionen, ${balance.dataQuality.domainsWithOwner} Bereiche mit Owner`
  })
  await check('Bereich-Detail', 'Wissensübergabe', async () => {
    const handover = await call<{ openStates: unknown[]; knowledgePrompts: unknown[] }>(
      'GET',
      `${hh}/domains/${schuhe.id}/handover`,
    )
    return `${handover.openStates.length} offene Angaben, ${handover.knowledgePrompts.length} Leitfragen`
  })
  await check('Bereich-Detail', 'Bedürfnisse', async () => {
    const created = await call<{ id: string }>('POST', `${hh}/needs`, {
      domainId: schuhe.id,
      description: 'Kind A braucht passende Winterschuhe',
      criticality: 'normal',
    })
    const list = await call<{ items: unknown[] }>('GET', `${hh}/needs`)
    await call('POST', `${hh}/needs/${created.id}/resolve`, { state: 'met' })
    return `${list.items.length} offen, danach erfüllt`
  })
  await check('Meldungen', 'In-App-Benachrichtigungen', async () => {
    const list = await call<{ items: unknown[]; unread: number }>('GET', `${hh}/notifications`)
    return `${list.items.length} gesamt, ${list.unread} ungelesen`
  })
  await check('Einstellungen', 'Einladungen', async () => {
    const list = await call<{ items: unknown[] }>('GET', `${hh}/invitations`)
    return `${list.items.length} offen`
  })
  await check('Bereich-Detail', 'Verlauf', async () => {
    const history = await call<{ items: unknown[] }>('GET', `${hh}/history?domainId=${schuhe.id}&limit=20`)
    return `${history.items.length} Ereignisse`
  })
  await check('Aufgaben', 'Zuweisen und Warten', async () => {
    const members = await call<{ items: { id: string }[] }>('GET', `${hh}/members`)
    const task = await call<{ id: string }>('POST', `${hh}/tasks`, { title: 'Rauchtest-Aufgabe', domainId: schuhe.id })
    await call('POST', `${hh}/tasks/${task.id}/assign`, {
      membershipId: members.items[0]!.id,
      delegationKind: 'delegated',
    })
    await call('POST', `${hh}/tasks/${task.id}/wait`, {
      waitingKind: 'external_party',
      description: 'Rückruf der Praxis',
      recheckAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    await call('POST', `${hh}/tasks/${task.id}/release-wait`)
    await call('POST', `${hh}/tasks/${task.id}/drop`, { reason: 'Rauchtest beendet' })
    return 'zugewiesen, gewartet, freigegeben'
  })

  // ── Dritter Durchgang: was vorher versprochen, aber nicht angeschlossen war ──
  await check('Einstellungen', 'Push-Konfiguration', async () => {
    const config = await call<{ publicKey: string | null }>('GET', '/api/v1/push/config')
    return config.publicKey ? 'Schlüssel vorhanden' : 'kein Schlüssel – Oberfläche sagt das ehrlich'
  })
  await check('Jetzt', 'Bin dran / nicht mehr nötig', async () => {
    const task = await call<{ id: string }>('POST', `${hh}/tasks`, { title: 'Rauchtest Ausgänge', domainId: schuhe.id })
    await call('POST', `${hh}/tasks/${task.id}/start`)
    await call('POST', `${hh}/tasks/${task.id}/drop`, { reason: 'Rauchtest beendet' })
    return 'gestartet und aus der Übersicht genommen'
  })
  await check('Bereich-Detail', 'Ablauf-Vorschläge', async () => {
    const suggestions = await call<{ items: { title: string; reason: string }[] }>(
      'GET',
      `${hh}/playbook-suggestions?domainId=${schuhe.id}&title=${encodeURIComponent('Neue Schuhe besorgen')}`,
    )
    return `${suggestions.items.length} Vorschläge${suggestions.items[0] ? `: ${suggestions.items[0].reason}` : ''}`
  })

  // ── Vierter Durchgang: die neuen Übersichtsseiten ──
  await check('Wissen', 'Notizen, Fragen, Entscheidungen', async () => {
    const [k, q, d] = await Promise.all([
      call<{ items: unknown[] }>('GET', `${hh}/knowledge`),
      call<{ items: unknown[] }>('GET', `${hh}/questions?state=open`),
      call<{ items: unknown[] }>('GET', `${hh}/decisions`),
    ])
    return `${k.items.length} Notizen, ${q.items.length} offene Fragen, ${d.items.length} Entscheidungen`
  })
  await check('Beobachtung', 'Regeln und Meldungen', async () => {
    const [m, a] = await Promise.all([
      call<{ items: { enabled: boolean }[] }>('GET', `${hh}/monitors`),
      call<{ items: unknown[] }>('GET', `${hh}/attention?state=open`),
    ])
    return `${m.items.filter((x) => x.enabled).length} aktive Regeln, ${a.items.length} gemeldet`
  })
  await check('Vorgänge', 'Übersicht über alle Bereiche', async () => {
    const [active, done] = await Promise.all([
      call<{ items: unknown[] }>('GET', `${hh}/processes?state=active`),
      call<{ items: unknown[] }>('GET', `${hh}/processes?state=completed`),
    ])
    return `${active.items.length} laufend, ${done.items.length} abgeschlossen`
  })

  console.log(
    failures === 0
      ? '\nAlle von der Oberfläche genutzten Endpunkte antworten.\n'
      : `\n${failures} Aufruf(e) fehlgeschlagen.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('Abbruch:', error instanceof Error ? error.message : error)
  process.exit(1)
})

// Ohne Import oder Export gälte diese Datei als globales Skript.
export {}
