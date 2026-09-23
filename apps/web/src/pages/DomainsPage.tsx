import { Fragment, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, endpoints, type DomainEntry } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { CRITICALITY, useAsync } from '../lib/ui.js'
import { toneClass, useColors } from '../lib/colors.js'
import { ColorPicker } from '../components/ColorPicker.js'
import { planDrop, isNoOp, type DragRow, type DropPlan } from '../lib/tree-drag.js'
import { prettyPath } from '../lib/domains.js'
import { EditDomainSheet } from '../components/EditDomainSheet.js'
import type { ColorTone } from '@thealotta/contracts'
import {
  Actions,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  Notice,
  OwnerBadge,
  Page,
  Row,
  RowList,
  Section,
  Select,
  Sheet,
  SkeletonList,
  useToast,
  ICON,
} from '../design/index.js'

/** Jeder Bereich trägt seine Farbe – die Kante sagt, welcher Bereich, nicht wie es um ihn steht. */
const domainClass = (tone: ColorTone | null): string => ['tone-edge', toneClass(tone)].filter(Boolean).join(' ')

/** Bereichsbaum: wo Verantwortung liegt – und wo sie fehlt (§8, §31). */
export function DomainsPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  /*
    Ein Zustand für beide Wege zum selben Bogen.

    `null` heißt geschlossen, `{}` heißt „neuer Bereich, Elternteil offen" (der Knopf oben),
    `{ parent }` heißt „Unterbereich von diesem hier" (der Knopf in der Zeile). Zwei
    getrennte Zustände hätten zwei Bögen bedeutet, die sich gegenseitig öffnen können.
  */
  const [adding, setAdding] = useState<{ parent?: { id: string; name: string } } | null>(null)
  /*
   * Ein ausdrücklicher Modus statt dauerhafter Knöpfe.
   *
   * Sechs Bedienelemente je Zeile sind beim Ansehen im Weg und beim Umbauen genau richtig.
   * Der Modus trennt beides: Wer schauen will, sieht die Liste; wer umbauen will, sagt es
   * einmal und hat dann alles zur Hand.
   */
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  /*
   * Die Meldung gehört zu einer Zeile, nicht zur Seite.
   *
   * Oben auf der Seite stünde sie weit weg von dem Knopf, der sie ausgelöst hat – bei
   * dreizehn Zeilen sieht man sie dort womöglich gar nicht. `tone` unterscheidet außerdem
   * „geht nicht weiter" (eine Auskunft) von „das nehme ich nicht zurück" (eine Ablehnung):
   * Am Ende einer Liste anzukommen ist kein Fehler.
   */
  const [message, setMessage] = useState<{ id: string; text: string; tone: 'quiet' | 'attention' } | null>(null)
  const [palette, setPalette] = useState<string | null>(null)
  /** Welcher Bereich gerade im Bearbeiten-Bogen liegt. `null` heißt: keiner. */
  const [bearbeiten, setBearbeiten] = useState<DomainEntry | null>(null)
  /*
   * Ziehen: Wir merken uns, was aufgenommen wurde, und wo es gerade landen würde. Gerechnet
   * wird in `lib/tree-drag.ts` – hier stehen nur Zeigergesten und Anzeige.
   */
  const [drag, setDrag] = useState<{ id: string; parentId: string | null; startX: number } | null>(null)
  const [plan, setPlan] = useState<DropPlan | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /** Die Zeilenmaße vom Beginn des Ziehens – während des Zugs ändert sich die Liste nicht. */
  const rowsRef = useRef<DragRow[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const colors = useColors()
  const toast = useToast()

  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null
  if (domains.error) return <ErrorState meaning="Die Bereiche konnten nicht geladen werden." onRetry={domains.reload} />

  const items = (domains.data?.items ?? []).filter((d) => !d.archivedAt)
  const vacant = items.filter((d) => !d.effectiveOwner)

  /**
   * Die Zeilen so vermessen, wie sie stehen.
   *
   * Aus dem DOM statt aus den Daten: Der gezogene Zeiger bewegt sich über Pixel, nicht über
   * Bäume. Einmal beim Aufnehmen gemessen – während des Ziehens ändert sich nichts an der
   * Liste, und jedes erneute Messen würde nur ruckeln.
   */
  const measure = (): DragRow[] => {
    const list = listRef.current
    if (!list) return []
    /*
     * Gemessen wird gegen die Liste, nicht mit `offsetTop`.
     *
     * `offsetTop` zählt ab dem nächsten *positionierten* Vorfahren – und `.row` ist
     * positioniert. Die Werte stimmten dadurch nicht mit der Zeigerposition überein, und der
     * Zug landete eine Zeile oder eine Ebene daneben: sichtbar erst nach dem Loslassen.
     */
    const listTop = list.getBoundingClientRect().top
    return [...list.querySelectorAll<HTMLElement>('li[data-domain]')].map((li) => {
      const box = li.getBoundingClientRect()
      return {
        id: li.dataset['domain']!,
        depth: Number(li.dataset['depth'] ?? 0),
        top: box.top - listTop,
        height: box.height,
      }
    })
  }

  const onDragMove = (event: React.PointerEvent) => {
    if (!drag) return
    const list = listRef.current
    if (!list) return
    const indentPx = 24
    const y = event.clientY - list.getBoundingClientRect().top
    setPlan(planDrop(rowsRef.current, drag.id, y, event.clientX - drag.startX, indentPx))
  }

  const onDragEnd = async () => {
    const current = drag
    const target = plan
    setDrag(null)
    setPlan(null)
    if (!current || !target) return
    // Ein Zug, der nichts ändert, schreibt auch nichts ins Protokoll.
    if (isNoOp(target, rowsRef.current, current.id, current.parentId)) return
    await act(current.id, () =>
      endpoints.repositionDomain(household.id, current.id, {
        parentId: target.parentId,
        beforeId: target.beforeId,
      }),
    )
  }

  /** Eine Bewegung ausführen und die Liste danach neu holen – die Reihenfolge kommt vom Server. */
  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusy(id)
    setMessage(null)
    try {
      await run()
      await domains.reload()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      setMessage({
        id,
        text: err instanceof Error ? err.message : 'Das ging gerade nicht.',
        tone: code === 'no_room' ? 'quiet' : 'attention',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Page
      title="Bereiche"
      lede="Eure Themen und wer für welches mitdenkt."
      action={
        <>
          <Button
            variant={editing ? 'primary' : 'secondary'}
            icon={editing ? 'check' : 'settings'}
            onClick={() => {
              setEditing((v) => !v)
              setPalette(null)
              setConfirmDelete(null)
              setMessage(null)
            }}
          >
            {editing ? 'Fertig' : 'Bearbeiten'}
          </Button>
          {!editing && (
            <Button variant="primary" icon="plus" onClick={() => setAdding({})}>
              Bereich anlegen
            </Button>
          )}
        </>
      }
    >
      {domains.loading && !domains.data && <SkeletonList count={3} />}

      {vacant.length > 0 && !editing && (
        <Notice tone="attention" title={`${vacant.length} ohne klare Zuständigkeit`}>
          Das ist kein Fehler – nur etwas, das jemand entscheiden sollte. Ohne Zuständigkeit
          bemerkt niemand, wenn hier etwas liegen bleibt.
        </Notice>
      )}

      {domains.data && items.length === 0 && (
        <EmptyState
          icon="domains"
          title="Noch keine Bereiche"
          description={'Bereiche sind die Räume, in denen Verantwortung lebt: „Kind A / Kleidung“, „Haushalt / Wäsche“, „Familie / Versicherungen“.'}
          action={
            <Button variant="primary" icon="plus" onClick={() => setAdding({})}>
              Ersten Bereich anlegen
            </Button>
          }
        />
      )}

      {editing && (
        <Notice tone="quiet" title="Bearbeiten">
          Verschieben ändert nur die Reihenfolge und die Ebene – nichts geht dabei verloren.
          Löschen geht nur bei leeren Bereichen; sonst sagt Thealotta, was drinsteht.
        </Notice>
      )}
      {items.length > 0 && (
        <Section>
          <RowList
            ref={listRef}
            className={drag ? 'is-dragging' : undefined}
            onPointerMove={onDragMove}
            onPointerUp={() => void onDragEnd()}
            onPointerCancel={() => {
              setDrag(null)
              setPlan(null)
            }}
          >
            {items.map((domain, i) => {
              const depth = Math.min(4, domain.path.split('.').length - 1)
              return (
                <Fragment key={domain.id}>
                  {/*
                    Die Einfügemarke zeigt beides: zwischen welche Zeilen es fällt und auf
                    welche Ebene. Ohne die Einrückung wäre „eine Ebene tiefer" beim Ziehen
                    nicht zu sehen – man erführe es erst nach dem Loslassen.
                  */}
                  {plan?.index === i && (
                    <li className="drop-mark" aria-hidden="true" style={{ '--depth': plan.depth } as never} />
                  )}

                  {/* Die Ebene trägt eine Linie: Einrückung allein ist bei vier Stufen und
                      kurzen Namen kaum zu lesen (im Browser nachgesehen). Die Farbe ist die
                      der zuständigen Person, sonst die eigene des Bereichs – Name und
                      Abzeichen stehen weiterhin daneben (§38). */}
                  <li
                  data-domain={domain.id}
                  data-depth={depth}
                  /* „Kritisch" stand als 13-px-Grau unter dem Namen – in derselben Farbe,
                     Größe und Gewicht wie „nebensächlich". Die Frage „Was ist kritisch?"
                     war damit nur durch Lesen zu beantworten, dreizehnmal je Seite
                     (docs/66, Bestandsaufnahme). Das Attribut trägt keine neue Information;
                     es macht die vorhandene sichtbar. */
                  data-rang={domain.criticality}
                  className={[
                    drag?.id === domain.id ? 'is-dragged' : '',
                    /*
                      Ziel des Hineinziehens. Eine Linie zwischen zwei Zeilen und „wird
                      Unterbereich von" sind zwei verschiedene Aussagen – also auch zwei
                      verschiedene Anzeigen (docs/76).
                    */
                    plan?.intoId === domain.id ? 'ist-ziel' : '',
                    depth > 0 ? 'tree-child' : '',
                    domainClass(colors.domainTone(domain.id, domain.effectiveOwner?.membershipId ?? null)),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--depth': depth } as never}
                >
                  <Row
                    title={domain.name}
                    subtitle={domain.criticality !== 'normal' ? CRITICALITY[domain.criticality] : undefined}
                    end={
                      editing ? (
                        <DomainTools
                          domain={domain}
                          busy={busy === domain.id}
                          dragging={drag?.id === domain.id}
                          onGrab={(event) => {
                            rowsRef.current = measure()
                            setDrag({ id: domain.id, parentId: domain.parentId, startX: event.clientX })
                            setPlan(null)
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }}
                          paletteOpen={palette === domain.id}
                          confirming={confirmDelete === domain.id}
                          onMove={(direction) =>
                            void act(domain.id, () => endpoints.moveDomain(household.id, domain.id, direction))
                          }
                          onEdit={() => {
                            setPalette(null)
                            setConfirmDelete(null)
                            setBearbeiten(domain)
                          }}
                          onPalette={() => {
                            setPalette((v) => (v === domain.id ? null : domain.id))
                            setConfirmDelete(null)
                          }}
                          onDelete={() => {
                            if (confirmDelete !== domain.id) {
                              setConfirmDelete(domain.id)
                              setPalette(null)
                              return
                            }
                            void act(domain.id, async () => {
                              await endpoints.deleteDomain(household.id, domain.id)
                              setConfirmDelete(null)
                              toast.show(`„${domain.name}" gelöscht.`)
                            })
                          }}
                          onCancelDelete={() => setConfirmDelete(null)}
                        />
                      ) : (
                        <>
                          <OwnerChip domain={domain} onClaimed={domains.reload} />
                          {/*
                            Ein Unterbereich entsteht dort, wo er hingehört – an seinem
                            künftigen Elternteil.

                            Vorher führte der einzige Weg über „Bereich anlegen" oben und eine
                            Aufklappliste aller Bereiche: Man musste den Bereich, auf den man
                            gerade zeigte, in einer Liste wiederfinden. `variant="ghost"` ist
                            hier wichtig – dreizehn umrandete Knöpfe mit Versatzschatten wären
                            in dieser Gestalt eine zweite Spalte aus Kästen.
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="plus"
                            title="Unterbereich anlegen"
                            aria-label={`Unterbereich in „${domain.name}" anlegen`}
                            onClick={() => setAdding({ parent: { id: domain.id, name: domain.name } })}
                          />
                        </>
                      )
                    }
                    onClick={editing ? undefined : () => navigate(`/bereiche/${domain.id}`)}
                  />

                  {message?.id === domain.id && (
                    <div className="row-drawer">
                      <Notice tone={message.tone}>{message.text}</Notice>
                    </div>
                  )}

                  {/* Die Farbwahl klappt unter ihrer Zeile auf – dort, wo sie wirkt. */}
                  {editing && palette === domain.id && (
                    <div className="row-drawer">
                      <ColorPicker
                        subject="domain"
                        subjectId={domain.id}
                        label={domain.name}
                        fallbackId={domain.effectiveOwner?.membershipId ?? null}
                      />
                    </div>
                  )}
                </li>
                </Fragment>
              )
            })}
            {plan && plan.index >= items.length && (
              <li className="drop-mark" aria-hidden="true" style={{ '--depth': plan.depth } as never} />
            )}
          </RowList>
        </Section>
      )}

      {/*
        Derselbe Bogen wie auf der Bereichsseite – nicht ein zweiter, der dasselbe kann.
        Zwei Formulare für Name, Einordnung und Wichtigkeit laufen auseinander, sobald eines
        ein Feld dazubekommt.
      */}
      {bearbeiten && (
        <EditDomainSheet
          open
          onClose={() => setBearbeiten(null)}
          domain={bearbeiten}
          allDomains={items}
          onSaved={async () => {
            setBearbeiten(null)
            await domains.reload()
          }}
        />
      )}

      <NewDomainSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        parent={adding?.parent}
        domains={items}
        onCreated={async (id) => {
          setAdding(null)
          await domains.reload()
          navigate(`/bereiche/${id}`)
        }}
      />
    </Page>
  )
}

export function OwnerChip({ domain, onClaimed }: { domain: DomainEntry; onClaimed?: () => Promise<void> | void }) {
  const owner = domain.effectiveOwner
  if (!owner) return <OwnerBadge kind="vacant" />
  if (owner.sharedNames && owner.sharedNames.length > 1)
    return <OwnerBadge kind="shared" name={owner.sharedNames.join(', ')} />
  if (owner.viaCoverage)
    return <OwnerBadge kind="coverage" name={owner.displayName} membershipId={owner.membershipId} />
  return (
    <>
      <OwnerBadge kind="responsibility" name={owner.displayName} membershipId={owner.membershipId} />
      {owner.inheritedFrom && <ErbeChip domain={domain} onClaimed={onClaimed} />}
    </>
  )
}

/**
 * „geerbt" – und beim Darauffahren der Weg, es zu beenden.
 *
 * Ein Unterbereich ohne eigene Zuweisung erbt die Verantwortung von oben (Q-04). Das stand
 * hier als reines Etikett: eine Auskunft, die den häufigsten nächsten Schritt kennt und ihn
 * nicht anbietet. Wer „geerbt" liest, will meistens genau eines – dass es für diesen Bereich
 * nicht mehr gilt. Dafür musste man bisher hineingehen und dort „Ich übernehme das" suchen.
 *
 * Jetzt ist das Etikett der Knopf. Beim Darauffahren und bei Tastaturfokus wechselt die
 * Aufschrift zu „übernehmen".
 *
 * **Am Finger gibt es kein Darauffahren.** Dort steht deshalb dauerhaft „übernehmen" (siehe
 * `@media (hover: none)`) – eine Aufschrift, die nur die Maus kennt, wäre auf dem Telefon eine
 * unsichtbare Funktion mit sichtbarer Trefferfläche. Aus demselben Grund wächst der Knopf dort
 * auf die volle Bedienhöhe.
 *
 * Für Vorleseprogramme bleibt der Name **unverändert**, egal was gerade zu sehen ist: Ein
 * Bedienelement, dessen Name sich unter dem Zeiger ändert, ist für jemanden, der es nicht
 * sieht, zwei verschiedene Dinge.
 */
function ErbeChip({ domain, onClaimed }: { domain: DomainEntry; onClaimed?: () => Promise<void> | void }) {
  const { household } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const herkunft = domain.effectiveOwner?.inheritedFrom

  const uebernehmen = async () => {
    if (!household || busy) return
    setBusy(true)
    try {
      await endpoints.claimDomain(household.id, domain.id)
      /*
        Die Meldung sagt, was sich geändert hat – nicht „gespeichert". Vererbt war kein
        Zustand, den jemand gewählt hat; dass er jetzt beendet ist, ist die eigentliche
        Nachricht (Q-04: die erste eigene Zuweisung beendet die Vererbung).
      */
      toast.show(`Du bist jetzt verantwortlich für „${domain.name}" – nicht mehr geerbt.`)
      await onClaimed?.()
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Das hat gerade nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="chip erbe-chip"
      disabled={busy}
      aria-label={`Verantwortung für „${domain.name}" selbst übernehmen – bisher geerbt`}
      title={herkunft ? `Geerbt von ${herkunft.split('.').at(-2) ?? herkunft}` : 'Geerbt'}
      onClick={() => void uebernehmen()}
    >
      {/*
        Ein Chip wie jeder andere – die Klasse `chip` bestimmt Höhe, Innenabstand, Schriftgrad
        und damit die Grundlinie. Nur der Inhalt ist besonders: zwei Aufschriften in derselben
        Zelle. Läge die Umschaltung am Knopf selbst (als Gitter statt Flex), säße er in der
        Zeile ein paar Pixel neben den anderen Abzeichen.
      */}
      <span className="erbe-text">
        <span className="erbe-ruhe" aria-hidden="true">
          geerbt
        </span>
        <span className="erbe-aktion" aria-hidden="true">
          übernehmen
        </span>
      </span>
    </button>
  )
}


/**
 * Ein neuer Bereich – frei oder unter einem bestimmten.
 *
 * `parent` setzt den übergeordneten Bereich fest, statt ihn zur Wahl zu stellen. Das ist der
 * Fall „von hier aus einen Unterbereich anlegen": Wer in „Kleidung" steht und dort auf den
 * Knopf drückt, hat die Frage nach dem Elternteil schon beantwortet. Eine Aufklappliste mit
 * dreizehn Bereichen wäre dann eine Frage, die niemand gestellt hat – und die Liste müsste
 * erst geladen werden, nur um eine bereits bekannte Antwort anzuzeigen.
 */
export function NewDomainSheet({
  open,
  onClose,
  domains = [],
  parent,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  domains?: DomainEntry[]
  parent?: { id: string; name: string }
  onCreated: (id: string) => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [criticality, setCriticality] = useState('normal')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Neuer Bereich"
      description="Ein Ort für alles, was zu einem Thema gehört."
    >
      <Field label="Wie heißt der Bereich?">
        {({ id }) => (
          <Input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={parent ? 'z. B. Winterschuhe' : 'z. B. Schuhe'}
          />
        )}
      </Field>

      {parent ? (
        /*
          Steht der übergeordnete Bereich fest, ist er eine Auskunft und keine Frage – und
          eine Auskunft braucht denselben Abstand wie ein Feld, sonst klebt sie an der
          nächsten Frage.
        */
        <p className="t-body-sm c-secondary field">
          Wird ein Unterbereich von <strong>{parent.name}</strong>.
        </p>
      ) : (
        <Field label="Gehört er zu einem größeren Bereich?" hint="Leer lassen für einen eigenständigen Hauptbereich.">
          {({ id }) => (
            <Select id={id} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— eigenständig —</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {prettyPath(d, domains)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field
        label="Wie wichtig ist er?"
        hint="Kritisch heißt: Liegenbleiben hätte spürbare Folgen für Versorgung oder Sicherheit."
      >
        {({ id }) => (
          <Select id={id} value={criticality} onChange={(e) => setCriticality(e.target.value)}>
            {Object.entries(CRITICALITY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              const created = await endpoints.createDomain(household.id, {
                name: name.trim(),
                parentId: parent?.id ?? (parentId || null),
                criticality,
              })
              setName('')
              toast.show('Bereich angelegt.')
              await onCreated(created.id)
            } finally {
              setBusy(false)
            }
          }}
        >
          Anlegen
        </Button>
      </Actions>
    </Sheet>
  )
}


/**
 * Werkzeuge einer Zeile im Bearbeiten-Modus.
 *
 * Der Griff ist zugleich Ziehfläche und Bedienelement: Mit dem Zeiger nimmt man ihn auf, mit
 * der Tastatur schiebt man ihn mit den Pfeiltasten. Beides ist derselbe Vorgang, nur anders
 * ausgeführt – Ziehen darf nicht der einzige Weg sein (WCAG 2.5.7).
 *
 * Was der Griff kann, steht in seiner Vorlesebeschriftung: Wer ihn anspringt, hört, dass
 * Pfeiltasten die Zeile bewegen.
 */
function DomainTools({
  domain,
  busy,
  dragging,
  onGrab,
  onMove,
  onEdit,
  paletteOpen,
  confirming,
  onPalette,
  onDelete,
  onCancelDelete,
}: {
  domain: DomainEntry
  busy: boolean
  dragging: boolean
  onGrab: (event: React.PointerEvent<HTMLButtonElement>) => void
  onMove: (direction: 'up' | 'down' | 'in' | 'out') => void
  onEdit: () => void
  paletteOpen: boolean
  confirming: boolean
  onPalette: () => void
  onDelete: () => void
  onCancelDelete: () => void
}) {
  if (confirming) {
    return (
      <Actions>
        <Button variant="ghost" size="sm" onClick={onCancelDelete}>
          Abbrechen
        </Button>
        <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
          Wirklich löschen
        </Button>
      </Actions>
    )
  }

  const BY_KEY: Record<string, 'up' | 'down' | 'in' | 'out'> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowRight: 'in',
    ArrowLeft: 'out',
  }

  return (
    <div className="row-tools">
      <button
        type="button"
        className={`grip${dragging ? ' is-dragging' : ''}`}
        aria-label={`„${domain.name}" verschieben – ziehen, oder mit den Pfeiltasten bewegen`}
        title="Ziehen zum Verschieben · Pfeiltasten bewegen"
        disabled={busy}
        onPointerDown={onGrab}
        onKeyDown={(event) => {
          const direction = BY_KEY[event.key]
          if (!direction) return
          // Sonst scrollt die Seite unter der Zeile weg, die man gerade bewegt.
          event.preventDefault()
          onMove(direction)
        }}
      >
        <Icon name="grip" size={ICON.md} />
      </button>
      {/*
        Eine Ebene höher als eigener Knopf.

        Ziehen kann das auch – aber waagerecht auf die richtige Stufe zu treffen ist die
        fummeligste Bewegung von allen, und „raus aus diesem Bereich" ist der häufigste
        Wunsch beim Aufräumen. Deaktiviert, wenn es schon oben liegt: Das sieht man der
        fehlenden Einrückung ohnehin an, und ein Knopf, der jedes Mal dasselbe antwortet,
        ist Lärm.

        Der Pfeil nach oben statt eines Winkels nach links: Im Baum ist „eine Ebene höher"
        zwar eine waagerechte Bewegung, gemeint und gesagt wird aber „hoch". Verwechseln
        kann man ihn nicht – ein zweiter Pfeil steht in der Zeile nicht.
      */}
      <Button
        variant="ghost"
        size="sm"
        icon="arrowUp"
        aria-label={`„${domain.name}" eine Ebene höher`}
        title={domain.parentId ? 'Eine Ebene höher' : 'Liegt schon auf der obersten Ebene'}
        disabled={busy || !domain.parentId}
        onClick={() => onMove('out')}
      />
      {/*
        Umbenennen gehört hierher.

        Im Bearbeiten-Modus ließ sich eine Zeile verschieben, einfärben und löschen – nur nicht
        umbenennen. Den Namen zu ändern hieß: Bereich öffnen, „Diesen Bereich verwalten",
        „Bearbeiten". Drei Schritte für die naheliegendste Änderung von allen, und zwar genau
        dort nicht erreichbar, wo man gerade aufräumt (docs/75).
      */}
      <Button
        variant="ghost"
        size="sm"
        icon="pencil"
        aria-label={`„${domain.name}" umbenennen oder einordnen`}
        title="Umbenennen"
        disabled={busy}
        onClick={onEdit}
      />
      <Button
        variant="ghost"
        size="sm"
        icon="sparkle"
        aria-label={`Farbe von „${domain.name}"`}
        title="Farbe"
        aria-pressed={paletteOpen}
        disabled={busy}
        onClick={onPalette}
      />
      <Button
        variant="ghost"
        size="sm"
        icon="trash"
        aria-label={`„${domain.name}" löschen`}
        title="Löschen"
        disabled={busy}
        onClick={onDelete}
      />
    </div>
  )
}
