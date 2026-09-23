/** Fachliche Fehler mit stabilem Code – das API-Layer bildet sie 1:1 auf Problem Details ab. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export const notFound = (what: string) =>
  new DomainError('not_found', 404, `${what} wurde nicht gefunden.`)

/**
 * INV-005: Ein Objekt aus einem fremden Household ist nicht „verboten“, sondern existiert
 * für diesen Nutzer nicht. `403` würde die Existenz bestätigen.
 */
export const crossTenant = () => new DomainError('not_found', 404, 'Nicht gefunden.')

export const forbidden = (reason: string, details?: Record<string, unknown>) =>
  new DomainError('forbidden', 403, reason, details)

export const invalidTransition = (machine: string, from: string, event: string) =>
  new DomainError(
    'invalid_transition',
    409,
    `Übergang „${event}“ ist im Zustand „${from}“ nicht möglich.`,
    { machine, from, event },
  )

export const versionConflict = (expected: number, actual: number, current?: unknown) =>
  new DomainError('version_conflict', 409, `Das Objekt wurde zwischenzeitlich geändert.`, {
    expected,
    actual,
    current,
  })

export const requiresHumanActor = (operation: string) =>
  new DomainError(
    'requires_human_actor',
    403,
    'Diese Entscheidung trifft das System nicht selbst.',
    { operation },
  )

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(code, 409, message, details)

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(code, 422, message, details)
