import { COLOR_TONES, type ColorTone } from '@thealotta/contracts'
import { toneClass, toneLabel, defaultTone, domainDefaultTone, useColors } from '../lib/colors.js'
import { useToast } from '../design/index.js'

/**
 * Farbwähler für eine Person oder einen Bereich.
 *
 * Zwölf feste Töne statt freier Farbwahl: Jeder ist in hellem und dunklem Modus gegen seine
 * eigene Fläche geprüft und liegt weit genug von den anderen entfernt, um unterscheidbar zu
 * bleiben. Eine frei gewählte Farbe könnte beides nicht zusagen.
 *
 * Die Auswahl ist eine Radiogruppe, kein Menü: Alle zwölf Möglichkeiten stehen gleichzeitig
 * da, die aktuelle ist als gedrückt markiert. Jeder Knopf trägt seinen Namen als Beschriftung
 * – wer Farben nicht unterscheiden kann, kann trotzdem wählen.
 */
export function ColorPicker({
  subject,
  subjectId,
  label,
  fallbackId,
}: {
  subject: 'member' | 'domain'
  subjectId: string
  /** Wessen Farbe hier eingestellt wird – steht in den Vorlesebeschriftungen. */
  label: string
  /**
   * Woraus sich die Voreinstellung ableitet, falls sie von einer anderen ID kommt: Ein
   * Bereich ohne eigene Farbe trägt die der Person, die für ihn mitdenkt.
   */
  fallbackId?: string | null
}) {
  const colors = useColors()
  const toast = useToast()
  const custom = colors.isCustom(subject, subjectId)
  /* Wohin „Zurücksetzen" führt: bei einer Person ihr eigener Ton, bei einem Bereich der Ton
     der zuständigen Person – und wenn niemand mitdenkt, der eigene Ton des Bereichs. */
  const fallback =
    subject === 'member'
      ? defaultTone(subjectId)
      : (defaultTone(fallbackId ?? null) ?? domainDefaultTone(subjectId))
  const current =
    subject === 'member' ? colors.memberTone(subjectId) : colors.domainTone(subjectId, fallbackId ?? null)

  const choose = async (tone: ColorTone | null) => {
    try {
      await colors.set(subject, subjectId, tone)
    } catch {
      toast.show('Die Farbe konnte nicht gespeichert werden.')
    }
  }

  return (
    <div className="colorpicker">
      <div className="swatches" role="radiogroup" aria-label={`Farbe für ${label}`}>
        {COLOR_TONES.map((tone) => {
          const active = custom && tone === current
          return (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={active}
              className={`swatch ${toneClass(tone)}${active ? ' is-active' : ''}`}
              onClick={() => void choose(tone)}
            >
              {/* Das Häkchen sagt dasselbe wie der Ring – nur nicht über Farbe. */}
              <span className="swatch-mark" aria-hidden="true">
                {active ? '✓' : ''}
              </span>
              <span className="visually-hidden">{toneLabel(tone)}</span>
            </button>
          )
        })}
      </div>

      <p className="t-caption c-muted colorpicker-state">
        {custom ? (
          <>
            {toneLabel(current)} – selbst gewählt.{' '}
            <button type="button" className="linklike" onClick={() => void choose(null)}>
              {fallback ? `Zurücksetzen auf ${toneLabel(fallback)}` : 'Eigene Farbe entfernen'}
            </button>
          </>
        ) : (
          `${toneLabel(current)} – voreingestellt.`
        )}
      </p>
    </div>
  )
}
