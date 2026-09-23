import { useCallback, useEffect, useRef, useState } from 'react'

/* ══ Datenladen ═══════════════════════════════════════════════════════ */

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  setData: (value: T) => void
}

/**
 * Schlanker Lade-Hook. Bewusst ohne Bibliothek: die Oberfläche braucht Laden, Fehler und
 * ein manuelles Neuladen – mehr nicht.
 *
 * Zwei Dinge sind hier nicht optional:
 *
 *  1. Wechseln die Abhängigkeiten, wird `data` verworfen. Sonst zeigt die Seite die
 *     Daten der vorigen Anfrage weiter – und beim ersten Durchlauf, wenn der Haushalt
 *     noch nicht feststeht, sogar den leeren Zustand: „Noch keine Bereiche", obwohl
 *     gerade geladen wird. Für ein Produkt, dem man Verantwortung anvertraut, ist eine
 *     falsche Leermeldung schlimmer als ein Platzhalter (Auftrag §46, §22).
 *  2. Ein Zähler verwirft Antworten überholter Anfragen. Ohne ihn kann eine langsame
 *     alte Antwort eine neue überschreiben.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  const generation = useRef(0)

  const run = useCallback(
    async (keepPrevious: boolean) => {
      const mine = (generation.current += 1)
      setState((previous) => ({
        data: keepPrevious ? previous.data : null,
        error: null,
        loading: true,
      }))
      try {
        const value = await loader()
        if (mine === generation.current) setState({ data: value, error: null, loading: false })
      } catch (e) {
        if (mine !== generation.current) return
        setState((previous) => ({
          data: keepPrevious ? previous.data : null,
          error: e instanceof Error ? e.message : 'Das konnte gerade nicht geladen werden.',
          loading: false,
        }))
      }
    },
    // Die Abhängigkeiten werden bewusst von außen übergeben; der Loader selbst ist eine
    // frisch erzeugte Closure und darf nicht Teil davon sein.
    deps,
  )

  useEffect(() => {
    void run(false)
  }, [run])

  const reload = useCallback(() => run(true), [run])
  const setData = useCallback((value: T) => setState((s) => ({ ...s, data: value })), [])

  return { data: state.data, error: state.error, loading: state.loading, reload, setData }
}

/* ══ Beschriftungen ═══════════════════════════════════════════════════
 * Fachbegriffe des Modells tauchen in der Oberfläche nie auf (Risiko P6).
 */

export const ENERGY: Record<string, string> = {
  low: 'wenig Energie',
  medium: 'mittlere Energie',
  high: 'viel Energie',
}

export const CRITICALITY: Record<string, string> = {
  low: 'nebensächlich',
  normal: 'normal',
  high: 'wichtig',
  critical: 'kritisch',
}

export const CAPACITY: Record<string, string> = {
  normal: 'Normal',
  reduced: 'Weniger als sonst',
  minimal: 'Sehr wenig',
  paused: 'Pause',
}

export const ROLE: Record<string, string> = {
  admin: 'Verwaltung',
  adult: 'Erwachsen',
  caregiver: 'Betreuung',
  teen: 'Jugendlich',
  child: 'Kind',
  guest: 'Gast',
}

export const ROLE_HINT: Record<string, string> = {
  admin: 'Kann Mitglieder, Rechte und Systemeinstellungen verwalten.',
  adult: 'Voller Zugriff auf Bereiche, Zustand und Wissen. Keine Rechteverwaltung.',
  caregiver: 'Sieht nur ausdrücklich freigegebene Bereiche.',
  teen: 'Sieht nur ausdrücklich freigegebene Bereiche, keine Gesundheitsdaten.',
  child: 'Sieht nur ausdrücklich Freigegebenes. Kann erfassen und eigene Aufgaben abhaken.',
  guest: 'Befristeter Zugang, nur ausdrücklich Freigegebenes.',
}

export const MONITOR_RULE: Record<string, string> = {
  state_freshness: 'Regelmäßig nachprüfen',
  state_unknown: 'Offene Angabe nicht vergessen',
  state_threshold: 'Grenzwert überwachen',
  schedule: 'Wiederkehrende Prüfung',
  seasonal: 'Saisonale Prüfung',
  lead_time_before_event: 'Vor einem Termin vorbereiten',
  date_field_lead_time: 'Vor einem hinterlegten Datum erinnern',
  absence: 'Melden, wenn lange nichts passiert',
  dependency_recheck: 'Wartendes wieder aufgreifen',
}

export const DECISION_KIND: Record<string, string> = {
  personal_preference: 'Persönliche Vorliebe',
  family_decision: 'Familienentscheidung',
  hard_rule: 'Feste Regel',
  guideline: 'Orientierung',
  exception: 'Ausnahme',
}

export const KNOWLEDGE_KIND: Record<string, string> = {
  fact: 'Fakt',
  how_to: 'Anleitung',
  preference: 'Vorliebe',
  experience: 'Erfahrung',
  rule: 'Regel',
  pitfall: 'Stolperfalle',
  link: 'Link',
  note: 'Notiz',
}

export const TASK_STATE: Record<string, string> = {
  draft: 'Entwurf',
  ready: 'offen',
  in_progress: 'begonnen',
  blocked: 'wartet auf einen früheren Schritt',
  waiting: 'wartet auf etwas von außen',
  deferred: 'zurückgestellt',
  done: 'erledigt',
  dropped: 'verworfen',
  superseded: 'ersetzt',
}

export const SHARE_LEVEL: Record<string, string> = {
  none: 'Nichts – andere sehen den Kalender gar nicht',
  busy: 'Nur belegt – ohne Inhalt (empfohlen)',
  title: 'Titel – andere sehen, worum es geht',
  full: 'Alles – Titel, Ort und Beschreibung',
}

/* ══ Formatierung ═════════════════════════════════════════════════════ */

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export const formatDate = (value: string | Date | null): string =>
  value ? dateFmt.format(typeof value === 'string' ? new Date(value) : value) : '–'

export const formatDateTime = (value: string | Date | null): string =>
  value ? dateTimeFmt.format(typeof value === 'string' ? new Date(value) : value) : '–'

/** „vor 12 Tagen" liest sich in diesem Produkt besser als ein absolutes Datum. */
export function relativeDays(value: string | Date | null): string {
  if (!value) return 'noch nie'
  const then = typeof value === 'string' ? new Date(value) : value
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000)
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 0) return `in ${Math.abs(days)} Tagen`
  if (days < 45) return `vor ${days} Tagen`
  const months = Math.round(days / 30)
  return `vor ${months} Monaten`
}

/** Zustandswerte kommen als JSON – hier wird daraus lesbarer Text. */
export function formatStateValue(kind: string, value: unknown, unit: string | null): string {
  if (kind === 'unknown') return 'noch nicht bekannt'
  if (kind === 'not_applicable') return 'trifft nicht zu'
  if (value === null || value === undefined) return '–'
  if (typeof value === 'boolean') return value ? 'ja' : 'nein'
  if (typeof value === 'number') return unit ? `${value} ${unit}` : String(value)
  if (typeof value === 'string') {
    const asDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(value) : null
    return asDate && !Number.isNaN(asDate.getTime()) ? formatDate(asDate) : value
  }
  return JSON.stringify(value)
}

/* ══ Zustands-Vokabular ═══════════════════════════════════════════════ */

export const STATE_TONE: Record<string, 'neutral' | 'success' | 'attention' | 'info'> = {
  ready: 'neutral',
  in_progress: 'info',
  blocked: 'neutral',
  waiting: 'info',
  deferred: 'neutral',
  done: 'success',
  dropped: 'neutral',
}

export const SEVERITY_LABEL: Record<string, string> = {
  info: 'zur Kenntnis',
  notice: 'wäre gut zu klären',
  important: 'wichtig',
  critical: 'dringend',
}

/**
 * Ein Ausklapp schließen, wenn daneben geklickt oder Escape gedrückt wird.
 *
 * Stand zweimal wortgleich im Code (Meldungen, Kontomenü) und wäre beim Farbwähler ein
 * drittes Mal entstanden. Wer ein Ausklapp baut, soll nicht daran denken müssen, dass es
 * sich auch wieder schließen lassen muss.
 *
 * Gibt die Ref zurück, die um Knopf und Ausklapp gelegt wird: Ein Klick darin schließt nicht.
 */
export function useDismissable<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return ref
}

/**
 * Ab dieser Breite stehen Verzeichnis und Inhalt nebeneinander – wie in der CSS-Regel.
 *
 * Lag in `SettingsPage`, seit die Bereichsseite dasselbe Muster benutzt gehört er hierher:
 * Zwei Fassungen derselben Schwelle laufen früher oder später auseinander.
 */
/**
 * Ob ein Medienabfrage-Ausdruck gerade zutrifft.
 *
 * Für Layouts, die sich nicht per CSS umstellen lassen, weil sich die **Reihenfolge** ändert:
 * Der Wochenplan zeigt breit ein Gitter (Tage waagerecht) und schmal einen Stapel (Tage
 * untereinander). Eine CSS-Umsortierung würde die Vorlesereihenfolge von der sichtbaren
 * trennen – zwei Zweige mit einer gemeinsamen Zelle sind ehrlicher.
 */
export function useMediaQuery(query: string): boolean {
  const [passt, setPasst] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setPasst(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return passt
}

export function useWideScreen(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1080px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1080px)')
    const update = () => setWide(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}
