import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { NowItem, NowResponse } from '@thealotta/contracts'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { CAPACITY, useAsync } from '../lib/ui.js'
import { PlanOptions, PlanSections, PlanTabs, PLAN_DEFAULTS, type PlanSettings } from './NowPlan.js'
import { NowCard, NowRow } from './NowCards.js'
import { AssignSheet, WaitSheet } from '../components/TaskSheet.js'
import {
  Actions,
  Button,
  EmptyState,
  Field,
  ErrorState,
  Icon,
  Page,
  Input,
  RowList,
  Section,
  Sheet,
  SkeletonList,
  SwipeToComplete,
  useToast,
} from '../design/index.js'

/**
 * Die zentrale Ansicht (§22 und §7 des UX-Auftrags).
 *
 * Kernentscheidung nach dem Audit: Es gibt genau **einen** prominenten Abschnitt.
 * Alles Weitere ist erreichbar, aber visuell zurückgenommen – vorher standen bis zu sechs
 * Abschnitte gleichrangig nebeneinander, was bei geringer Kapazität überfordert.
 */
export function NowPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const toast = useToast()

  const [busy, setBusy] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  /**
   * §26/§27: Abgeben und Warten waren bisher nur in Vorgängen erreichbar – also gerade
   * nicht dort, wo man einer Aufgabe tatsächlich begegnet. Wer eine Sache nicht selbst
   * machen kann, musste sie abhaken, verschieben oder liegen lassen.
   */
  const [handOver, setHandOver] = useState<NowItem | null>(null)
  const [waitFor, setWaitFor] = useState<NowItem | null>(null)
  const [dropping, setDropping] = useState<NowItem | null>(null)

  /*
   * Die Listenansicht (docs/80).
   *
   * `null` heißt „nicht angefordert" – dann verhält sich diese Seite wie vorher. Der Server
   * liefert den Plan aber auch ungefragt, wenn der Betrachter ihn sich einmal gemerkt hat;
   * deshalb wird die Einstellung aus der Antwort übernommen, sobald sie da ist.
   */
  /*
    Drei Zustände, nicht zwei.

    `undefined` heißt „noch nicht entschieden" – dann darf eine gemerkte Vorgabe übernommen
    werden. `null` heißt „der Betrachter hat ausdrücklich ‚Jetzt' gewählt". Beides als `null`
    zu führen war der Fehler: `useAsync` behält die alten Daten, während neu geladen wird
    (`keepPrevious`). Nach einem Klick auf „Jetzt" stand die vorige Antwort noch da, der
    Übernahme-Block sah „Plan vorhanden, nichts eingestellt" und stellte sofort wieder her,
    was der Klick gerade abgeschaltet hatte. Der Reiter ließ sich nicht verlassen.
  */
  const [planSettings, setPlanSettings] = useState<PlanSettings | null | undefined>(undefined)

  const view = useAsync<NowResponse | null>(
    () => (household ? endpoints.now(household.id, planSettings ?? undefined) : Promise.resolve(null)),
    [household?.id, planSettings?.horizon, planSettings?.strategy, planSettings?.aging, planSettings?.slack],
  )

  /*
    Wer „Jetzt" gewählt hat, bekommt keine Liste – auch dann nicht, wenn der Server eine
    mitschickt, weil eine Vorgabe gemerkt ist. Die Vorgabe bleibt erhalten; sie gilt beim
    nächsten Aufruf wieder.
  */
  const plan = planSettings === null ? null : (view.data?.plan ?? null)

  // Gemerkte Vorgabe: genau einmal übernehmen, solange nichts entschieden ist.
  if (plan && planSettings === undefined) {
    setPlanSettings({ horizon: plan.horizon, strategy: plan.strategy, aging: plan.aging, slack: plan.slack })
  }

  /**
   * Optimistisch abhaken: Die Karte verschwindet sofort, die Rückmeldung kommt als Toast mit
   * „Rückgängig". Das ersetzt einen Bestätigungsdialog und macht die häufigste Aktion schnell.
   */
  const complete = useCallback(
    async (item: NowItem) => {
      if (!household) return
      setBusy(item.subjectId)
      setHidden((set) => new Set(set).add(item.subjectId))
      try {
        await endpoints.completeTask(household.id, item.subjectId)
        toast.show(`„${shorten(item.title)}" erledigt.`, async () => {
          await endpoints.reopenTask(household.id, item.subjectId).catch(() => undefined)
          setHidden((set) => {
            const next = new Set(set)
            next.delete(item.subjectId)
            return next
          })
          await view.reload()
        })
        await view.reload()
      } catch {
        setHidden((set) => {
          const next = new Set(set)
          next.delete(item.subjectId)
          return next
        })
        toast.show('Das konnte nicht gespeichert werden. Nichts ist verloren.')
      } finally {
        setBusy(null)
      }
    },
    [household, toast, view],
  )

  /** §15: „Ich bin dran" macht für andere sichtbar, dass sich jemand kümmert. */
  const start = useCallback(
    async (item: NowItem) => {
      if (!household) return
      setBusy(item.subjectId)
      try {
        await endpoints.startTask(household.id, item.subjectId)
        toast.show('Notiert: du bist dran.')
        await view.reload()
      } finally {
        setBusy(null)
      }
    },
    [household, toast, view],
  )

  const defer = useCallback(
    async (item: NowItem) => {
      if (!household) return
      setHidden((set) => new Set(set).add(item.subjectId))
      await endpoints.deferTask(household.id, item.subjectId, {
        until: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        reason: 'Später erneut ansehen',
      })
      toast.show('In drei Tagen wieder da.')
      await view.reload()
    },
    [household, toast, view],
  )

  const sections = useMemo(() => {
    if (!view.data) return []
    return view.data.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !hidden.has(item.subjectId)),
      }))
      .filter((section) => section.items.length > 0)
  }, [view.data, hidden])

  if (!household) return null
  if (view.error) return <ErrorState meaning="Die Übersicht konnte nicht geladen werden." onRetry={view.reload} />

  /*
   * Die Informationshierarchie der Seite – drei Stufen, sichtbar verschieden:
   *
   *   1. EINE Sache als Karte. Groß, mit Begründung und Folge. Das ist die Antwort auf
   *      „was jetzt?".
   *   2. HÖCHSTENS DREI weitere als einzeilige Einträge. Das ist die Antwort auf
   *      „und danach?".
   *   3. Alles Übrige zusammengeklappt, nach Art gruppiert und gezählt. Das ist die
   *      Antwort auf „was ist sonst noch offen?" – und die stellt man selten.
   *
   * Vorher standen vier Abschnitte mit gleich aussehenden Zeilen untereinander: formal
   * geordnet, visuell gleichrangig – und damit wieder eine Liste, die man selbst sortieren
   * muss (§7, §55).
   */
  const itemsOf = (key: string) => sections.find((s) => s.key === key)?.items ?? []
  const nowItems = itemsOf('now')
  const lead = nowItems[0]
  const next = [...nowItems.slice(1), ...itemsOf('can_do_now')].slice(0, 3)
  const nextIds = new Set([lead?.subjectId, ...next.map((i) => i.subjectId)])

  const groups = [
    {
      key: 'needs_clarification',
      title: 'Braucht eine Entscheidung',
      href: '/regeln',
      items: itemsOf('needs_clarification'),
    },
    /*
       „Wartet auf andere" stimmte nur zur Hälfte: In diesem Abschnitt liegen seit Audit 2
       auch Schritte, die auf einen früheren Schritt warten – oft den eigenen. Der Grund
       steht an jedem Eintrag; die Überschrift muss offen bleiben.
    */
    { key: 'waiting', title: 'Wartet noch', href: '/vorgaenge', items: itemsOf('waiting') },
    {
      key: 'resting',
      title: 'Ruht, solange du pausierst',
      href: '/familie',
      items: itemsOf('resting'),
    },
    {
      key: 'rest',
      title: 'Sonst noch offen',
      href: '/bereiche',
      items: [...itemsOf('can_do_now'), ...itemsOf('soon')].filter(
        (i) => !nextIds.has(i.subjectId),
      ),
    },
  ].filter((g) => g.items.length > 0)

  const capacity = view.data?.capacity.level ?? 'normal'
  const quiet = capacity !== 'normal'

  return (
    <>
        <Page
          title="Was zählt gerade"
          lede={
            quiet
              ? `Du hast heute „${CAPACITY[capacity]}" angegeben. Es wird dir weniger gezeigt – nichts davon geht verloren.`
              : undefined
          }
        >
          <p className="capacity-line t-body-sm">
            <span className="c-secondary">Kapazität heute:</span>{' '}
            <button className="linklike" onClick={() => navigate('/familie')}>
              {CAPACITY[capacity] ?? capacity}
            </button>
          </p>

          <PlanTabs
            horizon={(planSettings ?? PLAN_DEFAULTS).horizon}
            active={plan !== null}
            onSelect={(horizon) =>
              setPlanSettings(horizon === null ? null : { ...(planSettings ?? PLAN_DEFAULTS), horizon })
            }
          />

          {/* Einstellungen nur, wo es etwas einzustellen gibt. */}
          {plan && (
            <PlanOptions
              settings={planSettings ?? PLAN_DEFAULTS}
              onChange={(next: PlanSettings) => setPlanSettings(next)}
              onRemember={() => {
                const s = planSettings ?? PLAN_DEFAULTS
                if (household) void endpoints.now(household.id, { ...s, remember: true })
                setPlanSettings(s)
                toast.show('Als deine Voreinstellung gemerkt.')
              }}
            />
          )}


          {view.loading && !view.data && <SkeletonList count={2} />}

          {!plan && view.data && !lead && next.length === 0 && groups.length === 0 && (
            <EmptyState
              icon="check"
              title="Gerade steht nichts an"
              description="Offene Themen bleiben in den Bereichen sichtbar."
              action={
                <Button variant="secondary" icon="domains" onClick={() => navigate('/bereiche')}>
                  Bereiche ansehen
                </Button>
              }
            />
          )}

          {/*
            Ist eine Liste angefordert, tritt sie an die Stelle der Abschnitte – nicht daneben.
            Beides gleichzeitig zeigte jede Sache zweimal, und genau das war der teuerste
            Posten im Kognitionsaudit (docs/48, Gedächtnislast auf `familie`).
            Verloren geht dabei nichts: buildPlan führt jeden Eintrag entweder in einem
            Abschnitt, im Überhang oder unter „nicht planbar" (INV-007, Eigenschaftstest).
          */}
          {plan && (
            <PlanSections
              plan={plan}
              actions={{
                busy,
                onComplete: complete,
                onDefer: defer,
                onStart: start,
                onHandOver: setHandOver,
                onWait: setWaitFor,
                onDrop: setDropping,
                onOpen: (item) => openItem(item, navigate),
              }}
            />
          )}

          {/* ── Stufe 1: die eine Sache ─────────────────────────────── */}
          {!plan && lead && (
            <div className="lead-card">
            <SwipeToComplete
              disabled={lead.subjectType !== 'task'}
              onComplete={() => void complete(lead)}
            >
              <NowCard
                item={lead}
                prominent
                busy={busy === lead.subjectId}
                onComplete={complete}
                onDefer={defer}
                onStart={start}
                onHandOver={setHandOver}
                onWait={setWaitFor}
                onDrop={setDropping}
                onOpen={() => openItem(lead, navigate)}
              />
            </SwipeToComplete>
            </div>
          )}

          {/*
            Was es heute gibt (§39).

            Eine Zeile, kein Abschnitt: „Heute Abend Chili, ca. 25 Minuten" beantwortet die
            Frage, ohne sie zur Aufgabe zu machen. Wer kochen muss, weiß es; wer nur wissen
            will, was es gibt, muss dafür nicht in die Planung.
          */}
          <TonightLine />

          {/* ── Stufe 2: was danach kommt ───────────────────────────── */}
          {!plan && next.length > 0 && (
            <Section title="Danach" icon="route">
              <RowList>
                {next.map((item) => (
                  <li key={`${item.subjectType}-${item.subjectId}`}>
                    <NowRow
                      item={item}
                      busy={busy === item.subjectId}
                      onComplete={item.subjectType === 'task' ? complete : undefined}
                      onOpen={() => openItem(item, navigate)}
                    />
                  </li>
                ))}
              </RowList>
            </Section>
          )}

          {/* ── Stufe 3: der Rest, sichtbar gruppiert statt weggeklappt ─── */}
          {!plan && groups.length > 0 && (
            <div className="tier3">
              {groups.map((group) => (
                <section key={group.key} className="tier3-group">
                  <header>
                    <p className="t-overline c-muted">{group.title}</p>
                    <span className="t-caption c-muted num">{group.items.length}</span>
                  </header>
                  <RowList>
                    {group.items.slice(0, 2).map((item) => (
                      <li key={`${item.subjectType}-${item.subjectId}`}>
                        <NowRow
                          item={item}
                          compact
                          busy={busy === item.subjectId}
                          onComplete={item.subjectType === 'task' ? complete : undefined}
                          onOpen={() => openItem(item, navigate)}
                        />
                      </li>
                    ))}
                  </RowList>
                  {group.items.length > 2 && (
                    <button className="linklike" onClick={() => navigate(group.href)}>
                      alle {group.items.length} ansehen
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}

        </Page>

      {dropping && (
        <DropSheet
          aufgabe={{ id: dropping.subjectId, title: dropping.title }}
          onClose={() => setDropping(null)}
          onDone={async () => {
            setDropping(null)
            await view.reload()
          }}
        />
      )}
      {handOver && (
        <AssignSheet
          open
          onClose={() => setHandOver(null)}
          taskId={handOver.subjectId}
          taskTitle={handOver.title}
          onDone={async () => {
            setHandOver(null)
            await view.reload()
          }}
        />
      )}
      {waitFor && (
        <WaitSheet
          open
          onClose={() => setWaitFor(null)}
          taskId={waitFor.subjectId}
          taskTitle={waitFor.title}
          onDone={async () => {
            setWaitFor(null)
            await view.reload()
          }}
        />
      )}
    </>
  )
}


/**
 * §36: Etwas fallen zu lassen ist ein legitimer Abschluss, kein Scheitern. Der Grund wird
 * erfragt, weil er später erklärt, warum nichts mehr passiert ist – nicht, um zu prüfen.
 *
 * Der Bogen ist ausdrücklich nicht an die Jetzt-Ansicht gebunden: Eine Aufgabe steht auch
 * auf der Seite ihres Bereichs, und dort ließ sie sich lange weder abhaken noch loswerden.
 * Zwei Bögen für dasselbe würden früher oder später auseinanderlaufen.
 */
export function DropSheet({
  aufgabe,
  grund,
  onClose,
  onDone,
}: {
  aufgabe: { id: string; title: string }
  /** Warum das stille Löschen nicht ging – der Satz des Servers, wenn er einen hatte. */
  grund?: string | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nicht mehr nötig"
      description={
        grund ?? `„${shorten(aufgabe.title)}" verschwindet aus der Übersicht. Der Bereich bleibt, wie er ist.`
      }
    >
      <Field label="Warum nicht mehr?" hint="Ein halber Satz genügt. Das steht später im Verlauf.">
        {({ id }) => (
          <Input
            id={id}
            value={reason}
            placeholder="z. B. hat sich anders erledigt"
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !household}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              await endpoints.dropTask(household.id, aufgabe.id, reason.trim() || 'Nicht mehr nötig')
              toast.show('Erledigt sich anders. Aus der Übersicht genommen.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          Aus der Übersicht nehmen
        </Button>
      </Actions>
    </Sheet>
  )
}

/**
 * Kompakte Fassung einer Sache: Titel, stärkster Grund, Aufwand – und der eine Knopf,
 * der zu 90 % gebraucht wird. Alles Weitere über den Bereich.
 */


function openItem(item: NowItem, navigate: (to: string) => void): void {
  if (item.domain) navigate(`/bereiche/${item.domain.id}`)
}

const shorten = (text: string) => (text.length > 40 ? `${text.slice(0, 38)}…` : text)

export { Icon }

/**
 * Das heutige Abendessen als eine Zeile.
 *
 * Bewusst ohne Handlung: Abhaken kann man ein Essen nicht, und ein Knopf „ansehen" wäre ein
 * Klick für eine Auskunft, die schon dasteht. Wer mehr will, findet den Plan in der
 * Navigation.
 */
function TonightLine() {
  const { household } = useSession()
  const essen = useAsync(
    () => (household ? endpoints.upcomingMeals(household.id, 1) : Promise.resolve(null)),
    [household?.id],
  )
  const heute = essen.data?.today
  const abends = essen.data?.items.find((i) => i.date === heute && i.slot === 'dinner')
  if (!abends) return null

  return (
    <p className="capacity-line t-body-sm">
      <span className="c-secondary">Heute Abend:</span>{' '}
      <Link className="linklike" to="/essen">
        {abends.dishName}
      </Link>
      {abends.totalMinutes !== null && <span className="c-secondary"> · ca. {abends.totalMinutes} Minuten</span>}
    </p>
  )
}
