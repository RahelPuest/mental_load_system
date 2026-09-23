import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ALL_ENTRIES, SETTINGS_ENTRY } from '../lib/navigation.js'
import { endpoints, type SearchHit } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { Icon, type IconName,
  ICON,
} from '../design/index.js'

interface Action {
  id: string
  title: string
  subtitle: string
  icon: IconName
  run: () => void
}

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  domain: 'Bereiche',
  person: 'Personen',
  state: 'Angaben',
  knowledge: 'Wissen',
  question: 'Fragen',
  decision: 'Entscheidungen',
  process: 'Vorgänge',
  task: 'Aufgaben',
  playbook: 'Abläufe',
  rule: 'Regeln',
}

const KIND_ICON: Record<SearchHit['kind'], IconName> = {
  domain: 'domains',
  person: 'family',
  state: 'flag',
  knowledge: 'book',
  question: 'search',
  decision: 'shield',
  process: 'route',
  task: 'check',
  playbook: 'route',
  rule: 'eye',
}

/**
 * §48/§49: Suche und Aktionen an einem Ort.
 *
 * Ergänzung, kein Ersatz: Jede Aktion hier ist auch über die normale Navigation erreichbar.
 * Auf Mobile ersetzt die Suchtaste in der Kopfzeile dasselbe Overlay.
 */
export function CommandPalette({
  open,
  onClose,
  onCapture,
}: {
  open: boolean
  onClose: () => void
  onCapture: () => void
}) {
  const { household } = useSession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const actions = useMemo<Action[]>(
    () => [
      {
        id: 'capture',
        title: 'Notiz erfassen',
        subtitle: 'Etwas aus dem Kopf bekommen',
        icon: 'plus',
        run: () => {
          onClose()
          onCapture()
        },
      },
      // Jeder Ort aus der Navigation ist auch hier erreichbar – aus einer Quelle,
      // damit Palette und Seitenleiste nicht auseinanderlaufen (§49).
      ...[...ALL_ENTRIES, SETTINGS_ENTRY].map((entry) => ({
        id: entry.to,
        title: entry.label,
        subtitle: entry.purpose,
        icon: entry.icon,
        run: () => navigate(entry.to),
      })),
    ],
    [navigate, onCapture, onClose],
  )

  const filteredActions = useMemo(() => {
    if (query.trim().length === 0) return actions
    const q = query.toLowerCase()
    return actions.filter((a) => a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q))
  }, [actions, query])

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery('')
    setHits([])
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      window.clearTimeout(timer)
      returnFocus.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open || !household || query.trim().length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setLoading(true)
    // Kurze Verzögerung: bei jedem Tastendruck zu suchen wäre verschwendete Arbeit.
    const timer = window.setTimeout(async () => {
      try {
        const result = await endpoints.search(household.id, query.trim())
        if (!cancelled) setHits(result.items)
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, household, query])

  const entries = useMemo(
    () => [
      ...hits.map((hit) => ({ type: 'hit' as const, hit })),
      ...filteredActions.map((action) => ({ type: 'action' as const, action })),
    ],
    [hits, filteredActions],
  )

  const activate = useCallback(
    (index: number) => {
      const entry = entries[index]
      if (!entry) return
      if (entry.type === 'action') entry.action.run()
      else {
        onClose()
        navigate(entry.hit.href)
      }
      if (entry.type === 'hit') return
    },
    [entries, navigate, onClose],
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((i) => Math.min(i + 1, entries.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        activate(active)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, entries.length, active, activate, onClose])

  if (!open) return null

  let renderedIndex = -1
  const grouped = new Map<string, SearchHit[]>()
  for (const hit of hits) {
    const label = KIND_LABEL[hit.kind] ?? 'Treffer'
    grouped.set(label, [...(grouped.get(label) ?? []), hit])
  }

  return createPortal(
    <>
      <div className="overlay-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Suchen und Aktionen">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Suchen oder Aktion wählen …"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          aria-label="Suchbegriff"
          autoComplete="off"
        />

        <div className="results">
          {loading && (
            <p className="t-body-sm c-muted" style={{ padding: 'var(--s-3)' }}>
              Wird gesucht …
            </p>
          )}

          {[...grouped.entries()].map(([label, groupHits]) => (
            <div key={label}>
              <p className="t-overline group-label">{label}</p>
              {groupHits.map((hit) => {
                renderedIndex += 1
                const index = renderedIndex
                return (
                  <button
                    key={`${hit.kind}-${hit.id}`}
                    className="hit"
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => activate(index)}
                  >
                    <Icon name={KIND_ICON[hit.kind] ?? 'search'} size={ICON.md} />
                    <span className="hit-main">
                      <span className="hit-title" title={hit.title}>{hit.title}</span>
                      <span className="hit-sub">{hit.subtitle}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}

          {filteredActions.length > 0 && (
            <div>
              <p className="t-overline group-label">Aktionen</p>
              {filteredActions.map((action) => {
                renderedIndex += 1
                const index = renderedIndex
                return (
                  <button
                    key={action.id}
                    className="hit"
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => activate(index)}
                  >
                    <Icon name={action.icon} size={ICON.md} />
                    <span className="hit-main">
                      <span className="hit-title" title={action.title}>{action.title}</span>
                      <span className="hit-sub">{action.subtitle}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {!loading && entries.length === 0 && (
            <p className="t-body-sm c-muted" style={{ padding: 'var(--s-3)' }}>
              Nichts gefunden. Vielleicht ein kürzeres Wort?
            </p>
          )}
        </div>

        <div className="foot t-caption">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> wählen
          </span>
          <span>
            <kbd>↵</kbd> öffnen
          </span>
          <span>
            <kbd>Esc</kbd> schließen
          </span>
        </div>
      </div>
    </>,
    document.body,
  )
}
