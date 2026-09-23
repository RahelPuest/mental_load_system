import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { endpoints, flushCaptures, pendingCaptures } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useDismissable } from '../lib/ui.js'
import { Icon, PersonDot,
  ICON,
} from '../design/index.js'
import { HELP_ENTRY, MOBILE_PRIMARY, NAV_GROUPS, SETTINGS_ENTRY } from '../lib/navigation.js'
import { CommandPalette } from './CommandPalette.js'
import { CaptureSheet } from './CaptureSheet.js'
import { NotificationsSheet } from './NotificationsSheet.js'

/**
 * Primärnavigation (docs/41, docs/45).
 *
 * Die Struktur liegt in lib/navigation.ts, damit Seitenleiste, mobile Übersicht und
 * Befehlspalette nicht auseinanderlaufen können.
 */
const MOBILE = MOBILE_PRIMARY

export function AppShell() {
  const { household, households, selectHousehold, degraded, refresh, me, signOut } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [queued, setQueued] = useState(pendingCaptures())
  const [online, setOnline] = useState(navigator.onLine)
  const [inboxCount, setInboxCount] = useState(0)
  const [attentionCount, setAttentionCount] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  // Klick daneben oder Escape schließt den Aufklapper – derselbe Haken wie beim Kontomenü.
  const closeBell = useCallback(() => setBellOpen(false), [])
  const bellRef = useDismissable<HTMLDivElement>(bellOpen, closeBell)
  const [unread, setUnread] = useState(0)

  const sync = useCallback(async () => {
    setOnline(navigator.onLine)
    if (!navigator.onLine) return
    await flushCaptures()
    setQueued(pendingCaptures())
    if (!household) return
    try {
      const [inbox, notifications, attention] = await Promise.all([
        endpoints.inbox(household.id),
        endpoints.notifications(household.id),
        endpoints.attention(household.id),
      ])
      setInboxCount(inbox.items.length)
      setUnread(notifications.unread)
      setAttentionCount(attention.items.length)
    } catch {
      /* Die Zähler sind Beiwerk – ein Fehler hier darf nichts blockieren. */
    }
  }, [household])

  useEffect(() => {
    const handler = () => void sync()
    window.addEventListener('online', handler)
    window.addEventListener('offline', () => setOnline(false))
    void sync()
    const timer = window.setInterval(handler, 30_000)
    return () => {
      window.removeEventListener('online', handler)
      window.clearInterval(timer)
    }
  }, [sync, location.pathname])


  // Tastenkürzel: ⌘K suchen, ⌘N erfassen. Ergänzung, kein Ersatz für die Navigation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      } else if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setCaptureOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Zum Inhalt springen
      </a>

      {/*
        Kopfleiste über allem: Suchen, Meldungen und das eigene Konto sind keine Orte,
        sondern Werkzeuge – sie gehören nicht in die Ortsliste. Die Seitenleiste trägt nur
        noch Navigation und die eine Primäraktion.
      */}
      <header className="appbar">
        <span className="wordmark">Thealotta</span>
        {households.length > 1 ? (
          <select
            className="select household-select"
            aria-label="Haushalt wechseln"
            value={household?.id ?? ''}
            onChange={(e) => {
              selectHousehold(e.target.value)
              navigate('/jetzt')
            }}
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        ) : (
          household && <span className="context t-body-sm">{household.name}</span>
        )}

        <span className="spacer" />

        {/* Ein Feld lädt ein, ein Knopf nicht – auch wenn beides dieselbe Palette öffnet. */}
        <button className="appbar-search" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={ICON.md} />
          <span>Suchen</span>
          <kbd className="appbar-kbd">⌘K</kbd>
        </button>

        <span className="appbar-sep" aria-hidden="true" />

        {/*
          Meldungen klappen unter dem Knopf auf, statt die Seite mit einem Dialog zu
          überdecken: Sie sind ein Blick zur Seite, keine Unterbrechung (§19, §32).
        */}
        <div className="popover-anchor" ref={bellRef}>
          <button
            className="appbar-btn icon-only"
            aria-haspopup="dialog"
            aria-expanded={bellOpen}
            onClick={() => setBellOpen((v) => !v)}
            aria-label={unread > 0 ? `Meldungen, ${unread} neu` : 'Meldungen'}
          >
            <Icon name="bell" size={ICON.md} />
            {unread > 0 && <span className="appbar-count num">{unread}</span>}
          </button>
          <NotificationsSheet open={bellOpen} onClose={() => setBellOpen(false)} />
        </div>

        <NavLink to={HELP_ENTRY.to} className="appbar-btn icon-only" title={HELP_ENTRY.purpose}>
          <Icon name="book" size={ICON.md} />
          <span className="visually-hidden">Wie Thealotta denkt</span>
        </NavLink>

        <NavLink to={SETTINGS_ENTRY.to} className="appbar-btn icon-only" title={SETTINGS_ENTRY.purpose}>
          <Icon name={SETTINGS_ENTRY.icon} size={ICON.md} />
          <span className="visually-hidden">Einstellungen</span>
        </NavLink>

        {me && (
          <AccountMenu
            name={me.user.displayName}
            membershipId={household?.membershipId}
            onSignOut={() => void signOut()}
          />
        )}
      </header>

      <div className="shell-body">
      {/* Seitenleiste ab Tablet */}
      <nav className="sidebar" aria-label="Hauptbereiche">
        <button className="nav-link capture" onClick={() => setCaptureOpen(true)}>
          <Icon name="plus" />
          <span>Erfassen</span>
        </button>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="nav-group">
            <p className="t-overline nav-group-label">{group.label}</p>
            {group.entries.map((entry) => {
              const count =
                entry.counter === 'inbox' ? inboxCount : entry.counter === 'attention' ? attentionCount : 0
              return (
                <NavLink key={entry.to} to={entry.to} className="nav-link" title={entry.purpose}>
                  <Icon name={entry.icon} />
                  <span>{entry.label}</span>
                  {count > 0 && (
                    <>
                      {/* Die Ausrichtung steht im Stylesheet – hier wäre sie eine Sonderregel,
                          die genau eine Stelle kennt. */}
                      <span className="chip chip-attention num">{count}</span>
                      <span className="visually-hidden">, {count} offen</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}

      </nav>

      <div className="main-col">
        {degraded && online && (
          <p
            className="notice notice-attention t-body-sm"
            style={{ margin: 'var(--s-3) var(--s-4) 0', maxWidth: 'none' }}
            role="status"
          >
            Der Server antwortet gerade nicht. Du bleibst angemeldet und nichts ist verloren –
            wir versuchen es weiter.{' '}
            <button className="linklike" onClick={() => void refresh()}>
              Jetzt erneut versuchen
            </button>
          </p>
        )}

        {(!online || queued > 0) && (
          <p className="notice notice-attention t-body-sm" style={{ margin: 'var(--s-3) var(--s-4) 0', maxWidth: 'none' }} role="status">
            {online
              ? `${queued} Notiz${queued === 1 ? '' : 'en'} wird nachgetragen.`
              : 'Gerade offline. Erfassen funktioniert weiter – alles wird lokal gesichert und später übertragen.'}
          </p>
        )}

        <main id="main" className="content">
          <Outlet context={{ openCapture: () => setCaptureOpen(true) }} />
        </main>
      </div>
      </div>

      {/* Untere Navigation mobil, mit erhöhter Erfassen-Taste im Daumenbereich.
          Eigener Name: beide Leisten stehen im DOM, auch wenn je Bildschirmgröße nur
          eine sichtbar ist – ein Vorleseprogramm muss sie auseinanderhalten können. */}
      <nav className="bottombar" aria-label="Hauptbereiche, untere Leiste">
        {MOBILE.slice(0, 2).map((item) => (
          <NavLink key={item.to} to={item.to}>
            <Icon name={item.icon} className="icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="fab-slot">
          <button className="fab" onClick={() => setCaptureOpen(true)} aria-label="Notiz erfassen">
            <Icon name="plus" size={ICON.lg} />
          </button>
        </div>

        {MOBILE.slice(2).map((item) => {
          const count =
            item.counter === 'inbox' ? inboxCount : item.counter === 'attention' ? attentionCount : 0
          return (
            <NavLink key={item.to} to={item.to}>
              <Icon name={item.icon} className="icon" />
              <span>{item.label}</span>
              {count > 0 && (
                <>
                  {/* Die Zahl statt eines bloßen Punktes: Sie ist bekannt, und ein Punkt
                      sagt nur „irgendetwas" – dieselbe Ecke wie in der Symbolleiste. */}
                  <span className="tab-count num" aria-hidden="true">
                    {count > 99 ? '99+' : count}
                  </span>
                  <span className="visually-hidden">, {count} offen</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCapture={() => setCaptureOpen(true)} />
      <CaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  )
}

/**
 * Konto in der Kopfleiste.
 *
 * Ein Klick auf das eigene Zeichen meldet nicht sofort ab – das wäre eine folgenreiche
 * Aktion ohne Absicht. Stattdessen ein kleines Menü mit den beiden Dingen, die man dort
 * sucht: Einstellungen und Abmelden (§56).
 */
function AccountMenu({
  name,
  membershipId,
  onSignOut,
}: {
  name: string
  membershipId?: string | null
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismissable<HTMLDivElement>(open, close)

  return (
    <div className="account-menu" ref={ref}>
      <button
        className="appbar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <PersonDot name={name} membershipId={membershipId} />
        <span className="appbar-label">{name}</span>
      </button>
      {open && (
        <div className="account-pop" role="menu">
          <p className="t-caption c-muted account-who">Angemeldet als {name}</p>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <Icon name="route" size={ICON.md} />
            Abmelden
          </button>
        </div>
      )}
    </div>
  )
}
