import { ENERGY } from '../lib/ui.js'
import { toneClass, useColors } from '../lib/colors.js'
import type { NowItem } from '@thealotta/contracts'
import {
  Actions,
  Button,
  Card,
  Chip,
  Consequence,
  Disclosure,
  Heading,
  Icon,
  ICON,
  PersonDot,
  Reasons,
  Row,
} from '../design/index.js'

/**
 * Die Karte und die Zeile, in denen eine Sache erscheint.
 *
 * Herausgelöst aus NowPage, damit die Planung (docs/80) sie benutzen kann. Vorher lagen sie
 * dort als lokale Funktionen, und die Liste hatte deshalb eigene, ärmere Zeilen gebaut:
 * ohne Abhaken, ohne Später, ohne Abgeben. Wer die Liste öffnete, verlor damit jede Aktion –
 * eine Todo-Liste, in der man nichts erledigen kann.
 *
 * Ein eigener Ort statt eines Imports aus NowPage: Die Planung wird von NowPage eingebunden,
 * ein Import zurück wäre ein Zyklus.
 */

export function NowCard({
  item,
  prominent,
  busy,
  onComplete,
  onDefer,
  onStart,
  onHandOver,
  onWait,
  onDrop,
  onOpen,
  note,
}: {
  item: NowItem
  prominent?: boolean
  /**
   * Eine Zeile am Fuß der Karte – die Planung sagt damit, warum die Sache an dieser Stelle
   * steht (docs/80). Außerhalb der Karte hing sie in der Luft: Im Kartenraster landeten die
   * Sätze mehrerer Spalten auf verschiedenen Höhen.
   */
  note?: string
  busy?: boolean
  onComplete?: (item: NowItem) => void
  onDefer?: (item: NowItem) => void
  onStart?: (item: NowItem) => void
  onHandOver?: (item: NowItem) => void
  onWait?: (item: NowItem) => void
  onDrop?: (item: NowItem) => void
  onOpen?: () => void
}) {
  const tone = undefined
  const colors = useColors()

  return (
    <Card
      tone={item.subjectType === 'attention_item' ? 'attention' : tone}
      accent={item.domain ? toneClass(colors.domainTone(item.domain.id, item.owner?.membershipId ?? null)) : undefined}
    >
      {item.domain && (
        <p className="card-eyebrow t-overline c-muted">
          <Icon name="domains" size={ICON.sm} />
          {item.domain.path}
        </p>
      )}
      <Heading className={prominent ? 't-title card-title' : 't-sub card-title'}>{item.title}</Heading>

      {/*
        Der Stempel: in einem Wort, warum das hier oben steht.

        Nur an der Leitkarte – es gibt genau eine je Seite, und nur deshalb darf er schief
        stehen (docs/69). Auf den kompakten Karten darunter bliebe es beim Satz.
      */}
      {prominent && item.why[0]?.label && <p className="stempel">{item.why[0].label}</p>}

      {/* Nur die zwei stärksten Gründe; der Rest hinter Aufklappen (Audit: Erklärbarkeit
          wurde durch Vollständigkeit zu Rauschen). */}
      {/* Ein Grund reicht, um „warum das?" zu beantworten. Der Rest steht darunter zum
          Aufklappen – zwei fettgedruckte Gründe lasen sich wie zwei Anforderungen. */}
      <Reasons items={item.why} max={1} />

      {/* Die Folge nur zeigen, wenn sie nicht dasselbe sagt wie der Grund darüber. */}
      {prominent && !saysTheSame(item.why[0]?.explanation, item.ifItWaits) && (
        <Consequence>{item.ifItWaits}</Consequence>
      )}

      {/*
        Eine Metazeile statt einer Reihe von Kästchen: Wer, wie lange, wie anstrengend –
        durch Punkte getrennt, in einer Schriftgröße. Vorher waren das drei Chips mit
        Rahmen, Hintergrund und eigener Größe (§3.3, §29).
      */}
      <p className="card-meta t-caption c-muted">
        {item.owner && (
          <span className="meta-item">
            <PersonDot name={item.owner.displayName} membershipId={item.owner.membershipId} />
            {item.owner.isYou ? 'du' : item.owner.displayName}
          </span>
        )}
        {item.assignee && !item.assignee.isYou && (
          <span className="meta-item">
            <Icon name="check" size={ICON.sm} />
            {item.assignee.displayName} führt aus
          </span>
        )}
        {item.estimatedMinutes !== null && (
          <span className="meta-item">
            <Icon name="clock" size={ICON.sm} />
            {item.estimatedMinutes} Min.
          </span>
        )}
        {item.mentalEnergy !== 'medium' && (
          <span className="meta-item">
            <Icon name="battery" size={ICON.sm} />
            {ENERGY[item.mentalEnergy]}
          </span>
        )}
      </p>

      {(onComplete ?? onDefer ?? onHandOver ?? onWait ?? onDrop ?? onOpen) && (
        <Actions>
          {item.subjectType === 'task' && onComplete && (
            <Button variant="primary" size={prominent ? 'md' : 'sm'} icon="check" disabled={busy} onClick={() => onComplete(item)}>
              Erledigt
            </Button>
          )}
          {item.subjectType === 'task' && onDefer && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDefer(item)}>
              Später
            </Button>
          )}
          {/*
            Eine Primäraktion, der Rest gleich gewichtet (§13).

            „Ich bin dran" war als einzige der vier Nebenaktionen umrandet und wirkte dadurch
            schwerer als „Später" oder „Zum Bereich" – ohne wichtiger zu sein. In einer Reihe
            von fünf Knöpfen gab es damit drei Gewichte und nur für eines davon einen Grund.
          */}
          {prominent && item.subjectType === 'task' && onStart && item.state !== 'in_progress' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStart(item)}>
              Ich bin dran
            </Button>
          )}
          {item.subjectType === 'task' && (onHandOver ?? onWait ?? onDrop) && (
            <Disclosure summary="Geht gerade nicht">
              <Actions>
                {onHandOver && (
                  <Button variant="secondary" size="sm" icon="family" onClick={() => onHandOver(item)}>
                    Abgeben
                  </Button>
                )}
                {onWait && (
                  <Button variant="secondary" size="sm" icon="clock" onClick={() => onWait(item)}>
                    Ich warte auf jemanden
                  </Button>
                )}
                {onDrop && (
                  <Button variant="ghost" size="sm" onClick={() => onDrop(item)}>
                    Nicht mehr nötig
                  </Button>
                )}
              </Actions>
            </Disclosure>
          )}
          {onOpen && (
            <Button variant="ghost" size="sm" onClick={onOpen}>
              {item.subjectType === 'attention_item' ? 'Ansehen und entscheiden' : 'Zum Bereich'}
            </Button>
          )}
        </Actions>
      )}
      {note && <p className="plan-grund t-caption c-muted">{note}</p>}
    </Card>
  )
}

export function NowRow({
  item,
  busy,
  compact,
  onComplete,
  onOpen,
}: {
  item: NowItem
  busy?: boolean
  /** Dritte Stufe: kleiner, ohne Aktion – hier wird gelesen, nicht gehandelt. */
  compact?: boolean
  onComplete?: (item: NowItem) => void
  onOpen: () => void
}) {
  // Wiederholt der Grund nur den Titel, ist er kein Grund, sondern Rauschen.
  const first = item.why[0]?.label
  const reason =
    first && !item.title.toLowerCase().includes(first.toLowerCase().slice(0, 18)) ? first : undefined
  const facts = [
    reason,
    item.estimatedMinutes !== null ? `${item.estimatedMinutes} Min.` : null,
    item.mentalEnergy !== 'medium' ? ENERGY[item.mentalEnergy] : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Row
      /* Auch in der kompakten Zeile trägt die Person ihre Farbe (§9). */
      lead={
        item.owner ? (
          <PersonDot name={item.owner.displayName} membershipId={item.owner.membershipId} />
        ) : undefined
      }
      title={item.title}
      subtitle={facts}
      chevron={false}
      onClick={onOpen}
      end={
        compact ? undefined : item.subjectType === 'task' && onComplete ? (
          <Button
            variant="secondary"
            size="sm"
            icon="check"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              onComplete(item)
            }}
          >
            Erledigt
          </Button>
        ) : (
          <Chip tone={item.subjectType === 'attention_item' ? 'attention' : 'neutral'}>
            {item.subjectType === 'attention_item' ? 'entscheiden' : 'ansehen'}
          </Chip>
        )
      }
    />
  )
}

/**
 * Grob, aber wirksam: Teilen zwei Sätze die Hälfte ihrer bedeutungstragenden Wörter, sagen
 * sie dasselbe. Zwei Formulierungen derselben Aussage untereinander sind Rauschen, keine
 * Erklärung.
 */
export function saysTheSame(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const words = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-zäöüß ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )
  const wa = words(a)
  const wb = words(b)
  if (wa.size === 0 || wb.size === 0) return false
  const shared = [...wa].filter((w) => wb.has(w)).length
  return shared / Math.min(wa.size, wb.size) >= 0.5
}
