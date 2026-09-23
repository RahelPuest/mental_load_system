import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Icon, ICON} from './icons.js'

/**
 * Wischen zum Abhaken (§23).
 *
 * Bewusst zurückhaltend umgesetzt: Die Geste ist eine Abkürzung, nie der einzige Weg – der
 * Knopf bleibt sichtbar. Ohne diese Doppelung wäre die Aktion für Tastatur, Screenreader und
 * alle, die die Geste nicht kennen, unerreichbar. `prefers-reduced-motion` schaltet sie ab.
 */
export function SwipeToComplete({
  onComplete,
  disabled,
  label = 'Erledigt',
  children,
}: {
  onComplete: () => void
  disabled?: boolean
  label?: string
  children: ReactNode
}) {
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const locked = useRef<'none' | 'x' | 'y'>('none')

  const THRESHOLD = 96

  if (disabled) return <>{children}</>

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    startX.current = touch.clientX
    startY.current = touch.clientY
    locked.current = 'none'
    setSwiping(true)
  }

  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    const dx = touch.clientX - startX.current
    const dy = touch.clientY - startY.current

    // Erst ab einer klaren Richtung übernehmen – sonst blockiert die Geste das Scrollen.
    if (locked.current === 'none') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      locked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (locked.current !== 'x') return
    setOffset(Math.max(-140, Math.min(0, dx)))
  }

  const onTouchEnd = () => {
    setSwiping(false)
    if (offset <= -THRESHOLD) onComplete()
    setOffset(0)
    locked.current = 'none'
  }

  const progress = Math.min(1, Math.abs(offset) / THRESHOLD)

  return (
    <div className="swipe" data-swiping={swiping} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <span className="swipe-hint" style={{ opacity: progress }} aria-hidden="true">
        <Icon name="check" size={ICON.md} />
        {label}
      </span>
      <div className="swipe-body" style={{ transform: offset ? `translateX(${offset}px)` : undefined }}>
        {children}
      </div>
    </div>
  )
}
