import { OWNING_ASSIGNMENT_KINDS, type AssignmentKind, type Criticality } from '@thealotta/contracts'
import { conflict } from './errors.js'
import type { CoverageRecord, DomainNode } from './types.js'

export interface AssignmentRow {
  id: string
  domainId: string
  membershipId: string
  assignmentKind: AssignmentKind
  effectiveFrom: Date
  effectiveTo: Date | null
}

export interface EffectiveOwner {
  membershipId: string
  assignmentKind: AssignmentKind
  /** Pfad der Domain, aus der die Verantwortung geerbt wurde – null bei eigener Zuweisung. */
  inheritedFrom: string | null
  /** true, wenn die Verantwortung gerade vertreten wird (INV-003: der permanente Owner bleibt). */
  viaCoverage: boolean
  /** Bei Vertretung: wer eigentlich verantwortlich ist. */
  permanentMembershipId: string | null
  /**
   * Alle, die diesen Bereich gemeinsam tragen – mehr als einer nur bei geteilter
   * Verantwortung. Ohne dieses Feld zeigte die Oberfläche eine beliebige der beteiligten
   * Personen als „verantwortlich" an, und geteilte Verantwortung sah aus wie einzelne.
   */
  sharedWith: string[]
  reason: string
}

/**
 * Q-04 / §8: Vererbung ist explizit. Eine Domain mit `ownershipInheritance='inherit'` hat keine
 * eigene Zuweisung; der effektive Owner wird zur Lesezeit vom nächsten Vorfahren mit
 * `ownershipInheritance='own'` gelesen und in der UI IMMER als geerbt ausgewiesen.
 */
export function resolveEffectiveOwner(
  domain: DomainNode,
  ancestors: readonly DomainNode[],
  assignments: readonly AssignmentRow[],
  coverages: readonly CoverageRecord[],
  now: Date,
): EffectiveOwner | null {
  const chain = [domain, ...[...ancestors].reverse()] // nächstgelegener Vorfahr zuerst

  for (const node of chain) {
    const own = activeOwning(assignments, node.id, now)
    if (own.length === 0) {
      if (node.ownershipInheritance === 'own' && node.id === domain.id) {
        // Eigene Verantwortung erklärt, aber niemand zugewiesen → ownerlos, nicht geerbt.
        return null
      }
      continue
    }

    const primary = own.find((a) => a.assignmentKind === 'primary_owner') ?? own[0]!
    const shared = own.filter((a) => a.assignmentKind === 'shared_owner')
    const sharedWith = shared.length > 1 ? shared.map((a) => a.membershipId) : []
    const inheritedFrom = node.id === domain.id ? null : node.path

    const coverage = coverages.find(
      (c) =>
        c.domainId === node.id &&
        (c.state === 'active' || c.state === 'pending_return') &&
        c.startsAt.getTime() <= now.getTime(),
    )

    if (coverage) {
      return {
        membershipId: coverage.coveringMembershipId,
        assignmentKind: primary.assignmentKind,
        inheritedFrom,
        viaCoverage: true,
        permanentMembershipId: primary.membershipId,
        sharedWith,
        reason:
          coverage.state === 'pending_return'
            ? 'Vertretung läuft weiter, bis die Rückgabe bestätigt ist.'
            : 'Vertretung für einen festgelegten Zeitraum.',
      }
    }

    return {
      membershipId: primary.membershipId,
      assignmentKind: primary.assignmentKind,
      inheritedFrom,
      viaCoverage: false,
      permanentMembershipId: primary.membershipId,
      sharedWith,
      reason: sharedWith.length > 1
        ? `${sharedWith.length} Menschen tragen diesen Bereich gemeinsam.`
        : inheritedFrom
          ? `Verantwortung geerbt von „${inheritedFrom}“.`
          : 'Direkte Verantwortung für diesen Bereich.',
    }
  }
  return null
}

function activeOwning(assignments: readonly AssignmentRow[], domainId: string, now: Date): AssignmentRow[] {
  return assignments.filter(
    (a) =>
      a.domainId === domainId &&
      (OWNING_ASSIGNMENT_KINDS as readonly string[]).includes(a.assignmentKind) &&
      a.effectiveFrom.getTime() <= now.getTime() &&
      (a.effectiveTo === null || a.effectiveTo.getTime() > now.getTime()),
  )
}

/**
 * Q-03: Primary Owner und Shared Ownership schließen sich je Domain aus. Sonst wäre bei
 * Eskalation und Vertretungsplanung unklar, wer gemeint ist (§47 Priorität 5).
 */
export function assertAssignmentCompatible(
  existing: readonly AssignmentRow[],
  incoming: AssignmentKind,
  domainId: string,
  now: Date,
): void {
  const active = activeOwning(existing, domainId, now)
  const hasPrimary = active.some((a) => a.assignmentKind === 'primary_owner')
  const hasShared = active.some((a) => a.assignmentKind === 'shared_owner')

  if (incoming === 'primary_owner' && hasPrimary) {
    throw conflict('already_claimed', 'Für diesen Bereich ist bereits eine Person hauptverantwortlich.')
  }
  if (incoming === 'primary_owner' && hasShared) {
    throw conflict(
      'shared_ownership_conflict',
      'Dieser Bereich wird gemeinsam getragen. Eine Hauptverantwortung würde das ersetzen – bitte zuerst die geteilte Verantwortung auflösen.',
    )
  }
  if (incoming === 'shared_owner' && hasPrimary) {
    throw conflict(
      'shared_ownership_conflict',
      'Für diesen Bereich gibt es bereits eine Hauptverantwortung. Geteilte Verantwortung und Hauptverantwortung schließen sich aus.',
    )
  }
}

/** §31: Sichtbar machen, wenn eine Verantwortung faktisch niemandem gehört. */
export function isUnowned(owner: EffectiveOwner | null): boolean {
  return owner === null
}

/** INV-014: Beim Pausieren einer Person dürfen kritische Bereiche nicht ohne Verantwortung bleiben. */
export function criticalDomainsAtRisk(
  domains: readonly DomainNode[],
  ownerByDomain: ReadonlyMap<string, EffectiveOwner | null>,
  pausedMembershipId: string,
): DomainNode[] {
  const risky: Criticality[] = ['high', 'critical']
  return domains.filter((d) => {
    if (!risky.includes(d.criticality)) return false
    const owner = ownerByDomain.get(d.id) ?? null
    return owner === null || owner.membershipId === pausedMembershipId
  })
}
