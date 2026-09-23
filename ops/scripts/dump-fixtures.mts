/**
 * Nimmt echte API-Antworten auf und legt sie als Fixtures für die Oberflächentests ab.
 *
 * Aufruf: `SMOKE_EMAIL=<adresse> pnpm fixtures` gegen den laufenden Stack.
 *
 * Der Grund für echte Mitschnitte statt erfundener Attrappen: Attrappen bestätigen nur,
 * was man beim Schreiben des Tests ohnehin geglaubt hat. Ein Mitschnitt fällt auf, wenn
 * sich ein Vertrag ändert (docs/44 §1).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
const BASE = process.env.API ?? 'http://127.0.0.1:3001/api/v1'
const jar: string[] = []
async function call(method: string, path: string, body?: unknown) {
  const csrf = jar.join('; ').match(/thealotta_csrf=([^;]+)/)?.[1] ?? ''
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie: jar.join('; '), 'x-csrf-token': csrf },
    body: body ? JSON.stringify(body) : undefined,
  })
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0]!
    const name = kv.split('=')[0]
    const i = jar.findIndex((e) => e.startsWith(name + '='))
    if (i >= 0) jar[i] = kv; else jar.push(kv)
  }
  const text = await r.text()
  return { status: r.status, body: text ? JSON.parse(text) : null }
}
const email = process.env.SMOKE_EMAIL!
await call('POST', '/auth/login', { email, password: process.env.SMOKE_PASSWORD ?? 'Korrekt-Pferd-Batterie-Klammer-7' })
const me = await call('GET', '/auth/me')
const hs = await call('GET', '/households')
const hh = hs.body.items[0].id
const domains = await call('GET', `/households/${hh}/domains`)
const domainId = domains.body.items.find((d: { name: string }) => d.name === 'Schuhe')?.id ?? domains.body.items[0].id
const out: Record<string, unknown> = { 'auth/me': me.body, households: hs.body, domains: domains.body }
const paths: Record<string, string> = {
  now: 'now', agenda: 'agenda?days=14', inbox: 'inbox', attention: 'attention?state=open', members: 'members',
  persons: 'persons', notifications: 'notifications', balance: 'balance',
  invitations: 'invitations', playbooks: 'playbooks', needs: 'needs', grants: 'grants',
  audit: 'audit', coverages: 'coverages', overview: 'overview', settings: 'settings',
  'capacity/me': 'capacity/me', knowledge: 'knowledge', colors: 'colors',
  decisions: 'decisions', monitors: 'monitors', questions: 'questions?state=open',
  processes: 'processes?state=active', 'calendar-connections': 'calendar-connections',
  'calendar-events': 'calendar-events', 'notification-preferences': 'notification-preferences',
  'push-subscriptions': 'push-subscriptions', exports: 'exports',
  'deletion-requests': 'deletion-requests', search: 'search?q=schuh',
  history: `history?domainId=${domainId}&limit=20`,
  'domains/detail': `domains/${domainId}/detail`,
  'domains/handover': `domains/${domainId}/handover`,
  'domains/ownership-history': `domains/${domainId}/ownership-history`,
  'domains/state-definitions': `domains/${domainId}/state-definitions`,
}
for (const [key, p] of Object.entries(paths)) {
  const r = await call('GET', `/households/${hh}${p ? '/' + p : ''}`)
  out[key] = r.status === 200 ? r.body : { __status: r.status, ...(r.body as object) }
  console.log(String(r.status).padEnd(4), key)
}
mkdirSync('apps/web/test/fixtures', { recursive: true })
writeFileSync('apps/web/test/fixtures/api.json', JSON.stringify({ householdId: hh, domainId, responses: out }, null, 2))
console.log('geschrieben')
