import { describe, expect, it } from 'vitest'
import { decide } from '../src/authz/decide.js'
import { DOMAINS, HH, OTHER_HH, ctx, grant, res } from './helpers.js'

describe('decide()', () => {
  it('verweigert Zugriff auf einen fremden Haushalt und nennt das Tenant-Gate', () => {
    const d = decide(ctx({ role: 'admin' }), 'domain:read', res({ householdId: OTHER_HH }))
    expect(d.allowed).toBe(false)
    expect(d.matchedRule).toBe('tenant_gate')
  })

  it('erteilt Rollenrechte an Erwachsene', () => {
    const d = decide(ctx(), 'domain:read', res())
    expect(d.allowed).toBe(true)
    expect(d.matchedRule).toBe('role:adult:domain:read')
  })

  it('gibt Kindern kein household-weites Leserecht auf Bereiche', () => {
    expect(decide(ctx({ role: 'child' }), 'domain:read', res()).allowed).toBe(false)
    expect(decide(ctx({ role: 'teen' }), 'domain:read', res()).allowed).toBe(false)
    expect(decide(ctx({ role: 'guest' }), 'domain:read', res()).allowed).toBe(false)
  })

  it('öffnet einen Bereich für eine Betreuungsperson per Domain-Grant – inklusive Unterbereichen', () => {
    const c = ctx({
      role: 'caregiver',
      grants: [grant({ capability: 'domain:read', scopeType: 'domain', scopeId: DOMAINS.kleidung.id })],
    })
    expect(decide(c, 'domain:read', res({ domainId: DOMAINS.schuhe.id })).allowed).toBe(true)
    expect(decide(c, 'domain:read', res({ domainId: DOMAINS.gesundheit.id })).allowed).toBe(false)
  })

  it('lässt ein Deny-Grant jedes Allow schlagen', () => {
    const c = ctx({
      role: 'admin',
      grants: [grant({ capability: 'state:read', scopeType: 'domain', scopeId: DOMAINS.gesundheit.id, effect: 'deny' })],
    })
    const d = decide(c, 'state:read', res({ domainId: DOMAINS.gesundheit.id }))
    expect(d.allowed).toBe(false)
    expect(d.matchedRule).toMatch(/^deny_grant/)
  })

  it('stoppt an der Sensitivity-Obergrenze – das Beispiel aus §7.3', () => {
    const c = ctx({
      role: 'caregiver',
      grants: [
        grant({
          capability: 'knowledge:read',
          scopeType: 'domain',
          scopeId: DOMAINS.gesundheit.id,
          maxSensitivity: 'health',
        }),
      ],
    })
    const inDomain = { domainId: DOMAINS.gesundheit.id, householdId: HH, type: 'knowledge_item', id: 'k1' }
    expect(decide(c, 'knowledge:read', { ...inDomain, sensitivity: 'health' }).allowed).toBe(true)
    const blocked = decide(c, 'knowledge:read', { ...inDomain, sensitivity: 'sensitive' })
    expect(blocked.allowed).toBe(false)
    expect(blocked.matchedRule).toContain('sensitivity_ceiling')
  })

  it('gibt auch Admins nicht automatisch Zugriff auf "sensitive"-Inhalte (Q-05)', () => {
    const d = decide(ctx({ role: 'admin' }), 'knowledge:read', res({ type: 'knowledge_item', sensitivity: 'sensitive' }))
    expect(d.allowed).toBe(false)
    expect(d.matchedRule).toContain('sensitivity_ceiling')
  })

  it('ignoriert abgelaufene Grants', () => {
    const c = ctx({
      role: 'caregiver',
      grants: [
        grant({
          capability: 'domain:read',
          scopeType: 'domain',
          scopeId: DOMAINS.schuhe.id,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ],
    })
    expect(decide(c, 'domain:read', res()).allowed).toBe(false)
  })

  it('räumt Ownern Rechte im gesamten Unterbaum ein', () => {
    const c = ctx({
      role: 'adult',
      assignments: [{ domainId: DOMAINS.kleidung.id, membershipId: 'm1', assignmentKind: 'primary_owner' }],
    })
    expect(decide(c, 'monitor:manage', res({ domainId: DOMAINS.schuhe.id })).allowed).toBe(true)
    expect(decide(c, 'monitor:manage', res({ domainId: DOMAINS.gesundheit.id })).allowed).toBe(false)
  })

  it('liefert für jede Entscheidung eine nachvollziehbare Begründung', () => {
    for (const c of [ctx(), ctx({ role: 'child' }), ctx({ role: 'admin' })]) {
      const d = decide(c, 'state:write', res())
      expect(d.reason.length).toBeGreaterThan(10)
      expect(d.matchedRule.length).toBeGreaterThan(0)
    }
  })
})

/**
 * §3.1: Ablehnungsgründe werden gelesen – von Menschen.
 *
 * `reason` reist über `forbidden()` als `detail` in der Fehlerantwort bis in die Oberfläche.
 * Solange die Oberfläche nur den Titel zeigte, fiel nicht auf, dass dort Modellbezeichner
 * standen: „Für „domain:archive" liegt keine Berechtigung vor." Seit der ausführliche Satz
 * angezeigt wird, ist jeder davon sichtbar.
 *
 * Der maschinenlesbare Teil geht dabei nicht verloren – er steht in `matchedRule`.
 */
describe('Ablehnungen sind lesbar', () => {
  /* Bezeichner aus dem Modell, die niemandem etwas sagen. */
  const MODEL_TOKENS = [
    /[a-z_]+:[a-z_]+/, // Capabilities wie „domain:archive"
    /\b(admin|adult|caregiver|teen|child|guest)\b/,
    /\b(public|normal|private|health|sensitive)\b/,
    /\b(household|domain|object)\b/,
  ]

  const refusals: { was: string; d: ReturnType<typeof decide> }[] = [
    { was: 'fremder Haushalt', d: decide(ctx({ role: 'admin' }), 'domain:read', res({ householdId: OTHER_HH })) },
    { was: 'keine Rolle deckt es ab', d: decide(ctx({ role: 'child' }), 'domain:read', res()) },
    { was: 'fehlendes Verwaltungsrecht', d: decide(ctx({ role: 'adult' }), 'domain:archive', res()) },
    {
      was: 'Einstufung über der Obergrenze',
      d: decide(ctx({ role: 'adult' }), 'knowledge:read', res({ sensitivity: 'sensitive' })),
    },
  ]

  for (const { was, d } of refusals) {
    it(`„${was}" wird ohne Modellbegriffe begründet`, () => {
      expect(d.allowed, 'dieser Fall wird gar nicht abgelehnt – der Test prüft nichts').toBe(false)
      for (const token of MODEL_TOKENS) {
        expect(d.reason, `„${d.reason}" enthält einen Begriff aus dem Modell`).not.toMatch(token)
      }
      expect(d.reason.length, 'ein leerer Grund ist keiner').toBeGreaterThan(10)
      expect(d.matchedRule, 'die maschinenlesbare Spur fehlt').toBeTruthy()
    })
  }
})
