import { versionConflict, type DomainError } from '@thealotta/domain'

/**
 * Optimistic Locking (docs/09 §2).
 *
 * Die Repositories geben die Zahl der betroffenen Zeilen zurück; 0 bedeutet, dass jemand anderes
 * schneller war. Der aktuelle Stand wird mitgeliefert, damit der Client einen Diff zeigen kann,
 * statt blind zu überschreiben.
 */
export function assertUpdated(rowsAffected: number, expectedVersion: number, current: { version: number } | undefined): void {
  if (rowsAffected > 0) return
  throw versionConflict(expectedVersion, current?.version ?? -1, current)
}

/** Wandelt eine fehlende `If-Match`-Angabe in eine klare Anweisung statt eines stillen Overwrites. */
export function requireIfMatch(header: string | string[] | undefined): number {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw) {
    const err = new Error('If-Match mit der bekannten Version ist erforderlich.') as DomainError
    Object.assign(err, { code: 'precondition_required', status: 428, name: 'DomainError' })
    throw err
  }
  const parsed = Number.parseInt(raw.replace(/"/g, ''), 10)
  if (!Number.isFinite(parsed)) {
    const err = new Error('If-Match muss eine Versionsnummer enthalten.') as DomainError
    Object.assign(err, { code: 'precondition_required', status: 428, name: 'DomainError' })
    throw err
  }
  return parsed
}

export const etag = (version: number): string => `"${version}"`
