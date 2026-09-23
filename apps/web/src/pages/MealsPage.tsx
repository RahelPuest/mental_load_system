import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiError,
  endpoints,
  type Dish,
  type DishInput,
  type MealEntry,
  type MealSettings,
  type MealWeek,
  type ShoppingItem,
} from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useAsync, useMediaQuery } from '../lib/ui.js'
import {
  ALL_TAG_SUGGESTIONS,
  DISH_RATING_LABEL,
  DISH_RATINGS,
  MEAL_SLOT_LABEL,
  MEAL_SLOTS,
  MEAL_SUITABILITY,
  MEAL_SUITABILITY_LABEL,
  SUGGESTION_MODE_LABEL,
  SUGGESTION_MODES,
  TAG_SUGGESTIONS,
  UNIT_SUGGESTIONS,
  type DishRating,
  type MealSlot,
  type MealSuitability,
} from '@thealotta/contracts'
import {
  Actions,
  Button,
  Chip,
  Chips,
  Disclosure,
  Divider,
  EmptyLine,
  EmptyState,
  ErrorState,
  Field,
  Icon,
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
} from '../design/index.js'

/**
 * Die Essensplanung (docs/63).
 *
 * Der Bildschirm folgt dem Ablauf und nicht dem Datenmodell:
 * **sammeln → planen → anpassen → einkaufen.** Links das Gedächtnis, rechts die Woche.
 *
 * Was hier ausdrücklich **nicht** steht: eine Rezeptverwaltung. Ein Gericht darf nur einen
 * Namen haben, und die häufigste Handlung ist nicht „Rezept pflegen", sondern „Woche füllen".
 * Deshalb steht der Knopf dafür oben rechts und nicht in einem Menü.
 */

type Abschnitt = 'woche' | 'sammlung' | 'einkauf' | 'einstellungen'

const ABSCHNITTE: { key: Abschnitt; titel: string; zweck: string }[] = [
  { key: 'woche', titel: 'Wochenplan', zweck: 'Was wann auf den Tisch kommt.' },
  { key: 'sammlung', titel: 'Gerichte', zweck: 'Euer Gedächtnis: was ihr kocht, mögt und lange nicht hattet.' },
  { key: 'einkauf', titel: 'Einkaufsliste', zweck: 'Was ihr für die geplante Woche braucht.' },
  { key: 'einstellungen', titel: 'Einstellungen', zweck: 'Mittagstage, Portionen und Regeln für Wochentage.' },
]

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WOCHENTAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

const tagePlus = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10)

const montagVon = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00.000Z`)
  return tagePlus(iso, -((d.getUTCDay() + 6) % 7))
}

const zeigeDatum = (iso: string): string => {
  const [, m, t] = iso.split('-')
  return `${Number(t)}.${Number(m)}.`
}

/** „25 Min." – oder nichts, wenn niemand eine Zeit hinterlegt hat. */
const zeigeZeit = (minuten: number | null): string | null => (minuten === null ? null : `${minuten} Min.`)

/**
 * Wie lange ein Gericht her ist – in Worten.
 *
 * Kein Datum: „zuletzt am 14.02." zwingt zum Rechnen. Die Frage lautet „hatten wir das
 * kürzlich?", und darauf ist „vor drei Wochen" die Antwort.
 */
function zeigeAbstand(letzterTag: string | null, heute: string): string {
  if (letzterTag === null) return 'noch nie'
  const tage = Math.round((Date.parse(`${heute}T00:00:00Z`) - Date.parse(`${letzterTag}T00:00:00Z`)) / 86_400_000)
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} Tagen`
  if (tage < 14) return 'vor einer Woche'
  if (tage < 31) return `vor ${Math.round(tage / 7)} Wochen`
  if (tage < 60) return 'vor einem Monat'
  if (tage < 365) return `vor ${Math.round(tage / 30)} Monaten`
  return 'vor über einem Jahr'
}

/**
 * Wie der Haushalt zu einem Gericht steht – ein Satz aus den einzelnen Stimmen (§9, §10).
 *
 * Keine Sterne, keine Zahl. Wer ablehnt, wird beim Namen genannt: Genau daran hängt, ob am
 * Abend jemand nichts isst – und das ist die Arbeit, die die Planung abnehmen soll.
 */
export function meinung(ratings: { displayName: string; rating: DishRating }[]): string | null {
  if (ratings.length === 0) return null
  const abneigung = ratings.filter((r) => r.rating === 'rather_not')
  if (abneigung.length > 0) {
    if (abneigung.length === ratings.length) return 'Mag hier gerade niemand'
    return `${abneigung.map((a) => a.displayName).join(' und ')} mag das eher nicht`
  }
  const liebe = ratings.filter((r) => r.rating === 'love').length
  const gern = ratings.filter((r) => r.rating === 'like').length
  if (liebe === ratings.length) return 'Mögen alle sehr'
  if (liebe + gern === ratings.length) return 'Mögen alle'
  if (liebe > 0) return 'Kommt gut an'
  return 'Geht so'
}

export function MealsPage() {
  const { household } = useSession()
  const { section } = useParams<{ section?: string }>()
  const toast = useToast()

  const aktiv: Abschnitt =
    section && ABSCHNITTE.some((a) => a.key === section) ? (section as Abschnitt) : 'woche'

  /* Welche Woche gerade offen ist. Der Montag ist der Schlüssel – überall derselbe. */
  const [woche, setWoche] = useState<string | null>(null)
  const [gewaehlt, setGewaehlt] = useState<Dish | null>(null)
  const [bogen, setBogen] = useState<{ art: 'neu' } | { art: 'bearbeiten'; dish: Dish } | null>(null)
  const [suche, setSuche] = useState('')
  const [filterTags, setFilterTags] = useState<string[]>([])
  /** Tags, die ausgeschlossen sind (§27). Getrennt von den geforderten – ein Tag ist eins von beidem. */
  const [ausTags, setAusTags] = useState<string[]>([])

  const heute = useAsync(
    () => (household ? endpoints.upcomingMeals(household.id, 1) : Promise.resolve(null)),
    [household?.id],
  )

  useEffect(() => {
    if (woche === null && heute.data?.weekStart) setWoche(heute.data.weekStart)
  }, [woche, heute.data])

  /*
    Welcher Montag gilt – notfalls selbst gerechnet.

    Der Server sagt es, weil er die Zeitzone des Haushalts kennt. Bleibt die Antwort aus oder
    fehlt das Feld, rechnet die Oberfläche es aus der Gerätezeit: eine Woche daneben wäre
    ärgerlich, eine Seite, die ewig lädt, wäre schlimmer.
  */
  const start = woche ?? heute.data?.weekStart ?? montagVon(new Date().toISOString().slice(0, 10))

  const plan = useAsync<MealWeek | null>(
    () => (household && start ? endpoints.mealWeek(household.id, start) : Promise.resolve(null)),
    [household?.id, start],
  )
  const gerichte = useAsync<{ items: Dish[] } | null>(
    () => (household ? endpoints.dishes(household.id) : Promise.resolve(null)),
    [household?.id],
  )

  const neuLaden = useCallback(async () => {
    await Promise.all([plan.reload(), gerichte.reload()])
  }, [plan, gerichte])

  if (!household) return null
  if (plan.error || gerichte.error) {
    return (
      <Page title="Essen" lede="Was diese Woche auf den Tisch kommt.">
        <ErrorState
          meaning="Die Essensplanung konnte nicht geladen werden."
          onRetry={() => void neuLaden()}
        />
      </Page>
    )
  }
  /*
    Nicht nur „lädt gerade", sondern „ist da".

    Die Woche wird erst geholt, wenn der heutige Montag bekannt ist – dazwischen liegt ein
    Durchlauf, in dem nichts mehr lädt und trotzdem nichts da ist. Wer hier nur auf `loading`
    prüft, greift auf `null` zu; genau das ist beim Einbau passiert.
  */
  if (!plan.data || !gerichte.data) {
    return (
      <Page title="Essen" lede="Was diese Woche auf den Tisch kommt.">
        <SkeletonList count={4} />
      </Page>
    )
  }

  const sammlung = gerichte.data?.items ?? []
  const heutigerTag = heute.data?.today ?? start

  /* Die Filter der Sammlung gelten auch beim automatischen Füllen (§45). */
  const gefiltert = sammlung.filter((d) => {
    if (suche.trim()) {
      const heuhaufen = [d.name, ...d.tags, ...d.ingredients.map((i) => i.name)].join(' ').toLowerCase()
      if (!heuhaufen.includes(suche.trim().toLowerCase())) return false
    }
    const gesetzt = new Set(d.tags.map((t) => t.toLowerCase()))
    if (!filterTags.every((t) => gesetzt.has(t.toLowerCase()))) return false
    return !ausTags.some((t) => gesetzt.has(t.toLowerCase()))
  })

  const kopfAktion = (
    <>
      <Button variant="secondary" icon="plus" onClick={() => setBogen({ art: 'neu' })}>
        Gericht
      </Button>
    </>
  )

  return (
    <Page
      title="Essen"
      lede="Sammeln, planen, einkaufen – damit niemand jeden Abend neu überlegen muss."
      action={kopfAktion}
    >
      {/*
        Vier Abschnitte als Chips, nicht als linke Spalte: Die linke Spalte gehört hier der
        Gerichtesammlung. Zwei Verzeichnisse nebeneinander wären eines zu viel.
      */}
      <nav className="abschnitt-chips" aria-label="Bereiche der Essensplanung">
        {ABSCHNITTE.map((a) => (
          <Link
            key={a.key}
            to={a.key === 'woche' ? '/essen' : `/essen/${a.key}`}
            className="chip"
            aria-current={a.key === aktiv ? 'page' : undefined}
          >
            {a.titel}
          </Link>
        ))}
      </nav>

      {aktiv === 'woche' && (
        <WeekPlanner
          householdId={household.id}
          week={plan.data!}
          dishes={gefiltert}
          heute={heutigerTag}
          suche={suche}
          setSuche={setSuche}
          filterTags={filterTags}
          setFilterTags={setFilterTags}
          ausTags={ausTags}
          setAusTags={setAusTags}
          gewaehlt={gewaehlt}
          setGewaehlt={setGewaehlt}
          onWeek={setWoche}
          onChanged={neuLaden}
          onNeuesGericht={() => setBogen({ art: 'neu' })}
        />
      )}

      {aktiv === 'sammlung' && (
        <DishCollection
          dishes={gefiltert}
          heute={heutigerTag}
          suche={suche}
          setSuche={setSuche}
          filterTags={filterTags}
          setFilterTags={setFilterTags}
          ausTags={ausTags}
          setAusTags={setAusTags}
          onNeu={() => setBogen({ art: 'neu' })}
          onBearbeiten={(dish) => setBogen({ art: 'bearbeiten', dish })}
        />
      )}

      {aktiv === 'einkauf' && (
        <ShoppingView householdId={household.id} weekStart={plan.data!.weekStart} onChanged={neuLaden} />
      )}

      {aktiv === 'einstellungen' && <MealSettingsView householdId={household.id} onChanged={neuLaden} />}

      {bogen && (
        <DishSheet
          householdId={household.id}
          dish={bogen.art === 'bearbeiten' ? bogen.dish : null}
          onClose={() => setBogen(null)}
          onDone={async () => {
            setBogen(null)
            await neuLaden()
            toast.show(bogen.art === 'neu' ? 'Gericht gespeichert.' : 'Gericht geändert.')
          }}
        />
      )}
    </Page>
  )
}

/* ══ Wochenplan ═══════════════════════════════════════════════════════ */

/**
 * Links die Sammlung, rechts die Woche (§44).
 *
 * Zwei Bedienwege, gleichrangig (§14): Ziehen mit der Maus – und Auswählen, dann Platz
 * antippen. Der zweite ist nicht der Notbehelf für Telefone, sondern der einzige, der mit
 * Tastatur und Vorleseprogramm funktioniert.
 */
function WeekPlanner({
  householdId,
  week,
  dishes,
  heute,
  suche,
  setSuche,
  filterTags,
  setFilterTags,
  ausTags,
  setAusTags,
  gewaehlt,
  setGewaehlt,
  onWeek,
  onChanged,
  onNeuesGericht,
}: {
  householdId: string
  week: MealWeek
  dishes: Dish[]
  heute: string
  suche: string
  setSuche: (v: string) => void
  filterTags: string[]
  setFilterTags: (v: string[]) => void
  ausTags: string[]
  setAusTags: (v: string[]) => void
  gewaehlt: Dish | null
  setGewaehlt: (d: Dish | null) => void
  onWeek: (start: string) => void
  onChanged: () => Promise<void>
  onNeuesGericht: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [ziehtUeber, setZiehtUeber] = useState<string | null>(null)
  const [modus, setModus] = useState<string>('balanced')
  /** Was gefüllt werden soll: alle freien Plätze, nur Abendessen oder ein einzelner Tag (§22). */
  const [umfang, setUmfang] = useState<string>('alle')
  const [wahl, setWahl] = useState<{ date: string; slot: MealSlot } | null>(null)
  const [mahlzeit, setMahlzeit] = useState<{ date: string; slot: MealSlot; entry: MealEntry } | null>(null)

  /*
    Ab wann das Gitter passt.

    Seit der Kalender die ganze Breite hat, reichen 1080 px: Dort bleiben je Tagesspalte rund
    110 px. Darunter – auf Telefonen und schmalen Tablets – ist der Stapel nach Tagen die
    ehrlichere Anordnung; sieben Spalten mit je zwei Wörtern Breite sind kein Kalender.
  */
  const gitter = useMediaQuery('(min-width: 1080px)')

  /*
    Die Schiene zeigt nicht alles, sondern das Naheliegendste.

    Bei zweihundert Gerichten wäre eine vollständige Liste kein Angebot, sondern eine zweite
    Suchaufgabe – und §7 verlangt ausdrücklich, dass man auch dann schnell etwas findet.
    Sortiert nach „lange nicht gegessen": Das ist die Antwort auf „was könnten wir essen?",
    und wer etwas Bestimmtes sucht, tippt es ins Feld darüber.

    Sechs, nicht acht: Mit acht lag die Seite bei 41 Bedienelementen, das Budget bei 40
    (`cognitive-load.spec.ts`). Sechs Vorschläge sind für einen Blick ohnehin genug.
  */
  const RAIL_DECKEL = 6
  const vorschlagsliste = useMemo(
    () => [...dishes].sort((a, b) => (a.lastPlannedOn ?? '').localeCompare(b.lastPlannedOn ?? '')).slice(0, RAIL_DECKEL),
    [dishes],
  )

  const fuellen = async (opts: { only?: { date: string; slot: MealSlot }[]; replace?: boolean }) => {
    setBusy(true)
    try {
      const ergebnis = await endpoints.fillWeek(householdId, {
        weekStart: week.weekStart,
        mode: modus,
        requireTags: filterTags,
        excludeTags: ausTags,
        ...(opts.only ? { only: opts.only } : {}),
        ...(opts.replace ? { replace: true } : {}),
        /* Jeder Klick würfelt neu – sonst käme beim zweiten Mal dasselbe heraus. */
        seed: Date.now() % 2_147_483_647,
      })
      await onChanged()
      if (ergebnis.filled.length === 0 && ergebnis.unfilled.length === 0) {
        toast.show('Hier ist schon alles geplant.')
      } else if (ergebnis.unfilled.length > 0) {
        toast.show(`${ergebnis.filled.length} gefüllt – für ${ergebnis.unfilled.length} passte nichts.`)
      } else {
        toast.show(`${ergebnis.filled.length} Vorschläge eingetragen.`)
      }
    } finally {
      setBusy(false)
    }
  }

  /*
    Die beiden Handlungen, die direkt am Platz sitzen (§23).

    Alles andere – festhalten, Portionen, Notiz, kopieren – steht weiterhin im Bogen hinter
    dem Namen. Diese zwei sind die, die man beim Planen hintereinander weg macht: würfeln,
    bis es passt, und wegnehmen, was nicht passt.
  */
  const neuWuerfeln = async (date: string, slot: MealSlot) => {
    await endpoints.unplanMeal(householdId, date, slot)
    await fuellen({ only: [{ date, slot }] })
  }

  /* Derselbe Wurf an einem leeren Platz – hier gibt es nichts zu entfernen. */
  const vorschlagen = async (date: string, slot: MealSlot) => {
    await fuellen({ only: [{ date, slot }] })
  }

  /*
    Entfernen ist zurücknehmbar, nicht bestätigungspflichtig (§57) – wie Abhaken überall sonst
    im Produkt.

    Der Knopf steht vierzehnmal auf der Seite, jedes Mal wenige Pixel neben „anderes Gericht“.
    Der Fehlgriff ist damit die wahrscheinlichste Fehlbedienung des Wochenplans und war bis
    hierher stumm und endgültig (docs/68, Befund E7).

    **Was das Rückgängig wiederherstellt:** Gericht, Portionen, Notiz und – falls gesetzt – das
    Festhalten. **Was es nicht wiederherstellt:** die Herkunft. Ein zurückgeholter Platz gilt
    als von Hand geplant, auch wenn er ein Vorschlag war. Das ist kein Verlust, sondern die
    vorsichtigere Seite: „Ganze Woche neu vorschlagen“ tauscht nur Vorschläge aus – was jemand
    ausdrücklich zurückgeholt hat, soll nicht beim nächsten Durchlauf wieder verschwinden.
  */
  const entfernen = async (date: string, slot: MealSlot, entry: MealEntry) => {
    setBusy(true)
    try {
      await endpoints.unplanMeal(householdId, date, slot)
      toast.show(`„${entry.dishName}“ aus dem Plan genommen.`, async () => {
        await endpoints
          .planMeal(householdId, {
            date,
            slot,
            dishId: entry.dishId,
            servings: entry.servings,
            note: entry.note ?? null,
          })
          .catch(() => undefined)
        if (entry.locked) {
          await endpoints.lockMeal(householdId, date, slot, true).catch(() => undefined)
        }
        await onChanged()
      })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const einplanen = async (date: string, slot: MealSlot, dishId: string) => {
    setBusy(true)
    try {
      await endpoints.planMeal(householdId, { date, slot, dishId })
      await onChanged()
    } finally {
      setBusy(false)
      setGewaehlt(null)
    }
  }

  const verschieben = async (von: { date: string; slot: MealSlot }, nach: { date: string; slot: MealSlot }) => {
    setBusy(true)
    try {
      await endpoints.moveMeal(householdId, von, nach)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  /** Was beim Fallenlassen ankommt: entweder ein Gericht aus der Sammlung oder ein Platz. */
  const aufnehmen = async (event: React.DragEvent, date: string, slot: MealSlot) => {
    event.preventDefault()
    setZiehtUeber(null)
    const dishId = event.dataTransfer.getData('application/x-thealotta-dish')
    if (dishId) return einplanen(date, slot, dishId)
    const quelle = event.dataTransfer.getData('application/x-thealotta-slot')
    if (quelle) {
      const [d, s] = quelle.split('|')
      if (d && s && !(d === date && s === slot)) {
        return verschieben({ date: d, slot: s as MealSlot }, { date, slot })
      }
    }
  }

  const kalender = (
    <>
      <Section
        title={`Woche vom ${zeigeDatum(week.weekStart)}`}
        hint="Freie Plätze füllt Thealotta auf Wunsch – bereits Geplantes bleibt, wie es ist."
        icon="calendar"
        action={
          <Actions spaced={false}>
            <Button
              variant="ghost"
              size="sm"
              icon="chevronLeft"
              aria-label="Woche davor"
              onClick={() => onWeek(tagePlus(week.weekStart, -7))}
            />
            <Button variant="ghost" size="sm" onClick={() => onWeek(montagVon(heute))}>
              Diese Woche
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="chevronRight"
              aria-label="Woche danach"
              onClick={() => onWeek(tagePlus(week.weekStart, 7))}
            />
          </Actions>
        }
      >
        <Panel>
          {/*
            Die häufigste Handlung der Seite, und sie steht über der Woche statt darunter:
            Wer sie sucht, hat noch nichts geplant und schaut nicht ans Ende einer leeren Liste.
          */}
          <div className="setting-row">
            <div className="text">
              <p className="t-sub">Freie Plätze füllen</p>
              <p className="t-body-sm c-secondary">
                Vorschläge für alles, was noch leer ist. Was schon geplant ist, bleibt unangetastet.
              </p>
            </div>
            <div className="row-actions">
              <Select
                aria-label="Wie soll ausgewählt werden?"
                value={modus}
                onChange={(e) => setModus(e.target.value)}
              >
                {SUGGESTION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {SUGGESTION_MODE_LABEL[m].titel}
                  </option>
                ))}
              </Select>
              {/*
                §22: vier Umfänge, aber kein Knopfregal.

                „Ganze Woche" ist der Regelfall und bleibt der Knopf. Die Einschränkungen –
                nur Abendessen, ein einzelner Tag – stehen als Auswahl daneben; der einzelne
                Platz hat ohnehin seinen Würfel in der Zelle (§23).
              */}
              <Select aria-label="Was soll gefüllt werden?" value={umfang} onChange={(e) => setUmfang(e.target.value)}>
                <option value="alle">alle freien Plätze</option>
                <option value="dinner">nur Abendessen</option>
                {week.days.map((t) => (
                  <option key={t.date} value={t.date}>
                    nur {WOCHENTAG[t.weekday]}
                  </option>
                ))}
              </Select>
              <Button
                variant="primary"
                icon="sparkle"
                disabled={busy}
                onClick={() =>
                  void fuellen(
                    umfang === 'alle'
                      ? {}
                      : {
                          only: week.days
                            .flatMap((t) => t.slots.map((sl) => ({ date: t.date, slot: sl.slot as MealSlot })))
                            .filter((p) => (umfang === 'dinner' ? p.slot === 'dinner' : p.date === umfang)),
                        },
                  )
                }
              >
                {umfang === 'alle' ? 'Freie Woche füllen' : 'Füllen'}
              </Button>
            </div>
          </div>
          <p className="t-body-sm c-muted">
            {SUGGESTION_MODE_LABEL[modus as keyof typeof SUGGESTION_MODE_LABEL]?.zweck}
          </p>
        </Panel>

        {/*
          Die Woche als Kalender: Tage waagerecht, Mahlzeiten senkrecht.

          Das ist die Anordnung, die jeder Wochenkalender hat, und sie beantwortet die beiden
          Fragen, die man an einen Wochenplan stellt, mit je einer Blickrichtung: „was gibt es
          Donnerstag?" senkrecht in einer Spalte, „was essen wir diese Woche abends?"
          waagerecht in einer Zeile. Untereinander gestapelt beantwortet man beide durch
          Zählen.

          Den Mittagsplatz gibt es an **jedem** Tag, auch an dem, für den keiner eingestellt
          ist – dort nur mit hellerer Kante und „Mittagessen" statt „Gericht wählen". Ein Loch
          im Gitter wäre nicht zu erklären, und die Ausnahme (Ferien, Feiertag, Homeoffice)
          ist genau der Fall, für den §12 ihn vorsieht.

          Auf schmalen Bildschirmen wird daraus wieder ein Stapel – und zwar nach Tagen, nicht
          nach Mahlzeiten: Auf dem Telefon lautet die Frage „was ist heute?", nicht „was essen
          wir diese Woche mittags?". Deshalb zwei Zweige statt einer CSS-Umsortierung; die
          Zelle selbst ist dieselbe.
        */}
        {gitter ? (
          <div className="essen-woche" role="table" aria-label="Wochenplan">
            <div className="essen-kopf" role="row">
              <span className="essen-ecke" role="columnheader" />
              {week.days.map((tag) => (
                <span
                  key={tag.date}
                  role="columnheader"
                  className={`essen-tag-kopf${tag.date === heute ? ' ist-heute' : ''}`}
                >
                  <span className="t-sub">{WOCHENTAG[tag.weekday]}</span>
                  <span className="t-body-sm c-muted">{zeigeDatum(tag.date)}</span>
                </span>
              ))}
            </div>
            {MEAL_SLOTS.map((slot) => (
              <div className="essen-reihe" role="row" key={slot}>
                <span className="essen-reihen-kopf" role="rowheader">
                  {MEAL_SLOT_LABEL[slot]}
                </span>
                {week.days.map((tag) => (
                  <MealCell
                    key={`${tag.date}|${slot}`}
                    tag={tag}
                    slot={slot}
                    heute={heute}
                    busy={busy}
                    gewaehlt={gewaehlt}
                    ziehtUeber={ziehtUeber}
                    setZiehtUeber={setZiehtUeber}
                    aufnehmen={aufnehmen}
                    einplanen={einplanen}
                    setWahl={setWahl}
                    onOpen={setMahlzeit}
                    neuWuerfeln={neuWuerfeln}
                    vorschlagen={vorschlagen}
                    entfernen={entfernen}
                    imGitter
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="essen-stapel">
            {week.days.map((tag) => (
              <div className={`essen-tag${tag.date === heute ? ' ist-heute' : ''}`} key={tag.date}>
                <p className="essen-tag-name">
                  <span className="t-sub">{WOCHENTAG[tag.weekday]}</span>
                  <span className="t-body-sm c-muted">{zeigeDatum(tag.date)}</span>
                  {tag.date === heute && <span className="chip chip-accent">heute</span>}
                </p>
                {MEAL_SLOTS.map((slot) => (
                  <MealCell
                    key={`${tag.date}|${slot}`}
                    tag={tag}
                    slot={slot}
                    heute={heute}
                    busy={busy}
                    gewaehlt={gewaehlt}
                    ziehtUeber={ziehtUeber}
                    setZiehtUeber={setZiehtUeber}
                    aufnehmen={aufnehmen}
                    einplanen={einplanen}
                    setWahl={setWahl}
                    onOpen={setMahlzeit}
                    neuWuerfeln={neuWuerfeln}
                    vorschlagen={vorschlagen}
                    entfernen={entfernen}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        <Actions>
          <Button
            variant="ghost"
            size="sm"
            icon="sparkle"
            disabled={busy}
            onClick={() => void fuellen({ replace: true })}
          >
            Ganze Woche neu vorschlagen
          </Button>
          <Link className="linklike" to="/essen/einkauf">
            Einkaufsliste erzeugen
          </Link>
        </Actions>
        {/*
          §24: „Neu vorschlagen" ist die ausdrücklich andere Handlung. Es steht unten, ist
          kein Primärknopf, und der Satz daneben sagt, was es anfasst und was nicht.
        */}
        <p className="t-body-sm c-muted">
          „Neu vorschlagen" tauscht nur, was Thealotta selbst vorgeschlagen hat. Von Hand Geplantes und
          Festgehaltenes bleibt stehen.
        </p>
      </Section>
    </>
  )

  const sammlung = (
    <nav className="essen-rail" aria-label="Gerichtesammlung">
      <DishFilter
        suche={suche}
        setSuche={setSuche}
        filterTags={filterTags}
        setFilterTags={setFilterTags}
        ausTags={ausTags}
        setAusTags={setAusTags}
        dishes={dishes}
      />
      {dishes.length === 0 ? (
        <EmptyLine
          text="Kein Gericht passt – oder es gibt noch keines."
          action={
            <Button variant="ghost" size="sm" icon="plus" onClick={onNeuesGericht}>
              Gericht
            </Button>
          }
        />
      ) : (
        <RowList>
          {vorschlagsliste.map((d) => (
            <li key={d.id} className={gewaehlt?.id === d.id ? 'ist-offen' : ''}>
              <div
                className="essen-karte"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-thealotta-dish', d.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <Row
                  title={d.name}
                  subtitle={[zeigeAbstand(d.lastPlannedOn, heute), zeigeZeit(d.totalMinutes)]
                    .filter(Boolean)
                    .join(' · ')}
                  chevron={false}
                  onClick={() => setGewaehlt(gewaehlt?.id === d.id ? null : d)}
                />
              </div>
            </li>
          ))}
        </RowList>
      )}
      {dishes.length > vorschlagsliste.length && (
        <p className="t-body-sm c-muted">
          {dishes.length} Gerichte insgesamt – such nach einem Namen oder{' '}
          <Link className="linklike" to="/essen/sammlung">
            sieh die ganze Sammlung an
          </Link>
          .
        </p>
      )}
    </nav>
  )

  return (
    <>
      {gewaehlt && (
        <Notice tone="accent" title={`„${gewaehlt.name}" ist ausgewählt`}>
          Wähle jetzt einen Platz in der Woche. Oder{' '}
          <button type="button" className="linklike" onClick={() => setGewaehlt(null)}>
            Auswahl aufheben
          </button>
          .
        </Notice>
      )}
      {/*
        Der Kalender bekommt die ganze Breite – die Gerichte stehen darunter.

        Zuerst lag die Sammlung als Spalte daneben (docs/44 schlug das so vor). Gemessen blieb
        dem Kalender damit rund 950 px für sieben Tagesspalten: 110 px je Tag, in denen ein
        Gerichtename dreimal umbricht. Ein Wochenkalender ist eine Fläche, kein Beiwerk – und
        von zwei nebeneinanderliegenden Dingen muss eines schmal sein.

        Der Weg zum Einplanen leidet nicht darunter: Ziehen geht über die Seite hinweg, und
        der Weg ohne Maus – Gericht antippen, dann einen Platz – braucht ohnehin zwei Klicks,
        egal wo die Liste steht.
      */}
      {kalender}
      <Section
        title="Gerichte"
        hint="Zum Einplanen antippen, dann einen Platz in der Woche wählen – oder von hier nach oben ziehen."
        icon="meal"
      >
        {sammlung}
      </Section>
      {mahlzeit && (
        <MealSheet
          householdId={householdId}
          ziel={mahlzeit}
          week={week}
          defaultServings={week.defaultServings}
          onClose={() => setMahlzeit(null)}
          onChanged={onChanged}
        />
      )}
      {wahl && (
        <PickDishSheet
          dishes={dishes}
          heute={heute}
          onClose={() => setWahl(null)}
          onPick={async (dish) => {
            const ziel = wahl
            setWahl(null)
            await einplanen(ziel.date, ziel.slot, dish.id)
          }}
        />
      )}
    </>
  )
}

/**
 * Eine geplante Mahlzeit ändern (§34, §36, §43).
 *
 * Was hier steht, gehört zu **diesem einen Platz**, nicht zum Gericht: Für wie viele gekocht
 * wird, eine Notiz für den Tag, festhalten, kopieren, entfernen. Am Gericht selbst würde es
 * jede künftige Woche mitverändern – „für 6 Personen" gilt am Sonntag, nicht für immer.
 */
function MealSheet({
  householdId,
  ziel,
  week,
  defaultServings,
  onClose,
  onChanged,
}: {
  householdId: string
  ziel: { date: string; slot: MealSlot; entry: MealEntry }
  week: MealWeek
  defaultServings: number
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const [portionen, setPortionen] = useState(ziel.entry.servings ? String(ziel.entry.servings) : '')
  const [notiz, setNotiz] = useState(ziel.entry.note ?? '')
  const [kopieNach, setKopieNach] = useState('')
  const [busy, setBusy] = useState(false)

  const wochentag = new Date(`${ziel.date}T00:00:00.000Z`).getUTCDay()

  /* Alle Plätze der Woche als Ziel für „kopieren" – auch die belegten, dort wird ersetzt. */
  const plaetze = week.days.flatMap((t) =>
    t.slots.map((s) => ({
      key: `${t.date}|${s.slot}`,
      label: `${WOCHENTAG[t.weekday]} ${MEAL_SLOT_LABEL[s.slot as MealSlot]}${s.entry ? ` (statt ${s.entry.dishName})` : ''}`,
      belegt: Boolean(s.entry),
    })),
  )

  const speichern = async () => {
    setBusy(true)
    try {
      await endpoints.planMeal(householdId, {
        date: ziel.date,
        slot: ziel.slot,
        dishId: ziel.entry.dishId,
        servings: portionen.trim() === '' ? null : Number(portionen),
        note: notiz.trim() || null,
      })
      await onChanged()
      onClose()
      toast.show('Gespeichert.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={ziel.entry.dishName}
      description={`${WOCHENTAG[wochentag]}, ${MEAL_SLOT_LABEL[ziel.slot]}`}
    >
      {/*
        Woher dieser Platz kommt – in Worten, ohne Punktzahl (§25, §26).

        Das stand bis September 2026 als Unterzeile in der Zelle. Seit die Zelle nur noch den
        Namen trägt, steht es hier: Wer wissen will, warum ein Gericht am Dienstag gelandet
        ist, fragt den Platz – und der antwortet an genau der Stelle, an der auch Portionen,
        Notiz und Festhalten stehen.

        Sichtbar bleiben muss es, weil „Ganze Woche neu vorschlagen" nur Vorschläge anfasst
        (§24): Was der Knopf mit diesem Platz tut, darf man nicht raten müssen.
      */}
      <p className="t-body-sm c-secondary essen-herkunft">
        {ziel.entry.source === 'suggested'
          ? `Vorschlag${ziel.entry.suggestionReason ? ` – ${ziel.entry.suggestionReason}` : ''}`
          : 'Von Hand geplant'}
        {ziel.entry.totalMinutes !== null ? ` · ${zeigeZeit(ziel.entry.totalMinutes)}` : ''}
      </p>

      {/*
        §34: Für wie viele gekocht wird – hier, nicht am Gericht. Leer heißt: so viele wie
        üblich. Die Mengen der Einkaufsliste rechnen damit; ohne Portionsangabe am Gericht
        wird nicht skaliert, sondern die Menge übernommen (lieber unverändert als geraten).
      */}
      <Field
        label="Für wie viele?"
        hint={`Leer heißt: wie üblich, also ${defaultServings}. Die Einkaufsliste rechnet damit.`}
      >
        {({ id }) => (
          <Input
            id={id}
            type="number"
            min={1}
            value={portionen}
            placeholder={String(defaultServings)}
            onChange={(e) => setPortionen(e.target.value)}
          />
        )}
      </Field>

      <Field label="Notiz für diesen Tag" hint={'Zum Beispiel „Oma isst mit" oder „ohne Zwiebeln".'}>
        {({ id }) => <Input id={id} value={notiz} onChange={(e) => setNotiz(e.target.value)} />}
      </Field>

      <Divider />

      {/*
        §43: Festhalten schützt den Platz vor „ganze Woche neu vorschlagen". Es steht hier und
        nicht als Symbol in der Zelle – man braucht es einmal je Woche, nicht dauernd.
      */}
      <div className="setting-row">
        <div className="text">
          <p className="t-sub">{ziel.entry.locked ? 'Wird festgehalten' : 'Festhalten'}</p>
          <p className="t-body-sm desc">
            {ziel.entry.locked
              ? 'Auch „ganze Woche neu vorschlagen" lässt diesen Platz stehen.'
              : 'Dann lässt auch „ganze Woche neu vorschlagen" diesen Platz stehen.'}
          </p>
        </div>
        <div className="row-actions">
          <Button
            variant="secondary"
            size="sm"
            icon="lock"
            disabled={busy}
            onClick={async () => {
              await endpoints.lockMeal(householdId, ziel.date, ziel.slot, !ziel.entry.locked)
              await onChanged()
              onClose()
            }}
          >
            {ziel.entry.locked ? 'Freigeben' : 'Festhalten'}
          </Button>
        </div>
      </div>

      {/*
        §13: Kopieren. Verschieben geht durch Ziehen; kopieren ließe sich mit der Maus nicht
        vom Verschieben unterscheiden, ohne eine Zusatztaste zu verlangen – und die gibt es
        auf einem Telefon nicht.
      */}
      <div className="setting-row">
        <div className="text">
          <p className="t-sub">Auf einen anderen Platz kopieren</p>
          <p className="t-body-sm desc">Dieser Platz bleibt, wie er ist.</p>
        </div>
        <div className="row-actions">
          <Select aria-label="Wohin kopieren?" value={kopieNach} onChange={(e) => setKopieNach(e.target.value)}>
            <option value="">Platz wählen …</option>
            {plaetze
              .filter((p) => p.key !== `${ziel.date}|${ziel.slot}`)
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
          </Select>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !kopieNach}
            onClick={async () => {
              const [d, sl] = kopieNach.split('|')
              await endpoints.moveMeal(
                householdId,
                { date: ziel.date, slot: ziel.slot },
                { date: d!, slot: sl! },
                'copy',
              )
              await onChanged()
              onClose()
              toast.show('Kopiert.')
            }}
          >
            Kopieren
          </Button>
        </div>
      </div>

      <div className="setting-row">
        <div className="text">
          <p className="t-sub">Vom Plan nehmen</p>
          <p className="t-body-sm desc">Der Platz wird wieder frei. Das Gericht bleibt in der Sammlung.</p>
        </div>
        <div className="row-actions">
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            disabled={busy}
            onClick={async () => {
              await endpoints.unplanMeal(householdId, ziel.date, ziel.slot)
              await onChanged()
              onClose()
            }}
          >
            Entfernen
          </Button>
        </div>
      </div>

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void speichern()}>
          Speichern
        </Button>
      </Actions>
    </Sheet>
  )
}

/**
 * Ein Platz im Wochenplan – eine Zelle des Kalenders.
 *
 * Dieselbe Zelle trägt beide Anordnungen: das Gitter auf dem Bildschirm (Tage waagerecht) und
 * den Stapel auf dem Telefon (Tage untereinander). Zwei Zellen für denselben Platz würden
 * früher oder später auseinanderlaufen – und die Zelle ist das Stück mit der Logik: Ziehen,
 * Ablegen, Vorschlag tauschen, Festhalten, Entfernen.
 */
function MealCell({
  tag,
  slot,
  heute,
  busy,
  gewaehlt,
  ziehtUeber,
  setZiehtUeber,
  aufnehmen,
  einplanen,
  setWahl,
  onOpen,
  neuWuerfeln,
  vorschlagen,
  entfernen,
  imGitter,
}: {
  tag: MealWeek['days'][number]
  slot: MealSlot
  heute: string
  busy: boolean
  gewaehlt: Dish | null
  ziehtUeber: string | null
  setZiehtUeber: React.Dispatch<React.SetStateAction<string | null>>
  aufnehmen: (event: React.DragEvent, date: string, slot: MealSlot) => Promise<void>
  einplanen: (date: string, slot: MealSlot, dishId: string) => Promise<void>
  setWahl: (v: { date: string; slot: MealSlot } | null) => void
  /** Den Bogen für eine geplante Mahlzeit öffnen. */
  onOpen: (v: { date: string; slot: MealSlot; entry: MealEntry }) => void
  neuWuerfeln: (date: string, slot: MealSlot) => Promise<void>
  vorschlagen: (date: string, slot: MealSlot) => Promise<void>
  entfernen: (date: string, slot: MealSlot, entry: MealEntry) => Promise<void>
  /**
   * Steht die Zelle im Gitter oder im Stapel? Daran hängen drei Dinge:
   *
   * - **Die Rolle.** `role="cell"` gilt nur innerhalb einer Tabelle. Im Stapel gibt es keine
   *   Zeile darüber, und eine Zelle ohne Zeile ist ein Verstoß (`aria-required-parent`).
   * - **Die Beschriftung.** Im Gitter steht die Mahlzeit am Zeilenkopf, im Stapel muss die
   *   Zelle sie selbst tragen.
   * - **Die Breite.** Eine Tagesspalte ist rund 110 px breit; dort trägt der leere Platz nur
   *   ein Pluszeichen. Was er meint, steht in Zeilen- und Spaltenkopf – und vollständig in
   *   der Beschriftung des Knopfes, denn wer vorlesen lässt, sieht weder das eine noch das
   *   andere.
   */
  imGitter?: boolean
}) {
  const vorhanden = tag.slots.find((s) => s.slot === slot)
  const entry = vorhanden?.entry ?? null
  /* Ein Mittagsplatz, den der Haushalt nicht eingestellt hat: der leise Ausnahmefall (§12). */
  const ausserplanmaessig = !vorhanden
  const key = `${tag.date}|${slot}`

  return (
    <div
      role={imGitter ? 'cell' : undefined}
      className={[
        'essen-slot',
        ziehtUeber === key ? 'ist-ziel' : '',
        entry ? 'ist-belegt' : '',
        ausserplanmaessig ? 'ist-ausserplan' : '',
        tag.date === heute ? 'ist-heute' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => {
        e.preventDefault()
        setZiehtUeber(key)
      }}
      onDragLeave={() => setZiehtUeber((k) => (k === key ? null : k))}
      onDrop={(e) => void aufnehmen(e, tag.date, slot)}
    >
      {!imGitter && <p className="t-caption c-muted">{MEAL_SLOT_LABEL[slot]}</p>}
      {entry ? (
        <div
          className="essen-eintrag"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-thealotta-slot', key)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          {/*
            In der Zelle steht der Name und sonst nichts.

            Vorher trugen die Plätze zusätzlich eine Unterzeile (Dauer, Begründung, Meinung)
            und bis zu drei Chips. Bei vierzehn belegten Plätzen waren das vierzehnmal fünf
            Angaben in 150 px breiten Spalten – ein Wochenplan, den man lesen musste, statt
            ihn zu überblicken. Was ein Gericht ausmacht, steht im Bogen hinter dem Namen.
          */}
          <button
            type="button"
            className="text essen-eintrag-knopf"
            disabled={busy}
            aria-label={`${entry.dishName} am ${WOCHENTAG[tag.weekday]} – ändern`}
            onClick={() => onOpen({ date: tag.date, slot, entry })}
          >
            <p className="t-sub">{entry.dishName}</p>
          </button>
          <div className="row-actions">
            {/*
              Zwei Knöpfe, an jedem Gericht dieselben: würfeln und wegnehmen. Bisher stand
              der Würfel nur an Vorschlägen – wer von Hand geplant hatte, musste erst den
              Bogen öffnen, um etwas anderes zu bekommen. Beim Planen einer Woche ist genau
              das die häufigste Bewegung.
            */}
            <Button
              variant="ghost"
              size="sm"
              icon="sparkle"
              aria-label={`Anderes Gericht für ${WOCHENTAG[tag.weekday]} ${MEAL_SLOT_LABEL[slot]}`}
              title="Anderes Gericht"
              disabled={busy}
              onClick={() => void neuWuerfeln(tag.date, slot)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              aria-label={`${entry.dishName} am ${WOCHENTAG[tag.weekday]} aus dem Plan nehmen`}
              title="Aus dem Plan nehmen"
              disabled={busy}
              onClick={() => void entfernen(tag.date, slot, entry)}
            />
          </div>
        </div>
      ) : (
        /*
          Der leere Platz ist zugleich Ziel und Knopf.

          Wer ein Gericht in der Liste ausgewählt hat, plant es mit einem Klick hier ein – das
          ist der Weg ohne Maus und ohne Ziehen (§14). Ohne Auswahl öffnet derselbe Knopf die
          Liste.

          Darunter steht dieselbe Knopfreihe wie an einem belegten Platz, nur mit einem Knopf:
          würfeln. Zwei Gründe. Erstens ist „schlag mir hier etwas vor" an einem leeren Platz
          die naheliegendste Handlung überhaupt – bisher ging sie nur über „Freie Woche füllen"
          für **alle** Plätze auf einmal. Zweitens sitzt die Reihe dadurch in jeder Zelle des
          Gitters an derselben Stelle, ob belegt oder nicht.
        */
        <div className="essen-eintrag">
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            block
            className="text"
            disabled={busy}
            /*
              Im Gitter ist wenig Platz, also trägt der sichtbare Text nur den Namen des
              gewählten Gerichts. Was der Klick tut, steht in der Beschriftung – wer die Seite
              vorlesen lässt, hat die Spalte nicht gesehen, in der der Knopf steht.
            */
            aria-label={
              gewaehlt
                ? `„${gewaehlt.name}" hier einplanen: ${WOCHENTAG[tag.weekday]}, ${MEAL_SLOT_LABEL[slot]}`
                : `${MEAL_SLOT_LABEL[slot]} am ${WOCHENTAG[tag.weekday]} planen`
            }
            onClick={() => {
              if (gewaehlt) return void einplanen(tag.date, slot, gewaehlt.id)
              setWahl({ date: tag.date, slot })
            }}
          >
            {imGitter ? '' : gewaehlt ? `„${gewaehlt.name}"` : ausserplanmaessig ? MEAL_SLOT_LABEL[slot] : 'Gericht wählen'}
          </Button>
          {/*
            Nicht am außerplanmäßigen Platz.

            Ein Mittagsplatz an einem Tag, für den der Haushalt kein Mittagessen eingestellt
            hat, wird von „Woche füllen" nicht bedient – gemessen antwortete der Knopf dort
            „Hier ist schon alles geplant" und tat nichts. Ein Knopf, der nichts bewirkt und
            dabei etwas Falsches meldet, ist schlechter als keiner. Diese Plätze tragen
            deshalb weiterhin nur das Pluszeichen, so wie sie auch keinen Rahmen tragen (§12).
          */}
          {!ausserplanmaessig && (
            <div className="row-actions">
              <Button
                variant="ghost"
                size="sm"
                icon="sparkle"
                aria-label={`Gericht für ${WOCHENTAG[tag.weekday]} ${MEAL_SLOT_LABEL[slot]} vorschlagen`}
                title="Gericht vorschlagen"
                disabled={busy}
                onClick={() => void vorschlagen(tag.date, slot)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Suche und Tagfilter – dieselben Filter gelten für „Woche füllen" (§45). */
function DishFilter({
  suche,
  setSuche,
  filterTags,
  setFilterTags,
  ausTags,
  setAusTags,
  dishes,
}: {
  suche: string
  setSuche: (v: string) => void
  filterTags: string[]
  setFilterTags: (v: string[]) => void
  ausTags: string[]
  setAusTags: (v: string[]) => void
  dishes: Dish[]
}) {
  /*
    Nur Tags anbieten, die auch vergeben sind – eine Vorschlagsliste ist kein Filterwerk.

    Sortiert nach Häufigkeit, nicht alphabetisch. Alphabetisch stünde „alle mögen es" vor
    „vegetarisch", und wer nur die ersten zwölf sieht, hielte „vegetarisch" für nicht
    vorhanden. Was oft vergeben ist, filtert man auch oft.
  */
  const vorhanden = useMemo(() => {
    const zaehler = new Map<string, number>()
    for (const d of dishes) for (const t of d.tags) zaehler.set(t, (zaehler.get(t) ?? 0) + 1)
    for (const t of [...filterTags, ...ausTags]) if (!zaehler.has(t)) zaehler.set(t, 0)
    return [...zaehler.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
      .map(([t]) => t)
  }, [dishes, filterTags, ausTags])
  /*
    Die Tagliste ist zugeklappt, bis jemand filtern will.

    Zwölf Chips dauerhaft neben einem Suchfeld sind zwölf Ziele, an denen der Blick hängen
    bleibt, bevor er das Feld findet – und Suchen ist der häufigere Weg. Wer filtern will,
    tut das absichtlich; ein Klick dafür ist kein Verlust (gemessen: docs/48).
  */
  const [offen, setOffen] = useState(filterTags.length + ausTags.length > 0)

  return (
    <div className="essen-filter">
      <Field label="Gericht suchen">
        {({ id }) => (
          <Input
            id={id}
            type="search"
            value={suche}
            placeholder="Name, Tag oder Zutat"
            onChange={(e) => setSuche(e.target.value)}
          />
        )}
      </Field>
      {vorhanden.length > 0 && (
        <Toggle pressed={offen} onToggle={() => setOffen(!offen)} role="checkbox">
          Nach Tags filtern{filterTags.length + ausTags.length > 0 ? ` (${filterTags.length + ausTags.length})` : ''}
        </Toggle>
      )}
      {offen && vorhanden.length > 0 && (
        <Chips>
          {vorhanden.map((t) => {
            /*
              Ein Chip, drei Zustände (§27): egal → nur das → nie das → egal.

              Zwei getrennte Listen „fordern" und „ausschließen" wären zwei Bedienelemente je
              Tag und eine Frage mehr („in welcher Liste stand das nochmal?"). Ein Tag ist
              eins von beidem, nie beides – also ein Chip, der weiterschaltet.
            */
            const gleich = (x: string) => x.toLowerCase() === t.toLowerCase()
            const an = filterTags.some(gleich)
            const aus = ausTags.some(gleich)
            return (
              <button
                key={t}
                type="button"
                className={`chip${an ? ' chip-accent' : ''}${aus ? ' chip-critical' : ''}`}
                aria-pressed={an || aus}
                aria-label={an ? `nur ${t}` : aus ? `${t} ausschließen` : t}
                onClick={() => {
                  if (an) {
                    setFilterTags(filterTags.filter((x) => !gleich(x)))
                    setAusTags([...ausTags, t])
                  } else if (aus) {
                    setAusTags(ausTags.filter((x) => !gleich(x)))
                  } else {
                    setFilterTags([...filterTags, t])
                  }
                }}
              >
                {aus ? `ohne ${t}` : t}
              </button>
            )
          })}
        </Chips>
      )}
    </div>
  )
}

/** Ein Gericht für einen bestimmten Platz wählen – der Weg ohne Ziehen (§14). */
function PickDishSheet({
  dishes,
  heute,
  onClose,
  onPick,
}: {
  dishes: Dish[]
  heute: string
  onClose: () => void
  onPick: (dish: Dish) => Promise<void>
}) {
  const [suche, setSuche] = useState('')
  const treffer = dishes.filter((d) => d.name.toLowerCase().includes(suche.trim().toLowerCase()))

  return (
    <Sheet open onClose={onClose} title="Gericht einplanen" description="Was soll es an diesem Tag geben?">
      <Field label="Suchen">
        {({ id }) => (
          <Input id={id} type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name" />
        )}
      </Field>
      {treffer.length === 0 ? (
        <EmptyLine text="Kein Gericht passt zur Suche." />
      ) : (
        <RowList>
          {treffer.slice(0, 40).map((d) => (
            <li key={d.id}>
              <Row
                title={d.name}
                subtitle={[zeigeAbstand(d.lastPlannedOn, heute), zeigeZeit(d.totalMinutes)].filter(Boolean).join(' · ')}
                onClick={() => void onPick(d)}
              />
            </li>
          ))}
        </RowList>
      )}
    </Sheet>
  )
}

/* ══ Die Sammlung ═════════════════════════════════════════════════════ */

const SORTIERUNGEN: { key: string; label: string }[] = [
  { key: 'name', label: 'Nach Namen' },
  { key: 'favorit', label: 'Favoriten zuerst' },
  { key: 'long_ago', label: 'Lange nicht gegessen' },
  { key: 'recent', label: 'Zuletzt gegessen' },
  { key: 'often', label: 'Am häufigsten' },
]

/**
 * Was als Favorit gilt (§7).
 *
 * Kein eigenes Sternchen neben der Bewertung: Zwei Arten, dasselbe zu sagen, laufen
 * auseinander, und §9 warnt ausdrücklich vor unnötiger Bewertungsarbeit. Favorit ist, was
 * mindestens einer sehr mag und niemand ablehnt – das ist genau das Gericht, das man sucht,
 * wenn man „etwas Gutes" will.
 */
export function istFavorit(dish: Dish): boolean {
  if (dish.ratings.length === 0) return false
  if (dish.ratings.some((r) => r.rating === 'rather_not')) return false
  return dish.ratings.some((r) => r.rating === 'love')
}

function DishCollection({
  dishes,
  heute,
  suche,
  setSuche,
  filterTags,
  setFilterTags,
  ausTags,
  setAusTags,
  onNeu,
  onBearbeiten,
}: {
  dishes: Dish[]
  heute: string
  suche: string
  setSuche: (v: string) => void
  filterTags: string[]
  setFilterTags: (v: string[]) => void
  ausTags: string[]
  setAusTags: (v: string[]) => void
  onNeu: () => void
  onBearbeiten: (dish: Dish) => void
}) {
  const [sort, setSort] = useState('name')

  const sortiert = useMemo(() => {
    const kopie = [...dishes]
    switch (sort) {
      case 'favorit':
        /* Favoriten zuerst, darin alphabetisch – eine Rangliste unter Favoriten wäre erfunden. */
        return kopie.sort(
          (a, b) => Number(istFavorit(b)) - Number(istFavorit(a)) || a.name.localeCompare(b.name, 'de'),
        )
      case 'recent':
        return kopie.sort((a, b) => (b.lastPlannedOn ?? '').localeCompare(a.lastPlannedOn ?? ''))
      case 'often':
        return kopie.sort((a, b) => b.plannedCount - a.plannedCount || a.name.localeCompare(b.name, 'de'))
      case 'long_ago':
        /* „Noch nie" zählt als am längsten her – genau diese Gerichte sucht man hier. */
        return kopie.sort((a, b) => (a.lastPlannedOn ?? '').localeCompare(b.lastPlannedOn ?? ''))
      default:
        return kopie.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    }
  }, [dishes, sort])

  return (
    <Section
      title="Gerichte"
      hint="Euer Gedächtnis. Ein Name genügt – alles Weitere könnt ihr später ergänzen."
      icon="meal"
      count={dishes.length}
      action={
        <Actions spaced={false}>
          <Select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTIERUNGEN.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" icon="plus" onClick={onNeu}>
            Gericht
          </Button>
        </Actions>
      }
    >
      <Panel>
        <DishFilter
          suche={suche}
          setSuche={setSuche}
          filterTags={filterTags}
          setFilterTags={setFilterTags}
          ausTags={ausTags}
          setAusTags={setAusTags}
          dishes={dishes}
        />
      </Panel>

      {sortiert.length === 0 ? (
        <EmptyState
          icon="meal"
          title="Noch kein Gericht"
          description={
            'Fangt mit dem an, was ihr sowieso kocht – der Name genügt. „Spaghetti Bolognese", ' +
            '„Brotzeit", „Pizza bestellen". Zutaten und Tags könnt ihr später ergänzen.'
          }
          action={
            <Button variant="secondary" icon="plus" onClick={onNeu}>
              Erstes Gericht
            </Button>
          }
        />
      ) : (
        <Panel>
          {sortiert.map((d) => (
            <div className="setting-row" key={d.id}>
              <div className="text">
                <p className="t-sub">
                  {d.name}
                  {istFavorit(d) && <Chip tone="accent">Favorit</Chip>}
                </p>
                <p className="t-body-sm desc">
                  {[
                    `zuletzt ${zeigeAbstand(d.lastPlannedOn, heute)}`,
                    d.plannedCount > 0 ? `${d.plannedCount}×  geplant` : null,
                    zeigeZeit(d.totalMinutes),
                    /*
                      Auch die Lücke steht da. „Keine Zutaten" ist kein Vorwurf, sondern die
                      Antwort auf „warum steht das nicht auf meiner Einkaufsliste?" – und der
                      Hinweis, dass man sie hinterlegen kann.
                    */
                    d.ingredients.length > 0 ? `${d.ingredients.length} Zutaten` : 'keine Zutaten',
                    /* Nur die Abweichung steht da – „mittags und abends" wäre bei fast allen Rauschen. */
                    d.suitableFor === 'both' ? null : MEAL_SUITABILITY_LABEL[d.suitableFor],
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {meinung(d.ratings) && <p className="t-body-sm c-muted">{meinung(d.ratings)}</p>}
                {d.tags.length > 0 && (
                  <Chips>
                    {d.tags.map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </Chips>
                )}
              </div>
              {/*
                Zwei Ziele je Zeile, nicht fünf.

                Bewerten bleibt draußen: Es ist die eine Sache, die man beim Durchsehen
                nebenbei tut, und §9 sagt ausdrücklich, dass Bewerten keine Arbeit sein soll.
                Ändern, Wegräumen und Löschen stehen im Bogen – dorthin führt der Name.
                Gemessen: Mit fünf Zielen je Zeile lag die Sammlung bei 67 Bedienelementen
                auf einem Bildschirm, das Budget liegt bei 40 (`cognitive-load.spec.ts`).
              */}
              {/*
                Ein Ziel je Zeile.

                Auch das Bewerten steht im Bogen: §9 sagt ausdrücklich, dass Bewerten keine
                Arbeit sein soll – ein Auswahlfeld an jeder Zeile einer Sammlung von
                zweihundert Gerichten ist genau das. Wie der Haushalt zu einem Gericht steht,
                steht als Satz daneben; ändern kann man es dort, wo man das Gericht ansieht.
              */}
              <div className="row-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  icon="chevronRight"
                  aria-label={`„${d.name}" öffnen`}
                  title="Öffnen"
                  onClick={() => onBearbeiten(d)}
                />
              </div>
            </div>
          ))}
        </Panel>
      )}
    </Section>
  )
}

/**
 * Die eigene Stimme zu einem Gericht (§9).
 *
 * Vier Worte statt fünf Sternen. Der Unterschied zwischen drei und vier Sternen bei einem
 * Kartoffelauflauf ist nicht bestimmbar – ihn zu erfragen wäre Arbeit ohne Ertrag (§26).
 */
function RatingControl({
  id,
  householdId,
  dish,
  onChanged,
}: {
  id?: string
  householdId: string
  dish: Dish
  onChanged: () => Promise<void>
}) {
  const { household } = useSession()
  /* Die eigene Stimme – jede Person bewertet nur für sich (§10). */
  const meins = dish.ratings.find((r) => r.membershipId === household?.membershipId)?.rating ?? ''

  return (
    <Select
      id={id}
      aria-label={`Wie magst du „${dish.name}"?`}
      value={meins}
      onChange={async (e) => {
        const wert = e.target.value
        await endpoints.rateDish(householdId, dish.id, wert === '' ? null : (wert as DishRating))
        await onChanged()
      }}
    >
      <option value="">nicht bewertet</option>
      {DISH_RATINGS.map((r) => (
        <option key={r} value={r}>
          {DISH_RATING_LABEL[r]}
        </option>
      ))}
    </Select>
  )
}

/* ══ Der Bogen für ein Gericht ════════════════════════════════════════ */

/**
 * Ein Gericht anlegen oder ändern (§40).
 *
 * Der schnellste Weg ist der kürzeste: Name eintragen, speichern. Alles Weitere liegt hinter
 * einem Aufklapper – sichtbar, dass es da ist, aber nicht im Weg.
 */
function DishSheet({
  householdId,
  dish,
  onClose,
  onDone,
}: {
  householdId: string
  dish: Dish | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState(dish?.name ?? '')
  const [tags, setTags] = useState<string[]>(dish?.tags ?? [])
  const [tagEingabe, setTagEingabe] = useState('')
  const [servings, setServings] = useState(dish?.servings ? String(dish.servings) : '')
  const [prep, setPrep] = useState(dish?.prepMinutes ? String(dish.prepMinutes) : '')
  const [cook, setCook] = useState(dish?.cookMinutes ? String(dish.cookMinutes) : '')
  const [steps, setSteps] = useState(dish?.steps ?? '')
  const [notes, setNotes] = useState(dish?.notes ?? '')
  const [quelle, setQuelle] = useState(dish?.sourceUrl ?? '')
  const [bild, setBild] = useState(dish?.imageUrl ?? '')
  const [ausgeschlossen, setAusgeschlossen] = useState(dish?.excludedFromSuggestions ?? false)
  const [passtZu, setPasstZu] = useState<MealSuitability>(dish?.suitableFor ?? 'both')
  const [zutaten, setZutaten] = useState<{ name: string; quantity: string; unit: string }[]>(
    dish?.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity === null ? '' : String(i.quantity),
      unit: i.unit ?? '',
    })) ?? [],
  )
  /*
    Der Aufklapper steht offen, wenn schon etwas darin liegt.

    Zutaten sind Inhalt, keine Einstellung: Wer ein Gericht mit sechs Zutaten öffnet und sie
    nicht sieht, glaubt, es habe keine. Und wer sie das erste Mal sucht, findet den Aufklapper
    nur, wenn er wie einer aussieht – als Chip getarnt wurde er übersehen.
  */
  const hatRezept = Boolean(
    dish &&
      (dish.ingredients.length > 0 ||
        dish.totalMinutes !== null ||
        dish.steps ||
        dish.servings ||
        dish.imageUrl),
  )
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const tagHinzu = (t: string) => {
    const sauber = t.trim()
    if (!sauber || tags.some((x) => x.toLowerCase() === sauber.toLowerCase())) return
    setTags([...tags, sauber])
    setTagEingabe('')
  }

  const speichern = async () => {
    setBusy(true)
    setFehler(null)
    try {
      const zahl = (v: string): number | null => (v.trim() === '' ? null : Number(v))
      const body: DishInput = {
        name: name.trim(),
        servings: zahl(servings),
        prepMinutes: zahl(prep),
        cookMinutes: zahl(cook),
        steps: steps.trim() || null,
        notes: notes.trim() || null,
        sourceUrl: quelle.trim() || null,
        imageUrl: bild.trim() || null,
        excludedFromSuggestions: ausgeschlossen,
        suitableFor: passtZu,
        tags,
        ingredients: zutaten
          .filter((z) => z.name.trim())
          .map((z) => ({
            name: z.name.trim(),
            quantity: z.quantity.trim() === '' ? null : Number(z.quantity),
            unit: z.unit.trim() || null,
          })),
      }
      if (dish) await endpoints.updateDish(householdId, dish.id, body)
      else await endpoints.createDish(householdId, body)
      await onDone()
    } catch (err) {
      setFehler(err instanceof ApiError ? err.message : 'Das hat gerade nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={dish ? 'Gericht ändern' : 'Neues Gericht'}
      description="Der Name genügt. Zutaten, Zeiten und Tags könnt ihr jederzeit später ergänzen."
    >
      <Field label="Wie heißt das Gericht?">
        {({ id }) => (
          <Input
            id={id}
            value={name}
            autoFocus
            placeholder="z. B. Kartoffelauflauf"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>

      {/*
        Wofür das Gericht passt – oben, nicht im Aufklapper.

        Es ist die einzige Angabe außer dem Namen, die **steuert** statt zu beschreiben: Ein
        Gericht, das nur mittags passt, wird abends nicht vorgeschlagen. Wer sie erst nach dem
        Aufklappen fände, bekäme Pfannkuchen zum Abendessen und wüsste nicht, warum.
      */}
      <Field label="Wofür passt das?" hint="Steuert, wann Thealotta es vorschlägt. Von Hand geht immer beides.">
        {({ id }) => (
          <Select
            id={id}
            value={passtZu}
            onChange={(e) => setPasstZu(e.target.value as MealSuitability)}
          >
            {MEAL_SUITABILITY.map((w) => (
              <option key={w} value={w}>
                {MEAL_SUITABILITY_LABEL[w]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {dish && (
        <Field label="Wie magst du das?" hint="Deine Stimme. Die anderen bewerten für sich (§10).">
          {({ id }) => <RatingControl id={id} householdId={householdId} dish={dish} onChanged={onDone} />}
        </Field>
      )}

      <Field label="Tags" hint="Frei wählbar. Sie helfen beim Finden und beim Vorschlagen.">
        {({ id }) => (
          <>
            <div className="field-row">
              <Input
                id={id}
                value={tagEingabe}
                list="thealotta-tag-vorschlaege"
                placeholder="z. B. schnell"
                onChange={(e) => setTagEingabe(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    tagHinzu(tagEingabe)
                  }
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => tagHinzu(tagEingabe)}>
                Hinzufügen
              </Button>
            </div>
            <datalist id="thealotta-tag-vorschlaege">
              {ALL_TAG_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {tags.length > 0 && (
              <Chips>
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="chip chip-accent"
                    aria-label={`Tag „${t}" entfernen`}
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    {t} ×
                  </button>
                ))}
              </Chips>
            )}
          </>
        )}
      </Field>

      {/*
        Alles Weitere hinter einem Aufklapper. Sichtbar, dass es da ist – aber der schnellste
        Weg bleibt: Name eintragen, speichern (§40).
      */}
      <Disclosure summary="Zutaten, Zeiten und Zubereitung" open={hatRezept}>
        <p className="t-body-sm c-secondary">
          Die Zutaten sind die Grundlage der Einkaufsliste: Was hier steht, taucht dort auf,
          sobald das Gericht in einer Woche geplant ist.
        </p>
        <>
          <Divider />
          <div className="field-row">
            <Field label="Portionen">
              {({ id }) => (
                <Input id={id} type="number" min={1} value={servings} onChange={(e) => setServings(e.target.value)} />
              )}
            </Field>
            <Field label="Vorbereitung (Min.)">
              {({ id }) => (
                <Input id={id} type="number" min={0} value={prep} onChange={(e) => setPrep(e.target.value)} />
              )}
            </Field>
            <Field label="Kochen (Min.)">
              {({ id }) => (
                <Input id={id} type="number" min={0} value={cook} onChange={(e) => setCook(e.target.value)} />
              )}
            </Field>
          </div>

          <Field label="Zutaten" hint="Grundlage der Einkaufsliste. Menge und Einheit dürfen fehlen.">
            {() => (
              <>
                {zutaten.map((z, i) => (
                  <div className="field-row" key={i}>
                    <Input
                      value={z.quantity}
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Menge für Zutat ${i + 1}`}
                      placeholder="Menge"
                      onChange={(e) =>
                        setZutaten(zutaten.map((x, j) => (i === j ? { ...x, quantity: e.target.value } : x)))
                      }
                    />
                    <Input
                      value={z.unit}
                      list="thealotta-einheiten"
                      aria-label={`Einheit für Zutat ${i + 1}`}
                      placeholder="Einheit"
                      onChange={(e) => setZutaten(zutaten.map((x, j) => (i === j ? { ...x, unit: e.target.value } : x)))}
                    />
                    <Input
                      value={z.name}
                      aria-label={`Name der Zutat ${i + 1}`}
                      placeholder="Zutat"
                      onChange={(e) => setZutaten(zutaten.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      aria-label={`Zutat ${i + 1} entfernen`}
                      onClick={() => setZutaten(zutaten.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
                <datalist id="thealotta-einheiten">
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="plus"
                  onClick={() => setZutaten([...zutaten, { name: '', quantity: '', unit: '' }])}
                >
                  Zutat
                </Button>
              </>
            )}
          </Field>

          <Field label="Zubereitung">
            {({ id }) => (
              <Textarea markdown id={id} rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
            )}
          </Field>
          <Field label="Notizen">
            {({ id }) => <Textarea markdown id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <Field label="Link zur Quelle">
            {({ id }) => (
              <Input id={id} type="url" value={quelle} placeholder="https://…" onChange={(e) => setQuelle(e.target.value)} />
            )}
          </Field>

          {/*
            Ein Bild als Adresse, nicht als Upload.

            Ein Uploader brächte Speicher, Größenbegrenzungen, Löschfristen und eine
            Sichtbarkeitsfrage mit – für ein Bild, das in der Regel ohnehin auf der Seite
            liegt, von der das Rezept stammt. Wer wirklich eigene Fotos will, bekommt sie in
            einem eigenen Vorhaben und nicht nebenbei.
          */}
          <Field label="Bild (Adresse)" hint="Optional. Erscheint im Bogen, damit man das Gericht wiedererkennt.">
            {({ id }) => (
              <Input id={id} type="url" value={bild} placeholder="https://…" onChange={(e) => setBild(e.target.value)} />
            )}
          </Field>
          {bild.trim() && (
            <img className="gericht-bild" src={bild} alt="" loading="lazy" />
          )}

          {/* §29: bleibt in der Sammlung, kommt nur nicht mehr von selbst auf den Tisch. */}
          <Toggle pressed={ausgeschlossen} onToggle={() => setAusgeschlossen(!ausgeschlossen)} role="checkbox">
            Nicht automatisch vorschlagen
          </Toggle>
          <p className="t-body-sm c-muted">
            Das Gericht bleibt in der Sammlung und lässt sich weiter von Hand einplanen.
          </p>
        </>
      </Disclosure>

      {fehler && <Notice tone="critical" title="Das ging nicht">{fehler}</Notice>}

      {/*
        Wegräumen und Löschen stehen hier, nicht in der Liste.

        In der Liste waren sie zwei Knöpfe an jeder Zeile – bei 14 Gerichten 28 Ziele für
        Handlungen, die man zweimal im Jahr braucht. Hier sind sie einen Klick entfernt und
        stehen dort, wo man das Gericht ohnehin ansieht.
      */}
      {dish && (
        <>
          <Divider />
          <div className="setting-row">
            <div className="text">
              <p className="t-sub">{dish.archivedAt ? 'Wieder in die Sammlung' : 'Wegräumen'}</p>
              <p className="t-body-sm desc">
                {dish.archivedAt
                  ? 'Das Gericht erscheint wieder in Sammlung und Vorschlägen.'
                  : 'Verschwindet aus Sammlung und Vorschlägen. Vergangene Wochen bleiben, wie sie waren.'}
              </p>
            </div>
            <div className="row-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={dish.archivedAt ? 'check' : 'archive'}
                disabled={busy}
                onClick={async () => {
                  await endpoints.archiveDish(householdId, dish.id, !dish.archivedAt)
                  await onDone()
                }}
              >
                {dish.archivedAt ? 'Zurückholen' : 'Wegräumen'}
              </Button>
            </div>
          </div>
          {/*
            Löschen nur, solange das Gericht nie auf dem Tisch stand. Der Server prüft
            dasselbe genauer; die Bedingung hier verhindert einen Knopf, der abgelehnt wird.
          */}
          {dish.plannedCount === 0 && (
            <div className="setting-row">
              <div className="text">
                <p className="t-sub">Löschen</p>
                <p className="t-body-sm desc">Endgültig. Möglich, weil es noch nie auf dem Plan stand.</p>
              </div>
              <div className="row-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await endpoints.deleteDish(householdId, dish.id)
                      await onDone()
                    } catch (err) {
                      setFehler(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
                    }
                  }}
                >
                  Löschen
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void speichern()}>
          Speichern
        </Button>
      </Actions>
    </Sheet>
  )
}

/* ══ Einkaufsliste ════════════════════════════════════════════════════ */

function ShoppingView({
  householdId,
  weekStart,
  onChanged,
}: {
  householdId: string
  weekStart: string
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [neu, setNeu] = useState('')
  const [bearbeiten, setBearbeiten] = useState<ShoppingItem | null>(null)

  const liste = useAsync(() => endpoints.shoppingList(householdId, weekStart), [householdId, weekStart])
  const bring = useAsync(() => endpoints.bringStatus(householdId), [householdId])
  const bringBereit = Boolean(bring.data?.verbindung?.listUuid)

  const speichern = async (item: Partial<ShoppingItem> & { id?: string; name?: string }) => {
    if (!liste.data?.id) return
    setBusy(true)
    try {
      await endpoints.saveShoppingItem(householdId, liste.data.id, item)
      await liste.reload()
    } finally {
      setBusy(false)
    }
  }

  const offen = (liste.data?.items ?? []).filter((i) => !i.checked && !i.haveAtHome)
  const erledigt = (liste.data?.items ?? []).filter((i) => i.checked || i.haveAtHome)

  return (
    <Section
      title="Einkaufsliste"
      hint={`Für die Woche vom ${zeigeDatum(weekStart)}. Aus den Zutaten der geplanten Gerichte.`}
      icon="inbox"
      action={
        <Button
          variant="primary"
          icon="sparkle"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const ergebnis = await endpoints.buildShoppingList(householdId, weekStart)
              await liste.reload()
              await onChanged()
              toast.show(
                ergebnis.added === 0
                  ? 'Nichts Neues – die Liste war schon vollständig.'
                  : `${ergebnis.added} Zutaten übernommen.`,
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          Aus dem Wochenplan erzeugen
        </Button>
      }
    >
      {liste.loading ? (
        <SkeletonList count={3} />
      ) : (liste.data?.items ?? []).length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Noch keine Liste"
          description={
            'Die Zeilen entstehen aus den Zutaten der geplanten Gerichte. Hinterlegt sind sie am ' +
            'Gericht selbst – unter „Zutaten, Zeiten und Zubereitung". Zutaten, die in mehreren ' +
            'Gerichten vorkommen, werden zusammengezählt.'
          }
          action={
            <Link className="linklike" to="/essen/sammlung">
              Zur Gerichtesammlung
            </Link>
          }
        />
      ) : (
        <>
          <Panel>
            {offen.length === 0 ? (
              <EmptyLine text="Alles abgehakt." />
            ) : (
              offen.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  disabled={busy}
                  onSave={speichern}
                  onOpen={() => setBearbeiten(item)}
                />
              ))
            )}
            <Divider />
            <div className="field-row">
              <Input
                value={neu}
                placeholder="Noch etwas dazu – z. B. Küchenrolle"
                aria-label="Eintrag hinzufügen"
                onChange={(e) => setNeu(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && neu.trim()) {
                    e.preventDefault()
                    await speichern({ name: neu.trim() })
                    setNeu('')
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                icon="plus"
                disabled={!neu.trim()}
                onClick={async () => {
                  await speichern({ name: neu.trim() })
                  setNeu('')
                }}
              >
                Dazu
              </Button>
            </div>
          </Panel>

          {erledigt.length > 0 && (
            <Panel>
              <p className="t-caption c-muted">Erledigt oder schon da</p>
              {erledigt.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  disabled={busy}
                  onSave={speichern}
                  onOpen={() => setBearbeiten(item)}
                />
              ))}
            </Panel>
          )}

          {/*
            §37: Der Weg nach Bring. Bring hat keine offizielle Schnittstelle – deshalb steht
            der Knopf nur da, wenn eine Liste verbunden ist, und die Antwort zählt, was
            durchkam. Ein Knopf, der erst beim Drücken sagt „nichts verbunden", wäre eine
            Sackgasse mit Ankündigung.
          */}
          {bearbeiten && liste.data?.id && (
            <ShoppingItemSheet
              householdId={householdId}
              listId={liste.data.id}
              item={bearbeiten}
              onClose={() => setBearbeiten(null)}
              onChanged={liste.reload}
            />
          )}

          <Actions>
            {bringBereit ? (
              <Button
                variant="secondary"
                icon="inbox"
                disabled={busy || offen.length === 0}
                onClick={async () => {
                  if (!liste.data?.id) return
                  setBusy(true)
                  try {
                    const ergebnis = await endpoints.pushShoppingList(householdId, liste.data.id)
                    await liste.reload()
                    toast.show(
                      ergebnis.failed > 0
                        ? `${ergebnis.pushed} übertragen, ${ergebnis.failed} nicht.`
                        : `${ergebnis.pushed} Artikel auf der Bring-Liste.`,
                    )
                  } catch (err) {
                    toast.show(err instanceof ApiError ? err.message : 'Bring hat gerade nicht geantwortet.')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Offenes an Bring! senden
              </Button>
            ) : (
              <Link className="linklike" to="/einstellungen/verbindungen">
                Bring! verbinden, um die Liste direkt zu übertragen
              </Link>
            )}
          </Actions>
        </>
      )}
    </Section>
  )
}

/**
 * Eine Zeile der Einkaufsliste ändern (§36).
 *
 * Menge, Einheit, Notiz, „haben wir schon", entfernen. Alles davon macht die Zeile
 * **berührt**: Beim nächsten „aus dem Wochenplan erzeugen" bleibt sie stehen, statt
 * überschrieben zu werden – sonst verlöre der zweite Klick genau diese Arbeit.
 *
 * Und in die andere Richtung wirkt hier nichts: Eine geänderte Menge auf der Liste ändert
 * nicht das Rezept. Was am Sonntag doppelt gebraucht wird, gilt nicht für immer.
 */
function ShoppingItemSheet({
  householdId,
  listId,
  item,
  onClose,
  onChanged,
}: {
  householdId: string
  listId: string
  item: ShoppingItem
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const [name, setName] = useState(item.name)
  const [menge, setMenge] = useState(item.quantity === null ? '' : String(item.quantity))
  const [einheit, setEinheit] = useState(item.unit ?? '')
  const [notiz, setNotiz] = useState(item.note ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description="Änderungen gelten für diese Liste – das Rezept bleibt, wie es ist."
    >
      <Field label="Was?">
        {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <div className="field-row">
        <Field label="Menge">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={0}
              step="any"
              value={menge}
              onChange={(e) => setMenge(e.target.value)}
            />
          )}
        </Field>
        <Field label="Einheit">
          {({ id }) => (
            <Input id={id} value={einheit} list="thealotta-einheiten" onChange={(e) => setEinheit(e.target.value)} />
          )}
        </Field>
      </div>
      <datalist id="thealotta-einheiten">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <Field label="Notiz" hint="Zum Beispiel die Marke oder wo es steht.">
        {({ id }) => <Input id={id} value={notiz} onChange={(e) => setNotiz(e.target.value)} />}
      </Field>

      <Divider />

      <div className="setting-row">
        <div className="text">
          <p className="t-sub">{item.haveAtHome ? 'Haben wir schon' : 'Haben wir schon?'}</p>
          <p className="t-body-sm desc">
            {item.haveAtHome
              ? 'Steht nicht mehr auf der Kaufliste und geht nicht an Bring.'
              : 'Nimmt die Zeile aus dem Einkauf, ohne sie abzuhaken – gekauft ist etwas anderes als dagewesen.'}
          </p>
        </div>
        <div className="row-actions">
          <Button
            variant="secondary"
            size="sm"
            icon="archive"
            disabled={busy}
            onClick={async () => {
              await endpoints.saveShoppingItem(householdId, listId, { id: item.id, haveAtHome: !item.haveAtHome })
              await onChanged()
              onClose()
            }}
          >
            {item.haveAtHome ? 'Doch kaufen' : 'Haben wir schon'}
          </Button>
        </div>
      </div>

      <div className="setting-row">
        <div className="text">
          <p className="t-sub">Von der Liste nehmen</p>
          <p className="t-body-sm desc">
            {item.origin === 'dish'
              ? 'Stammt aus einem geplanten Gericht – beim nächsten Erzeugen käme die Zeile wieder.'
              : 'Selbst hinzugefügt.'}
          </p>
        </div>
        <div className="row-actions">
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            disabled={busy}
            onClick={async () => {
              await endpoints.deleteShoppingItem(householdId, listId, item.id)
              await onChanged()
              onClose()
            }}
          >
            Entfernen
          </Button>
        </div>
      </div>

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await endpoints.saveShoppingItem(householdId, listId, {
                id: item.id,
                name: name.trim(),
                quantity: menge.trim() === '' ? null : Number(menge),
                unit: einheit.trim() || null,
                note: notiz.trim() || null,
              })
              await onChanged()
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

function ShoppingRow({
  item,
  disabled,
  onSave,
  onOpen,
}: {
  item: ShoppingItem
  disabled: boolean
  onSave: (item: { id: string; checked?: boolean }) => Promise<void>
  onOpen: () => void
}) {
  const menge = item.quantity === null ? '' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
  return (
    /*
      Zwei Ziele je Zeile – und die Aufteilung folgt der Häufigkeit.

      Abhaken macht man im Laden zwanzigmal: dafür der Haken links, ein Griff. Menge ändern,
      Notiz, „haben wir schon", entfernen (§36) macht man einmal beim Durchsehen: dafür der
      Rest der Zeile, der den Bogen öffnet. Fünf Symbole je Zeile wären bei dreißig Posten
      hundertfünfzig Ziele.
    */
    <div className="setting-row einkauf-zeile">
      <Button
        variant="ghost"
        size="sm"
        icon="check"
        className={item.checked ? 'ist-abgehakt' : ''}
        aria-label={item.checked ? `„${item.name}" wieder offen` : `„${item.name}" abhaken`}
        aria-pressed={item.checked}
        title={item.checked ? 'Wieder offen' : 'Abhaken'}
        disabled={disabled}
        onClick={() => void onSave({ id: item.id, checked: !item.checked })}
      />
      <button
        type="button"
        className="text einkauf-haken"
        disabled={disabled}
        aria-label={`„${item.name}" ändern`}
        onClick={onOpen}
      >
        <p className={`t-sub${item.checked ? ' ist-erledigt' : ''}`}>
          {menge ? `${menge} ` : ''}
          {item.name}
        </p>
        {item.note && <p className="t-body-sm c-muted">{item.note}</p>}
        {item.haveAtHome && <p className="t-body-sm c-muted">Haben wir schon.</p>}
        {item.pushedAt && <p className="t-body-sm c-muted">An Bring gesendet.</p>}
      </button>
    </div>
  )
}

/* ══ Einstellungen ════════════════════════════════════════════════════ */

function MealSettingsView({ householdId, onChanged }: { householdId: string; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const settings = useAsync<MealSettings | null>(() => endpoints.mealSettings(householdId), [householdId])
  /*
    Die Tags, die es im Haushalt wirklich gibt – nicht alle denkbaren.

    Eine Regel „nur vegan" ist sinnlos, wenn kein Gericht so getaggt ist; sie machte den Tag
    beim Füllen still leer. Was man wählen kann, muss auch etwas treffen können.
  */
  const gerichte = useAsync(() => endpoints.dishes(householdId), [householdId])
  const tagAuswahl = useMemo(() => {
    const alle = new Set<string>()
    for (const d of gerichte.data?.items ?? []) for (const t of d.tags) alle.add(t)
    return [...alle].sort((a, b) => a.localeCompare(b, 'de'))
  }, [gerichte.data])

  if (settings.loading || !settings.data) return <SkeletonList count={3} />
  const s = settings.data

  const speichern = async (patch: Partial<Omit<MealSettings, 'dayRules'>>) => {
    await endpoints.updateMealSettings(householdId, patch)
    await settings.reload()
    await onChanged()
    toast.show('Gespeichert.')
  }

  return (
    <>
      <Section
        title="Wann es Mittagessen gibt"
        hint="An den übrigen Tagen zeigt der Plan nur das Abendessen – ein leerer Platz an fünf Tagen wäre die häufigste Zeile."
        icon="calendar"
      >
        <Panel>
          <Chips>
            {WOCHENTAG_KURZ.map((kurz, tag) => {
              const an = s.lunchWeekdays.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  className={`chip${an ? ' chip-accent' : ''}`}
                  aria-pressed={an}
                  aria-label={`Mittagessen am ${WOCHENTAG[tag]}`}
                  onClick={() =>
                    void speichern({
                      lunchWeekdays: an ? s.lunchWeekdays.filter((d) => d !== tag) : [...s.lunchWeekdays, tag],
                    })
                  }
                >
                  {kurz}
                </button>
              )
            })}
          </Chips>
          <p className="t-body-sm c-muted">
            Ein einzelnes Mittagessen an einem anderen Tag – Ferien, Feiertag, Homeoffice – tragt ihr
            einfach im Plan ein. Es bleibt dort stehen, auch wenn der Wochentag hier nicht angehakt ist.
          </p>
        </Panel>
      </Section>

      <Section title="Für wie viele" hint="Die Voreinstellung für die Mengen auf der Einkaufsliste." icon="family">
        <Panel>
          <Field label="Personen">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                defaultValue={s.defaultServings}
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (n > 0 && n !== s.defaultServings) void speichern({ defaultServings: n })
                }}
              />
            )}
          </Field>
        </Panel>
      </Section>

      <Section
        title="Wie vorgeschlagen wird"
        hint="Eine Absicht statt Regler. Was hier steht, ist die Voreinstellung – im Plan lässt sie sich je Klick ändern."
        icon="sparkle"
      >
        <Panel>
          {SUGGESTION_MODES.map((m) => (
            <div className="setting-row" key={m}>
              <div className="text">
                <p className="t-sub">{SUGGESTION_MODE_LABEL[m].titel}</p>
                <p className="t-body-sm desc">{SUGGESTION_MODE_LABEL[m].zweck}</p>
              </div>
              <div className="row-actions">
                {s.suggestionMode === m ? (
                  <Chip tone="accent">ausgewählt</Chip>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => void speichern({ suggestionMode: m })}>
                    Wählen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Panel>
      </Section>

      <Section
        title="Regeln für Wochentage"
        hint="Optional. Sie verschieben Vorschläge – von Hand geplant werden darf immer alles."
        icon="eye"
      >
        <Panel>
          {WOCHENTAG.map((name, tag) => {
            const regel = s.dayRules.find((r) => r.weekday === tag && r.slot === null)
            return (
              <div className="setting-row" key={tag}>
                <div className="text">
                  <p className="t-sub">{name}</p>
                  <p className="t-body-sm desc">
                    {[
                      regel?.maxMinutes ? `höchstens ${regel.maxMinutes} Minuten` : null,
                      regel && regel.requireTags.length > 0 ? `nur ${regel.requireTags.join(', ')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Keine Vorgabe'}
                  </p>
                </div>
                <div className="row-actions">
                  <Select
                    aria-label={`Zeitgrenze für ${name}`}
                    value={regel?.maxMinutes ? String(regel.maxMinutes) : ''}
                    onChange={async (e) => {
                      const wert = e.target.value
                      await endpoints.setDayRule(householdId, {
                        weekday: tag,
                        slot: null,
                        maxMinutes: wert === '' ? null : Number(wert),
                        requireTags: regel?.requireTags ?? [],
                        excludeTags: regel?.excludeTags ?? [],
                      })
                      await settings.reload()
                    }}
                  >
                    <option value="">ohne Zeitgrenze</option>
                    <option value="20">höchstens 20 Min.</option>
                    <option value="30">höchstens 30 Min.</option>
                    <option value="45">höchstens 45 Min.</option>
                    <option value="60">höchstens 60 Min.</option>
                  </Select>
                  {/*
                    §21: „Freitag vegetarisch", „Sonntag Familienessen".

                    Ein Auswahlfeld mit den Tags, die im Haushalt tatsächlich vergeben sind –
                    eine Liste aller denkbaren Tags wäre ein Katalog, den niemand durchsieht.
                    Genau ein Tag je Tag: „nur vegetarisch **und** nur schnell" ist eine
                    Verschärfung, die man beim Füllen ohnehin über die Filter bekommt.
                  */}
                  <Select
                    aria-label={`Nur bestimmte Gerichte am ${name}`}
                    value={regel?.requireTags[0] ?? ''}
                    onChange={async (e) => {
                      const wert = e.target.value
                      await endpoints.setDayRule(householdId, {
                        weekday: tag,
                        slot: null,
                        maxMinutes: regel?.maxMinutes ?? null,
                        requireTags: wert === '' ? [] : [wert],
                        excludeTags: regel?.excludeTags ?? [],
                      })
                      await settings.reload()
                    }}
                  >
                    <option value="">alle Gerichte</option>
                    {tagAuswahl.map((t) => (
                      <option key={t} value={t}>
                        nur {t}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )
          })}
        </Panel>
      </Section>

      <Notice tone="quiet" title="Warum das hier steht">
        Ein Haushalt kocht anders als der nächste. Was hier eingestellt ist, verschiebt nur, was Thealotta
        von selbst vorschlägt – nie, was ihr selbst plant. Eine Vorgabe, die sich nicht übergehen
        lässt, wäre keine Hilfe, sondern eine zweite Meinung am Herd.
      </Notice>
    </>
  )
}

/** Für die Vorschlagsgruppen: die Tags in ihren Gruppen – genutzt in der Hilfe. */
export const TAG_GRUPPEN = TAG_SUGGESTIONS

/** Für Familienseite und Jetzt: die Anzeige eines geplanten Essens (§38, §39). */
export function MealLine({
  item,
  heute,
}: {
  item: { date: string; slot: string; dishName: string; totalMinutes: number | null }
  heute: string
}) {
  const wann = item.date === heute ? 'Heute' : item.date === tagePlus(heute, 1) ? 'Morgen' : zeigeDatum(item.date)
  return (
    <Row
      lead={<Icon name="meal" />}
      title={item.dishName}
      subtitle={[`${wann} ${MEAL_SLOT_LABEL[item.slot as MealSlot]}`, zeigeZeit(item.totalMinutes)]
        .filter(Boolean)
        .join(' · ')}
      chevron={false}
    />
  )
}
