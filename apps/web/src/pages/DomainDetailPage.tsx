import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  endpoints,
  type DomainDetail,
  type DomainEntry,
  type MonitorEntry,
  type MoveItemKind,
  type MoveItemRef,
  type StateEntry,
} from '../lib/api.js'
import { describeLimit, describeRhythm, type Recurrence } from '@thealotta/contracts'
import { useSession } from '../lib/session.js'
import {
  CRITICALITY,
  DECISION_KIND,
  KNOWLEDGE_KIND,
  formatDate,
  formatStateValue,
  relativeDays,
  useAsync,
  useDismissable,
  useWideScreen,
} from '../lib/ui.js'
import { toneClass, toneLabel, useColors } from '../lib/colors.js'
import { ColorPicker } from '../components/ColorPicker.js'
import {
  Actions,
  Button,
  Card,
  Checkbox,
  Chip,
  Chips,
  Consequence,
  Deeper,
  Divider,
  type IconName,
  EmptyLine,
  Heading,
  Icon,
  ErrorState,
  Field,
  Input,
  Notice,
  Page,
  Panel,
  Row,
  RowList,
  Section,
  Select,
  Sheet,
  SkeletonList,
  Textarea,
  Toggle,
  useToast,
  ICON,
} from '../design/index.js'
import { Markdown } from '../design/markdown.js'
import { NewDomainSheet, OwnerChip } from './DomainsPage.js'
import { EintragSheet, type Eintrag } from '../components/EintragSheet.js'
import { EditDomainSheet } from '../components/EditDomainSheet.js'
import { describeEvent } from './ProcessPage.js'
/* Derselbe Bogen wie in der Jetzt-Ansicht – zwei für dasselbe liefen früher oder später auseinander. */
import { DropSheet } from './NowPage.js'
import { NewTaskSheet } from '../components/TaskSheet.js'
import { UmhaengenSheet } from '../components/UmhaengenSheet.js'

/**
 * Ein Bereich als Ganzes – ohne Reiter (§10 des UX-Auftrags).
 *
 * Der Audit hat sechs Reiter als Hauptproblem benannt: Man navigiert die Datenstruktur
 * statt den Bereich zu verstehen. Jetzt eine Seite in Prioritätsreihenfolge, Selteneres
 * hinter Aufklappen. Was gerade Aufmerksamkeit braucht, steht oben.
 */
/**
 * Die Abschnitte, die eine eigene Seite haben.
 *
 * Eine Übersicht gab es hier einmal. Sie zeigte je Abschnitt eine Zahl und den dringendsten
 * Fall – und stand damit neben einer linken Spalte, die dieselben Zahlen schon an denselben
 * Namen trug. Zwei Auskünfte über denselben Sachverhalt, untereinander: Wer beide liest,
 * fragt sich, worin sie sich unterscheiden. Sie tun es nicht (docs/61).
 *
 * Was von ihr blieb, ist der Kopf: Wo bin ich, wie heißt der Bereich, wer denkt hier mit.
 * Der steht jetzt über jedem Abschnitt, statt nur über einem.
 */
const UNTERSEITEN = {
  wissen: {
    titel: 'Was wir wissen',
    zweck: 'Angaben, Notizen, offene Fragen und Entscheidungen zu diesem Bereich.',
    icon: 'book',
  },
  regeln: {
    titel: 'Regeln',
    zweck: 'Was von selbst geprüft wird, damit niemand daran denken muss.',
    icon: 'eye',
  },
  laeuft: {
    titel: 'Läuft gerade',
    zweck: 'Offene Aufgaben und mehrschrittige Vorgänge in diesem Bereich.',
    icon: 'route',
  },
  verlauf: {
    titel: 'Was hier passiert ist',
    zweck: 'Der Verlauf dieses Bereichs und die Übergabe an jemand anderen.',
    icon: 'history',
  },
  verwalten: {
    titel: 'Diesen Bereich verwalten',
    zweck: 'Sichtbarkeit, Name, Einordnung, Archivieren, Löschen.',
    icon: 'settings',
  },
} as const satisfies Record<string, { titel: string; zweck: string; icon: IconName }>
type Unterseite = keyof typeof UNTERSEITEN

/**
 * Die linke Spalte, in der Reihenfolge, in der ein Bereich entsteht.
 *
 * Nur die Reihenfolge – Name und Symbol stehen oben. Zwei Listen für dieselben sechs Dinge
 * liefen vorher schon einmal auseinander.
 */
const MENUE: Unterseite[] = ['wissen', 'regeln', 'laeuft', 'verlauf', 'verwalten']

/**
 * Ab wie vielen Einträgen die vollständige Liste ein Suchfeld bekommt.
 *
 * Der frühere Deckel auf der Übersicht ist entfallen: Seit dort eine Zusammenfassung steht
 * statt der ersten fünf Einträge, gibt es nichts mehr zu deckeln (Review C3). Die Schwelle
 * bleibt als Maß dafür, wann eine Liste lang genug ist, um Suchen zu rechtfertigen.
 */
const SUCHE_AB = 10

/** Wie viele Ereignisse der Verlauf auf einmal holt. */
const VERLAUF_SEITE = 25

type DomainEreignis = {
  id: string
  eventType: string
  subjectType: string
  occurredAt: string
  actorKind: string
  payload: Record<string, unknown>
}

export function DomainDetailPage() {
  const { household } = useSession()
  const { domainId, section } = useParams<{ domainId: string; section?: string }>()
  const navigate = useNavigate()
  const toast = useToast()

  /*
   * Filter auf den Unterseiten.
   *
   * Ohne ihn verschiebt die Unterseite das Problem nur: 203 Wissenseinträge sind 20
   * Bildschirme. Eine vollständige Liste ist erst dann ein Ort, wenn man darin etwas
   * wiederfindet. Auf der Übersicht gibt es das Feld nicht – dort stehen fünf Einträge.
   */
  const [filter, setFilter] = useState('')
  const wide = useWideScreen()

  /*
   * Ist eine Bring-Liste verbunden? Einmal je Seite gefragt, nicht je Zeile: Zwanzig Aufgaben
   * wären sonst zwanzig gleiche Anfragen.
   */
  const bring = useAsync(
    () => (household ? endpoints.bringStatus(household.id) : Promise.resolve({ verbindung: null })),
    [household?.id],
  )
  const bringBereit = Boolean(bring.data?.verbindung?.listUuid)

  const [sheet, setSheet] = useState<
    | 'state'
    | 'monitor'
    | 'knowledge'
    | 'question'
    | 'process'
    | 'decision'
    | 'task'
    | 'need'
    | 'handover'
    | 'subdomain'
    | 'edit'
    | 'ownership'
    | null
  >(null)
  /*
    Welche Regel der Bogen gerade ändert. `null` heißt: eine neue anlegen.
    Getrennt vom Bogen-Schalter, weil beim Schließen beides zurückgesetzt werden muss –
    sonst stünde beim nächsten „Regel einrichten" noch die alte Regel im Formular.
  */
  const [regelBearbeiten, setRegelBearbeiten] = useState<DomainDetail['monitors'][number] | null>(null)
  /*
    Aufgaben abhaken und loswerden – der Zustand dafür steht bei den übrigen Haken, nicht
    weiter unten: Hooks müssen in jedem Durchlauf in derselben Reihenfolge laufen, und weiter
    unten liegen die frühen Rückgaben für „lädt noch" und „gibt es nicht".
  */
  const [aufgabeBusy, setAufgabeBusy] = useState<string | null>(null)
  const [verwerfen, setVerwerfen] = useState<{ id: string; title: string; grund?: string | null } | null>(null)

  const detail = useAsync<DomainDetail | null>(
    () => (household && domainId ? endpoints.domainDetail(household.id, domainId) : Promise.resolve(null)),
    [household?.id, domainId],
  )
  const allDomains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  /*
   * Zwei Spalten: links die Abschnitte, rechts der gewählte.
   *
   * Welcher Abschnitt gezeigt wird, hängt nur am Pfad – nicht an geladenen Daten. Deshalb
   * steht das hier oben: Die Auswahl unten ist an ihn gebunden, und Hooks dürfen nicht hinter
   * einer frühen Rückgabe stehen.
   *
   * `/bereiche/:id` ohne Abschnitt zeigt „Was wir wissen" – den ersten Punkt der Spalte. Der
   * Pfad bleibt gültig und muss es bleiben: Brotkrumen, Unterbereichs-Chips und jeder Verweis
   * von außen zeigen darauf. Er führt nur nicht mehr auf eine eigene Seite, sondern auf den
   * ersten Abschnitt.
   */
  const aktiv: Unterseite = section && section in UNTERSEITEN ? (section as Unterseite) : 'wissen'

  /*
    Auswählen und umhängen (docs/72).

    Der Anlass ist das Aufteilen eines Bereichs: „Jacken und Schuhe" wird zu zwei Bereichen,
    und was schon dasteht, soll mitkommen. Deshalb eine Mehrfachauswahl und nicht ein Knopf je
    Zeile – wer aufteilt, verschiebt zwölf Dinge, nicht eines.

    Die Auswahl gilt für die gerade sichtbare Unterseite und endet, wenn man sie verlässt:
    Einträge mitzunehmen, die man nicht mehr sieht, wäre eine Auswahl im Blindflug.
  */
  const [auswaehlen, setAuswaehlen] = useState(false)
  const [gewaehlt, setGewaehlt] = useState<MoveItemRef[]>([])
  const [zielBogen, setZielBogen] = useState(false)
  /** Welche Angabe der Bogen gerade ändert. `null` heißt: eine neue anlegen. */
  const [angabeBearbeiten, setAngabeBearbeiten] = useState<StateEntry | null>(null)
  /*
    Ein Zustand für vier Eintragsarten (docs/81).

    Notizen, Fragen, Entscheidungen und Aufgaben standen auf dieser Seite zum Lesen da und zu
    sonst nichts – bei Entscheidungen gab es nicht einmal eine Aktion. Wer sich vertippt hatte,
    musste den Eintrag umgehen.
  */
  const [eintrag, setEintrag] = useState<Eintrag | null>(null)

  useEffect(() => {
    setAuswaehlen(false)
    setGewaehlt([])
  }, [aktiv, domainId])

  if (!household || !domainId) return null
  if (detail.error) return <ErrorState meaning="Dieser Bereich konnte nicht geladen werden." onRetry={detail.reload} />
  if (!detail.data) return <SkeletonList count={3} />

  const d = detail.data

  const istGewaehlt = (kind: MoveItemKind, id: string) => gewaehlt.some((g) => g.kind === kind && g.id === id)
  const umschalten = (kind: MoveItemKind, id: string) =>
    setGewaehlt((bisher) =>
      bisher.some((g) => g.kind === kind && g.id === id)
        ? bisher.filter((g) => !(g.kind === kind && g.id === id))
        : [...bisher, { kind, id }],
    )

  /** Das Kästchen vor einer Zeile – nur im Auswahlmodus, sonst nichts. */
  const kaestchen = (kind: MoveItemKind, id: string, label: string) =>
    auswaehlen ? (
      <Checkbox
        checked={istGewaehlt(kind, id)}
        onChange={() => umschalten(kind, id)}
        label={`„${label}" in einen anderen Bereich verschieben`}
      />
    ) : null

  /*
    Der Knopf trägt das Ziel, nicht das Mittel.

    Er hieß „Auswählen". Das beschreibt, was der nächste Klick tut, und verschweigt, wozu –
    auswählen kann man in einer Anwendung an zwanzig Stellen, und jedes Mal folgt etwas
    anderes. Wer einen Bereich aufteilen will, sucht nicht „Auswählen", sondern das Wort für
    das, was er vorhat.

    „Abbrechen" wirft die Auswahl weg, nicht die Einträge.
  */
  const auswahlKnopf = (
    <Button
      variant="ghost"
      size="sm"
      {...(auswaehlen ? {} : { icon: 'move' as const })}
      onClick={() => {
        setAuswaehlen((an) => !an)
        setGewaehlt([])
      }}
    >
      {auswaehlen ? 'Abbrechen' : 'In anderen Bereich'}
    </Button>
  )

  /*
    Die Leiste steht auch bei null Gewählten da. Eine, die erst beim ersten Haken erscheint,
    springt ins Bild und schiebt die Liste unter dem Finger weg.

    Solange nichts angehakt ist, sagt sie, was zu tun ist, statt nur „Nichts ausgewählt" zu
    melden – das ist dieselbe Auskunft, nur als Vorwurf formuliert.
  */
  const auswahlLeiste = auswaehlen ? (
    <div className="auswahl-leiste">
      <span className="zahl t-body-sm" aria-live="polite">
        {gewaehlt.length === 0
          ? 'Hak an, was umziehen soll'
          : `${gewaehlt.length} ${gewaehlt.length === 1 ? 'Eintrag' : 'Einträge'} ausgewählt`}
      </span>
      <Button
        variant="primary"
        size="sm"
        icon="move"
        disabled={gewaehlt.length === 0}
        onClick={() => setZielBogen(true)}
      >
        Zielbereich wählen
      </Button>
    </div>
  ) : null

  /*
   * Was der Deckel stehen lässt, entscheidet die fachliche Dringlichkeit – nicht die
   * Einfügereihenfolge. Sonst wäre die sichtbare Auswahl Zufall, und ausgerechnet die
   * Angabe, die bestätigt werden müsste, stünde unter dem Schnitt.
   */
  /** Vergleich ohne Groß- und Kleinschreibung, über Titel und Beschreibung. */
  const passt = (...felder: (string | null | undefined)[]) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return felder.some((f) => (f ?? '').toLowerCase().includes(q))
  }

  const angaben = [...d.states].sort(
    (a, b) => Number(Boolean(b.isStale || b.conflict)) - Number(Boolean(a.isStale || a.conflict)),
  )
  const entscheidungen = [...d.decisions].reverse()

  /*
   * Aufgaben abhaken und loswerden.
   *
   * „Entfernen" versucht erst das stille Löschen. Für eine Aufgabe, die zwei Sekunden alt und
   * noch unberührt ist, ist ein Grundfeld Zeremonie. Hängt dagegen etwas an ihr, sagt der
   * Server, warum – und **sein** Satz steht dann im Bogen, in dem der Grund erfragt wird.
   * Ein Klick für den Vertipper, zwei für den echten Fall.
   */
  const erledige = async (task: { id: string; title: string }) => {
    if (!household) return
    setAufgabeBusy(task.id)
    try {
      await endpoints.completeTask(household.id, task.id)
      // Abhaken ist zurücknehmbar, nicht bestätigungspflichtig (§57).
      toast.show(`„${task.title}" erledigt.`, async () => {
        await endpoints.reopenTask(household.id, task.id).catch(() => undefined)
        await detail.reload()
      })
      await detail.reload()
    } finally {
      setAufgabeBusy(null)
    }
  }

  const entferne = async (task: { id: string; title: string }) => {
    if (!household) return
    setAufgabeBusy(task.id)
    try {
      await endpoints.deleteTask(household.id, task.id)
      toast.show('Aufgabe gelöscht.')
      await detail.reload()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setVerwerfen({ id: task.id, title: task.title, grund: err.message })
      } else {
        toast.show('Das hat gerade nicht geklappt. Es ist nichts verloren gegangen.')
      }
    } finally {
      setAufgabeBusy(null)
    }
  }

  /** Dieselbe Handlung, ob aus der Kopfzeile oder aus dem Verantwortungs-Bogen. */
  const claim = async () => {
    if (!household || !detail.data) return
    await endpoints.claimDomain(household.id, detail.data.domain.id)
    toast.show('Du bist jetzt verantwortlich.')
    await detail.reload()
  }
  const activeProcesses = d.processes.filter((p) => p.state === 'active')
  /* Zurückgestelltes bleibt sichtbar – nur eben hinten (INV-001: nichts verschwindet still). */
  /*
   * `?? []`, weil eine Antwort ohne dieses Feld die ganze Seite umbringen würde. Genau das ist
   * beim Einbau passiert: Eine ältere Antwort ohne `tasks` ließ die Bereichsseite abstürzen.
   * Eine fehlende Liste ist eine leere Liste, kein Grund aufzugeben.
   */
  const offeneAufgaben = [...(d.tasks ?? [])].sort((a, b) => Number(Boolean(b.dueAt)) - Number(Boolean(a.dueAt)))
  const staleStates = d.states.filter((s) => s.isStale || s.conflict)

  /*
   * Links die Abschnitte, rechts der gewählte (`.split`, dasselbe Muster wie die
   * Einstellungen). Unter 1080 px stapelt das Raster: erst das Verzeichnis, dann der Inhalt –
   * deshalb steht die Liste dort waagerecht als Chips statt als sechs Zeilen, die man jedes
   * Mal überspringen müsste.
   */
  /*
   * Zähler an den Menüpunkten (Review C1).
   *
   * Eine Leiste zeigt Wege, keine Inhalte – man sah erst nach dem Klick, ob hinter „Regeln"
   * etwas liegt. Bei 11 von 13 Bereichen im Demohaushalt führten fünf der sechs Punkte ins
   * Leere; „Regeln" eines leeren Bereichs war ein voller Bildschirm für einen Satz.
   *
   * Kein „· 0": Wo nichts ist, steht keine Zahl, der Punkt wird nur gedämpft. Eine Null
   * liest sich als Bewertung, ein blasser Punkt als Auskunft.
   */
  const zahlen: Partial<Record<Unterseite, number>> = {
    wissen: d.states.length + d.knowledge.length + d.questions.length + d.decisions.length,
    regeln: d.monitors.length,
    laeuft: offeneAufgaben.length + activeProcesses.length,
  }

  const menue = (
    <nav className={wide ? 'master' : 'abschnitt-chips'} aria-label="Abschnitte dieses Bereichs">
      {wide ? (
        <RowList>
          {MENUE.map((k) => {
            const zahl = zahlen[k]
            const leer = zahl === 0
            return (
              <li key={k} className={`${k === aktiv ? 'ist-offen' : ''} ${leer ? 'ist-leer' : ''}`.trim()}>
                <Row
                  title={UNTERSEITEN[k].titel}
                  lead={<Icon name={UNTERSEITEN[k].icon} />}
                  chevron={false}
                  onClick={() => navigate(pfadZu(d.domain.id, k))}
                  end={zahl ? <span className="menue-zahl">{zahl}</span> : undefined}
                />
              </li>
            )
          })}
        </RowList>
      ) : (
        MENUE.map((k) => {
          const zahl = zahlen[k]
          return (
            <Link
              key={k}
              to={pfadZu(d.domain.id, k)}
              className={`chip${zahl === 0 ? ' ist-leer' : ''}`}
              aria-current={k === aktiv ? 'page' : undefined}
            >
              {UNTERSEITEN[k].titel}
              {zahl ? <span className="menue-zahl">{zahl}</span> : null}
            </Link>
          )
        })
      )}
    </nav>
  )

  return (
    <Page
      /*
        Der Kopf gehört dem Bereich, nicht dem Abschnitt.

        Vorher wechselte er mit jedem Klick in der linken Spalte: Auf „Regeln" stand „Regeln"
        als Überschrift, und wer verantwortlich ist, verschwand. Damit war die Kopfzeile ein
        Echo des Menüpunkts, den man gerade selbst gedrückt hat – und der Bereich, um den es
        geht, nur noch eine Brotkrume. Jetzt steht oben immer dasselbe: wo man ist, wie der
        Bereich heißt, wer mitdenkt, und was man hier am häufigsten tut.
      */
      crumbs={crumbsFor(d.domain, allDomains.data?.items ?? [])}
      title={d.domain.name}
      /*
        Wer mitdenkt, ist eine Eigenschaft des Bereichs – eine Zeile, kein Abschnitt.

        Als eigener Abschnitt war es mit 920 px der längste der Seite, und fast alles davon
        waren Formulare zum Übergeben und Beteiligen: selten gebraucht, dauerhaft im Weg.
        Die Aussage steht jetzt oben, das Ändern hinter „Ändern" (§17).
      */
      lede={
        <span className="domain-meta">
          <OwnerChip domain={d.domain} onClaimed={detail.reload} />
          {d.domain.criticality !== 'normal' && (
            <Chip tone={d.domain.criticality === 'critical' ? 'critical' : 'attention'}>
              {CRITICALITY[d.domain.criticality]}
            </Chip>
          )}
          {/*
            Ist niemand zuständig, ist das Übernehmen die häufigste Handlung auf dieser Seite –
            sie steht direkt neben der Lücke und nicht hinter einem Klick.
          */}
          {d.domain.effectiveOwner ? (
            <button type="button" className="meta-aktion" onClick={() => setSheet('ownership')}>
              <Icon name="shield" size={ICON.sm} />
              Verantwortung ändern
            </button>
          ) : (
            <button type="button" className="meta-aktion" onClick={() => void claim()}>
              <Icon name="shield" size={ICON.sm} />
              Ich übernehme das
            </button>
          )}
          {/*
            Der Name steht einen Zentimeter darüber – das Ändern gehört daneben, nicht in den
            fünften Abschnitt (docs/75).

            Diese Zeile trägt, was der Bereich *ist*: wer mitdenkt, wie wichtig er ist. Ihre
            Knöpfe sind genau das Ändern dessen, was hier steht. „Umbenennen" ist das
            fehlende dritte – und es öffnet denselben Bogen wie „Verwalten" und wie der Stift
            im Baum, nicht einen dritten Weg zur selben Sache.
          */}
          <button type="button" className="meta-aktion" onClick={() => setSheet('edit')}>
            <Icon name="pencil" size={ICON.sm} />
            Umbenennen
          </button>
        </span>
      }
      action={
        <>
          {/*
            Die Farbe ist eine Eigenschaft des Bereichs, keine Verwaltungsaufgabe – sie gehört
            dorthin, wo seine Identität steht. Unten in „Diesen Bereich verwalten" lag sie
            hinter einem Aufklapper mit Fließtext, und man sah nie, welche Farbe gerade gilt.
            Der Knopf zeigt sie.
          */}
          <DomainColorButton domain={d.domain} />
          {/*
            Kein Zahnrad mehr: „Diesen Bereich verwalten" steht als Punkt in der linken
            Spalte. Zwei Wege zum selben Ort sind kein doppelter Komfort, sondern eine Frage
            mehr – welcher der beiden führt wohin?
          */}
          {/*
            Eine Primäraktion, und es ist die häufigere: etwas notieren, das zu tun ist.

            Hier standen „Vorgang starten" und „Einzelne Aufgabe" nebeneinander – und damit die
            Frage „ist das ein Vorgang oder eine Aufgabe?" ganz am Anfang. Die muss niemand
            beantworten, bevor er weiß, was er notieren will: Es wird eine Aufgabe; ergibt sich
            ein zweiter Schritt, wird ein Vorgang daraus (Audit H2). Der Weg dorthin steht im
            Abschnitt, in dem beides auch erscheint.
          */}
          <Button variant="primary" icon="check" onClick={() => setSheet('task')}>
            Aufgabe
          </Button>
        </>
      }
    >
      {/*
        Der Weg nach unten steht neben dem Weg nach oben – im Kopf, über beiden Spalten.

        Solange er nur auf der Übersicht stand, war er von „Regeln" aus zwei Klicks entfernt,
        obwohl er ins Nachbarzimmer führt. Brotkrumen oben, Unterbereiche darunter: derselbe
        Baum, beide Richtungen, an einer Stelle – und keine davon abschnittsgebunden.
      */}
      {/*
        Der Weg nach unten – und der Ort, an dem ein neuer Unterbereich entsteht.

        Die Leiste stand bisher nur da, wenn es schon Unterbereiche gab. Damit fehlte sie
        genau in dem Moment, in dem man den ersten anlegen will: Bereiche ließen sich
        ausschließlich über die Übersicht anlegen, und dort musste man den übergeordneten
        Bereich aus einer Aufklappliste aller dreizehn heraussuchen. Der Baum kennt seine
        Richtung – Brotkrumen hinauf, diese Leiste hinab – und beide Wege gehören an dieselbe
        Stelle (docs/61).
      */}
      <nav className="subdomains" aria-label="Untergeordnete Bereiche">
        {/*
          Ein Wort davor, sonst liest sich „Schuhe" wie ein Etikett des Bereichs statt wie
          der Weg in ihn hinein. Die Brotkrumen oben brauchen es nicht – ein Pfad mit
          Schrägstrichen erklärt sich; eine einzelne Pille tut das nicht.
        */}
        <span className="t-caption c-muted">{d.children.length > 0 ? 'Darin' : 'Noch nichts darin'}</span>
        {d.children.map((child) => (
          <Link key={child.id} to={`/bereiche/${child.id}`} className="chip">
            {child.name}
          </Link>
        ))}
        <Button variant="ghost" size="sm" icon="plus" onClick={() => setSheet('subdomain')}>
          Unterbereich
        </Button>
      </nav>

      {/*
        Der Kopf steht über beidem, nicht in der rechten Spalte.

        Stand er im Inhalt, wanderte er mit jedem Abschnitt mit – fünfmal derselbe Block,
        jedes Mal neu aufgebaut, und die linke Spalte begann darüber, als gehörte sie zu
        etwas anderem. Er gehört keiner der beiden Spalten: Er benennt den Bereich, in dem
        beide stehen. Also über beiden, über die ganze Breite (docs/61).
      */}
      <div className="split bereich-spalten">
        {menue}
        <div className="split-detail">
        {/*
          Der Eingangshinweis „Noch ist dieser Bereich leer …" ist entfallen (Review C2).

          Er stand über drei Abschnitten, die jeder für sich schon sagen, dass sie leer sind –
          und machte den leeren Bereich damit **länger** als einen vollen: gemessen 1975 px
          gegen 1911 px. Der schlechteste Fall war der häufigste: 6 von 13 Bereichen sind leer.
        */}

        {/*
          Die Abschnitte folgen der Reihenfolge, in der ein Bereich entsteht:
          Verantwortung → Wissen → Beobachtung → was daraus läuft → Verwaltung.

          Vorher begann die Seite mit „Läuft gerade", während Verantwortung, Beobachtung und
          Entscheidungen – die drei Begriffe, auf denen alles andere aufsetzt – in einer
          Nebenspalte unter „Mehr zu diesem Bereich" lagen. Diese Überschrift sagte nichts
          darüber, was darunter steht, und die sechs Aufklapper darunter hatten miteinander
          nichts zu tun (§17: „Mehr" darf keine Müllhalde sein).
        */}

        {/*
          Unterbereiche sind der Weg nach unten – das Gegenstück zu den Brotkrumen oben.
          In der Nebenspalte unter „Verwalten" wäre Navigation an der falschen Stelle.
        */}
        {/*
          Inhalt links, Zustand rechts (docs/54, Desktop-Konzept).

          In der Spalte steht ausdrücklich **nicht**, was schon im Kopf steht: Zuständigkeit
          und Kritikalität bleiben oben. `.with-rail` schiebt die Spalte auf schmalen
          Bildschirmen unter den Inhalt – „wer denkt hier mit" stünde dann ganz unten, und
          das ist die erste Frage an einen Bereich, nicht die letzte.

          Hier steht, was den Bereich beschreibt statt ihn zu füllen: wer ihn sehen darf,
          wann zuletzt etwas passiert ist, und die zwei Wege nach draußen. Alles drei ist
          unter dem Inhalt richtig aufgehoben, wenn der Platz nicht reicht.
        */}
        {/*
          Ein Feld, kein Filterwerk: Auf einer Liste von Notizen ist „enthält" die einzige
          Frage, die jemand stellt. Es erscheint erst, wenn die Liste lang genug ist, um
          Suchen zu rechtfertigen – darunter wäre es ein Bedienelement ohne Anlass.
        */}
        {aktiv === 'wissen' &&
          d.states.length + d.knowledge.length + d.questions.length + d.decisions.length > SUCHE_AB && (
            <Field label="In diesem Bereich suchen">
              {({ id }) => (
                <Input
                  id={id}
                  type="search"
                  value={filter}
                  placeholder="Stichwort"
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
            </Field>
          )}


        {/*
          Die Abschnitte stehen immer da – auch wenn noch nichts drinsteht.

          Vorher waren sie bei einem leeren Bereich ausgeblendet, damit nicht „vier leere
          Hüllen untereinander" stehen. Solange die Optionen in einer Nebenspalte lagen, ging
          das: Man konnte trotzdem etwas anlegen. Seit sie hier stehen, hieß Ausblenden, dass
          es auf einem leeren Bereich überhaupt keinen Weg mehr gab, ihn zu füllen – ausgerechnet
          dort, wo man es am ehesten will.

          Die Antwort auf leere Hüllen ist nicht Verstecken, sondern ein knapper Leerzustand:
          eine Zeile, die sagt, was hier hingehört, mit dem Knopf daneben.
        */}

            {/*
              Angaben, Notizen, Fragen und Entscheidungen sind alle dasselbe: was ihr über
              diesen Bereich wisst. Als drei gleichrangige Abschnitte standen sie
              nebeneinander, als wären es drei verschiedene Themen. Jetzt ist es eines mit
              drei Teilen – die Überschriften rücken eine Ebene tiefer und werden kleiner.
            */}
            {/*
              Der Abschnitt sagt selbst, was er ist – der Kopf darüber gehört dem Bereich.

              Als der Seitenkopf noch den Abschnittstitel trug, wäre das eine Wiederholung
              gewesen. Jetzt steht dort der Bereichsname, und ohne diese Zeile begänne die
              Seite unter „Schuhe" unvermittelt mit „Angaben". Alle fünf Abschnitte tragen
              dieselbe Zeile an derselben Stelle: Symbol, Name, ein Satz Zweck.
            */}
            {aktiv === 'wissen' && (
            <Section title={UNTERSEITEN.wissen.titel} hint={UNTERSEITEN.wissen.zweck} icon="book" action={auswahlKnopf}>
            {/*
              Eine Fläche für den ganzen Abschnitt: Angaben, Notizen und Entscheidungen sind
              drei Teile einer Sache, nicht drei Karten nebeneinander. Die Kästen darin
              verlieren ihren Rahmen (siehe `.panel .panel`) und trennen sich durch Linien.
            */}
            <Panel>
          <Section
            title="Angaben"
            hint={staleStates.length > 0 ? `${staleStates.length} Angabe(n) sollten mal wieder bestätigt werden.` : undefined}
            action={
              <Button variant="ghost" size="sm" icon="plus" onClick={() => {
                  setAngabeBearbeiten(null)
                  setSheet('state')
                }}>
                Angabe
              </Button>
            }
          >
            {d.states.length === 0 ? (
              <EmptyLine
                text="Noch nichts hinterlegt – Größen, Termine, Vorräte."
                action={
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => {
                  setAngabeBearbeiten(null)
                  setSheet('state')
                }}>
                    Angabe anlegen
                  </Button>
                }
              />
            ) : (
              angaben.filter((e) => passt(e.definition.label)).map((entry, index) => (
                <div key={entry.definition.id}>
                  {index > 0 && <Divider />}
                  <div className="waehlbar">
                    {kaestchen('state', entry.definition.id, entry.definition.label)}
                    <div className="waehlbar-inhalt">
                      <StateTile
                        entry={entry}
                        onEdit={() => {
                          setAngabeBearbeiten(entry)
                          setSheet('state')
                        }}
                        onChanged={detail.reload}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </Section>

          <Section
            title="Notizen und Fragen"
            count={d.knowledge.length + d.questions.length}
            action={
              <>
                <Button variant="ghost" size="sm" icon="plus" onClick={() => setSheet('knowledge')}>
                  Notiz
                </Button>
                <Button variant="ghost" size="sm" icon="search" onClick={() => setSheet('question')}>
                  Frage
                </Button>
              </>
            }
          >
            {d.knowledge.length === 0 && d.questions.length === 0 ? (
              /*
                Eine Zeile statt eines großen Leerzustands.

                `EmptyState` ist für Seiten gedacht, auf denen sonst nichts steht. Hier können
                vier Abschnitte gleichzeitig leer sein – viermal Symbol, Titel und Absatz
                ergäben eine leere Seite, die länger ist als eine volle (gemessen: 2728 px
                gegen 2388 px).
              */
              <EmptyLine
                text="Noch nichts festgehalten – Marken, Fundorte, was letztes Mal schiefging."
                action={
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => setSheet('knowledge')}>
                    Festhalten
                  </Button>
                }
              />
            ) : (
              <>
                {d.questions.filter((q) => passt(q.body)).map((question) => (
                  <div className="setting-row" key={question.id}>
                    {kaestchen('question', question.id, question.body)}
                    <div className="text">
                      <p className="t-sub">{question.body}</p>
                      <p className="t-body-sm desc">Offene Frage</p>
                    </div>
                    <Actions spaced={false}>
                      <AendernKnopf
                        was={question.body}
                        onClick={() => setEintrag({ art: 'question', id: question.id, body: question.body })}
                      />
                      <AnswerButton questionId={question.id} onDone={detail.reload} />
                    </Actions>
                  </div>
                ))}
                {/* Neueste zuerst – ältere Notizen findet man über die vollständige Liste. */}
                {[...d.knowledge].reverse().filter((i) => passt(i.title, i.body))
                                    .map((item) => (
                  <div className="setting-row" key={item.id}>
                    {kaestchen('knowledge', item.id, item.title)}
                    <div className="text">
                      <p className="t-sub">{item.title}</p>
                      {/*
                        Notizen sind das Gedächtnis des Haushalts – oft eine Liste, oft mit
                        einem hervorgehobenen Wort. Der Text wird formatiert gelesen und roh
                        geschrieben (design/markdown.tsx).
                      */}
                      <Markdown className="t-body-sm desc">{item.body}</Markdown>
                    </div>
                    <Actions spaced={false}>
                      <Chips>
                        <Chip>{KNOWLEDGE_KIND[item.kind] ?? item.kind}</Chip>
                        {!item.confirmedAt && (
                          <Chip tone="info" icon="sparkle">
                            vermutet
                          </Chip>
                        )}
                      </Chips>
                      <AendernKnopf
                        was={item.title}
                        onClick={() =>
                          setEintrag({ art: 'knowledge', id: item.id, title: item.title, body: item.body, kind: item.kind })
                        }
                      />
                    </Actions>
                  </div>
                ))}
              </>
            )}
          </Section>

          {/*
            Derselbe Bau wie die beiden Abschnitte darüber: Knopf in der Kopfzeile, leer eine
            Zeile, gefüllt die Liste. Vorher stand hier ein Dauer-Absatz plus eine eigene
            Knopfzeile am Fuß – dieselbe Sache in einer dritten Form, 52 px teurer, und die
            Erklärung blieb stehen, auch wenn längst zehn Entscheidungen darunter standen.
          */}
          <Section
            title="Entscheidungen"
            count={d.decisions.length}
            action={
              <Button variant="ghost" size="sm" icon="plus" onClick={() => setSheet('decision')}>
                Entscheidung
              </Button>
            }
          >
            {d.decisions.length === 0 ? (
              <EmptyLine
                text="Noch nichts entschieden – Budgets, Vorlieben, Absprachen."
                action={
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => setSheet('decision')}>
                    Festhalten
                  </Button>
                }
              />
            ) : (
              entscheidungen.filter((e) => passt(e.title, e.body)).map((decision) => (
                <div className="setting-row" key={decision.id}>
                  {kaestchen('decision', decision.id, decision.title)}
                  <div className="text">
                    <p className="t-sub">{decision.title}</p>
                    <Markdown className="t-body-sm desc">{decision.body}</Markdown>
                  </div>
                  <Actions spaced={false}>
                    <Chip>{DECISION_KIND[decision.decisionKind] ?? decision.decisionKind}</Chip>
                    <AendernKnopf
                      was={decision.title}
                      onClick={() =>
                        setEintrag({
                          art: 'decision',
                          id: decision.id,
                          title: decision.title,
                          body: decision.body,
                          decisionKind: decision.decisionKind,
                          bindingLevel: decision.bindingLevel,
                        })
                      }
                    />
                  </Actions>
                </div>
              ))
            )}
          </Section>
            {auswahlLeiste}
            </Panel>
          </Section>
            )}

        {/* 3 — Regeln: Erst hiermit passiert im Bereich etwas von selbst. */}
        {aktiv === 'regeln' && (
        <Section title={UNTERSEITEN.regeln.titel} hint={UNTERSEITEN.regeln.zweck} icon="eye" action={auswahlKnopf}>
          <Panel>

            <MonitorList
              detail={d}
              kaestchen={kaestchen}
              monitors={d.monitors}
              onChanged={detail.reload}
              onAdd={() => {
                setRegelBearbeiten(null)
                setSheet('monitor')
              }}
              onEdit={(monitor) => {
                setRegelBearbeiten(monitor)
                setSheet('monitor')
              }}
            />
            {auswahlLeiste}
          </Panel>
        </Section>
        )}


        {/*
          Was daraus läuft: einzelne Aufgaben und mehrschrittige Vorgänge.

          Die Aufgaben fehlten hier ganz – der Bereich zeigte alles außer dem, was in ihm
          gerade offen ist. Wer für „Schuhe" verantwortlich war, musste warten, bis die
          Jetzt-Ansicht eine Aufgabe hochspült (Audit K1).

          Vorgangsschritte stehen bewusst nicht dabei: Die gehören zu ihrem Vorgang, und
          zweimal dasselbe zu zeigen hieße, dass man beide Listen abgleichen muss.
        */}
        {/*
          Was eine Entscheidung braucht, steht über dem, was schon läuft.

          Es stand auf der Übersicht und nirgends sonst – mit ihr wäre es verschwunden. Hier
          ist es richtiger als dort: Ein Hinweis, auf den noch niemand reagiert hat, ist der
          offenste Posten des Bereichs, offener als jede Aufgabe, die schon jemand hat.
        */}
        {d.attention.length > 0 && aktiv === 'laeuft' && (
          <Section title="Braucht eine Entscheidung" count={d.attention.length}>
            {d.attention.map((item) => (
              <Card key={item.id} tone="attention">
                <Heading className="t-sub card-title">{item.title}</Heading>
                <p className="t-body-sm c-secondary">{item.whyNow}</p>
                <Actions>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      const result = await endpoints.promote(household.id, item.id, item.title)
                      navigate(`/vorgang/${result.processId}`)
                    }}
                  >
                    Kümmern wir uns drum
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await endpoints.triage(household.id, item.id, 'snooze', {
                        until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                      })
                      toast.show('In einer Woche wieder da.')
                      await detail.reload()
                    }}
                  >
                    In einer Woche
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await endpoints.triage(household.id, item.id, 'dismiss', {})
                      toast.show('Ausgeblendet – kommt zurück, wenn sich etwas ändert.')
                      await detail.reload()
                    }}
                  >
                    Jetzt nicht
                  </Button>
                </Actions>
              </Card>
            ))}
          </Section>
        )}

        {aktiv === 'laeuft' && (
        <Section
          title={UNTERSEITEN.laeuft.titel}
          hint={UNTERSEITEN.laeuft.zweck}
          icon="route"
          action={
            <Actions spaced={false}>
              <Button variant="ghost" size="sm" icon="check" onClick={() => setSheet('task')}>
                Aufgabe
              </Button>
              <Button variant="ghost" size="sm" icon="route" onClick={() => setSheet('process')}>
                Vorgang
              </Button>
              {auswahlKnopf}
            </Actions>
          }
        >
          <Panel>
            {activeProcesses.length === 0 && offeneAufgaben.length === 0 ? (
              <EmptyLine
                text="Gerade läuft hier nichts."
                action={
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => setSheet('task')}>
                    Aufgabe anlegen
                  </Button>
                }
              />
            ) : (
              <RowList>
                {offeneAufgaben.map((task) => (
                  <li key={task.id}>
                    <Row
                      lead={
                        <>
                          {kaestchen('task', task.id, task.title)}
                          <Icon name="check" size={ICON.md} className="row-icon" />
                        </>
                      }
                      title={task.title}
                      subtitle={aufgabenZeile(task)}
                      end={
                        <Actions spaced={false}>
                          {task.state === 'waiting' && <Chip>wartet</Chip>}
                          {/*
                            Der Weg auf die Einkaufsliste – nur, wenn es eine gibt. Ein Knopf,
                            der erst beim Drücken sagt „nichts verbunden", ist eine Sackgasse
                            mit Ankündigung.
                          */}
                          <AendernKnopf
                            was={task.title}
                            onClick={() =>
                              setEintrag({
                                art: 'task',
                                id: task.id,
                                title: task.title,
                                estimatedMinutes: task.estimatedMinutes ?? null,
                                mentalEnergy: task.mentalEnergy ?? 'medium',
                                dueAt: task.dueAt ?? null,
                              })
                            }
                          />
                          {bringBereit && <AnBringKnopf taskId={task.id} titel={task.title} />}
                          {/*
                            Abhaken und Loswerden – hier, nicht nur in der Jetzt-Ansicht.

                            Eine Aufgabe stand auf der Seite ihres Bereichs zum Lesen da und
                            zu sonst nichts. Wer sie loswerden wollte, musste warten, bis die
                            Jetzt-Ansicht sie hochspült – und die zeigt nur drei auf einmal.
                            Was darunter lag, war weder abzuhaken noch zu entfernen.
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="check"
                            aria-label={`„${task.title}“ erledigt`}
                            title="Erledigt"
                            disabled={aufgabeBusy === task.id}
                            onClick={() => void erledige(task)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            aria-label={`„${task.title}“ entfernen`}
                            title="Entfernen"
                            disabled={aufgabeBusy === task.id}
                            onClick={() => void entferne(task)}
                          />
                        </Actions>
                      }
                    />
                  </li>
                ))}
                {activeProcesses.map((process) => (
                  <li key={process.id}>
                    <Row
                      lead={
                        <>
                          {kaestchen('process', process.id, process.title)}
                          <Icon name="route" size={ICON.md} className="row-icon" />
                        </>
                      }
                      title={process.title}
                      subtitle={process.goal ?? 'Mehrschrittiger Vorgang'}
                      onClick={() => navigate(`/vorgang/${process.id}`)}
                      end={
                        <AendernKnopf
                          was={process.title}
                          onClick={() =>
                            setEintrag({ art: 'process', id: process.id, title: process.title, goal: process.goal ?? null })
                          }
                        />
                      }
                    />
                  </li>
                ))}
              </RowList>
            )}
            {auswahlLeiste}
          </Panel>
        </Section>
        )}

        {/* Offene Bedürfnisse: bestehen fort, auch wenn der Hinweis dazu weg ist (§4) */}
        {aktiv === 'laeuft' && <NeedsSection domainId={domainId} onAdd={() => setSheet('need')} />}

      <UmhaengenSheet
        open={zielBogen}
        onClose={() => setZielBogen(false)}
        quelle={{ id: d.domain.id, name: d.domain.name }}
        bereiche={allDomains.data?.items ?? []}
        items={gewaehlt}
        onDone={async () => {
          setAuswaehlen(false)
          setGewaehlt([])
          await detail.reload()
        }}
      />

      <NewTaskSheet open={sheet === 'task'} onClose={() => setSheet(null)} domainId={domainId} onDone={detail.reload} />
      <HandoverSheet open={sheet === 'handover'} onClose={() => setSheet(null)} domainId={domainId} />

      {/*
        Derselbe Bogen wie in der Übersicht, nur mit festgelegtem Elternteil. Nach dem Anlegen
        geht es in den neuen Bereich – wer ihn gerade benannt hat, will ihn meist füllen.
      */}
      <NewDomainSheet
        open={sheet === 'subdomain'}
        onClose={() => setSheet(null)}
        parent={{ id: d.domain.id, name: d.domain.name }}
        onCreated={async (id) => {
          setSheet(null)
          await detail.reload()
          navigate(`/bereiche/${id}`)
        }}
      />
      <NeedSheet open={sheet === 'need'} onClose={() => setSheet(null)} domainId={domainId} onDone={detail.reload} />
      <TextSheet
        open={sheet === 'decision'}
        onClose={() => setSheet(null)}
        title="Entscheidung festhalten"
        description="Etwas, das ihr festgelegt habt – Budget, Vorliebe, Regel."
        labels={{ title: 'Was habt ihr festgelegt?', body: 'Hintergrund (optional)' }}
        placeholder="z. B. Kinderschuhe bis etwa 70 €"
        onSubmit={async (title, body) => {
        await endpoints.createDecision(household.id, {
          domainId,
          title,
          body,
          decisionKind: 'family_decision',
          bindingLevel: 'orientation',
        })
        await detail.reload()
        }}
      />
      <EintragSheet eintrag={eintrag} onClose={() => setEintrag(null)} onSaved={detail.reload} />
      <StateSheet
        open={sheet === 'state'}
        onClose={() => {
          setSheet(null)
          setAngabeBearbeiten(null)
        }}
        domainId={domainId}
        angabe={angabeBearbeiten}
        onDone={detail.reload}
      />
      <MonitorSheet
        open={sheet === 'monitor'}
        onClose={() => {
          setSheet(null)
          setRegelBearbeiten(null)
        }}
        domainId={domainId}
        states={d.states}
        monitors={d.monitors}
        bearbeiten={regelBearbeiten}
        onDone={detail.reload}
      />
      <TextSheet
        open={sheet === 'knowledge'}
        onClose={() => setSheet(null)}
        title="Etwas festhalten"
        description="Damit es nicht immer wieder erfragt werden muss."
        labels={{ title: 'Worum geht es?', body: 'Details (optional)' }}
        placeholder="z. B. Marke X passt gut"
        onSubmit={async (title, body) => {
        await endpoints.createKnowledge(household.id, { domainId, title, body, kind: 'fact' })
        await detail.reload()
        }}
      />
      <TextSheet
        open={sheet === 'question'}
        onClose={() => setSheet(null)}
        title="Offene Frage festhalten"
        description={'„Weiß ich nicht“ ist ein regulärer Zustand. Festgehalten ist es besser aufgehoben als im Kopf.'}
        labels={{ title: 'Was weißt du nicht?' }}
        placeholder="z. B. Wie erkenne ich, ob die Gummistiefel noch passen?"
        onSubmit={async (title) => {
        await endpoints.createQuestion(household.id, { domainId, body: title })
        await detail.reload()
        }}
      />
      {/*
        Ändern, wegräumen, löschen – als eigener Abschnitt mit eigener Überschrift.

        Vorher lag das als dritter von sieben Aufklappern in „Mehr zu diesem Bereich". Diese
        Überschrift klingt nach Nachschlagematerial über den Bereich, nicht nach Verwaltung
        des Bereichs – wer „löschen" suchte, hatte keinen Grund, dort hineinzusehen. Jetzt
        steht es in der Gliederung der Seite und ist beim Überfliegen der Überschriften zu
        finden (§31: Auffindbarkeit vor Aufgeräumtheit).

        Ganz unten und in zurückgenommenen Knöpfen: Man kommt selten hierher, aber wenn,
        dann gezielt.
      */}
      {/*
        Zuletzt: was den Bereich als Ganzes betrifft. Die Farbe gehört dazu – sie ist eine
        Eigenschaft des Bereichs, kein Wissen über ihn, und stand vorher zwischen
        Beobachtungsregeln und Verlauf.
      */}
      {/*
        Verwaltung und Verlauf haben die Übersicht verlassen (docs/54).

        Sie standen zusammen als letzter Abschnitt: 578 px auf dem Desktop für drei Handlungen,
        die man zweimal im Leben eines Bereichs braucht, plus zwei Aufklapper. Auf einer
        eigenen Seite dürfen die Folgen ausführlich dastehen, ohne die Übersicht zu belasten –
        und der Verlauf hat zum ersten Mal einen Ort statt eines Aufklappers.
      */}
      {aktiv === 'verwalten' && (
        <Section title={UNTERSEITEN.verwalten.titel} hint={UNTERSEITEN.verwalten.zweck} icon="settings">
          <Panel>
            {/*
              Wer den Bereich sehen darf, stand am Fuß der Übersicht. Es ist eine Einstellung,
              keine Auskunft über den Inhalt – und Einstellungen stehen hier.
            */}
            <div className="setting-row">
              <div className="text">
                <p className="t-sub">Wer sieht diesen Bereich</p>
                <p className="t-body-sm c-secondary">
                  {SICHTBARKEIT[d.domain.sensitivity] ?? 'Alle Erwachsenen im Haushalt.'}
                </p>
              </div>
            </div>
            <Divider />
            <ManageDomain detail={d} allDomains={allDomains.data?.items ?? []} onEdit={() => setSheet('edit')} />
          </Panel>
        </Section>
      )}

      {aktiv === 'verlauf' && (
        <>
          <Section title={UNTERSEITEN.verlauf.titel} hint={UNTERSEITEN.verlauf.zweck} icon="history">
            <Panel>
              <DomainHistory domainId={domainId} />
            </Panel>
          </Section>
          <Section
            title="Wissensübergabe"
            hint="Was müsste jemand wissen, um diesen Bereich zu übernehmen?"
          >
            <Panel>
              <div className="setting-row">
                <div className="text">
                  <p className="t-body-sm">
                    Die Liste ist ein Gesprächsleitfaden – die übernehmende Person füllt selbst aus.
                  </p>
                </div>
                <Button variant="secondary" size="sm" icon="book" onClick={() => setSheet('handover')}>
                  Leitfaden öffnen
                </Button>
              </div>
            </Panel>
          </Section>
        </>
      )}

        </div>
      </div>

      {verwerfen && (
        <DropSheet
          aufgabe={verwerfen}
          grund={verwerfen.grund}
          onClose={() => setVerwerfen(null)}
          onDone={async () => {
            setVerwerfen(null)
            await detail.reload()
          }}
        />
      )}

      <Sheet
        open={sheet === 'ownership'}
        onClose={() => setSheet(null)}
        title="Verantwortung"
        description={d.domain.name}
      >
        <OwnershipBlock detail={d} onChanged={detail.reload} />
          {/* 1 — Wer denkt hier mit? Ohne Antwort darauf bleibt alles andere unverbindlich. */}

        {/*
          Das Übernehmen steht auch oben in der Kopfzeile, direkt neben „niemand zuständig".
          Hier steht es noch einmal, weil man diesen Bogen auch aufmacht, um zu sehen, was
          es überhaupt für Möglichkeiten gibt.
        */}
        {!d.domain.effectiveOwner && (
          <>
            <Button variant="secondary" icon="shield" onClick={() => void claim()}>
              Ich übernehme das
            </Button>
                {/*
                  Ausdrücklich möglich, ausdrücklich nicht der Normalfall: Wo alle zuständig
                  sind, bemerkt oft niemand, wenn etwas liegen bleibt. Der Hinweis steht
                  einmal im Bestätigungstext – entscheiden tut der Haushalt.
                */}
                <Button
                  variant="secondary"
                  icon="family"
                  onClick={async () => {
                    const result = await endpoints.shareDomainWithAll(household.id, d.domain.id)
                    toast.show(
                      `${result.members} Menschen tragen den Bereich jetzt gemeinsam. Gemeinsam heißt: niemand ist allein zuständig – aber auch niemand ausdrücklich.`,
                    )
                    await detail.reload()
                  }}
                >
                  Alle sind zuständig
                </Button>
              </>
            )}

      </Sheet>

      <EditDomainSheet
        open={sheet === 'edit'}
        onClose={() => setSheet(null)}
        domain={d.domain}
        allDomains={allDomains.data?.items ?? []}
        onSaved={async () => {
          setSheet(null)
          await Promise.all([detail.reload(), allDomains.reload()])
        }}
      />
      <ProcessSheet
        open={sheet === 'process'}
        onClose={() => setSheet(null)}
        domainId={domainId}
        onStarted={(id) => navigate(`/vorgang/${id}`)}
      />
    </Page>
  )
}

/**
 * Jeder Abschnitt hat seinen eigenen Pfad – auch der erste.
 *
 * `/bereiche/:id` bliebe sonst zweideutig: derselbe Bildschirm unter zwei Adressen, von denen
 * nur eine im Verlauf des Browsers wiederzuerkennen ist. Der nackte Pfad führt weiterhin
 * hierher, er wird nur nicht mehr erzeugt.
 */
function pfadZu(domainId: string, k: Unterseite): string {
  return `/bereiche/${domainId}/${k}`
}

/* ══ Zustandsangabe ══════════════════════════════════════════════════ */

/**
 * Die Eingabe für einen Wert – dieselbe beim Anlegen wie beim Ändern.
 *
 * Welche Eingabe zu einer Angabe passt, hängt an ihrer Art: „Ja / Nein" ist eine Wahl, eine
 * Zahl ein Zahlenfeld, ein Datum ein Datumsfeld. Diese Zuordnung stand zweimal im Code, als
 * das Anlegen den Wert noch gar nicht kannte – und zwei Listen für dieselbe Sache laufen
 * auseinander, sobald eine dritte Art dazukommt.
 *
 * `unbekannt` blendet das Feld aus, statt es zu sperren: Ein leeres, graues Feld daneben lädt
 * dazu ein, doch etwas hineinzuschreiben, das dann nicht gespeichert wird.
 */
function WertFeld({
  label,
  dataType,
  value,
  onChange,
  unbekannt,
  onUnbekannt,
  autoFocus,
}: {
  label: string
  dataType: string
  value: string
  onChange: (wert: string) => void
  unbekannt: boolean
  onUnbekannt: (an: boolean) => void
  autoFocus?: boolean
}) {
  return (
    <>
      {!unbekannt && (
        <Field label={label}>
          {({ id }) =>
            dataType === 'boolean' ? (
              <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="">bitte wählen</option>
                <option value="true">ja</option>
                <option value="false">nein</option>
              </Select>
            ) : (
              <Input
                id={id}
                type={dataType === 'number' ? 'number' : dataType === 'date' ? 'date' : 'text'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoFocus={autoFocus}
              />
            )
          }
        </Field>
      )}
      {/*
        „Weiß ich (noch) nicht" ist keine Verlegenheitsantwort, sondern ein Zustand, den das
        System beobachten kann: INV-010. Die Regelart „state_unknown" meldet sich erst, wenn
        eine Angabe **ausdrücklich** als unbekannt hinterlegt ist – eine Angabe ganz ohne Wert
        sieht sie nicht (`evaluators.ts`: ohne `stateValue` passiert nichts).
      */}
      <label className="toggle" style={{ marginBottom: 'var(--s-3)' }}>
        <input
          type="checkbox"
          checked={unbekannt}
          onChange={(e) => onUnbekannt(e.target.checked)}
          style={{ width: 'auto', minHeight: 'auto' }}
        />
        Weiß ich (noch) nicht
      </label>
    </>
  )
}

/** Was in `value` steht, in der Form, die der Server für diese Art erwartet. */
function wertFuerServer(dataType: string, value: string): unknown {
  if (dataType === 'number') return Number(value)
  if (dataType === 'boolean') return value === 'true'
  return value
}

/**
 * Eine Angabe in der Liste.
 *
 * „Ändern" öffnet den **ganzen** Bogen, nicht nur ein Wertfeld. Vorher klappte hier eine
 * Eingabe auf, die ausschließlich den Wert setzen konnte – Name, Art, Frist und Wichtigkeit
 * waren damit nach dem Anlegen für immer festgelegt (docs/77).
 */
function StateTile({
  entry,
  onEdit,
  onChanged,
}: {
  entry: StateEntry
  onEdit: () => void
  onChanged: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()

  return (
    <div className="setting-row">
      <div className="text">
        {/*
          Vorher stand der Begriff größer und schwerer als der Wert, den er benennt – die
          Angabe, wegen der man herkommt, war das Leiseste im Block. Jetzt benennt eine
          kleine Zeile das Feld, darunter steht der Wert. Dasselbe Muster wie die Eyebrow
          auf den Karten, also nichts Neues zu lernen.
        */}
        <p className="t-overline c-muted">{entry.definition.label}</p>
        <p className="t-body" style={{ marginTop: 2 }}>
          {formatStateValue(entry.valueKind, entry.value, entry.definition.unit)}
        </p>

        <Chips>
          <Chip tone={entry.isStale ? 'attention' : 'success'} icon={entry.isStale ? 'clock' : 'check'}>
            {entry.verifiedAt ? `bestätigt ${relativeDays(entry.verifiedAt)}` : 'noch nie bestätigt'}
          </Chip>
          {entry.definition.isCritical && <Chip tone="critical">kritisch</Chip>}
          {entry.origin !== 'human' && (
            <Chip tone="info" icon="sparkle">
              vom System vermutet
            </Chip>
          )}
        </Chips>

        {entry.isStale && (
          <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-2)' }}>
            Könnte inzwischen veraltet sein. Das heißt nicht, dass es falsch ist – nur, dass es
            länger nicht bestätigt wurde.
          </p>
        )}

        {entry.conflict && household && (
          <div className="notice notice-attention" style={{ marginTop: 'var(--s-3)' }}>
            <p className="t-sub notice-title">Zwei unterschiedliche Angaben</p>
            <p className="t-body-sm">Welche stimmt?</p>
            <Chips>
              {entry.conflict.observations.map((observation) => (
                <Button
                  key={observation.id}
                  size="sm"
                  onClick={async () => {
                    await endpoints.resolveConflict(household.id, entry.id, {
                      chosenObservationId: observation.id,
                      note: 'In der App geklärt',
                    })
                    toast.show('Geklärt.')
                    await onChanged()
                  }}
                >
                  {formatStateValue('known', observation.value, entry.definition.unit)} ·{' '}
                  {relativeDays(observation.observedAt)}
                </Button>
              ))}
            </Chips>
          </div>
        )}

      </div>

      <Button size="sm" icon="pencil" onClick={onEdit}>
        Ändern
      </Button>
    </div>
  )
}

/* ══ Beobachtung ═════════════════════════════════════════════════════ */

function MonitorList({
  detail,
  monitors,
  onChanged,
  onAdd,
  onEdit,
  kaestchen,
}: {
  detail: DomainDetail
  /** Was gezeigt wird – auf der Übersicht gedeckelt, auf der eigenen Seite vollständig. */
  monitors?: DomainDetail['monitors']
  onChanged: () => Promise<void>
  onAdd: () => void
  onEdit?: (monitor: DomainDetail['monitors'][number]) => void
  /*
    Das Auswahlkästchen kommt von der Seite, nicht von hier: Die Auswahl gilt für den ganzen
    Abschnitt, und eine zweite Auswahl in dieser Liste wäre eine zweite Wahrheit darüber, was
    gerade gewählt ist. Fehlt die Funktion – etwa auf der Übersicht –, gibt es kein Kästchen.
  */
  kaestchen?: (kind: MoveItemKind, id: string, label: string) => ReactNode
}) {
  const { household } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const liste = monitors ?? detail.monitors

  if (detail.monitors.length === 0) {
    return (
      <EmptyLine
        text="Noch keine Regel – damit niemand daran denken muss, wann etwas wieder drankommt."
        action={
          <Button variant="ghost" size="sm" icon="plus" onClick={onAdd}>
            Regel einrichten
          </Button>
        }
      />
    )
  }

  return (
    <>
      {liste.map((monitor) => (
        <div className="setting-row" key={monitor.id}>
          {kaestchen?.('monitor', monitor.id, describeMonitor(monitor, detail))}
          <div className="text">
            {/* §12: Regeln in natürlicher Sprache, nicht als technische Konfiguration. */}
            <p className="t-sub">{describeMonitor(monitor, detail)}</p>
            <p className="t-body-sm desc">
              Zuletzt geprüft {relativeDays(monitor.lastEvaluatedAt)}
              {monitor.enabled ? '' : ' · ausgesetzt'}
            </p>
            {/*
              Was die Regel bisher bewirkt hat.

              „Zuletzt geprüft" sagt, dass sie läuft – nicht, ob sie taugt. Wer nicht sieht,
              was aus ihren Meldungen wurde, kann nicht lernen, wann er sich auf sie verlassen
              darf, und landet bei blindem Vertrauen oder blindem Misstrauen (docs/60 Q1).
            */}
            <p className="t-body-sm c-muted">{regelBilanz(monitor)}</p>
          </div>
          {/*
            Die Handlungen bilden eine Gruppe.

            Ohne sie standen vier Knöpfe als Geschwister neben dem Text – auf 390 px blieb
            für den Namen der Regel eine Spalte von einem Wort Breite. Als Gruppe rücken sie
            bei Platzmangel geschlossen unter den Text, statt ihn zu zerdrücken.
          */}
          <div className="row-actions">
          {/*
            Eine Regel, die Aufgaben anlegt, muss man auch wieder stoppen können – und zwar
            hier, nicht nur über die Schnittstelle. Abschalten statt löschen: Die Regel bleibt
            samt ihrer Vergangenheit stehen und meldet sich nur nicht mehr, ein später noch
            sichtbarer Hinweis bleibt damit erklärbar.
          */}
          {/*
            Ändern statt neu anlegen.

            Vorher ging beides nicht: Löschen verweigert ab dem ersten Signal, und ändern
            konnte man nur „an/aus". Eine einmal gelaufene Regel war damit eingefroren – wer
            den Rhythmus falsch gewählt hatte, konnte sie bloß abschalten und daneben eine
            zweite anlegen.
          */}
          <Button
            variant="ghost"
            size="sm"
            icon="settings"
            aria-label={`„${monitor.name}“ ändern`}
            onClick={() => onEdit?.(monitor)}
          >
            Ändern
          </Button>
          {/*
            Löschen nur, solange die Regel nie ausgewertet wurde – dann kann daran auch kein
            Hinweis hängen. Der Server prüft dasselbe, nur genauer (er sieht auf die Signale);
            die strengere Bedingung hier verhindert, dass ein Knopf dasteht, der abgelehnt wird.
          */}
          {monitor.lastEvaluatedAt === null && (
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              aria-label={`„${monitor.name}“ löschen`}
              title="Löschen – nur solange die Regel noch nie gelaufen ist"
              disabled={busy === monitor.id}
              onClick={async () => {
                if (!household) return
                setBusy(monitor.id)
                try {
                  await endpoints.deleteMonitor(household.id, monitor.id)
                  toast.show('Regel gelöscht.')
                  await onChanged()
                } catch (err) {
                  toast.show(err instanceof Error ? err.message : 'Das ging gerade nicht.')
                } finally {
                  setBusy(null)
                }
              }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={monitor.enabled ? 'pause' : 'check'}
            aria-label={monitor.enabled ? `„${monitor.name}“ abschalten` : `„${monitor.name}“ wieder einschalten`}
            title={monitor.enabled ? 'Abschalten' : 'Wieder einschalten'}
            disabled={busy === monitor.id}
            onClick={async () => {
              if (!household) return
              setBusy(monitor.id)
              try {
                await endpoints.setMonitorEnabled(household.id, monitor.id, !monitor.enabled)
                toast.show(monitor.enabled ? 'Regel abgeschaltet.' : 'Regel wieder aktiv.')
                await onChanged()
              } finally {
                setBusy(null)
              }
            }}
          />
          <Button
            size="sm"
            disabled={busy === monitor.id}
            onClick={async () => {
              if (!household) return
              setBusy(monitor.id)
              try {
                const result = await endpoints.evaluateMonitor(household.id, monitor.id)
                toast.show(
                  result.signalsCreated > 0
                    ? 'Es gibt einen neuen Hinweis – siehe oben.'
                    : 'Alles aktuell, es gibt nichts zu melden.',
                )
                await onChanged()
              } finally {
                setBusy(null)
              }
            }}
          >
            Jetzt prüfen
          </Button>
          </div>
        </div>
      ))}
      <Actions>
        <Button variant="ghost" size="sm" icon="plus" onClick={onAdd}>
          Weitere Regel
        </Button>
      </Actions>
    </>
  )
}

function describeMonitor(monitor: DomainDetail['monitors'][number], detail: DomainDetail): string {
  const label = detail.states.find((s) => s.definition.id === monitor.stateDefinitionId)?.definition.label
  const subject = label ? `„${label}“` : 'diesen Bereich'
  switch (monitor.ruleKind) {
    case 'state_freshness':
      return `${subject} regelmäßig nachprüfen`
    case 'state_unknown':
      return `Daran erinnern, solange ${subject} offen ist`
    case 'state_threshold':
      return `Melden, wenn ${subject} einen Grenzwert erreicht`
    case 'date_field_lead_time':
      return `Rechtzeitig vor dem Datum in ${subject} erinnern`
    case 'lead_time_before_event':
      return 'Vor passenden Terminen an die Vorbereitung erinnern'
    case 'absence':
      return 'Melden, wenn hier lange nichts passiert'
    default:
      return monitor.name
  }
}

/* ══ Verantwortung ═══════════════════════════════════════════════════ */

const ASSIGNMENT_HINT: Record<string, string> = {
  secondary_owner: 'Denkt mit, wird bei Eskalation aber nachrangig angesprochen.',
  shared_owner: 'Gleichrangig geteilt – geht nur, wenn es keine Hauptverantwortung gibt.',
  support: 'Hilft, wenn gefragt. Denkt nicht mit.',
  observer: 'Bekommt mit, was passiert, ohne Verantwortung.',
}

function OwnershipBlock({ detail, onChanged }: { detail: DomainDetail; onChanged: () => Promise<void> }) {
  const { household } = useSession()
  const toast = useToast()
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [coTarget, setCoTarget] = useState('')
  const [coKind, setCoKind] = useState('support')

  const members = useAsync(
    () => (household ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const history = useAsync(
    () => (household ? endpoints.ownershipHistory(household.id, detail.domain.id) : Promise.resolve({ owners: [] })),
    [household?.id, detail.domain.id],
  )

  const nameOf = (id: string) => members.data?.items.find((m) => m.id === id)?.displayName ?? 'unbekannt'

  return (
    <>
      <Notice tone="quiet">
        Verantwortung heißt mitdenken – nicht alles selbst machen. Wer eine Aufgabe erledigt,
        übernimmt damit nicht den Bereich.
      </Notice>

      <div style={{ margin: 'var(--s-4) 0' }}>
        <OwnerChip domain={detail.domain} onClaimed={onChanged} />
      </div>

      {detail.domain.effectiveOwner && household && (
        <>
          <Field label="An wen übergeben?">
            {({ id }) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">bitte wählen</option>
                {(members.data?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Warum?" hint="Wird im Verlauf festgehalten, damit die Änderung nachvollziehbar bleibt.">
            {({ id }) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Actions spaced={false}>
            <Button
              variant="secondary"
              disabled={!target || !reason.trim()}
              onClick={async () => {
                await endpoints.transferDomain(household.id, detail.domain.id, {
                  toMembershipId: target,
                  reason: reason.trim(),
                })
                setReason('')
                toast.show('Verantwortung übergeben.')
                await onChanged()
                await history.reload()
              }}
            >
              Verantwortung übergeben
            </Button>
          </Actions>
        </>
      )}

      <Divider />

      {/* §7.4: Fünf Arten von Verantwortung – vorher waren vier davon unerreichbar. */}
      <p className="t-overline c-muted">Weitere Beteiligte</p>
      <p className="t-body-sm c-secondary" style={{ margin: 'var(--s-1) 0 var(--s-3)' }}>
        Nicht jede Beteiligung ist Hauptverantwortung. Wer nur hilft oder informiert bleiben will,
        bekommt hier die passende Rolle.
      </p>
      <Field label="Wen?">
        {({ id }) => (
          <Select id={id} value={coTarget} onChange={(e) => setCoTarget(e.target.value)}>
            <option value="">bitte wählen</option>
            {(members.data?.items ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="In welcher Rolle?" hint={ASSIGNMENT_HINT[coKind]}>
        {({ id }) => (
          <Select id={id} value={coKind} onChange={(e) => setCoKind(e.target.value)}>
            <option value="secondary_owner">Mitverantwortlich</option>
            <option value="shared_owner">Gemeinsam verantwortlich</option>
            <option value="support">Hilft auf Anfrage</option>
            <option value="observer">Möchte informiert bleiben</option>
          </Select>
        )}
      </Field>
      <Actions spaced={false}>
        <Button
          variant="secondary"
          disabled={!coTarget}
          onClick={async () => {
            if (!household) return
            try {
              await endpoints.assignDomain(household.id, detail.domain.id, {
                membershipId: coTarget,
                assignmentKind: coKind,
              })
              setCoTarget('')
              toast.show('Beteiligung eingetragen.')
              await onChanged()
              await history.reload()
            } catch (e) {
              toast.show(e instanceof Error ? e.message : 'Das ging nicht.')
            }
          }}
        >
          Eintragen
        </Button>
      </Actions>

      <Divider />

      <p className="t-overline c-muted">Verlauf</p>
      {(history.data?.owners ?? []).length === 0 ? (
        <p className="t-body-sm c-muted">Noch keine eigene Zuweisung – die Verantwortung wird geerbt.</p>
      ) : (
        <ul className="rowlist" style={{ marginTop: 'var(--s-2)' }}>
          {(history.data?.owners ?? []).map((entry, index) => (
            <li key={index}>
              <Row
                title={nameOf(entry.membershipId)}
                subtitle={`seit ${new Date(entry.from).toLocaleDateString('de-DE')}${
                  entry.to ? ` bis ${new Date(entry.to).toLocaleDateString('de-DE')}` : ' – bis heute'
                }${entry.endReason ? ` · ${entry.endReason}` : ''}`}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ══ Sheets ══════════════════════════════════════════════════════════ */

/**
 * Eine Angabe anlegen – oder eine bestehende ändern (docs/73, docs/77).
 *
 * **Ein Bogen für beides.** Es war einer für das Anlegen, und zum Ändern gab es nur die
 * Zeile mit dem Wert. Der Name ließ sich damit nie berichtigen: Ein Tippfehler bedeutete für
 * immer „Schugröße" – oder eine neue Angabe, womit der Verlauf der alten an der falschen
 * Beschriftung hängen bliebe.
 *
 * Zwei Formulare für dieselben fünf Felder wären die andere schlechte Antwort gewesen; sie
 * laufen auseinander, sobald eines ein Feld dazubekommt.
 */
/**
 * Ein Knopf, fünf Stellen.
 *
 * „Ändern" heißt überall dasselbe und sieht deshalb überall gleich aus. Als Geist-Variante,
 * weil er neben der jeweiligen Hauptaktion steht und nicht mit ihr konkurrieren soll (§13).
 *
 * Der zugängliche Name nennt den Eintrag. In einer Liste von zehn Zeilen sind zehn Knöpfe
 * namens „Ändern" für jemanden, der die Seite hört statt sieht, nicht unterscheidbar – und
 * `getByRole('button', { name: 'Ändern' })` fand in den Tests prompt mehrere Treffer.
 * Sichtbar bleibt das kurze Wort; vorgelesen wird „‚Fundort' ändern".
 */
function AendernKnopf({ onClick, was }: { onClick: () => void; was: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={`„${was}" ändern`}>
      Ändern
    </Button>
  )
}

function StateSheet({
  open,
  onClose,
  domainId,
  angabe,
  onDone,
}: {
  open: boolean
  onClose: () => void
  domainId: string
  /** Gesetzt heißt: ändern statt anlegen. */
  angabe?: StateEntry | null
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [dataType, setDataType] = useState('text')
  const [wert, setWert] = useState('')
  const [unbekannt, setUnbekannt] = useState(false)
  const [interval, setInterval] = useState('')
  const [isCritical, setIsCritical] = useState(false)
  const [busy, setBusy] = useState(false)

  const aendern = Boolean(angabe)
  /*
    Die Art hängt am Wert: „29" als Zahl ist als Datum nichts. Der Dienst lehnt den Wechsel ab,
    sobald ein Wert dasteht – ein Feld anzubieten, das dann scheitert, wäre eine Falle.
    „Unbekannt" zählt nicht: Da steht nichts, was seine Bedeutung verlieren könnte.
  */
  const artFest = aendern && angabe!.valueKind !== 'unknown'

  const zuruecksetzen = () => {
    setLabel('')
    setWert('')
    setUnbekannt(false)
    setDataType('text')
    setInterval('')
    setIsCritical(false)
  }

  // Beim Öffnen den aktuellen Stand zeigen, nicht den von vorhin.
  useEffect(() => {
    if (!open) return
    if (!angabe) {
      zuruecksetzen()
      return
    }
    setLabel(angabe.definition.label)
    setDataType(angabe.definition.dataType)
    setInterval(angabe.definition.freshnessInterval ?? '')
    setIsCritical(angabe.definition.isCritical)
    setUnbekannt(angabe.valueKind !== 'known')
    setWert(
      angabe.valueKind === 'known' && angabe.value !== null && angabe.value !== undefined
        ? String(angabe.value)
        : '',
    )
  }, [open, angabe])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={aendern ? 'Angabe ändern' : 'Neue Angabe'}
      description={
        aendern
          ? 'Name, Art, Frist, Wichtigkeit – und der Wert.'
          : 'Etwas, das ihr über diesen Bereich wisst – und das aktuell bleiben sollte.'
      }
    >
      <Field label="Was soll festgehalten werden?">
        {({ id }) => (
          <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Schuhgröße" />
        )}
      </Field>
      <Field
        label="Art der Angabe"
        hint={artFest ? 'Steht fest, solange ein Wert hinterlegt ist – sonst passte er nicht mehr dazu.' : undefined}
      >
        {({ id }) => (
          <Select
            id={id}
            disabled={artFest}
            value={dataType}
            onChange={(e) => {
              /*
                Beim Wechsel der Art wird der Wert verworfen. „29" als Zahl ist als „Ja / Nein"
                nichts, und ein stehengebliebener Rest würde stillschweigend als `false`
                gespeichert – ein Wert, den niemand eingegeben hat.
              */
              setDataType(e.target.value)
              setWert('')
            }}
          >
            <option value="text">Text</option>
            <option value="number">Zahl</option>
            <option value="date">Datum</option>
            <option value="boolean">Ja / Nein</option>
          </Select>
        )}
      </Field>

      {/*
        Der Wert gehört hierher, nicht in einen zweiten Schritt.

        Vorher legte dieser Bogen nur die Hülle an und meldete „Angabe angelegt – noch ohne
        Wert"; den Wert trug man danach über „Ändern" nach. Wer eine Angabe anlegt, weiß sie
        aber meistens gerade – das ist der Anlass. Das Feld bleibt trotzdem freiwillig: Eine
        Angabe ohne Wert ist eine gültige Aussage („wir sollten das wissen und tun es nicht").
      */}
      <WertFeld
        label="Wert (kannst du auch später eintragen)"
        dataType={dataType}
        value={wert}
        onChange={setWert}
        unbekannt={unbekannt}
        onUnbekannt={setUnbekannt}
      />
      <Field
        label="Wie lange bleibt sie verlässlich?"
        hint="Danach erinnert Thealotta daran, die Angabe zu bestätigen."
      >
        {({ id }) => (
          <Select id={id} value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="">altert nicht</option>
            <option value="P1W">1 Woche</option>
            <option value="P2W">2 Wochen</option>
            <option value="P4W">4 Wochen</option>
            <option value="P6W">6 Wochen</option>
            <option value="P3M">3 Monate</option>
            <option value="P6M">6 Monate</option>
            <option value="P1Y">1 Jahr</option>
          </Select>
        )}
      </Field>
      <label className="toggle" style={{ marginBottom: 'var(--s-4)' }}>
        <input
          type="checkbox"
          checked={isCritical}
          onChange={(e) => setIsCritical(e.target.checked)}
          style={{ width: 'auto', minHeight: 'auto' }}
        />
        Kritisch für Versorgung oder Sicherheit
      </label>

      <Actions end spaced={false}>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !label.trim()}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              /*
                Zwei Aufrufe, weil es zwei Dinge sind: die Angabe (was wir wissen wollen) und
                ihr Wert (was wir wissen). Beim Ändern geht nur hinaus, was sich wirklich
                geändert hat – sonst stünde nach jedem Öffnen des Bogens eine Änderung im
                Verlauf, auch wenn jemand nur nachgesehen hat.
              */
              const id = aendern
                ? angabe!.definition.id
                : (
                    await endpoints.createStateDefinition(household.id, domainId, {
                      key: slug(label),
                      label: label.trim(),
                      dataType,
                      freshnessInterval: interval || null,
                      isCritical,
                      sensitivity: 'normal',
                    })
                  ).id

              if (aendern) {
                const d = angabe!.definition
                const geaendert: Record<string, unknown> = {}
                if (label.trim() !== d.label) geaendert['label'] = label.trim()
                if (!artFest && dataType !== d.dataType) geaendert['dataType'] = dataType
                if ((interval || null) !== (d.freshnessInterval ?? null)) {
                  geaendert['freshnessInterval'] = interval || null
                }
                if (isCritical !== d.isCritical) geaendert['isCritical'] = isCritical
                if (Object.keys(geaendert).length > 0) {
                  await endpoints.updateStateDefinition(household.id, id, geaendert)
                }
              }

              const mitWert = unbekannt || wert !== ''
              const wertNeu =
                !aendern ||
                unbekannt !== (angabe!.valueKind !== 'known') ||
                wert !== (angabe!.value === null || angabe!.value === undefined ? '' : String(angabe!.value))
              if (mitWert && wertNeu) {
                await endpoints.setStateValue(household.id, id, {
                  valueKind: unbekannt ? 'unknown' : 'known',
                  value: unbekannt ? undefined : wertFuerServer(dataType, wert),
                  confirm: true,
                })
              }

              zuruecksetzen()
              onClose()
              toast.show(
                aendern
                  ? 'Angabe geändert.'
                  : unbekannt
                    ? 'Angabe angelegt – als offen hinterlegt.'
                    : mitWert
                      ? 'Angabe angelegt und bestätigt.'
                      : 'Angabe angelegt – noch ohne Wert.',
              )
              await onDone()
            } catch (err) {
              /*
                Ein Widerspruch kommt als 409 zurück. Das ist kein Fehler, sondern die
                gewünschte Sichtbarkeit: Beide Angaben bleiben stehen, bis ein Mensch
                entscheidet (§10).
              */
              onClose()
              toast.show(err instanceof ApiError ? err.message : 'Das ging gerade nicht.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          {aendern ? 'Speichern' : 'Anlegen'}
        </Button>
      </Actions>
    </Sheet>
  )
}

/**
 * Eine Regel einrichten.
 *
 * Drei Arten, die sich nicht ineinander übersetzen lassen und deshalb die erste Frage bilden:
 *
 *   Beobachten          Das System sieht auf eine Angabe und meldet sich, wenn etwas auffällt.
 *   Regelmäßig          Etwas ist in einem Rhythmus wieder dran – daraus wird eine Aufgabe.
 *   Folgt auf etwas     Etwas ist fällig, nachdem etwas anderes erledigt wurde.
 *
 * Der Unterschied zwischen den ersten beiden ist der wichtige: Die eine meldet sich, die
 * andere legt an. Vorher gab es nur die erste, und im Untertitel stand ausdrücklich „es legt
 * keine Aufgabe an" – regelmäßige Aufgaben waren gar nicht einrichtbar.
 */
/**
 * Der Bogen wird von zwei Seiten benutzt.
 *
 * Auf der Bereichsseite steht der Bereich schon fest. Auf der Beobachtungsseite – der Liste
 * aller Regeln – nicht: Dort ist „für welchen Bereich?" die erste Frage. Ein zweiter Bogen
 * für dasselbe wären zwei Formulare, die auseinanderlaufen.
 */
export function MonitorSheet({
  open,
  onClose,
  domainId,
  domains,
  states,
  monitors,
  bearbeiten,
  onDone,
}: {
  open: boolean
  onClose: () => void
  /** Fest vorgegeben auf der Bereichsseite; sonst wählt man ihn im Bogen. */
  domainId?: string
  domains?: { id: string; name: string; path: string; archivedAt: string | null }[]
  states: StateEntry[]
  monitors: MonitorEntry[]
  /**
   * Gesetzt heißt: Dieser Bogen ändert eine bestehende Regel statt eine neue anzulegen.
   *
   * Derselbe Bogen für beides – zwei Formulare für dieselbe Sache würden früher oder später
   * auseinanderlaufen, und man müsste jede Verbesserung zweimal machen.
   */
  bearbeiten?: MonitorEntry | null
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [art, setArt] = useState<'beobachten' | 'regelmaessig' | 'folgt'>('beobachten')
  const [stateId, setStateId] = useState('')
  const [kind, setKind] = useState('state_freshness')
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [preset, setPreset] = useState('P1W')
  const [everyCount, setEveryCount] = useState('3')
  const [everyUnit, setEveryUnit] = useState<'D' | 'W' | 'M' | 'Y'>('D')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monatsArt, setMonatsArt] = useState<'monthday' | 'nth'>('monthday')
  const [ende, setEnde] = useState<'nie' | 'am' | 'nach'>('nie')
  const [until, setUntil] = useState('')
  const [count, setCount] = useState('10')
  const [gewaehlterBereich, setGewaehlterBereich] = useState('')
  const [afterId, setAfterId] = useState('')
  const [delayCount, setDelayCount] = useState('1')
  const [delayUnit, setDelayUnit] = useState<'D' | 'W'>('D')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * Eine bestehende Regel zurück in die Formularfelder übersetzen.
   *
   * Das ist die eigentliche Arbeit beim Bearbeiten: Gespeichert ist ein Muster
   * (`{ weekdays: [4], startsOn: … }`), angezeigt wird eine Auswahl („Wöchentlich am
   * Donnerstag"). Ohne diese Rückübersetzung stünde beim Öffnen ein leeres Formular, und wer
   * nur den Namen ändern will, müsste den Rhythmus neu zusammensuchen.
   */
  useEffect(() => {
    if (!open) return
    if (!bearbeiten) {
      // Neuanlage: bewusst zurücksetzen, sonst stünde die zuletzt bearbeitete Regel darin.
      setArt('beobachten')
      setStateId('')
      setName('')
      setEnde('nie')
      return
    }

    const c = (bearbeiten.config ?? {}) as Record<string, unknown>
    setName(bearbeiten.name)
    setStateId(bearbeiten.stateDefinitionId ?? '')
    setGewaehlterBereich(bearbeiten.domainId)

    if (bearbeiten.ruleKind === 'schedule') {
      setArt('regelmaessig')
      if (typeof c['startsOn'] === 'string') setStartsOn(c['startsOn'])
      const tage = Array.isArray(c['weekdays']) ? (c['weekdays'] as number[]) : null
      const nth = c['nthWeekday'] as { nth?: number; weekday?: number } | undefined
      if (tage && tage.length === 5 && [1, 2, 3, 4, 5].every((d) => tage.includes(d))) setPreset('werktags')
      else if (tage && tage.length === 1) setPreset('P1W')
      else if (tage && tage.length > 1) {
        setPreset('custom')
        setEveryUnit('W')
        setWeekdays(tage)
      } else if (nth?.nth) setPreset('nth')
      else if (typeof c['monthday'] === 'number') setPreset('monthday')
      else if (c['every'] === 'P1D') setPreset('P1D')
      else if (c['every'] === 'P1Y') setPreset('P1Y')
      else {
        // Alles Übrige ist ein eigener Abstand („alle 6 Wochen") – der gehört ins Freifeld.
        setPreset('custom')
        const abstand = /^P(\d+)([DWMY])$/.exec(String(c['every'] ?? ''))
        if (abstand) {
          setEveryCount(abstand[1]!)
          setEveryUnit(abstand[2] as 'D' | 'W' | 'M' | 'Y')
        }
      }

      if (typeof c['until'] === 'string') {
        setEnde('am')
        setUntil(c['until'])
      } else if (typeof c['count'] === 'number') {
        setEnde('nach')
        setCount(String(c['count']))
      } else setEnde('nie')
    } else if (bearbeiten.ruleKind === 'dependency_recheck') {
      setArt('folgt')
      if (typeof c['afterMonitorId'] === 'string') setAfterId(c['afterMonitorId'])
      const verzug = /^P(\d+)([DW])$/.exec(String(c['delay'] ?? 'P1D'))
      if (verzug) {
        setDelayCount(verzug[1]!)
        setDelayUnit(verzug[2] as 'D' | 'W')
      }
    } else {
      setArt('beobachten')
      setKind(bearbeiten.ruleKind)
    }
  }, [open, bearbeiten])

  const label = states.find((s) => s.definition.id === stateId)?.definition.label
  const bereich = domainId ?? gewaehlterBereich
  /*
   * Nur Regeln, die eine Aufgabe anlegen, können eine andere nach sich ziehen – und nur die
   * aus demselben Bereich: Eine Kette über Bereichsgrenzen hinweg wäre schwer zu durchschauen.
   */
  const vorgaenger = monitors.filter((m) => m.defaultResponse === 'create_task' && m.domainId === bereich)

  const startTag = new Date(`${startsOn}T00:00:00.000Z`)
  const wochentag = startTag.getUTCDay()
  const nthImMonat = Math.ceil(startTag.getUTCDate() / 7)

  /*
   * Die Vorschläge leiten sich aus dem gewählten Datum ab – wie im Kalender. „Monatlich am
   * zweiten Donnerstag" ist nur eine sinnvolle Angebotszeile, wenn der 12. tatsächlich ein
   * zweiter Donnerstag ist.
   */
  const vorschlaege: { value: string; text: string }[] = [
    { value: 'P1D', text: 'Täglich' },
    { value: 'P1W', text: `Wöchentlich am ${TAG_EINZAHL[wochentag]}` },
    { value: 'werktags', text: 'An jedem Werktag (Mo–Fr)' },
    ...(nthImMonat <= 4
      ? [{ value: 'nth', text: `Monatlich am ${ORDNUNGSZAHL[nthImMonat]} ${TAG_EINZAHL[wochentag]}` }]
      : []),
    { value: 'monthday', text: `Monatlich am ${startTag.getUTCDate()}.` },
    { value: 'P1Y', text: `Jährlich am ${startTag.getUTCDate()}. ${MONAT[startTag.getUTCMonth()]}` },
    { value: 'custom', text: 'Benutzerdefiniert …' },
  ]

  /** Aus der Auswahl das Muster bauen – dieselbe Form, die der Server versteht. */
  const muster = (): Recurrence => {
    const grenze: Recurrence =
      ende === 'am' && until ? { until } : ende === 'nach' ? { count: Math.max(1, Number(count) || 1) } : {}
    const basis: Recurrence = { startsOn, ...grenze }

    switch (preset) {
      case 'werktags':
        return { ...basis, weekdays: [1, 2, 3, 4, 5] }
      case 'nth':
        return { ...basis, nthWeekday: { nth: nthImMonat, weekday: wochentag } }
      case 'monthday':
        return { ...basis, monthday: startTag.getUTCDate() }
      case 'P1W':
        // „Wöchentlich am Donnerstag" ist ein fester Wochentag, kein Sieben-Tage-Abstand:
        // Sonst hieße die Regel „jede Woche" und verlöre den Tag.
        return { ...basis, weekdays: [wochentag] }
      case 'custom':
        if (everyUnit === 'W' && weekdays.length > 0) return { ...basis, weekdays: [...weekdays].sort() }
        if (everyUnit === 'M') {
          return monatsArt === 'nth' && nthImMonat <= 4
            ? { ...basis, nthWeekday: { nth: nthImMonat, weekday: wochentag } }
            : { ...basis, monthday: startTag.getUTCDate() }
        }
        return { ...basis, every: `P${Math.max(1, Number(everyCount) || 1)}${everyUnit}` }
      default:
        return { ...basis, every: preset }
    }
  }

  const folgeSatz = (): string => {
    const vorher = vorgaenger.find((m) => m.id === afterId)?.name ?? 'die andere Aufgabe'
    const n = Number(delayCount) || 0
    const einheit = delayUnit === 'D' ? (n === 1 ? 'Tag' : 'Tage') : n === 1 ? 'Woche' : 'Wochen'
    return n === 0
      ? `„${name || 'Diese Aufgabe'}“ ist dran, sobald „${vorher}“ erledigt ist.`
      : `„${name || 'Diese Aufgabe'}“ ist ${n} ${einheit} nach „${vorher}“ dran.`
  }

  const bereit =
    !bereich
      ? false
      : art === 'beobachten'
        ? Boolean(stateId)
        : art === 'folgt'
          ? Boolean(name.trim() && afterId)
          : Boolean(name.trim() && startsOn && (preset !== 'custom' || everyUnit !== 'W' || weekdays.length > 0))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={bearbeiten ? 'Regel ändern' : 'Regel einrichten'}
      description="Damit niemand daran denken muss, wann etwas wieder drankommt."
    >
      {!domainId && (
        <Field label="Für welchen Bereich?">
          {({ id }) => (
            <Select id={id} value={gewaehlterBereich} onChange={(e) => setGewaehlterBereich(e.target.value)}>
              <option value="">bitte wählen</option>
              {(domains ?? [])
                .filter((d) => !d.archivedAt)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      )}

      <Field label="Was für eine Regel?">
        {({ id }) => (
          <Select id={id} value={art} onChange={(e) => setArt(e.target.value as typeof art)}>
            <option value="beobachten">Auf eine Angabe achten und sich melden</option>
            <option value="regelmaessig">Regelmäßig eine Aufgabe anlegen</option>
            <option value="folgt">Eine Aufgabe, die auf eine andere folgt</option>
          </Select>
        )}
      </Field>

      {art === 'beobachten' &&
        (states.length === 0 ? (
          <Notice tone="attention">
            Dafür braucht es zuerst eine Angabe, die beobachtet werden kann. Eine regelmäßige
            Aufgabe geht auch ohne.
          </Notice>
        ) : (
          <>
            <Field label="Welche Angabe?">
              {({ id }) => (
                <Select id={id} value={stateId} onChange={(e) => setStateId(e.target.value)}>
                  <option value="">bitte wählen</option>
                  {states.map((s) => (
                    <option key={s.definition.id} value={s.definition.id}>
                      {s.definition.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Wann soll sich das System melden?">
              {({ id }) => (
                <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="state_freshness">Wenn sie zu lange nicht bestätigt wurde</option>
                  <option value="state_unknown">Solange sie unbekannt bleibt</option>
                  <option value="date_field_lead_time">Rechtzeitig vor dem hinterlegten Datum</option>
                </Select>
              )}
            </Field>
          </>
        ))}

      {art !== 'beobachten' && (
        <Field label="Wie heißt die Aufgabe?" hint="Genau dieser Satz steht später auf der Aufgabe.">
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={art === 'folgt' ? 'z. B. Wäsche aufhängen' : 'z. B. Müll rausbringen'}
            />
          )}
        </Field>
      )}

      {art === 'regelmaessig' && (
        <>
          {/*
            Erst das Datum, dann die Wiederholung – wie im Kalender. Die Vorschläge leiten sich
            aus dem Datum ab: „am zweiten Donnerstag" ergibt nur Sinn, wenn der gewählte Tag
            einer ist.
          */}
          <Field label="Wann zum ersten Mal?">
            {({ id }) => (
              <Input id={id} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            )}
          </Field>

          <Field label="Wiederholt sich">
            {({ id }) => (
              <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value)}>
                {vorschlaege.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.text}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {preset === 'custom' && (
            <>
              <Field label="Alle …">
                {({ id }) => (
                  <div className="field-row">
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      value={everyCount}
                      onChange={(e) => setEveryCount(e.target.value)}
                    />
                    <Select
                      value={everyUnit}
                      aria-label="Einheit"
                      onChange={(e) => setEveryUnit(e.target.value as typeof everyUnit)}
                    >
                      <option value="D">Tage</option>
                      <option value="W">Wochen</option>
                      <option value="M">Monate</option>
                      <option value="Y">Jahre</option>
                    </Select>
                  </div>
                )}
              </Field>

              {everyUnit === 'W' && (
                <Field label="An welchen Tagen?" hint="Feste Tage rutschen nicht mit – donnerstags bleibt donnerstags.">
                  {() => (
                    <Chips>
                      {[1, 2, 3, 4, 5, 6, 0].map((tag) => (
                        <Toggle
                          key={tag}
                          pressed={weekdays.includes(tag)}
                          onToggle={() =>
                            setWeekdays((v) => (v.includes(tag) ? v.filter((x) => x !== tag) : [...v, tag]))
                          }
                        >
                          {KURZ_TAG[tag]}
                        </Toggle>
                      ))}
                    </Chips>
                  )}
                </Field>
              )}

              {everyUnit === 'M' && (
                <Field label="Wonach im Monat?">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={monatsArt}
                      onChange={(e) => setMonatsArt(e.target.value as typeof monatsArt)}
                    >
                      <option value="monthday">Am {startTag.getUTCDate()}. – kürzere Monate enden am letzten Tag</option>
                      {nthImMonat <= 4 && (
                        <option value="nth">
                          Am {ORDNUNGSZAHL[nthImMonat]} {TAG_EINZAHL[wochentag]}
                        </option>
                      )}
                    </Select>
                  )}
                </Field>
              )}
            </>
          )}

          <Field label="Endet">
            {({ id }) => (
              <Select id={id} value={ende} onChange={(e) => setEnde(e.target.value as typeof ende)}>
                <option value="nie">Nie</option>
                <option value="am">An einem Datum</option>
                <option value="nach">Nach einer Anzahl</option>
              </Select>
            )}
          </Field>

          {ende === 'am' && (
            <Field label="Letzter Termin">
              {({ id }) => <Input id={id} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}
            </Field>
          )}

          {ende === 'nach' && (
            <Field label="Wie oft insgesamt?">
              {({ id }) => (
                <Input id={id} type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
              )}
            </Field>
          )}
        </>
      )}

      {art === 'folgt' && (
        <>
          {vorgaenger.length === 0 ? (
            <Notice tone="attention">
              Dafür braucht es zuerst eine Regel, die eine Aufgabe anlegt – an die kann sich diese
              dann hängen.
            </Notice>
          ) : (
            <>
              <Field label="Nach welcher Aufgabe?">
                {({ id }) => (
                  <Select id={id} value={afterId} onChange={(e) => setAfterId(e.target.value)}>
                    <option value="">bitte wählen</option>
                    {vorgaenger.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Wie lange danach?" hint="0 heißt: sofort, sobald die andere Aufgabe erledigt ist.">
                {({ id }) => (
                  <div className="field-row">
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      value={delayCount}
                      onChange={(e) => setDelayCount(e.target.value)}
                    />
                    <Select
                      value={delayUnit}
                      aria-label="Einheit"
                      onChange={(e) => setDelayUnit(e.target.value as typeof delayUnit)}
                    >
                      <option value="D">Tage später</option>
                      <option value="W">Wochen später</option>
                    </Select>
                  </div>
                )}
              </Field>
            </>
          )}
        </>
      )}

      {/*
        Ein Satz statt einer Konfiguration – und zwar derselbe, den der Server später in die
        Begründung schreibt: `describeRecurrence` steht in den Contracts, damit hier und dort
        nicht zwei Formulierungen entstehen.
      */}
      {bereit && (
        <Notice tone="accent" title="So wird die Regel gelesen">
          {art === 'beobachten' ? (
            <>
              {kind === 'state_freshness' && `„${label}“ regelmäßig nachprüfen – im hinterlegten Prüfintervall.`}
              {kind === 'state_unknown' && `Daran erinnern, solange „${label}“ offen ist.`}
              {kind === 'date_field_lead_time' && `Rechtzeitig vor dem Datum in „${label}“ erinnern.`}
            </>
          ) : art === 'folgt' ? (
            folgeSatz()
          ) : (
            `„${name || 'Diese Aufgabe'}“ ist ${describeRhythm(muster())} dran${describeLimit(muster())}.`
          )}
        </Notice>
      )}

      {error && <Notice tone="attention">{error}</Notice>}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !bereit}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            setError(null)
            try {
              const felder = {
                stateDefinitionId: art === 'beobachten' ? stateId : null,
                name: art === 'beobachten' ? `${label ?? 'Angabe'} beobachten` : name.trim(),
                ruleKind: art === 'beobachten' ? kind : art === 'folgt' ? 'dependency_recheck' : 'schedule',
                config:
                  art === 'beobachten'
                    ? kind === 'state_unknown'
                      ? { afterDays: 14 }
                      : {}
                    : art === 'folgt'
                      ? { afterMonitorId: afterId, delay: `P${Math.max(0, Number(delayCount) || 0)}${delayUnit}` }
                      : (muster() as unknown as Record<string, unknown>),
                // Beobachten meldet sich, die anderen beiden legen an.
                defaultResponse: art === 'beobachten' ? 'attention_item' : 'create_task',
              }

              /*
                Derselbe Bogen, zwei Wege: Beim Ändern geht der Bereich nicht mit – eine Regel
                gehört zu ihrem Bereich, sie umzuhängen wäre eine andere Regel.
              */
              if (bearbeiten) {
                await endpoints.updateMonitor(household.id, bearbeiten.id, felder)
              } else {
                await endpoints.createMonitor(household.id, { domainId: bereich, ...felder })
              }
              onClose()
              toast.show(bearbeiten ? 'Regel geändert.' : 'Regel eingerichtet.')
              await onDone()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Das ging gerade nicht.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {bearbeiten ? 'Speichern' : 'Einrichten'}
        </Button>
      </Actions>
    </Sheet>
  )
}

const TAG_EINZAHL: Record<number, string> = {
  0: 'Sonntag',
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
}

const ORDNUNGSZAHL: Record<number, string> = { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten' }

const MONAT = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const KURZ_TAG: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }


/**
 * §46/§47: Wenn es für das Vorhaben schon einen erprobten Ablauf gibt, soll Thealotta ihn
 * anbieten statt ihn zu verstecken – mit Begründung, warum gerade dieser vorgeschlagen wird.
 * Der Vorschlag ist ein Angebot: „Ohne Ablauf starten" steht gleichberechtigt daneben.
 */
function ProcessSheet({
  open,
  onClose,
  domainId,
  onStarted,
}: {
  open: boolean
  onClose: () => void
  domainId: string
  onStarted: (processId: string) => void
}) {
  const { household } = useSession()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<{ id: string; title: string; reason: string }[]>([])

  // Nachschlagen, sobald der Titel etwas hergibt – nicht bei jedem Tastendruck.
  useEffect(() => {
    if (!open || !household || title.trim().length < 3) {
      setSuggestions([])
      return
    }
    const timer = window.setTimeout(async () => {
      const result = await endpoints
        .playbookSuggestions(household.id, domainId, title.trim())
        .catch(() => ({ items: [] }))
      setSuggestions(result.items)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [open, household, domainId, title])

  if (!household) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Vorgang starten"
      description="Etwas Mehrschrittiges, das nicht in einem Zug erledigt ist."
    >
      <Field label="Worum geht es?">
        {({ id }) => (
          <Input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Neue Schuhe besorgen"
          />
        )}
      </Field>

      {suggestions.length > 0 && (
        <Section title="Dafür gibt es schon einen Ablauf">
          <RowList>
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <Row
                  title={suggestion.title}
                  subtitle={suggestion.reason}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const created = await endpoints.instantiatePlaybook(household.id, suggestion.id, {
                        domainId,
                        title: title.trim() || undefined,
                      })
                      toast.show('Vorgang aus dem Ablauf gestartet. Die Schritte stehen schon drin.')
                      onClose()
                      onStarted(created.id)
                    } finally {
                      setBusy(false)
                    }
                  }}
                />
              </li>
            ))}
          </RowList>
        </Section>
      )}

      <Field label="Ziel (optional)" hint="Woran merkt ihr, dass es erledigt ist?">
        {({ id }) => <Textarea id={id} rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />}
      </Field>

      <Actions end spaced={false}>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              const created = await endpoints.createProcess(household.id, {
                domainId,
                title: title.trim(),
                goal: goal.trim() || undefined,
              })
              setTitle('')
              setGoal('')
              onClose()
              onStarted(created.id)
            } finally {
              setBusy(false)
            }
          }}
        >
          {suggestions.length > 0 ? 'Ohne Ablauf starten' : 'Starten'}
        </Button>
      </Actions>
    </Sheet>
  )
}

function TextSheet({
  open,
  onClose,
  title,
  description,
  labels,
  placeholder,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  labels: { title: string; body?: string }
  placeholder: string
  onSubmit: (title: string, body: string) => Promise<void>
}) {
  const toast = useToast()
  const [value, setValue] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      <Field label={labels.title}>
        {({ id }) => <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />}
      </Field>
      {labels.body && (
        <Field label={labels.body}>
          {({ id }) => <Textarea markdown id={id} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
      )}
      <Actions end spaced={false}>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !value.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await onSubmit(value.trim(), body)
              setValue('')
              setBody('')
              onClose()
              toast.show('Gespeichert.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Speichern
        </Button>
      </Actions>
    </Sheet>
  )
}

function AnswerButton({ questionId, onDone }: { questionId: string; onDone: () => Promise<void> }) {
  const { household } = useSession()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState('')

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Beantworten
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Frage beantworten"
        description="Die Antwort wird direkt als Wissen gesichert – dann steht sie beim nächsten Mal schon da."
      >
        <Field label="Antwort">
          {({ id }) => <Textarea markdown id={id} rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
        </Field>
        <Actions end spaced={false}>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={!answer.trim()}
            onClick={async () => {
              if (!household) return
              await endpoints.answerQuestion(household.id, questionId, {
                body: answer.trim(),
                promoteToKnowledge: true,
              })
              setAnswer('')
              setOpen(false)
              toast.show('Beantwortet und als Wissen gesichert.')
              await onDone()
            }}
          >
            Antworten
          </Button>
        </Actions>
      </Sheet>
    </>
  )
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'angabe'

/* ══ Bedürfnisse, Verlauf und Übergabe ═══════════════════════════════ */

/**
 * §4: Ein Bedürfnis besteht fort, auch wenn das auslösende Signal aufgelöst wurde.
 * „Kind A braucht passende Schuhe" bleibt wahr, auch wenn der Hinweis weggeklickt wurde.
 */
function NeedsSection({ domainId, onAdd }: { domainId: string; onAdd: () => void }) {
  const { household } = useSession()
  const toast = useToast()
  const needs = useAsync(
    () => (household ? endpoints.needs(household.id) : Promise.resolve({ items: [], note: '' })),
    [household?.id],
  )
  const mine = (needs.data?.items ?? []).filter((n) => n.domainId === domainId)
  if (mine.length === 0) return null

  return (
    <Section
      title="Offene Bedürfnisse"
      count={mine.length}
      action={
        <Button variant="ghost" size="sm" icon="plus" onClick={onAdd}>
          Bedürfnis
        </Button>
      }
    >
      <Panel>
        {mine.map((need, index) => (
          <div key={need.id}>
            {index > 0 && <Divider />}
            <div className="setting-row">
              <div className="text">
                <p className="t-sub">{need.description}</p>
                <p className="t-body-sm desc">
                  {need.neededBy ? `Gebraucht bis ${new Date(need.neededBy).toLocaleDateString('de-DE')}` : 'Ohne festen Zeitpunkt'}
                </p>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  if (!household) return
                  await endpoints.resolveNeed(household.id, need.id, 'met')
                  toast.show('Als erfüllt vermerkt.')
                  await needs.reload()
                }}
              >
                Ist erfüllt
              </Button>
            </div>
          </div>
        ))}
      </Panel>
    </Section>
  )
}

function NeedSheet({
  open,
  onClose,
  domainId,
  onDone,
}: {
  open: boolean
  onClose: () => void
  domainId: string
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [neededBy, setNeededBy] = useState('')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Was wird gebraucht?"
      description="Ein Bedürfnis bleibt bestehen, bis es erfüllt ist – auch wenn der auslösende Hinweis längst weg ist."
    >
      <Field label="Worum geht es?">
        {({ id }) => (
          <Input
            id={id}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="z. B. Kind A braucht passende Winterschuhe"
          />
        )}
      </Field>
      <Field label="Bis wann?" hint="Optional.">
        {({ id }) => <Input id={id} type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />}
      </Field>
      <Actions end spaced={false}>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={!description.trim()}
          onClick={async () => {
            if (!household) return
            await endpoints.createNeed(household.id, {
              domainId,
              description: description.trim(),
              criticality: 'normal',
              neededBy: neededBy ? new Date(neededBy).toISOString() : null,
            })
            setDescription('')
            onClose()
            toast.show('Festgehalten.')
            await onDone()
          }}
        >
          Festhalten
        </Button>
      </Actions>
    </Sheet>
  )
}

function DomainHistory({ domainId }: { domainId: string }) {
  const { household } = useSession()
  const [seiten, setSeiten] = useState<DomainEreignis[][]>([])
  const [laedt, setLaedt] = useState(false)
  const [mehr, setMehr] = useState(false)

  const laden = useCallback(
    async (before?: string) => {
      if (!household) return
      setLaedt(true)
      try {
        const q = `domainId=${domainId}&limit=${VERLAUF_SEITE}${before ? `&before=${encodeURIComponent(before)}` : ''}`
        const antwort = await endpoints.history(household.id, q)
        setSeiten((bisher) => (before ? [...bisher, antwort.items] : [antwort.items]))
        setMehr(Boolean(antwort.hasMore))
      } finally {
        setLaedt(false)
      }
    },
    [household, domainId],
  )

  useEffect(() => {
    void laden()
  }, [laden])

  const alle = seiten.flat()
  if (seiten.length === 0 && laedt) return <SkeletonList count={1} />
  if (alle.length === 0) return <p className="t-body-sm c-muted">Hier ist noch nichts passiert.</p>

  /*
   * Nach Tagen gruppiert (Review C5).
   *
   * Vierzig Ereignisse in einer Reihe, jedes mit vollem Datum, sind vierzig gleich aussehende
   * Zeilen – man liest das Datum vierzigmal, um zu sehen, dass zwanzig davon derselbe Tag
   * sind. Der Tag steht jetzt einmal als Überschrift, die Zeile trägt nur noch die Uhrzeit.
   */
  const tage = new Map<string, DomainEreignis[]>()
  for (const e of alle) {
    const tag = new Date(e.occurredAt).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
    tage.set(tag, [...(tage.get(tag) ?? []), e])
  }

  return (
    <>
      {[...tage].map(([tag, ereignisse]) => (
        <div className="verlauf-tag" key={tag}>
          <Deeper>
            <Heading className="t-caption c-muted">{tag}</Heading>
          </Deeper>
          <RowList>
            {ereignisse.map((event) => (
              <li key={event.id}>
                <Row
                  title={describeEvent(event.eventType)}
                  subtitle={`${new Date(event.occurredAt).toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })} Uhr${event.actorKind === 'system' ? ' · vom System' : ''}`}
                />
              </li>
            ))}
          </RowList>
        </div>
      ))}
      {mehr && (
        <Actions>
          <Button
            variant="secondary"
            size="sm"
            disabled={laedt}
            onClick={() => void laden(alle[alle.length - 1]!.occurredAt)}
          >
            {laedt ? 'Lädt …' : 'Früheres laden'}
          </Button>
        </Actions>
      )}
    </>
  )
}

/** §19: Der Leitfaden für die Übergabe – Fragen statt Formular. */
function HandoverSheet({ open, onClose, domainId }: { open: boolean; onClose: () => void; domainId: string }) {
  const { household } = useSession()
  const handover = useAsync(
    () => (household && open ? endpoints.handover(household.id, domainId) : Promise.resolve(null)),
    [household?.id, domainId, open],
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Wissensübergabe"
      description="Was müsste jemand wissen, um diesen Bereich zu übernehmen?"
    >
      {!handover.data ? (
        <SkeletonList count={1} />
      ) : (
        <>
          <Notice tone="quiet">{handover.data.note}</Notice>

          {handover.data.openStates.length > 0 && (
            <>
              <p className="t-overline c-muted" style={{ marginTop: 'var(--s-4)' }}>
                Noch offen
              </p>
              <ul className="reasons t-body-sm">
                {handover.data.openStates.map((entry) => (
                  <li key={entry.stateDefinitionId}>
                    <span className="marker" aria-hidden="true">
                      •
                    </span>
                    <span>{entry.question}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {handover.data.staleStates.length > 0 && (
            <>
              <p className="t-overline c-muted" style={{ marginTop: 'var(--s-4)' }}>
                Länger nicht bestätigt
              </p>
              <ul className="reasons t-body-sm">
                {handover.data.staleStates.map((entry) => (
                  <li key={entry.stateDefinitionId}>
                    <span className="marker" aria-hidden="true">
                      •
                    </span>
                    <span>{entry.question}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="t-overline c-muted" style={{ marginTop: 'var(--s-4)' }}>
            Fragen, die sonst niemand stellt
          </p>
          <ul className="reasons t-body-sm">
            {handover.data.knowledgePrompts.map((prompt) => (
              <li key={prompt}>
                <span className="marker" aria-hidden="true">
                  •
                </span>
                <span>{prompt}</span>
              </li>
            ))}
          </ul>

          {handover.data.openQuestions.length > 0 && (
            <>
              <p className="t-overline c-muted" style={{ marginTop: 'var(--s-4)' }}>
                Bereits festgehaltene offene Fragen
              </p>
              <ul className="reasons t-body-sm">
                {handover.data.openQuestions.map((q) => (
                  <li key={q.id}>
                    <span className="marker" aria-hidden="true">
                      •
                    </span>
                    <span>{q.body}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Actions end>
            <Button variant="primary" onClick={onClose}>
              Verstanden
            </Button>
          </Actions>
        </>
      )}
    </Sheet>
  )
}

/* ══ Bereich verwalten ═══════════════════════════════════════════════ */

/**
 * Ändern, wegräumen, löschen.
 *
 * Die drei Wege stehen nebeneinander, jeder mit seiner Folge im Klartext. Archivieren ist der
 * übliche: Der Bereich verschwindet aus den Listen und behält alles. Löschen geht nur, wenn
 * dabei nichts verloren gehen kann – der Server prüft das und sagt sonst, was im Weg steht.
 * Diesen Satz zeigen wir dann unverändert an, statt ihn zu „Das ging nicht" einzudampfen.
 */
function ManageDomain({
  detail,
  allDomains,
  onEdit,
}: {
  detail: DomainDetail
  allDomains: DomainEntry[]
  onEdit: () => void
}) {
  const { household } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<'archive' | 'unarchive' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const archived = Boolean(detail.domain.archivedAt)
  const childCount = allDomains.filter(
    (d) => d.path.startsWith(`${detail.domain.path}.`) && !d.archivedAt,
  ).length

  const run = async (what: 'archive' | 'unarchive' | 'delete') => {
    if (!household) return
    setBusy(what)
    setError(null)
    try {
      if (what === 'archive') {
        await endpoints.archiveDomain(household.id, detail.domain.id)
        toast.show('Bereich archiviert.')
        navigate('/bereiche')
      } else if (what === 'unarchive') {
        await endpoints.unarchiveDomain(household.id, detail.domain.id)
        toast.show('Bereich zurückgeholt.')
        window.location.reload()
      } else {
        await endpoints.deleteDomain(household.id, detail.domain.id)
        toast.show('Bereich gelöscht.')
        navigate('/bereiche')
      }
    } catch (err) {
      // Der Server sagt genau, was im Weg steht. Das ist mehr wert als jeder eigene Text.
      setError(err instanceof Error ? err.message : 'Das ging gerade nicht.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {/*
        Folgen stehen nur da, wo sie etwas ändern: bei einem gesperrten Knopf (sonst wäre
        nicht zu sehen, warum) und im Moment des Bestätigens. Was beim Bearbeiten passiert,
        steht im Formular selbst – hier vorweg erklärt es eine Handlung, die noch niemand
        gewählt hat, und macht den Abschnitt dreimal so hoch wie seine drei Knöpfe.
      */}
      <div className="setting-row">
        <div className="text">
          <p className="t-body-sm">Name, Wichtigkeit, Beschreibung – oder wohin der Bereich gehört.</p>
        </div>
        <Button variant="secondary" size="sm" icon="settings" onClick={onEdit}>
          Bearbeiten
        </Button>
      </div>

      <Divider />

      <div className="setting-row">
        <div className="text">
          <p className="t-body-sm">
            {archived
              ? 'Dieser Bereich ist archiviert. Zurückholen stellt ihn her, wie er war.'
              : 'Aus dem Weg räumen. Behält alles, jederzeit umkehrbar.'}
          </p>
          {!archived && childCount > 0 && (
            <Consequence>
              {`Erst müssten die ${childCount} Unterbereiche weg – sonst wären sie über den Baum nicht mehr erreichbar.`}
            </Consequence>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon="archive"
          disabled={busy !== null || (!archived && childCount > 0)}
          onClick={() => void run(archived ? 'unarchive' : 'archive')}
        >
          {archived ? 'Zurückholen' : 'Archivieren'}
        </Button>
      </div>

      <Divider />

      <div className="setting-row">
        <div className="text">
          <p className="t-body-sm">Endgültig löschen.</p>
          {confirmDelete && (
            <Consequence>
              Geht nur, solange nichts drinsteht. Sobald hier eine Aufgabe, eine Angabe oder ein
              Vorgang liegt, bleibt nur das Archivieren – dann geht nichts verloren.
            </Consequence>
          )}
        </div>
        {confirmDelete ? (
          <Actions>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" size="sm" disabled={busy !== null} onClick={() => void run('delete')}>
              Wirklich löschen
            </Button>
          </Actions>
        ) : (
          <Button variant="ghost" size="sm" icon="trash" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
            Löschen
          </Button>
        )}
      </div>

      {error && (
        <Notice tone="attention" title="So geht das nicht">
          {error}
        </Notice>
      )}
    </>
  )
}

/** Was sich an einem Bereich ändern lässt – in einem Formular, nicht in fünf Knöpfen. */
/**
 * Der Weg zu einem Bereich, als anklickbare Kette.
 *
 * Ohne den Bereich selbst: Sein Name steht direkt darunter als Überschrift. Vorher schrieb
 * die Kopfzeile den vollen Pfad – „Kinder / Kind A / Kleidung / Schuhe" über „Schuhe".
 *
 * Übergeordnete Bereiche, die man nicht sehen darf, fehlen in `all` und damit in der Kette.
 * Das ist richtig so: Eine Krume, die ins Nichts führt, wäre schlimmer als eine fehlende.
 */
export function crumbsFor(
  domain: { path: string },
  all: { id: string; path: string; name: string }[],
): { label: string; to: string }[] {
  const parts = domain.path.split('.')
  const crumbs = [{ label: 'Bereiche', to: '/bereiche' }]
  for (let i = 1; i < parts.length; i += 1) {
    const ancestor = all.find((candidate) => candidate.path === parts.slice(0, i).join('.'))
    if (ancestor) crumbs.push({ label: ancestor.name, to: `/bereiche/${ancestor.id}` })
  }
  return crumbs
}

/**
 * Die Farbe eines Bereichs, als Punkt in der Kopfzeile.
 *
 * Der Knopf ist zugleich die Anzeige: Er trägt den Ton, der gerade gilt. Ein Klick klappt die
 * zwölf Töne darunter auf – kein Dialog, der die Seite überdeckt, sondern ein Blick zur Seite
 * (dasselbe Muster wie die Meldungen in der Kopfleiste).
 */
function DomainColorButton({ domain }: { domain: DomainEntry }) {
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismissable<HTMLDivElement>(open, close)

  const tone = colors.domainTone(domain.id, domain.effectiveOwner?.membershipId ?? null)

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`color-button ${toneClass(tone)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Farbe von „${domain.name}" – ${toneLabel(tone)}`}
        title={`Farbe: ${toneLabel(tone)}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="color-dot" aria-hidden="true" />
      </button>

      {open && (
        <div className="popover popover-narrow" role="dialog" aria-label={`Farbe von „${domain.name}"`}>
          <header className="popover-head">
            <p className="t-sub">Farbe</p>
            <Button variant="ghost" size="sm" onClick={close} aria-label="Schließen">
              <Icon name="plus" size={ICON.md} style={{ transform: 'rotate(45deg)' }} />
            </Button>
          </header>
          <div className="popover-body">
            <p className="t-body-sm c-secondary" style={{ marginBottom: 'var(--s-3)' }}>
              Voreingestellt trägt dieser Bereich die Farbe der Person, die für ihn mitdenkt –
              und solange niemand mitdenkt, eine eigene. Eine abweichende Farbe gilt nur für
              deine Ansicht.
            </p>
            <ColorPicker
              subject="domain"
              subjectId={domain.id}
              label={domain.name}
              fallbackId={domain.effectiveOwner?.membershipId ?? null}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Die Unterzeile einer Aufgabe im Bereich.
 *
 * Sie beantwortet die eine Frage, die man hier hat: „muss ich mich darum jetzt kümmern?" –
 * also Fälligkeit zuerst, dann Aufwand, dann woher sie kommt. Bei einer Aufgabe aus einer
 * Regel steht deren Begründung dahinter; sonst stünde da eine Aufgabe, die niemand angelegt
 * hat und die sich nicht erklärt.
 */
function aufgabenZeile(task: NonNullable<DomainDetail['tasks']>[number]): string {
  const teile: string[] = []
  if (task.dueAt) teile.push(`fällig ${relativeDays(task.dueAt)}`)
  if (task.state === 'deferred' && task.deferUntil) teile.push(`zurückgestellt bis ${formatDate(task.deferUntil)}`)
  if (task.estimatedMinutes) teile.push(`${task.estimatedMinutes} Min.`)
  if (task.origin === 'system_rule' && task.rationale) teile.push(task.rationale)
  return teile.join(' · ') || 'ohne Datum'
}


/** Wer einen Bereich sehen darf – in Worten, nicht als Modellwert. */
const SICHTBARKEIT: Record<string, string> = {
  public: 'Alle im Haushalt, auch Kinder und Gäste.',
  normal: 'Alle Erwachsenen im Haushalt.',
  private: 'Nur wer ausdrücklich Zugang hat.',
  health: 'Gesundheitsdaten – nur wer ausdrücklich Zugang hat.',
  sensitive: 'Besonders geschützt – nur mit ausdrücklichem Zugang.',
}



/**
 * „Auf die Einkaufsliste" – ohne die Aufgabe abzugeben.
 *
 * Die Aufgabe bleibt in Thealotta offen: Dort steht, wer dafür mitdenkt. Bring bekommt nur den
 * Einkauf. Nach dem Senden bleibt der Knopf sichtbar – man kauft manchmal zweimal, und ein
 * verschwundener Knopf wäre eine Behauptung darüber, dass es erledigt sei.
 */
function AnBringKnopf({ taskId, titel }: { taskId: string; titel: string }) {
  const { household } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [gesendet, setGesendet] = useState(false)

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={gesendet ? 'check' : 'plus'}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation()
        if (!household) return
        setBusy(true)
        try {
          await endpoints.bringPushTask(household.id, taskId)
          setGesendet(true)
          toast.show(`„${titel}" steht auf der Einkaufsliste.`)
        } catch (err) {
          // Der Server sagt genau, woran es lag – das ist mehr wert als jeder eigene Text.
          toast.show(err instanceof Error ? err.message : 'Das ging gerade nicht.')
        } finally {
          setBusy(false)
        }
      }}
    >
      {gesendet ? 'Auf der Liste' : 'Bring'}
    </Button>
  )
}

/**
 * Ein Satz über den bisherigen Verlauf einer Regel.
 *
 * Bewusst in Worten und ohne Quote: „2 von 3" lädt zum Optimieren ein, und optimiert würde
 * hier an der falschen Stelle – eine Regel, die selten meldet, kann genau richtig sein.
 * Der Satz soll eine Auskunft geben, keine Note.
 */
function regelBilanz(monitor: DomainDetail['monitors'][number]): string {
  const b = monitor.bilanz
  if (!b || b.gemeldet === 0) {
    return monitor.lastEvaluatedAt
      ? 'Hat sich bisher nicht gemeldet.'
      : 'Noch nie gelaufen – sie hat sich noch nicht bewähren können.'
  }

  const teile = [b.gemeldet === 1 ? 'Einmal gemeldet' : `${b.gemeldet}-mal gemeldet`]
  if (b.gefuehrtZu > 0) teile.push(`${b.gefuehrtZu}× führte das zu etwas`)
  if (b.weggeklickt > 0) teile.push(`${b.weggeklickt}× als nicht relevant abgetan`)

  /*
   * Der einzige Fall, in dem der Satz einen Rat gibt: Wenn eine Regel überwiegend weggeklickt
   * wird, ist das keine Nachlässigkeit des Nutzers, sondern eine Rückmeldung an die Regel.
   */
  const ueberwiegendWeg = b.weggeklickt > b.gefuehrtZu && b.gemeldet >= 3
  return teile.join(' · ') + (ueberwiegendWeg ? '. Vielleicht passt sie nicht.' : '.')
}
