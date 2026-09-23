import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Zweiter Durchgang: die Funktionen, die zuvor nirgends erreichbar waren.
 * §7.1 Beitritt · §19 Wissensübergabe · §25.2 Care Mode · §32 Verteilung · §4 Needs · §28 Meldungen
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
let criticalDomainId: string

const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'zweiter')

  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Kleidung' })).id
  criticalDomainId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, {
      name: 'Medikamente',
      criticality: 'critical',
    })
  ).id
  await h.json(family.anna, 'POST', `${base()}/domains/${domainId}/claim`, {})
  await h.json(family.anna, 'POST', `${base()}/domains/${criticalDomainId}/claim`, {})
}, 180_000)
afterAll(async () => h.stop())

describe('§7.1 – Einladung und Beitritt', () => {
  let inviteUrl = ''
  // Die Testdatenbank wird zwischen Läufen nicht geleert – die Adresse muss eindeutig sein.
  const invitedEmail = `neu-${Date.now().toString(36)}@example.invalid`

  it('eine Einladung entsteht mit Link und Ablaufdatum', async () => {
    const result = await h.json<{ id: string; inviteUrl: string; expiresAt: string }>(
      family.anna,
      'POST',
      `${base()}/invitations`,
      { email: invitedEmail, role: 'adult' },
    )
    inviteUrl = result.inviteUrl
    expect(inviteUrl).toMatch(/^\/beitreten\//)
    // Die Frist entsteht an der Harness-Uhr, nicht an der Wanduhr: gegen `Date.now()` geprüft
    // wäre dieser Test ab dem achten Tag nach der festen Uhrzeit rot, ohne dass sich etwas ändert.
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(h.clock.now().getTime())
  })

  it('die Vorschau verrät den Haushalt, aber nicht die volle Adresse', async () => {
    const token = inviteUrl.split('/').at(-1)!
    const preview = await h.json<{ householdName: string; role: string; emailHint: string }>(
      null,
      'GET',
      `/api/v1/invitations/${token}/preview`,
    )
    expect(preview.role).toBe('adult')
    // Ohne Anmeldung erreichbar – deshalb nur ein Hinweis auf die Adresse, nicht die Adresse.
    expect(preview.emailHint).toBe('n…@example.invalid')
    expect(preview.emailHint).not.toContain(invitedEmail.split('@')[0])
  })

  it('nur die eingeladene Adresse kann beitreten', async () => {
    const token = inviteUrl.split('/').at(-1)!
    const wrongPerson = await h.register(`fremd-${Date.now()}@example.invalid`, 'Fremd')

    const refused = await h.request(wrongPerson, 'POST', `/api/v1/invitations/${token}/accept`, { confirm: true })
    expect(refused.statusCode).toBe(422)
    expect(refused.json<{ code: string }>().code).toBe('invitation_email_mismatch')
  })

  it('die eingeladene Person tritt bei und ist danach Mitglied', async () => {
    const token = inviteUrl.split('/').at(-1)!
    const invited = await h.register(invitedEmail, 'Neu')

    const result = await h.json<{ householdId: string }>(invited, 'POST', `/api/v1/invitations/${token}/accept`, {
      confirm: true,
    })
    expect(result.householdId).toBe(family.householdId)

    const households = await h.json<{ items: { id: string }[] }>(invited, 'GET', '/api/v1/households')
    expect(households.items.map((x) => x.id)).toContain(family.householdId)
  })

  it('ein bereits eingelöster Link funktioniert nicht erneut', async () => {
    const token = inviteUrl.split('/').at(-1)!
    const response = await h.request(null, 'GET', `/api/v1/invitations/${token}/preview`)
    expect(response.statusCode).toBe(404)
  })
})

describe('§25.2 – Care Mode', () => {
  it('zeigt, was übernommen werden muss und was ruhen darf', async () => {
    const care = await h.json<{
      member: { displayName: string }
      needsHandover: { name: string }[]
      canPause: { name: string }[]
      note: string
    }>(family.anna, 'GET', `${base()}/care-mode/${family.annaMembershipId}`)

    expect(care.member.displayName).toBe('Anna')
    expect(care.needsHandover.map((e) => e.name)).toContain('Medikamente')
    expect(care.canPause.map((e) => e.name)).toContain('Kleidung')
    // §42: keine Bewertung der Person.
    expect(care.note).toContain('kein Urteil')
  })

  it('nach eingerichteter Vertretung gilt der Bereich als versorgt', async () => {
    await h.json(family.anna, 'POST', `${base()}/coverages`, {
      domainId: criticalDomainId,
      coveringMembershipId: family.benMembershipId,
      startsAt: h.clock.now().toISOString(),
      endsAt: new Date(h.clock.now().getTime() + 14 * 86_400_000).toISOString(),
      returnMode: 'require_confirmation',
    })

    const care = await h.json<{ needsHandover: unknown[]; alreadyCovered: { name: string }[] }>(
      family.anna,
      'GET',
      `${base()}/care-mode/${family.annaMembershipId}`,
    )
    expect(care.needsHandover).toHaveLength(0)
    expect(care.alreadyCovered.map((e) => e.name)).toContain('Medikamente')
  })
})

describe('§32 / ADR-0012 – Verteilung als Bänder', () => {
  it('liefert Dimensionen mit Bändern und ohne jede Zahl', async () => {
    const balance = await h.json<{
      dimensions: { label: string; question: string; members: { band: string }[] }[]
      dataQuality: { note: string }
      note: string
    }>(family.anna, 'GET', `${base()}/balance`)

    expect(balance.dimensions.length).toBeGreaterThanOrEqual(5)
    for (const dimension of balance.dimensions) {
      expect(dimension.question.length).toBeGreaterThan(10)
      for (const member of dimension.members) {
        expect(['deutlich mehr', 'mehr', 'ausgeglichen', 'weniger', 'deutlich weniger']).toContain(member.band)
      }
    }
    expect(balance.dataQuality.note).toContain('Bereichen')
    expect(balance.note).toContain('Gesprächsgrundlage')
  })

  it('enthält nirgends einen Prozentwert oder Punktestand (INV-015)', async () => {
    const raw = await h.request(family.anna, 'GET', `${base()}/balance`)
    const body = raw.body
    expect(body).not.toMatch(/percentage|"score"|"rank"|%/)
  })
})

describe('§19 – Wissensübergabe', () => {
  it('macht aus dem Zustand eines Bereichs einen Gesprächsleitfaden', async () => {
    await h.json(family.anna, 'POST', `${base()}/domains/${domainId}/state-definitions`, {
      key: 'schuhgroesse',
      label: 'Schuhgröße',
      dataType: 'number',
      freshnessInterval: 'P6W',
    })
    await h.json(family.anna, 'POST', `${base()}/questions`, { domainId, body: 'Wo liegen die Ersatzsachen?' })

    const handover = await h.json<{
      openStates: { question: string }[]
      openQuestions: { body: string }[]
      knowledgePrompts: string[]
      note: string
    }>(family.anna, 'GET', `${base()}/domains/${domainId}/handover`)

    // Eine frisch angelegte Angabe ist „unbekannt" und damit Teil der Übergabe.
    expect(handover.openStates.map((s) => s.question).join(' ')).toContain('Schuhgröße')
    expect(handover.openQuestions.map((q) => q.body)).toContain('Wo liegen die Ersatzsachen?')
    expect(handover.knowledgePrompts.length).toBeGreaterThan(4)
    expect(handover.note).toContain('Gesprächsleitfaden')
  })
})

describe('§4 – Needs bestehen unabhängig von Signalen', () => {
  it('lassen sich festhalten und später als erfüllt vermerken', async () => {
    const need = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/needs`, {
      domainId,
      description: 'Kind A braucht passende Winterschuhe',
      criticality: 'normal',
    })

    const open = await h.json<{ items: { id: string }[]; note: string }>(family.anna, 'GET', `${base()}/needs`)
    expect(open.items.map((n) => n.id)).toContain(need.id)
    expect(open.note).toContain('bleibt bestehen')

    await h.json(family.anna, 'POST', `${base()}/needs/${need.id}/resolve`, { state: 'met' })
    const after = await h.json<{ items: { id: string }[] }>(family.anna, 'GET', `${base()}/needs`)
    expect(after.items.map((n) => n.id)).not.toContain(need.id)
  })
})

describe('§28 – Benachrichtigungen sind sichtbar', () => {
  it('listet auch unterdrückte Meldungen mit Begründung', async () => {
    const { notifications, uuidv7, withTenant } = await import('@thealotta/db')
    await withTenant(h.app.db, [family.householdId], async (tx) => {
      await tx.insert(notifications).values([
        {
          id: uuidv7(),
          householdId: family.householdId,
          recipientMembershipId: family.annaMembershipId,
          notificationKind: 'attention.new',
          priority: 'normal',
          title: 'Etwas braucht Aufmerksamkeit',
          dedupeKey: `test-${Date.now()}-a`,
        },
        {
          id: uuidv7(),
          householdId: family.householdId,
          recipientMembershipId: family.annaMembershipId,
          notificationKind: 'task.due_soon',
          priority: 'low',
          title: 'Leise zugestellt',
          dedupeKey: `test-${Date.now()}-b`,
          state: 'suppressed',
          suppressedReason: 'wenig Kapazität',
        },
      ])
    })

    const list = await h.json<{ items: { title: string; state: string }[]; unread: number; note: string }>(
      family.anna,
      'GET',
      `${base()}/notifications`,
    )
    expect(list.items.map((n) => n.title)).toContain('Leise zugestellt')
    expect(list.unread).toBeGreaterThanOrEqual(2)
    // §28.1: Was leise zugestellt wurde, ist trotzdem auffindbar.
    expect(list.note).toContain('geht nicht verloren')
  })

  it('lassen sich als gelesen markieren', async () => {
    await h.json(family.anna, 'POST', `${base()}/notifications/read-all`)
    const list = await h.json<{ unread: number }>(family.anna, 'GET', `${base()}/notifications`)
    expect(list.unread).toBe(0)
  })

  it('zeigt nur die eigenen Meldungen', async () => {
    const list = await h.json<{ items: unknown[] }>(family.ben, 'GET', `${base()}/notifications`)
    expect(list.items).toHaveLength(0)
  })
})

describe('§7.4 – alle fünf Arten von Beteiligung', () => {
  it('Support und Observer lassen sich neben der Hauptverantwortung eintragen', async () => {
    for (const kind of ['secondary_owner', 'support', 'observer']) {
      const response = await h.request(family.anna, 'POST', `${base()}/domains/${domainId}/assignments`, {
        membershipId: family.benMembershipId,
        assignmentKind: kind,
      })
      expect(response.statusCode, kind).toBe(201)
    }
  })

  it('geteilte Verantwortung schließt eine Hauptverantwortung aus (Q-03)', async () => {
    const response = await h.request(family.anna, 'POST', `${base()}/domains/${domainId}/assignments`, {
      membershipId: family.benMembershipId,
      assignmentKind: 'shared_owner',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json<{ code: string }>().code).toBe('shared_ownership_conflict')
  })
})

describe('Konto: Passwort ändern', () => {
  it('verlangt das aktuelle Passwort und beendet danach alle Sitzungen', async () => {
    const person = await h.register(`pw-${Date.now()}@example.invalid`, 'Passwort')

    const wrong = await h.request(person, 'POST', '/api/v1/auth/password', {
      currentPassword: 'falsch-aber-lang-genug',
      newPassword: 'Neues-Sicheres-Kennwort-99',
    })
    expect(wrong.statusCode).toBe(422)

    const ok = await h.json<{ note: string }>(person, 'POST', '/api/v1/auth/password', {
      currentPassword: 'Korrekt-Pferd-Batterie-Klammer-7',
      newPassword: 'Neues-Sicheres-Kennwort-99',
    })
    expect(ok.note).toContain('Sitzungen beendet')

    // Die alte Sitzung gilt nicht mehr – genau darum geht es.
    const afterChange = await h.request(person, 'GET', '/api/v1/auth/me')
    expect(afterChange.statusCode).toBe(401)
  })
})
