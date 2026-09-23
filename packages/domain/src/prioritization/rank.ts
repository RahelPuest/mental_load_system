import type { CapacityLevel, Criticality, EnergyLevel, ScoreFactor, Severity } from '@thealotta/contracts'
import { MS } from '../clock.js'
import { fitsCapacity } from '../capacity.js'
import { formatDate } from '../freshness.js'

export interface RankableItem {
  subjectType: 'task' | 'attention_item' | 'question'
  subjectId: string
  title: string
  /** Bereich, zu dem es gehört. Wird für die Bedeutungsgewichtung der Planung gebraucht. */
  domainId?: string | null
  domainCriticality: Criticality
  /** Nur für Attention Items. */
  severity?: Severity
  dueAt: Date | null
  deferUntil: Date | null
  estimatedMinutes: number | null
  mentalEnergy: EnergyLevel
  /** Ist der Betrachter für den Bereich verantwortlich? */
  isOwner: boolean
  /** Ist die Aufgabe dem Betrachter zugewiesen? */
  isAssignee: boolean
  /** Wartet die Aufgabe auf jemanden/etwas? */
  isWaiting: boolean
  /**
   * Steht noch ein früherer Schritt davor?
   *
   * Getrennt von `isWaiting`: Warten heißt „von außen muss etwas passieren", Blockiert heißt
   * „vorher ist hier noch etwas offen". Für den Nutzer ist der Unterschied wichtig, denn im
   * zweiten Fall kann er selbst etwas tun – nur eben zuerst das andere.
   */
  blockedBy: string | null
  /** Seit wann ist der ursprüngliche Zeitpunkt vorbei? Null = nicht überschritten. */
  overdueSince: Date | null
  createdAt: Date
  /** Zusätzliche Faktoren aus der Quelle, z. B. die Monitor-Begründung. */
  seededFactors?: ScoreFactor[]
}

export interface RankContext {
  now: Date
  capacity: CapacityLevel
}

export interface RankedItem {
  item: RankableItem
  score: number
  factors: ScoreFactor[]
  ifItWaits: string
}

/**
 * ADR-0005 / INV-008: Priorisierung ist eine Summe benannter Faktoren.
 *
 * Der Score wird bewusst NICHT an den Nutzer ausgegeben – nur die Faktoren mit ihrer
 * Erklärung. Gründe helfen bei der Entscheidung, Punktzahlen laden zum Vergleichen ein (§42).
 * Eigenschaft: score === Σ factors.contribution (Property-Test).
 */
export function rank(item: RankableItem, ctx: RankContext): RankedItem {
  const factors: ScoreFactor[] = [...(item.seededFactors ?? [])]

  // ── Frist
  if (item.dueAt) {
    const hoursLeft = (item.dueAt.getTime() - ctx.now.getTime()) / MS.hour
    if (hoursLeft <= 0) {
      factors.push({
        code: 'due_passed',
        label: 'Zeitpunkt ist vorbei',
        explanation: `Der vorgesehene Zeitpunkt war der ${formatDate(item.dueAt)}. Die Sache ist weiterhin offen.`,
        contribution: 30,
      })
    } else if (hoursLeft <= 24) {
      factors.push({
        code: 'due_today',
        label: 'Heute vorgesehen',
        explanation: `Vorgesehen bis ${formatDate(item.dueAt)} – das ist innerhalb der nächsten 24 Stunden.`,
        contribution: 28,
      })
    } else if (hoursLeft <= 72) {
      factors.push({
        code: 'due_soon',
        label: 'Bald vorgesehen',
        explanation: `Vorgesehen bis ${formatDate(item.dueAt)}.`,
        contribution: 14,
      })
    }
  }

  // ── Kritikalität des Bereichs
  // Nur ausdrücklich hochgestufte Bereiche bekommen einen Faktor. „Normal" ist der Regelfall
  // und trägt keine Begründung – sonst stünde bei jedem Element „Wichtiger Bereich".
  const critWeight: Record<Criticality, number> = { low: 0, normal: 0, high: 12, critical: 26 }
  if (critWeight[item.domainCriticality] > 0) {
    factors.push({
      code: 'domain_criticality',
      label: item.domainCriticality === 'critical' ? 'Kritischer Bereich' : 'Wichtiger Bereich',
      explanation:
        item.domainCriticality === 'critical'
          ? 'Der Bereich ist als kritisch für die Versorgung markiert.'
          : 'Der Bereich ist als wichtig markiert.',
      contribution: critWeight[item.domainCriticality],
    })
  }

  // ── Dringlichkeit des Signals
  if (item.severity) {
    const sev: Record<Severity, number> = { info: 2, notice: 6, important: 16, critical: 30 }
    /* Begründungen landen unverändert in der Oberfläche – Modellwerte gehören dort nicht hin. */
    const said: Record<Severity, string> = {
      info: 'Ein Hinweis am Rande.',
      notice: 'Etwas ist aufgefallen.',
      important: 'Das ist deutlicher als üblich – es lohnt sich hinzusehen.',
      critical: 'Hier hängt Versorgung oder Sicherheit dran.',
    }
    if (sev[item.severity] > 6) {
      factors.push({
        code: 'signal_severity',
        label: 'Deutlicher Hinweis',
        explanation: said[item.severity],
        contribution: sev[item.severity],
      })
    }
  }

  // ── Geringe Ausführungskosten (§24: bei wenig Kapazität besonders relevant)
  if (item.estimatedMinutes !== null && item.estimatedMinutes <= 5) {
    factors.push({
      code: 'low_cost',
      label: 'Schnell erledigt',
      explanation: `Geschätzt ${item.estimatedMinutes} Minuten, Energiebedarf „${energyLabel(item.mentalEnergy)}“.`,
      contribution: 12,
    })
  }

  // ── Kapazität: verändert die Reihenfolge, nie die Relevanz (INV-007)
  if (!fitsCapacity(item.mentalEnergy, ctx.capacity)) {
    factors.push({
      code: 'above_capacity',
      label: 'Braucht mehr Energie als gerade da ist',
      explanation: `Diese Sache braucht „${energyLabel(item.mentalEnergy)}“ Energie. Heute ist weniger verfügbar – sie bleibt vorgemerkt.`,
      contribution: -30,
    })
  }

  // ── Verantwortung und Zuweisung
  if (item.isAssignee) {
    factors.push({
      code: 'assigned_to_you',
      label: 'Dir zugewiesen',
      explanation: 'Diese Aufgabe ist ausdrücklich dir zugewiesen.',
      contribution: 10,
    })
  } else if (item.isOwner) {
    factors.push({
      code: 'your_domain',
      label: 'Dein Verantwortungsbereich',
      explanation: 'Du trägst für diesen Bereich die Verantwortung.',
      contribution: 7,
    })
  }

  // ── Blockiert: der frühere Schritt ist die eigentliche Aufgabe
  if (item.blockedBy) {
    factors.push({
      code: 'blocked_by',
      label: 'Ein früherer Schritt fehlt noch',
      explanation: `Vorher muss „${item.blockedBy}" erledigt sein.`,
      contribution: -40,
    })
  }

  // ── Wartend: bleibt sichtbar, aber nicht vorn (§27)
  if (item.isWaiting) {
    factors.push({
      code: 'waiting',
      label: 'Wartet auf etwas anderes',
      explanation: 'Vor dem nächsten Schritt muss etwas von außen passieren.',
      contribution: -35,
    })
  }

  // ── Zurückgestellt
  if (item.deferUntil && item.deferUntil.getTime() > ctx.now.getTime()) {
    factors.push({
      code: 'deferred',
      label: 'Bewusst zurückgestellt',
      explanation: `Zurückgestellt bis ${formatDate(item.deferUntil)}.`,
      contribution: -50,
    })
  }

  // ── Alter: §29 – ein verpasster Zeitpunkt führt zur Neubewertung, nicht zum Verschwinden
  if (item.overdueSince) {
    const days = Math.floor((ctx.now.getTime() - item.overdueSince.getTime()) / MS.day)
    if (days >= 3) {
      factors.push({
        code: 'waiting_long',
        label: 'Wartet schon länger',
        explanation: `Wartet seit ${days} Tagen auf einen passenden Moment.`,
        contribution: Math.min(18, 3 + days),
      })
    }
  }

  /*
   * Mindestens ein Faktor – sonst stünde ein Eintrag ohne Antwort auf „warum das hier?" da.
   *
   * Jeder Faktor oben hängt an einer Bedingung. Eine Aufgabe ohne Frist, ohne Zuweisung,
   * nicht überfällig, in einem normal eingestuften Bereich erfüllte keine davon und bekam
   * **null** Faktoren – während `nowItem.why` im Vertrag ausdrücklich `min(1)` mit dem
   * Vermerk „INV-008: jedes Element muss begründet sein" fordert. Erreichbar war das schon
   * über „Kann ich jetzt erledigen"; aufgefallen ist es erst, als die Planung (docs/80) auch
   * die Einträge zeigte, die vorher hinter den Abschnittsgrenzen lagen.
   *
   * Beitrag 0: Die Eigenschaft score === Σ contributions bleibt unberührt, die Reihenfolge
   * ändert sich nicht. Der Satz sagt schlicht, was wahr ist – dass nichts drängt.
   */
  if (factors.length === 0) {
    factors.push({
      code: 'merely_open',
      label: 'Offen, ohne besonderen Anlass',
      explanation:
        'Hier drängt nichts: keine Frist, keine Zuweisung, kein Signal. Es steht offen und wartet auf einen passenden Moment.',
      contribution: 0,
    })
  }

  const score = factors.reduce((sum, f) => sum + f.contribution, 0)
  return { item, score, factors, ifItWaits: describeIfItWaits(item, ctx.now) }
}

export function rankAll(items: readonly RankableItem[], ctx: RankContext): RankedItem[] {
  return items.map((i) => rank(i, ctx)).sort((a, b) => b.score - a.score || a.item.createdAt.getTime() - b.item.createdAt.getTime())
}

/** §22: „Was passiert, wenn es wartet?“ – ohne Drohung, ohne Schuldzuweisung (§1.10). */
function describeIfItWaits(item: RankableItem, now: Date): string {
  if (item.blockedBy) {
    return `Solange „${item.blockedBy}" offen ist, ändert sich hier nichts. Das ist der Schritt, an dem es hängt.`
  }
  if (item.domainCriticality === 'critical') {
    return 'Dieser Bereich ist als kritisch markiert – hier kann Warten spürbare Folgen haben.'
  }
  if (item.dueAt && item.dueAt.getTime() < now.getTime()) {
    return 'Der vorgesehene Zeitpunkt ist vorbei. Die Sache bleibt sichtbar, bis sie erledigt oder bewusst verworfen ist.'
  }
  if (item.isWaiting) {
    return 'Es passiert nichts, solange die Antwort von außen fehlt. Das System meldet sich, wenn es weitergeht.'
  }
  return 'Keine akute Folge. Es bleibt vorgemerkt und taucht wieder auf, wenn der Moment passt.'
}

function energyLabel(e: EnergyLevel): string {
  return e === 'low' ? 'niedrig' : e === 'medium' ? 'mittel' : 'hoch'
}
