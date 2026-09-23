import { MS, addIsoDuration } from '../clock.js'
import { describeStaleness, formatDate, humanizeDuration } from '../freshness.js'
import { dedupeKey, isSuppressed } from './dedupe.js'
import { describeRecurrence } from '@thealotta/contracts'
import { isFinished, nextOccurrence, readRecurrence, startOfUtcDay } from './recurrence.js'
import type { MonitorEvaluationContext, MonitorEvaluationResult, MonitorEvaluator, MonitorLike, SignalDraft } from './types.js'

const empty = (next: Date): MonitorEvaluationResult => ({ signals: [], resolvedBuckets: [], nextEvaluationAt: next })

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/* ── state_freshness ───────────────────────────────────────────────────
 * Der Kern des Akzeptanzszenarios §44.
 */
const stateFreshness: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const def = ctx.stateDefinition
  const value = ctx.stateValue
  if (!def || !value) return empty(new Date(now.getTime() + MS.day))

  const interval = str(monitor.config['interval']) ?? def.freshnessInterval
  if (!interval) return empty(new Date(now.getTime() + MS.week))

  const graceMs = num(monitor.config['graceDays'], 0) * MS.day
  const staleAt = value.verifiedAt ? addIsoDuration(value.verifiedAt, interval) : null

  // Nie bestätigt: ab Erstellung fällig, aber als eigener Bucket geführt.
  const bucket = value.verifiedAt ? `verified:${value.verifiedAt.toISOString()}` : 'never_verified'

  if (staleAt !== null && now.getTime() < staleAt.getTime() + graceMs) {
    // Noch frisch: ein früher erzeugtes Signal zu diesem Bucket ist damit erledigt.
    return { signals: [], resolvedBuckets: [bucket], nextEvaluationAt: new Date(staleAt.getTime() + graceMs) }
  }

  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(new Date(now.getTime() + MS.week))

  const rationale = describeStaleness(def, value, ctx.clock)
  const signal: SignalDraft = {
    monitorId: monitor.id,
    domainId: monitor.domainId,
    signalKind: 'stale_state',
    severity: def.isCritical ? 'important' : 'notice',
    dedupeKey: dedupeKey(monitor.id, 'stale_state', bucket),
    bucket,
    evidence: {
      rationale,
      stateDefinitionId: def.id,
      stateKey: def.key,
      verifiedAt: value.verifiedAt?.toISOString() ?? null,
      interval,
    },
    title: `${def.label} könnte inzwischen veraltet sein`,
    whyNow: rationale,
    ifItWaits: def.isCritical
      ? 'Diese Information ist als kritisch markiert – veraltete Angaben können hier zu Fehlentscheidungen führen.'
      : 'Keine akute Folge. Je länger es wartet, desto ungenauer wird die Angabe.',
  }
  return { signals: [signal], resolvedBuckets: [], nextEvaluationAt: new Date(now.getTime() + MS.day) }
}

/* ── state_unknown ─────────────────────────────────────────────────────
 * INV-010: 'unknown' ist ein aktiver Zustand, der von selbst Aufmerksamkeit verdienen kann.
 */
const stateUnknown: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const def = ctx.stateDefinition
  const value = ctx.stateValue
  if (!def || !value) return empty(new Date(now.getTime() + MS.day))
  if (value.valueKind !== 'unknown') {
    return { signals: [], resolvedBuckets: ['unknown'], nextEvaluationAt: new Date(now.getTime() + MS.week) }
  }
  const afterDays = num(monitor.config['afterDays'], 14)
  const since = value.verifiedAt ?? value.staleAt
  const sinceMs = since ? now.getTime() - since.getTime() : Number.POSITIVE_INFINITY
  if (sinceMs < afterDays * MS.day) {
    return empty(new Date(now.getTime() + MS.day))
  }
  const bucket = `unknown:${since?.toISOString() ?? 'unset'}`
  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(new Date(now.getTime() + MS.week))

  const rationale = `„${def.label}“ ist seit mindestens ${afterDays} Tagen als „unbekannt“ hinterlegt.`
  return {
    signals: [
      {
        monitorId: monitor.id,
        domainId: monitor.domainId,
        signalKind: 'unresolved_unknown',
        severity: def.isCritical ? 'important' : 'info',
        dedupeKey: dedupeKey(monitor.id, 'unresolved_unknown', bucket),
        bucket,
        evidence: { rationale, stateDefinitionId: def.id, stateKey: def.key },
        title: `${def.label} ist noch offen`,
        whyNow: rationale,
        ifItWaits: 'Die Frage bleibt offen. Es entsteht kein Schaden, aber auch keine Klarheit.',
      },
    ],
    resolvedBuckets: [],
    nextEvaluationAt: new Date(now.getTime() + MS.week),
  }
}

/* ── state_threshold ───────────────────────────────────────────────────
 * §11: „Wenn eine Medikamentenmenge unter einen Vorrat fällt …“
 */
const stateThreshold: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const def = ctx.stateDefinition
  const value = ctx.stateValue
  const next = new Date(now.getTime() + MS.hour * 6)
  if (!def || !value || value.valueKind !== 'known' || typeof value.value !== 'number') return empty(next)

  const op = str(monitor.config['op']) ?? 'lt'
  const threshold = num(monitor.config['value'], 0)
  const current = value.value
  const crossed =
    op === 'lt' ? current < threshold
    : op === 'lte' ? current <= threshold
    : op === 'gt' ? current > threshold
    : op === 'gte' ? current >= threshold
    : current === threshold

  const bucket = `threshold:${op}:${threshold}:${current}`
  if (!crossed) return { signals: [], resolvedBuckets: [bucket], nextEvaluationAt: next }
  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(next)

  const opText = op.startsWith('l') ? 'unter' : op.startsWith('g') ? 'über' : 'genau bei'
  const rationale = `„${def.label}“ liegt mit ${current} ${opText} dem hinterlegten Wert ${threshold}.`
  return {
    signals: [
      {
        monitorId: monitor.id,
        domainId: monitor.domainId,
        signalKind: 'threshold_crossed',
        severity: def.isCritical ? 'critical' : 'important',
        dedupeKey: dedupeKey(monitor.id, 'threshold_crossed', bucket),
        bucket,
        evidence: { rationale, stateDefinitionId: def.id, current, threshold, op },
        title: `${def.label}: Grenzwert erreicht`,
        whyNow: rationale,
        ifItWaits: def.isCritical
          ? 'Es geht um Versorgung. Wartet es zu lange, fehlt etwas Notwendiges.'
          : 'Der Vorrat wird knapper.',
      },
    ],
    resolvedBuckets: [],
    nextEvaluationAt: next,
  }
}

/* ── date_field_lead_time ──────────────────────────────────────────────
 * §9: „nächster Zahnarzt: 14.11.2026“ – rechtzeitig vorher sichtbar machen.
 */
const dateFieldLeadTime: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const def = ctx.stateDefinition
  const value = ctx.stateValue
  const next = new Date(now.getTime() + MS.day)
  if (!def || !value || value.valueKind !== 'known' || typeof value.value !== 'string') return empty(next)

  const target = new Date(value.value)
  if (Number.isNaN(target.getTime())) return empty(next)

  const lead = str(monitor.config['leadTime']) ?? 'P2W'
  const triggerAt = new Date(target.getTime() - (addIsoDuration(new Date(0), lead).getTime() - 0))
  const bucket = `date:${target.toISOString()}`

  if (now.getTime() < triggerAt.getTime()) return { signals: [], resolvedBuckets: [], nextEvaluationAt: triggerAt }
  if (now.getTime() > target.getTime()) return { signals: [], resolvedBuckets: [bucket], nextEvaluationAt: next }
  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(next)

  const rationale = `„${def.label}“ steht am ${formatDate(target)} an – Vorlauf ${humanizeDuration(lead)}.`
  return {
    signals: [
      {
        monitorId: monitor.id,
        domainId: monitor.domainId,
        signalKind: 'date_approaching',
        severity: 'notice',
        dedupeKey: dedupeKey(monitor.id, 'date_approaching', bucket),
        bucket,
        evidence: { rationale, stateDefinitionId: def.id, targetDate: target.toISOString(), leadTime: lead },
        title: `${def.label} steht an`,
        whyNow: rationale,
        ifItWaits: 'Der Termin rückt näher; die Vorbereitung wird knapper.',
      },
    ],
    resolvedBuckets: [],
    nextEvaluationAt: next,
  }
}

/* ── schedule / seasonal ───────────────────────────────────────────────
 * Wiederkehrende Prüfungen ohne State-Bezug. Der Bucket ist die Vorkommensinstanz,
 * damit ein DST-bedingt doppelt fälliger Lauf kein zweites Signal erzeugt.
 */
const schedule: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const rule = readRecurrence(monitor.config) ?? { every: 'P1M' }

  /*
   * Eine Reihe kann zu Ende sein – „bis zum 31.12." oder „zehnmal". Danach ist die Regel
   * nicht kaputt, sondern fertig: Sie meldet sich nicht mehr und wird auch nicht mehr
   * angefasst. Ohne diese Prüfung liefe eine begrenzte Wiederholung still ewig weiter.
   */
  if (isFinished(rule, now, ctx.occurrencesSoFar ?? 0)) return empty(new Date(now.getTime() + MS.week * 52))

  /*
   * Der Anker ist das Startdatum, nicht der Zeitpunkt der letzten Auswertung. Sonst hinge
   * eine Aufgabe „am 15." davon ab, wann der Auswerter lief.
   */
  const anchor = str(monitor.config['anchor'])
  const last = monitor.lastEvaluatedAt ?? (anchor ? new Date(anchor) : startOfUtcDay(now))
  const due = nextOccurrence(rule, last)
  if (!due) return empty(new Date(now.getTime() + MS.week * 52))
  if (now.getTime() < due.getTime()) return empty(due)

  const bucket = `occurrence:${startOfUtcDay(due).toISOString()}`
  const after = nextOccurrence(rule, now) ?? new Date(now.getTime() + MS.week * 52)
  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(after)

  const rationale = `„${monitor.name}“ ist wieder dran (${describeRecurrence(rule)}).`
  return {
    signals: [
      {
        monitorId: monitor.id,
        domainId: monitor.domainId,
        signalKind: 'scheduled_check_due',
        severity: 'notice',
        dedupeKey: dedupeKey(monitor.id, 'scheduled_check_due', bucket),
        bucket,
        evidence: {
          rationale,
          recurrence: describeRecurrence(rule),
          // Der Termin, um den es geht – daraus wird das Fälligkeitsdatum der Aufgabe.
          dueOn: startOfUtcDay(due).toISOString(),
        },
        title: monitor.name,
        whyNow: rationale,
        ifItWaits: 'Verschiebt sich nach hinten – der Rhythmus fängt beim nächsten Mal wieder von vorn an.',
      },
    ],
    resolvedBuckets: [],
    nextEvaluationAt: after,
  }
}

/* ── dependency_recheck ────────────────────────────────────────────────
 * „N Tage, nachdem etwas anderes erledigt wurde."
 *
 * Der Anker ist eine Erledigung, kein Kalendertag: Erst wenn die vorangehende Aufgabe
 * abgehakt ist, beginnt die Frist zu laufen. Vorher passiert nichts – eine Regel, die auf
 * etwas wartet, das nie geschieht, meldet sich zu Recht nie.
 *
 * Der Eimer ist der Zeitpunkt der Erledigung. Dadurch feuert jede Erledigung genau einmal,
 * auch wenn der Auswerter zwischendurch mehrfach läuft.
 */
const dependencyRecheck: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const delay = str(monitor.config['delay']) ?? 'P1D'
  const completedAt = ctx.precedingCompletedAt ?? null

  // Noch nichts erledigt: später noch einmal nachsehen, aber nichts melden.
  if (!completedAt) return empty(new Date(now.getTime() + MS.day))

  const due = addIsoDuration(completedAt, delay)
  if (now.getTime() < due.getTime()) return empty(due)

  const bucket = `after:${completedAt.toISOString()}`
  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(new Date(now.getTime() + MS.week))

  const rationale =
    `„${monitor.name}“ ist dran: ${humanizeDuration(delay)} nachdem der vorangehende Schritt ` +
    `am ${formatDate(completedAt)} erledigt wurde.`
  return {
    signals: [
      {
        monitorId: monitor.id,
        domainId: monitor.domainId,
        signalKind: 'scheduled_check_due',
        severity: 'notice',
        dedupeKey: dedupeKey(monitor.id, 'scheduled_check_due', bucket),
        bucket,
        evidence: { rationale, delay, after: completedAt.toISOString() },
        title: monitor.name,
        whyNow: rationale,
        ifItWaits: 'Verschiebt sich nach hinten. Der nächste Anlauf beginnt erst mit der nächsten Erledigung.',
      },
    ],
    resolvedBuckets: [],
    nextEvaluationAt: new Date(now.getTime() + MS.week),
  }
}

/* ── lead_time_before_event ────────────────────────────────────────────
 * §14.1: Kalendertermin liefert den Anlass, nicht der Nutzer.
 */
const leadTimeBeforeEvent: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const next = new Date(now.getTime() + MS.hour * 6)
  const events = ctx.upcomingEvents ?? []
  const lead = str(monitor.config['leadTime']) ?? 'P3D'
  const leadMs = addIsoDuration(new Date(0), lead).getTime()
  const signals: SignalDraft[] = []

  for (const ev of events) {
    const triggerAt = new Date(ev.startsAt.getTime() - leadMs)
    if (now.getTime() < triggerAt.getTime() || now.getTime() > ev.startsAt.getTime()) continue
    const bucket = `event:${ev.id}:${ev.sequence}`
    if (isSuppressed(bucket, ctx.suppressions, now)) continue
    const rationale = `„${ev.title}“ findet am ${formatDate(ev.startsAt)} statt – Vorbereitungszeit ${humanizeDuration(lead)}.`
    signals.push({
      monitorId: monitor.id,
      domainId: monitor.domainId,
      signalKind: 'event_preparation_due',
      severity: 'notice',
      dedupeKey: dedupeKey(monitor.id, 'event_preparation_due', bucket),
      bucket,
      evidence: { rationale, calendarEventId: ev.id, startsAt: ev.startsAt.toISOString() },
      title: `Vorbereitung: ${ev.title}`,
      whyNow: rationale,
      ifItWaits: 'Der Termin findet trotzdem statt – nur ohne Vorbereitung.',
    })
  }
  return { signals, resolvedBuckets: [], nextEvaluationAt: next }
}

/* ── absence ───────────────────────────────────────────────────────────
 * Ein Bereich, in dem lange nichts passiert ist, ist kein Fehler – aber einen Blick wert.
 */
const absence: MonitorEvaluator = (monitor, ctx) => {
  const now = ctx.clock.now()
  const sinceDays = num(monitor.config['sinceDays'], 90)
  const last = ctx.lastActivityAt
  const next = new Date(now.getTime() + MS.week)
  if (!last || now.getTime() - last.getTime() < sinceDays * MS.day) return empty(next)

  const bucket = `dormant:${startOfUtcDay(now).toISOString().slice(0, 7)}`
  if (isSuppressed(bucket, ctx.suppressions, now)) return empty(next)

  const rationale = `In diesem Bereich gab es seit ${formatDate(last)} keine Aktivität (mehr als ${sinceDays} Tage).`
  return {
    signals: [
      {
        monitorId: monitor.id,
        domainId: monitor.domainId,
        signalKind: 'domain_dormant',
        severity: 'info',
        dedupeKey: dedupeKey(monitor.id, 'domain_dormant', bucket),
        bucket,
        evidence: { rationale, lastActivityAt: last.toISOString() },
        title: `${monitor.name}: lange nichts passiert`,
        whyNow: rationale,
        ifItWaits: 'Wahrscheinlich nichts. Es kann aber auch etwas übersehen worden sein.',
      },
    ],
    resolvedBuckets: [],
    nextEvaluationAt: next,
  }
}

const notImplemented: MonitorEvaluator = (_m, ctx) => empty(new Date(ctx.clock.now().getTime() + MS.day))

/**
 * Registry: Ein neuer Regeltyp ist eine Funktion plus ein Eintrag hier.
 * Alle Evaluatoren sind rein – kein I/O, keine Uhr außer über den Kontext.
 */
export const EVALUATORS: Record<string, MonitorEvaluator> = {
  state_freshness: stateFreshness,
  state_unknown: stateUnknown,
  state_threshold: stateThreshold,
  date_field_lead_time: dateFieldLeadTime,
  schedule,
  seasonal: schedule,
  lead_time_before_event: leadTimeBeforeEvent,
  absence,
  dependency_recheck: dependencyRecheck,
}

export function evaluateMonitor(monitor: MonitorLike, ctx: MonitorEvaluationContext): MonitorEvaluationResult {
  if (!monitor.enabled) return empty(new Date(ctx.clock.now().getTime() + MS.week))
  const evaluator = EVALUATORS[monitor.ruleKind] ?? notImplemented
  return evaluator(monitor, ctx)
}

