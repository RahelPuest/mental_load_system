/**
 * Rauchtest gegen eine laufende API (docs/27 §5, Schritt „Verifikation").
 *
 * Prüft den Kernpfad in echt: anmelden, Jetzt-Ansicht laden, Monitore auswerten lassen,
 * Aufmerksamkeit prüfen. Wird in CI nach dem Start des Stacks ausgeführt.
 */
const BASE = process.env['SMOKE_BASE_URL'] ?? 'http://localhost:3000'
const EMAIL = process.env['SMOKE_EMAIL']
const PASSWORD = process.env['SMOKE_PASSWORD'] ?? 'Korrekt-Pferd-Batterie-Klammer-7'

let cookies = ''
let csrf = ''

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
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

async function main(): Promise<void> {
  const health = await call<{ status: string }>('GET', '/health/ready')
  console.log(`  /health/ready       → ${health.status}`)

  if (!EMAIL) {
    console.log('  (SMOKE_EMAIL nicht gesetzt – nur Health geprüft)')
    return
  }

  const login = await call<{ csrfToken: string }>('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
  csrf = login.csrfToken
  console.log('  Anmeldung           → ok')

  const households = await call<{ items: { id: string; name: string }[] }>('GET', '/api/v1/households')
  const household = households.items[0]
  if (!household) throw new Error('Kein Haushalt gefunden')
  console.log(`  Haushalt            → ${household.name}`)

  const monitors = await call<{ items: { id: string; name: string }[] }>(
    'GET',
    `/api/v1/households/${household.id}/monitors`,
  )
  let signals = 0
  for (const monitor of monitors.items) {
    const result = await call<{ signalsCreated: number }>(
      'POST',
      `/api/v1/households/${household.id}/monitors/${monitor.id}/evaluate`,
    )
    signals += result.signalsCreated
  }
  console.log(`  Monitore            → ${monitors.items.length} ausgewertet, ${signals} neue Hinweise`)

  const attention = await call<{ items: { title: string; whyNow: string }[] }>(
    'GET',
    `/api/v1/households/${household.id}/attention?state=open`,
  )
  console.log(`  Aufmerksamkeit      → ${attention.items.length} offen`)
  for (const item of attention.items) console.log(`      · ${item.title} – ${item.whyNow}`)

  const now = await call<{ sections: { key: string; label: string; items: { title: string; why: { label: string }[] }[] }[] }>(
    'GET',
    `/api/v1/households/${household.id}/now?contexts=home,person%3Akind-a`,
  )
  console.log('  Jetzt-Ansicht:')
  for (const section of now.sections.filter((s) => s.items.length > 0)) {
    console.log(`      ${section.label}:`)
    for (const item of section.items) {
      console.log(`        · ${item.title} (${item.why.map((w) => w.label).join(', ')})`)
    }
  }

  const overview = await call<{ unownedCritical: { path: string }[]; note: string }>(
    'GET',
    `/api/v1/households/${household.id}/overview`,
  )
  console.log(`  Ohne Verantwortung  → ${overview.unownedCritical.map((d) => d.path).join(', ') || 'keine'}`)
  console.log('\nRauchtest erfolgreich.')
}

main().catch((error: unknown) => {
  console.error('Rauchtest fehlgeschlagen:', error instanceof Error ? error.message : error)
  process.exit(1)
})

// Ohne Import oder Export gälte diese Datei als globales Skript.
export {}
