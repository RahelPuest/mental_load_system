import {
  calendarConnections,
  calendarSelections,
  domains,
  householdMemberships,
  households,
  users,
  uuidv7,
  withTenant,
  withoutTenant,
  type Database,
  type DbHandle,
} from '@thealotta/db'
import { createDb } from '@thealotta/db'
import { prepareTestDatabase, TEST_URL } from '../../../packages/db/test/setup.js'

export interface WorkerFixture {
  handle: DbHandle
  db: Database
  householdId: string
  membershipId: string
  domainId: string
  connectionId: string
}

const RUN_ID = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Baut einen minimalen Haushalt direkt über die Datenbank – der Worker kennt keine HTTP-Schicht. */
export async function seedWorkerFixture(label: string): Promise<WorkerFixture> {
  await prepareTestDatabase()
  const handle = createDb(TEST_URL, { max: 5, onnotice: false })

  const householdId = uuidv7()
  const membershipId = uuidv7()
  const domainId = uuidv7()
  const connectionId = uuidv7()
  const userId = uuidv7()

  await withoutTenant(handle.db, 'test_fixture_bootstrap', async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: `worker-${label}-${RUN_ID}@example.invalid`,
      passwordHash: 'x',
      displayName: 'Testnutzer',
    })
  })

  await withTenant(handle.db, [householdId], async (tx) => {
    await tx.insert(households).values({ id: householdId, name: `Worker ${label}`, timezone: 'Europe/Berlin' })
    await tx.insert(householdMemberships).values({
      id: membershipId,
      householdId,
      userId,
      displayName: 'Testnutzer',
      role: 'admin',
    })
    await tx.insert(domains).values({
      id: domainId,
      householdId,
      path: 'termine',
      name: 'Termine',
      slug: 'termine',
      ownershipInheritance: 'own',
    })
    await tx.insert(calendarConnections).values({
      id: connectionId,
      householdId,
      membershipId,
      provider: 'ics',
      displayName: 'Familienkalender',
      state: 'active',
    })
    await tx.insert(calendarSelections).values({
      householdId,
      connectionId,
      externalCalendarId: 'primary',
      readEnabled: true,
    })
  })

  return { handle, db: handle.db, householdId, membershipId, domainId, connectionId }
}
