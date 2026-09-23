import {
  OWNING_ASSIGNMENT_KINDS,
  sensitivityRank,
  type Capability,
  type Sensitivity,
} from '@thealotta/contracts'
import { crossTenant, forbidden } from '../errors.js'
import type { Decision, EffectiveContext, GrantRecord, ResourceRef } from '../types.js'
import {
  COVERAGE_EXCLUDED_CAPABILITIES,
  OWNER_CAPABILITIES,
  ROLE_CAPABILITIES,
  ROLE_SENSITIVITY_CEILING,
} from './role-matrix.js'

/**
 * Die einzige Autorisierungsentscheidung des Systems (ADR-0003, docs/04).
 *
 * Reine Funktion: kein I/O, kein Zustand, vollständig unit-testbar. API, Export und
 * Notification-Filter nutzen dieselbe Implementierung – so kann die Logik nicht auseinanderlaufen.
 *
 * Auswertungsreihenfolge:
 *   1. Tenant-Gate            (INV-005 – fremder Household existiert nicht)
 *   2. explizites deny-Grant  (Deny schlägt Allow, auf jeder Ebene)
 *   3. Object-Grant
 *   4. Domain-Grant           (längster passender Pfad gewinnt)
 *   5. Owner-Recht der Domain (inkl. aktiver Vertretung)
 *   6. Selbstbezug            (eigene Task abschließen, eigene Kapazität setzen)
 *   7. Household-Rollenrecht
 *   8. sonst deny
 * Anschließend in jedem Fall: Sensitivity-Ceiling.
 */
/*
 * Ablehnungsgründe werden gelesen – von Menschen, nicht von Programmen.
 *
 * `reason` landet über `forbidden()` als `detail` in der Fehlerantwort und damit in der
 * Oberfläche. Modellbezeichner wie „domain:archive" oder „health" sind dort bedeutungslos
 * (§3.1). Der maschinenlesbare Teil geht davon nicht verloren: Er steht weiterhin in
 * `matchedRule` und in den Details der Ausnahme.
 */
const SCOPE_WORD: Record<string, string> = {
  household: 'des ganzen Haushalts',
  domain: 'dieses Bereichs',
  object: 'dieses Eintrags',
}

const SENSITIVITY_WORD: Record<string, string> = {
  public: 'offen',
  normal: 'normal',
  private: 'privat',
  health: 'gesundheitsbezogen',
  sensitive: 'besonders schützenswert',
}

export function decide(ctx: EffectiveContext, capability: Capability, resource: ResourceRef): Decision {
  // 1 ── Tenant-Gate
  if (resource.householdId !== ctx.householdId || !ctx.householdIds.includes(resource.householdId)) {
    return { allowed: false, reason: 'Objekt gehört zu einem anderen Haushalt.', matchedRule: 'tenant_gate', ceiling: null }
  }

  const resourceSensitivity: Sensitivity = resource.sensitivity ?? 'normal'
  const domainPath = resource.domainId ? ctx.domainPaths.get(resource.domainId) : undefined

  const applicable = ctx.grants.filter((g) => g.capability === capability && !isExpired(g, ctx))

  // 2 ── Explizites Deny hat immer Vorrang
  const deny = applicable.find((g) => g.effect === 'deny' && grantMatches(g, resource, domainPath, ctx))
  if (deny) {
    return {
      allowed: false,
      reason: `Ein ausdrückliches Verbot auf Ebene ${SCOPE_WORD[deny.scopeType] ?? 'dieses Objekts'} verhindert diesen Zugriff.`,
      matchedRule: `deny_grant:${deny.scopeType}:${deny.id}`,
      ceiling: null,
    }
  }

  const allows = applicable.filter((g) => g.effect === 'allow' && grantMatches(g, resource, domainPath, ctx))

  // 3 ── Object-Grant
  const objectGrant = allows.find((g) => g.scopeType === 'object')
  if (objectGrant) {
    return withCeiling(
      { allowed: true, reason: 'Direkte Freigabe für dieses Objekt.', matchedRule: `object_grant:${objectGrant.id}`, ceiling: objectGrant.maxSensitivity },
      resourceSensitivity,
    )
  }

  // 4 ── Domain-Grant, längster Pfad gewinnt (engste Zuständigkeit)
  const domainGrants = allows
    .filter((g) => g.scopeType === 'domain')
    .sort((a, b) => (pathOf(a, ctx)?.length ?? 0) - (pathOf(b, ctx)?.length ?? 0))
  const domainGrant = domainGrants.at(-1)
  if (domainGrant) {
    return withCeiling(
      {
        allowed: true,
        reason: `Freigabe für den Bereich und seine Unterbereiche.`,
        matchedRule: `domain_grant:${domainGrant.id}`,
        ceiling: domainGrant.maxSensitivity,
      },
      resourceSensitivity,
    )
  }

  // 5 ── Owner-Recht
  if (resource.domainId && OWNER_CAPABILITIES.has(capability)) {
    const owner = ownerRight(ctx, resource.domainId, capability)
    if (owner) return withCeiling(owner, resourceSensitivity)
  }

  // 6 ── Selbstbezug
  const self = selfRight(ctx, capability, resource)
  if (self) return withCeiling(self, resourceSensitivity)

  // 7 ── Rollenrecht
  if (ROLE_CAPABILITIES[ctx.role].has(capability)) {
    return withCeiling(
      {
        allowed: true,
        reason: `Recht aus der Rolle „${ctx.role}“.`,
        matchedRule: `role:${ctx.role}:${capability}`,
        ceiling: ROLE_SENSITIVITY_CEILING[ctx.role],
      },
      resourceSensitivity,
    )
  }

  // 8 ── Default deny
  return {
    allowed: false,
    reason: 'Dafür fehlt dir die Berechtigung.',
    matchedRule: 'default_deny',
    ceiling: null,
  }
}

/** Wirft, wenn nicht erlaubt. Cross-Tenant wird zu 404, alles andere zu 403. */
export function authorize(ctx: EffectiveContext, capability: Capability, resource: ResourceRef): Decision {
  const d = decide(ctx, capability, resource)
  if (!d.allowed) {
    if (d.matchedRule === 'tenant_gate') throw crossTenant()
    throw forbidden(d.reason, { capability, resourceType: resource.type, matchedRule: d.matchedRule })
  }
  return d
}

/* ── Hilfsfunktionen ──────────────────────────────────────────────────── */

/**
 * Abgelaufene Grants werden bereits beim Laden gefiltert. Diese Prüfung ist die zweite
 * Verteidigungslinie und nutzt denselben Zeitpunkt wie der übrige Request – nicht die Systemuhr.
 */
function isExpired(g: GrantRecord, ctx: EffectiveContext): boolean {
  return g.expiresAt !== null && g.expiresAt.getTime() <= ctx.evaluatedAt.getTime()
}

function pathOf(g: GrantRecord, ctx: EffectiveContext): string | undefined {
  return g.scopeId ? ctx.domainPaths.get(g.scopeId) : undefined
}

function grantMatches(
  g: GrantRecord,
  resource: ResourceRef,
  domainPath: string | undefined,
  ctx: EffectiveContext,
): boolean {
  switch (g.scopeType) {
    case 'household':
      return true
    case 'object':
      return resource.id !== null && g.scopeId === resource.id
    case 'domain': {
      if (!g.scopeId) return false
      if (resource.domainId === g.scopeId) return true
      const grantPath = ctx.domainPaths.get(g.scopeId)
      // Subtree-Vererbung: '<grantPath>.' als Präfix des Ressourcenpfads
      return !!grantPath && !!domainPath && domainPath.startsWith(`${grantPath}.`)
    }
    default:
      return false
  }
}

function ownerRight(ctx: EffectiveContext, domainId: string, capability: Capability): Decision | null {
  const resourcePath = ctx.domainPaths.get(domainId)

  const owns = ctx.assignments.some(
    (a) =>
      (OWNING_ASSIGNMENT_KINDS as readonly string[]).includes(a.assignmentKind) &&
      coversDomain(ctx, a.domainId, domainId, resourcePath),
  )
  if (owns) {
    return {
      allowed: true,
      reason: 'Verantwortung für diesen Bereich.',
      matchedRule: `owner:${domainId}:${capability}`,
      ceiling: ROLE_SENSITIVITY_CEILING[ctx.role],
    }
  }

  const covering = ctx.activeCoverages.find(
    (c) => c.coveringMembershipId === ctx.membershipId && coversDomain(ctx, c.domainId, domainId, resourcePath),
  )
  if (covering) {
    // INV-003: Vertretung darf Ownership nie übertragen.
    if (COVERAGE_EXCLUDED_CAPABILITIES.has(capability)) {
      return {
        allowed: false,
        reason: 'Eine Vertretung kann die dauerhafte Verantwortung nicht übertragen.',
        matchedRule: 'coverage_cannot_transfer_ownership',
        ceiling: null,
      }
    }
    return {
      allowed: true,
      reason: 'Vertretung für diesen Bereich.',
      matchedRule: `coverage:${covering.id}:${capability}`,
      ceiling: ROLE_SENSITIVITY_CEILING[ctx.role],
    }
  }
  return null
}

/** Gilt eine Zuweisung auf `assignedDomainId` auch für `targetDomainId`? (Subtree-Vererbung) */
function coversDomain(
  ctx: EffectiveContext,
  assignedDomainId: string,
  targetDomainId: string,
  targetPath: string | undefined,
): boolean {
  if (assignedDomainId === targetDomainId) return true
  const assignedPath = ctx.domainPaths.get(assignedDomainId)
  return !!assignedPath && !!targetPath && targetPath.startsWith(`${assignedPath}.`)
}

function selfRight(ctx: EffectiveContext, capability: Capability, resource: ResourceRef): Decision | null {
  const isMine =
    resource.assigneeMembershipId === ctx.membershipId || resource.ownerMembershipId === ctx.membershipId
  if (capability === 'task:complete' && isMine) {
    return {
      allowed: true,
      reason: 'Eigene Aufgabe.',
      matchedRule: 'self:task',
      ceiling: ROLE_SENSITIVITY_CEILING[ctx.role],
    }
  }
  if (capability === 'capacity:declare_self') {
    return { allowed: true, reason: 'Eigene Kapazität.', matchedRule: 'self:capacity', ceiling: 'sensitive' }
  }
  return null
}

/** Sensitivity-Ceiling: Ein Grant über „Gesundheit“ öffnet keine „sensitive“-Inhalte (§7.3). */
function withCeiling(d: Decision, resourceSensitivity: Sensitivity): Decision {
  if (!d.allowed || d.ceiling === null) return d
  if (sensitivityRank(resourceSensitivity) > sensitivityRank(d.ceiling)) {
    return {
      allowed: false,
      reason:
        `Dieser Inhalt ist als ${SENSITIVITY_WORD[resourceSensitivity] ?? resourceSensitivity} eingestuft; ` +
        `deine Berechtigung reicht bis ${SENSITIVITY_WORD[d.ceiling] ?? d.ceiling}.`,
      matchedRule: `${d.matchedRule}+sensitivity_ceiling`,
      ceiling: d.ceiling,
    }
  }
  return d
}
