import { ICON } from './icons.js'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, Deeper, Heading, Icon} from './components.js'

/* ══ Sheet / Dialog ══════════════════════════════════════════════════ */

/**
 * Ein Overlay-Muster für beide Größen: mobil ein Bottom Sheet im Daumenbereich,
 * ab Tablet ein zentrierter Dialog (per CSS). Damit bleibt der Kontext erhalten – das war
 * einer der Hauptbefunde: Erfassen und kurze Bearbeitungen dürfen die Seite nicht verlassen.
 *
 * Barrierefreiheit: Fokusfalle, Escape schließt, Fokus kehrt zum Auslöser zurück.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    // Erstes sinnvolles Element fokussieren, nicht den Schließen-Knopf.
    const first = focusable().find((el) => !el.hasAttribute('data-close')) ?? focusable()[0]
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="overlay-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        ref={ref}
      >
        <div className="grabber" aria-hidden="true" />
        {/* Der Dialog beginnt eine eigene Gliederung: sein Titel ist die zweite Ebene. */}
        <Deeper to={2}>
        <div className="sheet-head">
          <div>
            <Heading className="t-heading" id={titleId}>
              {title}
            </Heading>
            {description && (
              <p className="t-body-sm c-secondary" id={descId}>
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Schließen" data-close="">
            <Icon name="plus" size={ICON.md} style={{ transform: 'rotate(45deg)' }} />
          </Button>
        </div>
        <Deeper>{children}</Deeper>
        </Deeper>
      </div>
    </>,
    document.body,
  )
}

/* ══ Toasts mit Undo ═════════════════════════════════════════════════ */

interface Toast {
  id: number
  message: string
  undo?: () => void | Promise<void>
}

interface ToastApi {
  /** Höfliche Rückmeldung. Mit `undo` statt eines Bestätigungsdialogs (§57 des Auftrags). */
  show: (message: string, undo?: () => void | Promise<void>) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (message: string, undo?: () => void | Promise<void>) => {
      const id = (counter.current += 1)
      setToasts((list) => [...list.slice(-2), { id, message, undo }])
      // Sechs Sekunden: lang genug zum Lesen und Rückgängigmachen, kurz genug, um nicht zu stören.
      window.setTimeout(() => dismiss(id), 6000)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 &&
        createPortal(
          <div className="toasts" role="status" aria-live="polite">
            {toasts.map((toast) => (
              <div className="toast" key={toast.id}>
                <span className="toast-text">{toast.message}</span>
                {toast.undo && (
                  <button
                    onClick={() => {
                      void toast.undo?.()
                      dismiss(toast.id)
                    }}
                  >
                    Rückgängig
                  </button>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast außerhalb des ToastProvider')
  return value
}
