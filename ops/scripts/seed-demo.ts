/**
 * Erzeugt einen realistischen Demo-Haushalt (docs/26 §4).
 *
 * Zweck: manuelle Erprobung, Lasttests und ein schneller Blick darauf, ob sich das Produkt
 * mit echten Daten richtig anfühlt. Der Datensatz enthält bewusst auch unbequeme Fälle –
 * eine veraltete Angabe, eine offene Frage, einen Bereich ohne Verantwortung.
 */
import { eq } from 'drizzle-orm'
import { seedMeals } from './demo-meals.js'
import { createDb, uuidv7, withTenant } from '@thealotta/db'
import {
  playbookSteps,
  playbooks,
  domains,
  householdMemberships,
  households,
  monitors,
  persons,
  questions,
  responsibilityAssignments,
  stateDefinitions,
  stateValues,
  tasks,
  users,
  withoutTenant,
} from '@thealotta/db'
import { hashPassword } from '@thealotta/crypto'

const DATABASE_URL = process.env['DATABASE_URL']
if (!DATABASE_URL) {
  console.error('DATABASE_URL fehlt')
  process.exit(1)
}

const PASSWORD = process.env['SEED_PASSWORD'] ?? 'Korrekt-Pferd-Batterie-Klammer-7'
const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

async function main(): Promise<void> {
  const handle = createDb(DATABASE_URL!, { max: 3, onnotice: false })
  const householdId = uuidv7()
  const annaId = uuidv7()
  const benId = uuidv7()
  const annaMembership = uuidv7()
  const benMembership = uuidv7()
  const hash = await hashPassword(PASSWORD)

  await withoutTenant(handle.db, 'seed_creates_users', async (tx) => {
    await tx.insert(users).values([
      { id: annaId, email: `anna+${Date.now()}@example.invalid`, passwordHash: hash, displayName: 'Anna' },
      { id: benId, email: `ben+${Date.now()}@example.invalid`, passwordHash: hash, displayName: 'Ben' },
    ])
  })

  await withTenant(handle.db, [householdId], async (tx) => {
    await tx.insert(households).values({
      id: householdId,
      name: 'Familie Beispiel',
      timezone: 'Europe/Berlin',
      // §32: standardmäßig aus – im Demo-Haushalt an, damit die Ansicht auffindbar ist.
      balanceViewEnabled: true,
    })
    await tx.insert(householdMemberships).values([
      { id: annaMembership, householdId, userId: annaId, displayName: 'Anna', role: 'admin' },
      { id: benMembership, householdId, userId: benId, displayName: 'Ben', role: 'adult' },
    ])

    const kindA = uuidv7()
    await tx.insert(persons).values([
      { id: kindA, householdId, displayName: 'Kind A', personKind: 'child', birthDate: '2020-04-12' },
      { householdId, displayName: 'Kind B', personKind: 'child', birthDate: '2023-09-01' },
    ])


    const tree: [string, string | null, string, string][] = [
      // [name, parentPath, path, criticality]
      ['Kinder', null, 'kinder', 'normal'],
      ['Kind A', 'kinder', 'kinder.kind_a', 'normal'],
      ['Kleidung', 'kinder.kind_a', 'kinder.kind_a.kleidung', 'normal'],
      ['Schuhe', 'kinder.kind_a.kleidung', 'kinder.kind_a.kleidung.schuhe', 'normal'],
      ['Gesundheit', 'kinder.kind_a', 'kinder.kind_a.gesundheit', 'critical'],
      ['Kita', 'kinder.kind_a', 'kinder.kind_a.kita', 'high'],
      ['Haushalt', null, 'haushalt', 'normal'],
      ['Lebensmittel', 'haushalt', 'haushalt.lebensmittel', 'high'],
      ['Wäsche', 'haushalt', 'haushalt.waesche', 'normal'],
      ['Reparaturen', 'haushalt', 'haushalt.reparaturen', 'low'],
      ['Familie', null, 'familie', 'normal'],
      ['Urlaube', 'familie', 'familie.urlaube', 'low'],
      ['Versicherungen', 'familie', 'familie.versicherungen', 'high'],
    ]

    const idByPath = new Map<string, string>()
    for (const [name, parentPath, path, criticality] of tree) {
      const id = uuidv7()
      idByPath.set(path, id)
      await tx.insert(domains).values({
        id,
        householdId,
        parentId: parentPath ? (idByPath.get(parentPath) ?? null) : null,
        path,
        name,
        slug: path.split('.').at(-1)!,
        criticality,
        sensitivity: path.includes('gesundheit') ? 'health' : 'normal',
        ownershipInheritance: parentPath ? 'inherit' : 'own',
      })
    }

    // Verantwortung: bewusst ungleich verteilt und mit einer echten Lücke.
    await tx.insert(responsibilityAssignments).values([
      { householdId, domainId: idByPath.get('kinder.kind_a.kleidung')!, membershipId: annaMembership, assignmentKind: 'primary_owner' },
      { householdId, domainId: idByPath.get('kinder.kind_a.gesundheit')!, membershipId: annaMembership, assignmentKind: 'primary_owner' },
      { householdId, domainId: idByPath.get('haushalt.lebensmittel')!, membershipId: benMembership, assignmentKind: 'primary_owner' },
      { householdId, domainId: idByPath.get('haushalt.waesche')!, membershipId: benMembership, assignmentKind: 'primary_owner' },
      { householdId, domainId: idByPath.get('familie.urlaube')!, membershipId: annaMembership, assignmentKind: 'shared_owner' },
      { householdId, domainId: idByPath.get('familie.urlaube')!, membershipId: benMembership, assignmentKind: 'shared_owner' },
      // 'familie.versicherungen' bleibt bewusst ohne Owner – die Übersicht soll das zeigen.
    ])
    for (const path of ['kinder.kind_a.kleidung', 'kinder.kind_a.gesundheit', 'haushalt.lebensmittel', 'haushalt.waesche', 'familie.urlaube']) {
      await tx.update(domains).set({ ownershipInheritance: 'own' }).where(eq(domains.id, idByPath.get(path)!))
    }

    const shoeSize = uuidv7()
    const rainPants = uuidv7()
    const medication = uuidv7()
    await tx.insert(stateDefinitions).values([
      {
        id: shoeSize,
        householdId,
        domainId: idByPath.get('kinder.kind_a.kleidung.schuhe')!,
        key: 'shoe_size',
        label: 'Schuhgröße',
        dataType: 'number',
        freshnessInterval: '6 weeks',
      },
      {
        id: rainPants,
        householdId,
        domainId: idByPath.get('kinder.kind_a.kita')!,
        key: 'regenhose',
        label: 'Regenhose in der Kita',
        dataType: 'boolean',
        freshnessInterval: '8 weeks',
      },
      {
        id: medication,
        householdId,
        domainId: idByPath.get('kinder.kind_a.gesundheit')!,
        key: 'medikament_tage',
        label: 'Medikament: Vorrat in Tagen',
        dataType: 'number',
        isCritical: true,
        sensitivity: 'health',
      },
    ])

    await tx.insert(stateValues).values([
      // Bewusst veraltet: sieben Wochen seit der letzten Bestätigung.
      {
        householdId,
        stateDefinitionId: shoeSize,
        valueKind: 'known',
        value: 29,
        verifiedAt: daysAgo(49),
        staleAt: daysAgo(7),
        confirmedAt: daysAgo(49),
        confirmedBy: annaMembership,
        origin: 'human',
      },
      // INV-010: 'unbekannt' ist ein regulärer Zustand, kein leeres Feld.
      { householdId, stateDefinitionId: rainPants, valueKind: 'unknown', value: null, origin: 'human' },
      {
        householdId,
        stateDefinitionId: medication,
        valueKind: 'known',
        value: 5,
        verifiedAt: daysAgo(1),
        confirmedAt: daysAgo(1),
        confirmedBy: annaMembership,
        origin: 'human',
      },
    ])

    await tx.insert(monitors).values([
      {
        householdId,
        domainId: idByPath.get('kinder.kind_a.kleidung.schuhe')!,
        stateDefinitionId: shoeSize,
        name: 'Schuhgröße prüfen',
        ruleKind: 'state_freshness',
        createdBy: annaMembership,
        nextEvaluationAt: now,
      },
      {
        householdId,
        domainId: idByPath.get('kinder.kind_a.gesundheit')!,
        stateDefinitionId: medication,
        name: 'Medikamentenvorrat',
        ruleKind: 'state_threshold',
        config: { op: 'lt', value: 7 },
        createdBy: annaMembership,
        nextEvaluationAt: now,
      },
      {
        householdId,
        domainId: idByPath.get('kinder.kind_a.kita')!,
        stateDefinitionId: rainPants,
        name: 'Offene Kita-Angaben',
        ruleKind: 'state_unknown',
        config: { afterDays: 14 },
        createdBy: annaMembership,
        nextEvaluationAt: now,
      },
    ])

    const taskId = uuidv7()
    await tx.insert(tasks).values([
      {
        id: taskId,
        householdId,
        domainId: idByPath.get('kinder.kind_a.kleidung.schuhe')!,
        title: 'Beim nächsten Schuheanziehen Zehenraum prüfen',
        state: 'ready',
        estimatedMinutes: 2,
        mentalEnergy: 'low',
        assigneeMembershipId: benMembership,
        createdBy: annaMembership,
      },
      {
        householdId,
        domainId: idByPath.get('haushalt.reparaturen')!,
        title: 'Tropfenden Wasserhahn reparieren',
        state: 'ready',
        estimatedMinutes: 45,
        mentalEnergy: 'high',
        dueAt: daysAgo(12),
        createdBy: benMembership,
      },
      {
        householdId,
        domainId: idByPath.get('haushalt.lebensmittel')!,
        title: 'Wocheneinkauf',
        state: 'ready',
        estimatedMinutes: 60,
        mentalEnergy: 'medium',
        assigneeMembershipId: benMembership,
        createdBy: benMembership,
      },
    ])


    // §15: Ein Playbook ist eine Vorlage – ohne Beispiel bleibt der Unterschied zum
    // laufenden Vorgang abstrakt.
    const playbookId = uuidv7()
    await tx.insert(playbooks).values({
      id: playbookId,
      householdId,
      domainId: idByPath.get('kinder.kind_a.kleidung.schuhe')!,
      title: 'Neue Schuhe',
      triggerDescription: 'Schuhe zu klein, kaputt oder nicht mehr passend',
      scope: 'domain',
      createdBy: annaMembership,
    })
    await tx.insert(playbookSteps).values(
      [
        ['Füße messen', 5, 'low'],
        ['Notwendige Schuhart bestimmen', 5, 'medium'],
        ['Passende Größe bestimmen', 5, 'low'],
        ['Modelle auswählen', 20, 'medium'],
        ['Bestellen oder kaufen', 30, 'medium'],
        ['Anprobieren', 10, 'low'],
        ['Passform beurteilen', 5, 'low'],
        ['Gegebenenfalls retournieren', 15, 'medium'],
        ['Schuhgröße im System aktualisieren', 2, 'low'],
        ['Alte Schuhe aussortieren', 10, 'low'],
      ].map(([title, minutes, energy], index) => ({
        householdId,
        playbookId,
        position: index + 1,
        title: title as string,
        estimatedMinutes: minutes as number,
        mentalEnergy: energy as string,
      })),
    )

    await tx.insert(questions).values({
      householdId,
      domainId: idByPath.get('kinder.kind_a.kleidung.schuhe')!,
      body: 'Wie erkenne ich, ob die Gummistiefel noch passen?',
      askedBy: benMembership,
      directedTo: annaMembership,
    })

    await seedMeals(tx, householdId, annaMembership, benMembership)
  })

  console.log('Demo-Haushalt angelegt.')
  console.log('  Enthält: 13 Bereiche, 3 Zustandsangaben, 3 Beobachtungsregeln, 1 Playbook,')
  console.log('           1 offene Frage, 3 Aufgaben – und zwei Bereiche ohne Zuständigkeit.')
  console.log('           14 Gerichte samt Vergangenheit und zwei geplanten Abenden.')
  console.log(`  Household-ID: ${householdId}`)
  console.log(`  Anmeldung:    siehe Tabelle users (Passwort: ${PASSWORD})`)
  await handle.close()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
