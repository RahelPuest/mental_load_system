import {
  PLAN_HORIZONS,
  PLAN_STRATEGIES,
  type NowItem,
  type PlanEntry,
  type PlanHorizon,
  type PlanStrategy,
  type PlanView,
} from '@thealotta/contracts'
import {
  Actions,
  Button,
  Disclosure,
  EmptyLine,
  Notice,
  Panel,
  RowList,
  Section,
  Select,
  SettingRow,
  Toggle,
} from '../design/index.js'
import { NowCard, NowRow, saysTheSame } from './NowCards.js'

export interface PlanSettings {
  horizon: PlanHorizon
  strategy: PlanStrategy
  aging: boolean
  slack: boolean
}

export const PLAN_DEFAULTS: PlanSettings = { horizon: 'day', strategy: 'deadline_first', aging: true, slack: true }

const HORIZON_LABEL: Record<PlanHorizon, string> = { day: 'Heute', week: 'Woche', month: 'Monat' }

/**
 * Die Bezeichnungen sagen, woher die Reihenfolge kommt – nicht, dass sie die beste sei.
 *
 * Eine Auswahl namens „Beste Reihenfolge" nähme eine Entscheidung ab, die sie nicht abnehmen
 * kann. Der Zusatz in Klammern ist der Herkunftsnachweis: Wer wissen will, was dahintersteckt,
 * findet es in docs/80 unter demselben Namen.
 */
const STRATEGY_LABEL: Record<PlanStrategy, string> = {
  deadline_first: 'Frist zuerst (EDF)',
  shortest_first: 'Kurzes zuerst (SJF)',
  one_thing: 'Eine Sache (WIP-Grenze 1)',
  capacity_fit: 'Nach Kapazität füllen (Bin Packing)',
  meaning_first: 'Nach Bedeutung (Verhaltensaktivierung)',
  cue_grouped: 'Nach Anlass (wenn–dann)',
}

/** Was eine Zeile oder Karte im Plan tun kann – dieselben Aktionen wie außerhalb der Liste. */
export interface PlanActions {
  busy: string | null
  onComplete: (item: NowItem) => void
  onDefer: (item: NowItem) => void
  onStart: (item: NowItem) => void
  onHandOver: (item: NowItem) => void
  onWait: (item: NowItem) => void
  onDrop: (item: NowItem) => void
  onOpen: (item: NowItem) => void
}

/**
 * Die Steuerung liegt hinter einem Aufklapper.
 *
 * docs/48 zählt sichtbare Bedienelemente als Last, und `jetzt` lag dort bei „Hoch". Drei
 * Zeiträume, sechs Reihenfolgen und zwei Schalter offen hinzulegen wäre ein Rückschritt in
 * genau dieser Kennzahl. Geschlossener Inhalt zählt nicht – und die Regel aus docs/48 ist
 * eingehalten: einen **benannten** Klick entfernt, nie einen geratenen.
 */
/**
 * Die Reiter über der Ansicht.
 *
 * Vier Wege, von denen genau einer gilt – deshalb ein zusammenhängender Streifen und
 * `role="radiogroup"`: Die Form sagt „eines davon", und Hilfsmittel bekommen dieselbe
 * Auskunft. Keine ARIA-Reiter, weil deren Tastaturverhalten (Pfeiltasten, Roving-Tabindex)
 * mehr verspricht, als eine Leiste ohne eigene Bereiche einlösen kann.
 *
 * „Jetzt" ist der erste Reiter und die Voreinstellung. Wer nie auf einen der anderen klickt,
 * sieht die Seite, die es vorher gab.
 */
export function PlanTabs({
  horizon,
  active,
  onSelect,
}: {
  horizon: PlanHorizon
  active: boolean
  onSelect: (horizon: PlanHorizon | null) => void
}) {
  return (
    <nav className="plan-reiter" role="radiogroup" aria-label="Ansicht">
      <button
        type="button"
        role="radio"
        aria-checked={!active}
        className={!active ? 'ist-gewaehlt' : ''}
        onClick={() => onSelect(null)}
      >
        Jetzt
      </button>
      {PLAN_HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={active && horizon === h}
          className={active && horizon === h ? 'ist-gewaehlt' : ''}
          onClick={() => onSelect(h)}
        >
          {HORIZON_LABEL[h]}
        </button>
      ))}
    </nav>
  )
}

/**
 * Was an der Liste einstellbar ist – ohne den Zeitraum, der jetzt oben als Reiter steht.
 *
 * Erscheint nur, wenn eine Liste gewählt ist: Auf „Jetzt" gäbe es nichts einzustellen, und
 * eine Einstellung ohne Gegenstand ist eine Frage ohne Anlass (docs/48).
 */
export function PlanOptions({
  settings,
  onChange,
  onRemember,
}: {
  settings: PlanSettings
  onChange: (next: PlanSettings) => void
  onRemember: () => void
}) {
  return (
    <Disclosure summary="Wie sortiert wird">
      <Panel>
        <div className="plan-steuerung">
          <SettingRow title="Reihenfolge" description="Woher die Sortierung stammt, steht in Klammern – nachzulesen in docs/80.">
            <Select
              aria-label="Reihenfolge"
              value={settings.strategy}
              onChange={(e) => onChange({ ...settings, strategy: e.target.value as PlanStrategy })}
            >
              {PLAN_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </Select>
          </SettingRow>

          {/* An/Aus wie auf der Einstellungsseite: ein Schalter, der sein Wort sagt. */}
          <SettingRow
            title="Liegengebliebenes nach vorn holen"
            description="Was seit drei Wochen offen ist, kommt einmal nach oben – sonst gewinnt immer das Kurze."
          >
            <Toggle pressed={settings.aging} onToggle={() => onChange({ ...settings, aging: !settings.aging })}>
              {settings.aging ? 'an' : 'aus'}
            </Toggle>
          </SettingRow>

          <SettingRow
            title="Puffer lassen"
            description="Verplant nur etwa 69 % des Tages. Dass Menschen den eigenen Aufwand unterschätzen, ist gut belegt."
          >
            <Toggle pressed={settings.slack} onToggle={() => onChange({ ...settings, slack: !settings.slack })}>
              {settings.slack ? 'an' : 'aus'}
            </Toggle>
          </SettingRow>

          <Actions>
            <Button variant="secondary" onClick={onRemember}>
              Als meine Voreinstellung merken
            </Button>
          </Actions>
        </div>
      </Panel>
    </Disclosure>
  )
}

/**
 * Der Plan.
 *
 * Die erste Fassung baute die Einträge aus `Row` – einer Navigationszeile. Damit ließ sich in
 * der Liste nichts abhaken, nichts verschieben, nichts abgeben: eine Todo-Liste, in der man
 * nichts tun kann. Jetzt tragen die Einträge dieselben Karten und Zeilen wie die Seite
 * außerhalb der Liste, mit denselben Aktionen.
 *
 * Die Form richtet sich nach dem Zeitraum, nicht nach Bequemlichkeit:
 *
 * - **Heute** – volle Karten im Kartenraster. Ein Tag hat wenige Sachen, und wer handeln soll,
 *   braucht Begründung, Folge und Aktionen an einem Ort.
 * - **Woche und Monat** – Spalten je Abschnitt (`.plan-days`, dieselbe Bildsprache wie der
 *   gemeinsame Plan), darin kompakte Zeilen. Sieben Tage als volle Karten wären eine Seite,
 *   die man scrollt statt liest.
 *
 * Bewusst **kein Balken** für das Budget, obwohl er naheliegt: Ein gefüllter Balken lädt zum
 * Vergleichen ein („heute nur 40 % geschafft"). Genau das vermeidet dieses Produkt an jeder
 * anderen Stelle auch (INV-008, INV-015). Die Zahl steht als Satz da.
 */
export function PlanSections({ plan, actions }: { plan: PlanView; actions: PlanActions }) {
  const heute = plan.horizon === 'day'

  return (
    <>
      {/* Die Anmerkung steht oben, auch wenn sie unbequem ist: kalibriertes Vertrauen
          statt Werbung (docs/60 E6). */}
      <Notice tone="info">{plan.note}</Notice>

      {heute ? (
        <Section
          title={plan.slots[0]?.label ?? 'Heute'}
          hint={budgetSatz(plan.slots[0])}
          count={plan.slots[0]?.entries.length}
        >
          {(plan.slots[0]?.entries.length ?? 0) === 0 ? (
            <EmptyLine text="Für heute ist nichts eingeplant." />
          ) : (
            <div className="card-grid">
              {plan.slots[0]!.entries.map((e) => (
                <PlanCard key={e.subjectId} entry={e} actions={actions} />
              ))}
            </div>
          )}
        </Section>
      ) : (
        <div className="plan-days plan-liste">
          {plan.slots.map((slot) => (
            <section key={slot.key} className="plan-day">
              <header>
                <p className="t-sub">{slot.label}</p>
                <p className="t-caption c-muted">{budgetSatz(slot)}</p>
              </header>
              {slot.entries.length === 0 ? null : (
                <RowList>
                  {slot.entries.map((e) => (
                    <li key={e.subjectId}>
                      <PlanRow entry={e} actions={actions} />
                    </li>
                  ))}
                </RowList>
              )}
            </section>
          ))}
        </div>
      )}

      {plan.overflow.length > 0 && (
        <Section
          title="Passt nicht in den Zeitraum"
          hint="Nicht weggefallen – nur nicht eingeplant. Mehr Kapazität angeben oder den Puffer abschalten zeigt mehr."
          count={plan.overflow.length}
        >
          <RowList>
            {plan.overflow.map((e) => (
              <li key={e.subjectId}>
                <PlanRow entry={e} actions={actions} />
              </li>
            ))}
          </RowList>
        </Section>
      )}

      {plan.notPlannable.length > 0 && (
        <Section
          title="Lässt sich nicht einplanen"
          hint="Wartet auf etwas, hängt an einem früheren Schritt oder ist bewusst zurückgestellt."
          count={plan.notPlannable.length}
        >
          <RowList>
            {plan.notPlannable.map((e) => (
              <li key={e.subjectId}>
                {/* Hier gibt es nichts abzuhaken – deshalb kompakt, zum Lesen. */}
                <NowRow item={e} compact onOpen={() => actions.onOpen(e)} />
                <PlanGrund entry={e} />
              </li>
            ))}
          </RowList>
        </Section>
      )}
    </>
  )
}

/** Volle Karte plus der Satz, warum sie an dieser Stelle steht. */
function PlanCard({ entry, actions }: { entry: PlanEntry; actions: PlanActions }) {
  return (
    <div className="plan-eintrag">
      <NowCard
        item={entry}
        busy={actions.busy === entry.subjectId}
        onComplete={entry.subjectType === 'task' ? actions.onComplete : undefined}
        onDefer={entry.subjectType === 'task' ? actions.onDefer : undefined}
        onStart={entry.subjectType === 'task' ? actions.onStart : undefined}
        onHandOver={entry.subjectType === 'task' ? actions.onHandOver : undefined}
        onWait={entry.subjectType === 'task' ? actions.onWait : undefined}
        onDrop={entry.subjectType === 'task' ? actions.onDrop : undefined}
        onOpen={() => actions.onOpen(entry)}
        note={grundText(entry)}
      />
    </div>
  )
}

/** Kompakte Zeile mit Abhaken – und dem Satz zur Platzierung darunter. */
function PlanRow({ entry, actions }: { entry: PlanEntry; actions: PlanActions }) {
  return (
    <>
      <NowRow
        item={entry}
        busy={actions.busy === entry.subjectId}
        onComplete={entry.subjectType === 'task' ? actions.onComplete : undefined}
        onOpen={() => actions.onOpen(entry)}
      />
      <PlanGrund entry={entry} />
    </>
  )
}

/**
 * Der Satz zur Platzierung – wenn es einen gibt.
 *
 * Schweigt die Strategie, steht hier nichts. Vorher stand unter fast jedem Eintrag derselbe
 * Satz („Ohne Frist – steht hinter allem mit Termin"), und ein Band aus Wiederholungen zog
 * sich durch die ganze Liste.
 */
function PlanGrund({ entry }: { entry: PlanEntry }) {
  const text = grundText(entry)
  return text ? <p className="plan-grund t-caption c-muted">{text}</p> : null
}

/**
 * Der Satz – oder nichts.
 *
 * Er schweigt zweimal: wenn die Strategie nichts Eigenes zu sagen hat, und wenn er dasselbe
 * sagt wie der Grund, der ohnehin auf der Karte steht. Unter „Tropfenden Wasserhahn
 * reparieren" stand sonst „Der Zeitpunkt ist vorbei." direkt unter „Der vorgesehene
 * Zeitpunkt war der 26.08.2026" – zweimal derselbe Satz in zwei Schriftgrößen.
 */
function grundText(entry: PlanEntry): string | undefined {
  const satz = entry.placedBecause
  const teile: string[] = []
  if (entry.cue) teile.push(entry.cue.label)
  if (satz && !saysTheSame(satz, entry.why[0]?.explanation) && !saysTheSame(satz, entry.ifItWaits)) teile.push(satz)
  return teile.length > 0 ? teile.join(' · ') : undefined
}

/**
 * Das Budget als Satz.
 *
 * „45 von 83 Minuten" ist eine Auskunft. Dasselbe als Balken wäre eine Bewertung.
 */
function budgetSatz(slot: PlanView['slots'][number] | undefined): string {
  if (!slot) return ''
  if (slot.entries.length === 0) return 'Nichts eingeplant.'
  return `${slot.plannedMinutes} von ${slot.budgetMinutes} Minuten verplant.`
}
