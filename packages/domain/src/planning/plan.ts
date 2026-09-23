import type { CapacityLevel, PlanHorizon, PlanStrategy } from '@thealotta/contracts'
import { MS } from '../clock.js'
import { fitsCapacity } from '../capacity.js'
import type { RankedItem } from '../prioritization/rank.js'
import { ASSUMED_MINUTES, dayBudgetMinutes, SLACK_UTILISATION } from './budget.js'

/** Ein situativer Anlass: „beim nächsten Einkauf", „wenn ich im Auto sitze". */
export interface Cue {
  id: string
  label: string
}

export interface PlanInput {
  ranked: readonly RankedItem[]
  now: Date
  /** Beginn des ersten Abschnitts – vom Aufrufer in der Zeitzone des Haushalts berechnet. */
  firstSlotStart: Date
  capacity: CapacityLevel
  horizon: PlanHorizon
  strategy: PlanStrategy
  aging: boolean
  slack: boolean
  cueBySubject?: ReadonlyMap<string, Cue>
  /** Persönliche Bedeutung je Bereich, 0–3. Fehlt sie, greift ein benannter Behelf. */
  meaningByDomain?: ReadonlyMap<string, number>
  dayBudget?: number
}

export interface PlanItem {
  ranked: RankedItem
  /**
   * Warum steht es hier? Ein Satz, keine Punktzahl (INV-008).
   *
   * `null`, wenn es über diese Stelle nichts Eigenes zu sagen gibt. Das ist wichtiger, als es
   * klingt: In einer Liste von zwölf Sachen ohne Frist stand zwölfmal „Ohne Frist – steht
   * hinter allem mit Termin". Zwölf gleiche Sätze sind kein Grund, sondern Rauschen – dieselbe
   * Regel, die `NowRow` schon anwendet, wenn der Grund nur den Titel wiederholt.
   */
  placedBecause: string | null
  cue: Cue | null
}

export interface PlanSlot {
  key: string
  from: Date
  to: Date
  budgetMinutes: number
  plannedMinutes: number
  items: PlanItem[]
}

export interface PlanResult {
  slots: PlanSlot[]
  /** Passte nicht ins Budget. Sichtbar, nicht versteckt (INV-007). */
  overflow: PlanItem[]
  /** Gar nicht planbar: wartet, ist blockiert oder noch zurückgestellt. */
  notPlannable: PlanItem[]
  strategy: PlanStrategy
  aging: boolean
  slack: boolean
  /**
   * Ein Satz zur gewählten Strategie – ausdrücklich auch über ihre Grenzen.
   *
   * Nicht Werbung, sondern kalibriertes Vertrauen (docs/60 E6): Wer sich auf eine Reihenfolge
   * verlässt, muss erkennen können, wann er das besser nicht tut.
   */
  note: string
}

const OVERLOAD_HINT =
  'Bei mehr Arbeit als Zeit verliert diese Reihenfolge ihre Stärke: Sie hält dann keine Frist, sondern reißt sie der Reihe nach.'

const NOTES: Record<PlanStrategy, string> = {
  deadline_first:
    'Früheste Frist zuerst (EDF). Solange die Menge überhaupt in die Zeit passt, ist keine Reihenfolge besser darin, Fristen zu halten. ' +
    OVERLOAD_HINT,
  shortest_first:
    'Kürzestes zuerst. Verkürzt beweisbar die mittlere Wartezeit und schafft einen Anfang, der gelingt. ' +
    'Große Sachen rutschen dabei nach hinten – dagegen wirkt „Alterung".',
  one_thing:
    'Eine Sache. Nichts ist gelöscht, alles andere bleibt einen benannten Klick entfernt. ' +
    'Gut gegen Wechselkosten, schlecht für den Überblick – für Woche und Monat eher nicht geeignet.',
  capacity_fit:
    'Gefüllt nach dem, was du für heute angegeben hast. Was mehr Energie braucht, als du angegeben hast, bleibt stehen – es wird nicht kleiner geredet.',
  meaning_first:
    'Nach Bedeutung statt nach Dringlichkeit – das Vorgehen der Verhaltensaktivierung. ' +
    'Als Therapie mit Begleitung ist es gut belegt; dass eine Anwendung dasselbe leistet, ist nicht geprüft.',
  cue_grouped:
    'Gruppiert nach dem Anlass, an dem die Sache hängt. Für „wenn X, dann Y" liegt die stärkste Evidenz des Feldes vor. ' +
    'Es filtert nichts: Ohne Anlass verschwindet nichts, es steht weiter unten.',
}

/**
 * Die Todo-Ansicht für Tag, Woche und Monat.
 *
 * Zwei Zusicherungen, die jede Strategie einhalten muss und die als Eigenschaft geprüft sind:
 *
 *  1. **Nichts geht verloren.** Jeder Eintrag landet in genau einem Abschnitt, im Überhang
 *     oder unter „nicht planbar" (INV-007 – Kapazität ändert nie die Relevanz, nur die Menge
 *     des Gezeigten).
 *  2. **Nichts wird nach seiner Frist eingeplant.** Ein Plan, der eine Sache auf nach ihrem
 *     Termin legt, ist keine Hilfe, sondern eine Zusage, die er nicht halten kann.
 */
export function buildPlan(input: PlanInput): PlanResult {
  const slots = makeSlots(input)
  const { plannable, notPlannable } = split(input)

  const sorted = order(plannable, input)
  const withAging = input.aging ? applyAging(sorted, input.now) : sorted

  const overflow: PlanItem[] = []
  for (const item of withAging) {
    const slot = findSlot(slots, item, input)
    if (slot) {
      slot.items.push(item)
      slot.plannedMinutes += minutesOf(item.ranked)
    } else {
      overflow.push(item)
    }
  }

  return {
    slots,
    overflow,
    notPlannable,
    strategy: input.strategy,
    aging: input.aging,
    slack: input.slack,
    note: NOTES[input.strategy],
  }
}

/* ── Abschnitte ──────────────────────────────────────────────────────── */

function makeSlots(input: PlanInput): PlanSlot[] {
  const budget = input.dayBudget ?? dayBudgetMinutes(input.capacity)
  const usable = input.slack ? Math.floor(budget * SLACK_UTILISATION) : budget

  // Monat: Wochenabschnitte. Tageweise über einen Monat zu planen behauptet eine Genauigkeit,
  // die niemand hat – und verlangt, dass man 30 Felder liest, um eine Frage zu beantworten.
  const count = input.horizon === 'day' ? 1 : input.horizon === 'week' ? 7 : 4
  const stepDays = input.horizon === 'month' ? 7 : 1

  return Array.from({ length: count }, (_, i) => {
    const from = new Date(input.firstSlotStart.getTime() + i * stepDays * MS.day)
    const to = new Date(from.getTime() + stepDays * MS.day)
    return {
      key: from.toISOString().slice(0, 10),
      from,
      to,
      budgetMinutes: usable * stepDays,
      plannedMinutes: 0,
      items: [],
    }
  })
}

/* ── Was überhaupt planbar ist ───────────────────────────────────────── */

function split(input: PlanInput): { plannable: PlanItem[]; notPlannable: PlanItem[] } {
  const plannable: PlanItem[] = []
  const notPlannable: PlanItem[] = []

  for (const ranked of input.ranked) {
    const item: PlanItem = {
      ranked,
      placedBecause: null,
      cue: input.cueBySubject?.get(ranked.item.subjectId) ?? null,
    }
    const t = ranked.item
    const zurueckgestellt = t.deferUntil !== null && t.deferUntil.getTime() > input.now.getTime()

    if (t.isWaiting || t.blockedBy !== null || zurueckgestellt) {
      item.placedBecause = t.blockedBy
        ? `Vorher muss „${t.blockedBy}" erledigt sein.`
        : t.isWaiting
          ? 'Wartet auf etwas von außen.'
          : 'Ist bewusst zurückgestellt.'
      notPlannable.push(item)
    } else {
      plannable.push(item)
    }
  }
  return { plannable, notPlannable }
}

/* ── Die sechs Reihenfolgen ──────────────────────────────────────────── */

function order(items: PlanItem[], input: PlanInput): PlanItem[] {
  const kopie = [...items]

  switch (input.strategy) {
    case 'deadline_first': {
      // EDF: ohne Frist heißt „keine Frist", nicht „unendlich weit weg" – solche Einträge
      // stehen hinten, dort aber nach der gewohnten Begründungsstärke.
      kopie.sort((a, b) => keyOf(a) - keyOf(b) || b.ranked.score - a.ranked.score)
      for (const i of kopie) {
        const due = i.ranked.item.dueAt
        // Ohne Frist gibt es über die Stelle nichts zu sagen: Die Sortierung sagt es schon.
        i.placedBecause = due
          ? due.getTime() <= input.now.getTime()
            ? 'Der Zeitpunkt ist vorbei.'
            : 'Von allem Offenen läuft das hier als Erstes ab.'
          : null
      }
      return kopie
    }

    case 'shortest_first': {
      kopie.sort((a, b) => minutesOf(a.ranked) - minutesOf(b.ranked) || b.ranked.score - a.ranked.score)
      for (const i of kopie) {
        const m = i.ranked.item.estimatedMinutes
        // Die Dauer steht ohnehin in der Metazeile der Karte – hier nur, wenn sie geschätzt ist.
        i.placedBecause = m === null ? `Ohne Schätzung – gerechnet mit ${ASSUMED_MINUTES} Minuten.` : null
      }
      return kopie
    }

    case 'one_thing': {
      kopie.sort((a, b) => b.ranked.score - a.ranked.score)
      kopie.forEach((i, idx) => {
        i.placedBecause = idx === 0 ? 'Die eine Sache für jetzt.' : null
      })
      return kopie
    }

    case 'capacity_fit': {
      // Passendes zuerst, Unpassendes bleibt dahinter stehen – ausgeblendet wird nichts.
      kopie.sort((a, b) => {
        const pa = fitsCapacity(a.ranked.item.mentalEnergy, input.capacity) ? 0 : 1
        const pb = fitsCapacity(b.ranked.item.mentalEnergy, input.capacity) ? 0 : 1
        return pa - pb || minutesOf(a.ranked) - minutesOf(b.ranked)
      })
      for (const i of kopie) {
        // Nur die Abweichung ist eine Auskunft: „passt" ist der Normalfall.
        i.placedBecause = fitsCapacity(i.ranked.item.mentalEnergy, input.capacity)
          ? null
          : 'Braucht mehr Energie, als du für heute angegeben hast.'
      }
      return kopie
    }

    case 'meaning_first': {
      kopie.sort((a, b) => meaningOf(b, input) - meaningOf(a, input) || b.ranked.score - a.ranked.score)
      for (const i of kopie) {
        const eigene = input.meaningByDomain !== undefined
        i.placedBecause = eigene
          ? 'Gehört zu einem Bereich, den du als bedeutsam markiert hast.'
          : 'Behelf: gewichtet nach Wichtigkeit des Bereichs und eigener Verantwortung – keine eigene Bedeutungsangabe vorhanden.'
      }
      return kopie
    }

    case 'cue_grouped': {
      // Stabile Gruppierung: Einträge mit Anlass zuerst, je Anlass beieinander, Reihenfolge
      // der Anlässe nach ihrem stärksten Eintrag. Ohne Anlass folgt der Rest unverändert.
      const gruppen = new Map<string, PlanItem[]>()
      const ohne: PlanItem[] = []
      for (const i of kopie) {
        if (i.cue) {
          const liste = gruppen.get(i.cue.id) ?? []
          liste.push(i)
          gruppen.set(i.cue.id, liste)
        } else {
          ohne.push(i)
        }
      }
      const sortiert = [...gruppen.values()].sort(
        (a, b) => Math.max(...b.map((i) => i.ranked.score)) - Math.max(...a.map((i) => i.ranked.score)),
      )
      for (const gruppe of sortiert) {
        for (const i of gruppe) i.placedBecause = `Wenn „${i.cue!.label}" eintritt, dann das hier.`
      }
      ohne.sort((a, b) => b.ranked.score - a.ranked.score)
      // „Hängt an keinem Anlass" unter jeder zweiten Zeile wäre Rauschen; die Gruppierung
      // darüber sagt es bereits.
      for (const i of ohne) i.placedBecause = null
      return [...sortiert.flat(), ...ohne]
    }
  }
}

/* ── Alterung ────────────────────────────────────────────────────────── */

/**
 * Was lange liegt, kommt nach vorn – aber höchstens eine Sache je Abschnitt.
 *
 * Aus der Ablaufplanung (Aging in Multilevel-Feedback-Queues) gegen Verhungern: Ohne diesen
 * Zusatz gewinnt „Kurzes zuerst" immer, und die große unangenehme Sache erscheint nie.
 * Die Grenze von einer Sache ist Absicht – ein Plan, der nur aus Altlasten besteht, wird
 * nicht angefasst.
 */
export const AGING_DAYS = 21

function applyAging(items: PlanItem[], now: Date): PlanItem[] {
  const alt = items.filter((i) => (now.getTime() - i.ranked.item.createdAt.getTime()) / MS.day >= AGING_DAYS)
  if (alt.length === 0) return items

  const aelteste = alt.reduce((a, b) => (a.ranked.item.createdAt <= b.ranked.item.createdAt ? a : b))
  const tage = Math.floor((now.getTime() - aelteste.ranked.item.createdAt.getTime()) / MS.day)
  aelteste.placedBecause = `Steht seit ${tage} Tagen offen und wäre sonst wieder nicht dran gewesen.`
  return [aelteste, ...items.filter((i) => i !== aelteste)]
}

/* ── Einsortieren ────────────────────────────────────────────────────── */

function findSlot(slots: PlanSlot[], item: PlanItem, input: PlanInput): PlanSlot | null {
  const dauer = minutesOf(item.ranked)
  const due = item.ranked.item.dueAt

  for (const slot of slots) {
    // Nie nach der Frist einplanen. Ist die Frist schon vorbei, gehört es in den ersten
    // Abschnitt – nicht in keinen.
    if (due && due.getTime() < slot.from.getTime() && due.getTime() > input.now.getTime()) continue
    if (input.strategy === 'one_thing' && slot.items.length >= 1) continue
    if (slot.plannedMinutes + dauer > slot.budgetMinutes) continue
    return slot
  }
  return null
}

function minutesOf(r: RankedItem): number {
  return r.item.estimatedMinutes ?? ASSUMED_MINUTES
}

function keyOf(i: PlanItem): number {
  return i.ranked.item.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER
}

function meaningOf(i: PlanItem, input: PlanInput): number {
  const domainWeight = input.meaningByDomain?.get(subjectDomain(i) ?? '')
  if (domainWeight !== undefined) return domainWeight * 10
  // Behelf, klar benannt: Wichtigkeit des Bereichs plus eigene Verantwortung. Das ist nicht
  // „Bedeutung" im Sinne der Verhaltensaktivierung, sondern das Nächstliegende, was das
  // Modell heute hergibt (docs/80 §4).
  const krit = i.ranked.item.domainCriticality
  const basis = krit === 'critical' ? 3 : krit === 'high' ? 2 : krit === 'normal' ? 1 : 0
  return basis * 10 + (i.ranked.item.isOwner ? 5 : 0)
}

function subjectDomain(i: PlanItem): string | null {
  return i.ranked.item.domainId ?? null
}
