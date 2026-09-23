import { and, eq } from 'drizzle-orm'
import {
  domains,
  householdMemberships,
  households,
  uuidv7,
  withTenant,
  withoutTenant,
  type Database,
  type Tx,
} from '@thealotta/db'
import type { ActorContext } from '@thealotta/domain'
import { recordEvent } from '@thealotta/db'
import { slugify } from '../slug.js'

/**
 * Risiko P3: Der Einrichtungsaufwand darf nicht selbst zum Mental Load werden.
 * Eine neue Familie startet deshalb mit einem sinnvollen Grundgerüst, das vollständig
 * editierbar ist – niemand muss 24 Bereiche von Hand anlegen, um loszulegen.
 */
const DEFAULT_TREE: { name: string; criticality?: string; children?: { name: string; criticality?: string; sensitivity?: string }[] }[] = [
  {
    name: 'Haushalt',
    children: [
      { name: 'Lebensmittel', criticality: 'high' },
      { name: 'Wäsche' },
      { name: 'Reinigung' },
      { name: 'Reparaturen' },
      { name: 'Finanzen', criticality: 'high', sensitivity: 'private' },
    ],
  },
  {
    name: 'Familie',
    children: [
      { name: 'Urlaube' },
      { name: 'Geburtstage' },
      { name: 'Versicherungen', sensitivity: 'private' },
      { name: 'Jahresplanung' },
    ],
  },
  { name: 'Kinder' },
]

export class HouseholdService {
  constructor(private readonly db: Database) {}

  async create(
    actor: ActorContext,
    userId: string,
    displayName: string,
    input: { name: string; timezone: string; template: 'none' | 'family_de' },
  ): Promise<{ householdId: string; membershipId: string }> {
    const householdId = uuidv7()

    // Der Tenant-Kontext wird auf den neuen Haushalt gesetzt, damit auch das Anlegen
    // unter Row Level Security stattfindet – kein Bypass für den Normalfall.
    return withTenant(this.db, [householdId], async (tx) => {
      await tx.insert(households).values({ id: householdId, name: input.name, timezone: input.timezone })

      const membershipId = uuidv7()
      await tx.insert(householdMemberships).values({
        id: membershipId,
        householdId,
        userId,
        displayName,
        role: 'admin',
        status: 'active',
      })

      const boundActor: ActorContext = { ...actor, membershipId }
      await recordEvent(tx, householdId, boundActor, {
        eventType: 'household.created',
        subjectType: 'household',
        subjectId: householdId,
        payload: { name: input.name, timezone: input.timezone, template: input.template },
      })

      if (input.template === 'family_de') {
        await this.seedDomains(tx, householdId, boundActor)
      }

      return { householdId, membershipId }
    })
  }

  private async seedDomains(tx: Tx, householdId: string, actor: ActorContext): Promise<void> {
    let position = 0
    for (const root of DEFAULT_TREE) {
      const rootSlug = slugify(root.name)
      const rootId = uuidv7()
      await tx.insert(domains).values({
        id: rootId,
        householdId,
        parentId: null,
        path: rootSlug,
        name: root.name,
        slug: rootSlug,
        criticality: root.criticality ?? 'normal',
        ownershipInheritance: 'own',
        position: position++,
      })
      await recordEvent(tx, householdId, actor, {
        eventType: 'domain.created',
        subjectType: 'domain',
        subjectId: rootId,
        payload: { name: root.name, path: rootSlug, origin: 'template' },
        publish: false,
      })

      let childPos = 0
      for (const child of root.children ?? []) {
        const childSlug = slugify(child.name)
        const childId = uuidv7()
        await tx.insert(domains).values({
          id: childId,
          householdId,
          parentId: rootId,
          path: `${rootSlug}.${childSlug}`,
          name: child.name,
          slug: childSlug,
          criticality: child.criticality ?? 'normal',
          sensitivity: child.sensitivity ?? 'normal',
          ownershipInheritance: 'inherit',
          position: childPos++,
        })
        await recordEvent(tx, householdId, actor, {
          eventType: 'domain.created',
          subjectType: 'domain',
          subjectId: childId,
          payload: { name: child.name, path: `${rootSlug}.${childSlug}`, origin: 'template' },
          publish: false,
        })
      }
    }
  }

  /**
   * Haushaltsübergreifende Abfrage: welche Haushalte gehören mir? Sie ist per Definition nicht
   * auf einen Tenant eingrenzbar und läuft deshalb mit begründetem RLS-Bypass, gefiltert
   * ausschließlich über die eigene Nutzer-ID.
   */
  async listForUser(
    userId: string,
  ): Promise<{ id: string; name: string; timezone: string; role: string; membershipId: string }[]> {
    return withoutTenant(this.db, 'list_own_households', async (tx) =>
      tx
        .select({
          id: households.id,
          name: households.name,
          timezone: households.timezone,
          role: householdMemberships.role,
          /* Die eigene Mitgliedschaft: die Oberfläche braucht sie, um „das bin ich" zu
             erkennen – etwa für die Personenfarbe. */
          membershipId: householdMemberships.id,
        })
        .from(householdMemberships)
        .innerJoin(households, eq(households.id, householdMemberships.householdId))
        .where(and(eq(householdMemberships.userId, userId), eq(householdMemberships.status, 'active'))),
    )
  }
}
