/**
 * Komponentenbibliothek des Designsystems (docs/42).
 *
 * Regeln, die hier durchgesetzt werden:
 *  - `Chip` ist nur Status. Auswahl heißt `Toggle`. Gleiche Optik für Verschiedenes war
 *    einer der Hauptbefunde des Audits.
 *  - `Panel` grenzt eine Einheit ab, `Card` ist ein interaktiver Listeneintrag,
 *    `Section` gliedert nur. Karten in Karten gibt es nicht mehr.
 *  - Genau eine Primäraktion je Ansicht: `Page` nimmt sie entgegen.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Fragment, forwardRef, createContext, useContext, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName, ICON} from './icons.js'
import { Markdown } from './markdown.js'
import { initials } from '../lib/people.js'
import { useMemberClass } from '../lib/colors.js'

/* ══ Überschriftenebenen ═════════════════════════════════════════════
 * Die Ebene ergibt sich aus der Schachtelung, nicht aus der Schriftgröße. Wer per
 * Überschrift durch die Seite navigiert, darf keine Ebene übersprungen bekommen (§38).
 * Vorher stand in jeder Datei ein handverlesenes <h3>; das ging genau so lange gut,
 * bis eine Ansicht ohne Zwischenüberschrift auskam.
 */

const LevelContext = createContext(1)

export function Heading({
  className,
  id,
  children,
}: {
  className?: string
  id?: string
  children: ReactNode
}) {
  const level = Math.min(useContext(LevelContext), 6)
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  return (
    <Tag className={className} id={id}>
      {children}
    </Tag>
  )
}

/** Alles darin liegt eine Ebene tiefer. */
export function Deeper({ children, to }: { children: ReactNode; to?: number }) {
  const level = useContext(LevelContext)
  return <LevelContext.Provider value={to ?? level + 1}>{children}</LevelContext.Provider>
}

/* ══ Seite und Gliederung ════════════════════════════════════════════ */

export function Page({
  eyebrow,
  crumbs,
  title,
  lede,
  action,
  back,
  children,
}: {
  eyebrow?: string
  /**
   * Der Weg hierher, anklickbar – ohne die aktuelle Seite selbst.
   *
   * Sie steht direkt darunter als Überschrift; sie noch einmal in den Pfad zu schreiben,
   * hieße denselben Namen zweimal untereinander zu lesen.
   */
  crumbs?: { label: string; to: string }[]
  title: string
  lede?: ReactNode
  /** Genau eine Primäraktion je Ansicht. */
  action?: ReactNode
  back?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <>
      {back && (
        <button className="back" onClick={back.onClick}>
          <Icon name="chevronLeft" size={ICON.md} />
          {back.label}
        </button>
      )}
      <header className="page-head">
        {crumbs && crumbs.length > 0 && (
          /*
            Kein `t-overline` mehr.

            Versalien mit Sperrung sind in diesem Entwurf die Form eines Etiketts – so steht
            „TÄGLICH" über der Navigation und „SCHUHGRÖSSE" über einem Wert. Der Weg hierher
            trug dieselbe Form und las sich damit als Beschriftung, obwohl jedes Stück davon
            ein Link ist. Jetzt sieht er aus, was er ist: anklickbarer Text.
          */
          <nav className="crumbs" aria-label="Wo bin ich">
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.to}>
                {index > 0 && (
                  <span className="crumb-sep" aria-hidden="true">
                    /
                  </span>
                )}
                <Link to={crumb.to}>{crumb.label}</Link>
              </Fragment>
            ))}
          </nav>
        )}
        {eyebrow && <p className="t-overline eyebrow">{eyebrow}</p>}
        <Heading className="t-title">{title}</Heading>
        {lede && <p className="t-body-sm lede">{lede}</p>}
        {action && <div className="head-actions">{action}</div>}
      </header>
      <Deeper>{children}</Deeper>
    </>
  )
}

export function Section({
  title,
  hint,
  count,
  icon,
  action,
  children,
}: {
  title?: string
  hint?: string
  count?: number
  /** Symbol vor der Überschrift – erleichtert das Wiederfinden beim Scrollen. */
  icon?: IconName
  action?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="section" aria-labelledby={title ? id : undefined}>
      {(title ?? action) && (
        <header>
          <div className="titles">
            {title && (
              <Heading className="t-heading" id={id}>
                {icon && <Icon name={icon} size={ICON.md} className="section-icon" />}
                {title}
                {/* Rolle ausdrücklich: `.num` bestimmt nur noch die Ziffernform, nicht die Größe. */}
                {count !== undefined && count > 0 && (
                  <span className="t-body-sm c-muted num" style={{ fontWeight: 400 }}>
                    {' '}
                    {count}
                  </span>
                )}
              </Heading>
            )}
            {hint && <p className="t-body-sm hint">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {/* Ohne eigene Überschrift entsteht auch keine neue Ebene – sonst würde die
          Gliederung eine Stufe überspringen, die niemand sieht. */}
      {title ? <Deeper>{children}</Deeper> : children}
    </section>
  )
}

export function Panel({ children, sunken, ...rest }: { children: ReactNode; sunken?: boolean } & { className?: string }) {
  return <div className={`panel${sunken ? ' sunken' : ''}${rest.className ? ` ${rest.className}` : ''}`}>{children}</div>
}

export function Card({
  tone,
  accent,
  onClick,
  children,
  labelledBy,
}: {
  tone?: 'attention' | 'critical' | 'info'
  /**
   * Farbklasse des Bereichs oder der Person, zu der die Karte gehört (`m-1` … `m-12`).
   *
   * Sie färbt die linke Kante und die Herkunftszeile darüber – zwei Signale für dieselbe
   * Sache, damit die Zuordnung nicht allein an der Farbe hängt (§38). Der Ton für
   * Dringlichkeit bleibt davon unberührt: Er sitzt im Hintergrund, die Zugehörigkeit an der
   * Kante. Zwei Kanäle, die sich nicht ins Gehege kommen.
   */
  accent?: string
  onClick?: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const cls = `card${tone ? ` tinted-${tone}` : ''}${accent ? ` card-accent ${accent}` : ''}`
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {children}
      </button>
    )
  }
  return (
    <article className={cls} aria-labelledby={labelledBy}>
      {children}
    </article>
  )
}

export function Row({
  title,
  subtitle,
  lead,
  end,
  onClick,
  chevron = true,
}: {
  title: string
  subtitle?: string
  lead?: ReactNode
  end?: ReactNode
  onClick?: () => void
  chevron?: boolean
}) {
  /*
   * Die ganze Zeile ist anklickbar, ohne dass sie selbst ein <button> ist.
   *
   * Vorher wurde die Zeile zu einem Knopf – und Zeilen mit einer Aktion rechts hatten damit
   * einen Knopf im Knopf. Das ist ungültiges HTML: der Browser bricht die Verschachtelung
   * auf, und der Bedienbarkeitsbaum wird unbrauchbar (im Browser als React-Warnung und als
   * sprunghaft „nicht gefundene" Überschriften sichtbar geworden).
   *
   * Stattdessen trägt der Titel den Knopf; eine unsichtbare Fläche darüber macht die ganze
   * Zeile zur Trefferfläche. Aktionen rechts liegen darüber und bleiben eigenständig.
   */
  const titleNode = (
    <span className="row-title" title={title}>
      {title}
    </span>
  )

  return (
    <div className={`row${onClick ? ' row-clickable' : ''}`}>
      {lead}
      <span className="row-main">
        {onClick ? (
          <button type="button" className="row-open" onClick={onClick}>
            {titleNode}
          </button>
        ) : (
          titleNode
        )}
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      <span className="row-end">
        {end}
        {onClick && chevron && <Icon name="chevronRight" size={ICON.md} className="chevron" />}
      </span>
    </div>
  )
}

/**
 * Eine Liste von Zeilen.
 *
 * Nimmt eine Ref und Zeigerereignisse entgegen, weil das Ziehen im Bereichsbaum die Zeilen
 * vermessen und die Bewegung über der ganzen Liste verfolgen muss – nicht nur über der Zeile,
 * auf der der Zeiger gerade steht.
 */
export const RowList = forwardRef<
  HTMLUListElement,
  { children: ReactNode } & Partial<
    Pick<HTMLAttributes<HTMLUListElement>, 'className' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>
  >
>(({ children, className, ...rest }, ref) => (
  <ul ref={ref} className={`rowlist${className ? ` ${className}` : ''}`} {...rest}>
    {children}
  </ul>
))
RowList.displayName = 'RowList'
export const Divider = () => <hr className="divider" />

/* ══ Knöpfe ══════════════════════════════════════════════════════════ */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'md' | 'sm'
  icon?: IconName
  block?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon, block, children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}${block ? ' btn-block' : ''}${
        children === undefined ? ' btn-icon' : ''
      }${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {/*
        Die Skala gilt auch hier: 17 und 19 px standen fest im Knopf verdrahtet – zwei
        Werte, die es sonst nirgends gibt, und die sich von den 16/20 daneben um je einen
        Pixel unterschieden. Ein Unterschied, den niemand als Absicht liest.
      */}
      {icon && <Icon name={icon} size={size === 'sm' ? ICON.sm : ICON.md} />}
      {children}
    </button>
  )
}

export const Actions = ({ children, end, spaced = true }: { children: ReactNode; end?: boolean; spaced?: boolean }) => (
  <div className={`actions${end ? ' end' : ''}${spaced ? ' actions-spaced' : ''}`}>{children}</div>
)

/* ══ Status und Auswahl ══════════════════════════════════════════════ */

export type Tone = 'neutral' | 'success' | 'attention' | 'critical' | 'info' | 'accent'

/** Nur Status – niemals anklickbar. Für Auswahl gibt es `Toggle`. */
export function Chip({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`chip${tone === 'neutral' ? '' : ` chip-${tone}`}`}>
      {icon && <Icon name={icon} size={ICON.sm} />}
      {children}
    </span>
  )
}

export const Chips = ({ children }: { children: ReactNode }) => <div className="chips">{children}</div>

/**
 * Ein Kästchen zum Auswählen.
 *
 * Bewusst ein echtes `input[type=checkbox]` und kein nachgebauter Knopf: Tastatur, Vorlesen
 * und die Mehrfachauswahl mit gedrückter Umschalttaste kommen damit vom Browser, nicht aus
 * eigenem Code, der sie nie vollständig nachbildet.
 *
 * Die Beschriftung steht nicht daneben, sondern in der Zeile, zu der das Kästchen gehört –
 * deshalb wird sie hier nur vorgelesen. Ohne sie hieße jedes Kästchen der Liste „Kontrollkästchen".
 */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (naechster: boolean) => void
  label: string
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="visually-hidden">{label}</span>
    </label>
  )
}

export function Toggle({
  pressed,
  onToggle,
  children,
  role,
}: {
  pressed: boolean
  onToggle: () => void
  children: ReactNode
  role?: 'radio' | 'checkbox'
}) {
  const ariaProps = role === 'radio' ? { role, 'aria-checked': pressed } : { 'aria-pressed': pressed }
  return (
    <button type="button" className="toggle" onClick={onToggle} {...ariaProps}>
      <span className="mark" aria-hidden="true">
        {pressed ? '✓' : '＋'}
      </span>
      {children}
    </button>
  )
}

/**
 * Verantwortung und Ausführung sind verschiedene Dinge (INV-009). Der Unterschied wird
 * über die Rahmenart kodiert, nicht nur über Farbe: durchgezogen = Verantwortung,
 * gestrichelt = Ausführung.
 */
/** Farbiger Punkt mit Initialen. Steht nie allein – der Name folgt daneben. */
/**
 * Eine Auswahl aus mehreren – genau eine gilt.
 *
 * Bis hierher wurde dafür `Toggle` mit `role="radio"` benutzt, an acht Stellen: Kapazität,
 * Dauer einer Auszeit, Eingangsfilter, Dichte, Farbschema, Thema, Voreinstellung, Zeitraum
 * der Planung. `Toggle` trägt aber ein „＋" vor dem Wort, solange es nicht gewählt ist –
 * „＋ Pause" liest sich als „Pause hinzufügen", nicht als „Pause wählen". Und die Knöpfe
 * standen in einem `Chips`-Behälter ohne `radiogroup`, waren für Hilfsmittel also nicht
 * einmal als zusammengehörige Auswahl erkennbar.
 *
 * Ein zusammenhängender Streifen sagt schon durch seine Form, dass genau eines davon gilt.
 */
export function Auswahl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** Wonach wird gewählt? Wird vorgelesen, steht nicht sichtbar da. */
  label: string
  value: T | null
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="auswahl" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'ist-gewaehlt' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PersonDot({
  name,
  membershipId,
  size,
}: {
  name: string
  membershipId?: string | null
  size?: 'lg'
}) {
  const tone = useMemberClass(membershipId)
  return (
    <span
      className={`person-dot ${tone}${size === 'lg' ? ' lg' : ''}`}
      aria-hidden="true"
      title={name}
    >
      {initials(name)}
    </span>
  )
}

export function OwnerBadge({
  kind,
  name,
  isYou,
  membershipId,
}: {
  kind: 'responsibility' | 'execution' | 'vacant' | 'coverage' | 'shared'
  name?: string
  isYou?: boolean
  /** Färbt das Abzeichen in der Farbe dieser Person. */
  membershipId?: string | null
}) {
  const tone = useMemberClass(membershipId)
  const label = isYou ? 'du' : (name ?? 'unbekannt')
  /*
   * Das Präfix („verantwortlich:") verschwindet auf schmalen Bildschirmen aus der Anzeige,
   * bleibt aber für Vorleseprogramme erhalten. Auf 390 px lief die Zeile sonst seitlich aus
   * dem Bild – und „verantwortlich:" ist neben einem Namen ohnehin fast immer aus dem
   * Zusammenhang klar.
   */
  const prefix =
    kind === 'vacant' || kind === 'shared'
      ? ''
      : kind === 'coverage'
        ? 'vertreten: '
        : kind === 'execution'
          ? 'macht: '
          : 'verantwortlich: '
  const text = kind === 'vacant' ? 'niemand zuständig' : kind === 'shared' ? `alle: ${name ?? ''}` : label
  return (
    <span className={`owner-badge ${kind} ${kind === 'responsibility' ? tone : ''}`}>
      {/* Für „niemand zuständig" gibt es kein Symbol, das das ehrlich sagt – ein falsches
          wäre schlechter als keines. Der Text trägt die Bedeutung. */}
      {/* Die Person trägt ihre Farbe als Punkt; der Name steht daneben. */}
      {kind === 'shared' && <Icon name="family" size={ICON.sm} />}
      {kind === 'responsibility' && name ? (
        <PersonDot name={isYou ? (name ?? 'du') : name} membershipId={membershipId} />
      ) : (
        kind !== 'vacant' && <Icon name={kind === 'execution' ? 'check' : 'shield'} size={ICON.sm} />
      )}
      {prefix && <span className="badge-prefix">{prefix.trimEnd()}</span>}
      <span className="badge-name">{text}</span>
    </span>
  )
}

/* ══ Formulare ═══════════════════════════════════════════════════════ */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label className="t-label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className="t-body-sm hint" id={hintId}>
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && (
        <p className="t-body-sm error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...props} />
/**
 * Mehrzeiliger Text.
 *
 * Mit `markdown` versteht das Feld Auszeichnungen (`design/markdown.tsx`) und bekommt einen
 * Umschalter dazu. Geschrieben wird **roh** – ein Feld, das beim Tippen umformatiert, nimmt
 * einem die Kontrolle darüber, was tatsächlich gespeichert ist. Gelesen wird formatiert, und
 * zwar auf Wunsch schon hier: Rezeptschritte und Antworten stehen in dieser Anwendung nur im
 * Bogen, es gibt für sie keine zweite Ansicht, in der die Formatierung sonst sichtbar würde.
 */
export function Textarea({
  markdown,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { markdown?: boolean }) {
  const [vorschau, setVorschau] = useState(false)
  /*
    Ein Feld, in dem drei Zeilen Platz haben, sagt: Hier gehören drei Zeilen hin.

    Für eine Notiz stimmt das oft, für eine Zubereitung oder eine ausführliche Entscheidung
    nicht – und wer dort mehr schreibt, arbeitet durch ein Guckloch: Was oben steht, ist beim
    Schreiben der zehnten Zeile längst aus dem Bild. Der Zug am unteren Rand (`resize:
    vertical`) löst das nur mit der Maus; am Finger gibt es ihn nicht.

    Deshalb ein Knopf. Er steht neben „Vorschau", weil beides dasselbe beantwortet: wie man
    diesen Text gerade ansehen will.
  */
  const [gross, setGross] = useState(false)
  const wert = typeof props.value === 'string' ? props.value : ''
  if (!markdown) return <textarea className="textarea" {...props} />
  const flaeche = `textarea${gross ? ' gross' : ''}`
  return (
    <div className="textarea-markdown">
      {vorschau ? (
        <div className={`${flaeche} vorschau`} aria-live="polite">
          {wert.trim() ? (
            <Markdown className="t-body-sm">{wert}</Markdown>
          ) : (
            <p className="t-body-sm c-muted">Noch nichts geschrieben.</p>
          )}
        </div>
      ) : (
        <textarea className={flaeche} {...props} />
      )}
      <p className="textarea-fuss t-caption c-muted">
        <span>
          <strong>**fett**</strong>, <em>_kursiv_</em>, <code>- Liste</code>
        </span>
        <span className="textarea-knoepfe">
          {/*
            Auch die Vorschau wächst mit: Wer den Text groß schreibt, will ihn groß gegenlesen –
            ein Umschalter, der die Fläche wieder zusammenklappt, nähme den Gewinn sofort zurück.
          */}
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={gross}
            onClick={() => setGross((g) => !g)}
          >
            {gross ? 'Kleiner' : 'Größer'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setVorschau((v) => !v)}>
            {vorschau ? 'Bearbeiten' : 'Vorschau'}
          </Button>
        </span>
      </p>
    </div>
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select className="select" {...props} />
    </span>
  )
}

export function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="text">
        <p className="t-sub">{title}</p>
        <p className="t-body-sm desc">{description}</p>
      </div>
      {children}
    </div>
  )
}

/* ══ Zustandsflächen ═════════════════════════════════════════════════ */

export function EmptyState({
  icon = 'sparkle',
  title,
  description,
  action,
}: {
  icon?: IconName
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={ICON.lg} className="icon" />
      <Heading className="t-sub">{title}</Heading>
      <p className="t-body-sm">{description}</p>
      {action}
    </div>
  )
}

/**
 * Kompakter leerer Zustand: eine Zeile statt einer Kachel.
 *
 * Ein großer, gut gemeinter Leerzustand je Abschnitt summiert sich – ein frisch angelegter
 * Bereich bestand aus vier davon untereinander. Wo ein Abschnitt nur zufällig gerade leer
 * ist, genügt ein Satz und ein Weg (§20, §54).
 */
export function EmptyLine({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty-line">
      <p className="t-body-sm c-muted">{text}</p>
      {action}
    </div>
  )
}

export function Notice({
  tone = 'quiet',
  title,
  children,
}: {
  tone?: 'quiet' | 'accent' | 'attention' | 'critical' | 'info'
  title?: string
  children: ReactNode
}) {
  return (
    <div className={`notice notice-${tone}`}>
      {title && <p className="t-sub notice-title">{title}</p>}
      <p className="t-body-sm">{children}</p>
    </div>
  )
}

/**
 * Fehlermeldungen beantworten vier Fragen: was ist passiert, was bedeutet es,
 * ist etwas verloren, was kannst du tun (§21 des Auftrags).
 */
export function ErrorState({
  title = 'Das hat gerade nicht geklappt',
  meaning,
  reassurance = 'Es ist nichts verloren gegangen.',
  onRetry,
}: {
  title?: string
  meaning?: string
  reassurance?: string
  onRetry?: () => void
}) {
  return (
    <div className="notice notice-attention" role="alert">
      {/* Überschrift, nicht nur fetter Text: wer per Überschrift navigiert, muss den
          Fehlerzustand finden können (§38). */}
      <Heading className="t-sub notice-title">{title}</Heading>
      <p className="t-body-sm">
        {meaning ? `${meaning} ` : ''}
        {reassurance}
      </p>
      {onRetry && (
        <Actions>
          <Button size="sm" onClick={onRetry}>
            Erneut versuchen
          </Button>
        </Actions>
      )}
    </div>
  )
}

/**
 * §67: „Ohne Berechtigung" ist ein eigener Zustand, keine leere Seite und kein 403-Text.
 * Er erklärt, warum etwas fehlt und wer es freigeben kann.
 */
export function PermissionDenied({
  what = 'Dieser Bereich',
  who = 'Eine Person mit der Rolle „Verwaltung"',
}: {
  what?: string
  who?: string
}) {
  return (
    <div className="denied">
      <Icon name="lock" size={ICON.lg} className="icon" />
      <div>
        <Heading className="t-sub">{what} ist für dich nicht freigegeben</Heading>
        <p className="t-body-sm c-secondary" style={{ marginTop: 2 }}>
          {who} kann dir Zugriff geben. Bis dahin siehst du hier nichts – es fehlt dir nichts,
          was du bräuchtest.
        </p>
      </div>
    </div>
  )
}

export function Skeleton({ w = '100%', h = 14, radius }: { w?: string | number; h?: number; radius?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: radius }} />
}

/** Platzhalter in der Form des erwarteten Inhalts – kein Spinner (§22 des Auftrags). */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Wird geladen …</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <Skeleton w="34%" h={11} />
          <div style={{ height: 10 }} />
          <Skeleton w="72%" h={17} />
          <div style={{ height: 14 }} />
          <Skeleton w="100%" h={12} />
          <div style={{ height: 6 }} />
          <Skeleton w="88%" h={12} />
        </div>
      ))}
    </div>
  )
}

/* ══ Inhaltliche Bausteine ═══════════════════════════════════════════ */

export interface Reason {
  code: string
  label: string
  explanation: string
}

/**
 * Die Begründungen sind das Alleinstellungsmerkmal – aber vollständig gezeigt werden sie
 * zu Rauschen. Standardmäßig zwei, der Rest hinter „Mehr dazu" (Progressive Disclosure).
 */
export function Reasons({ items, max = 2 }: { items: Reason[]; max?: number }) {
  const shown = items.slice(0, max)
  const rest = items.slice(max)
  /*
   * Ein Grund ist ein Satz, kein Etikett mit Doppelpunkt.
   *
   * Vorher stand in jeder Zeile „**Label:** Erklärung" – zwei Schriftschnitte, zwei
   * Bedeutungsebenen, und das Etikett wiederholte meist die Erklärung. Jetzt trägt ein
   * Symbol die Kategorie und der Satz die Aussage (§3.3, §27).
   */
  const line = (reason: Reason) => (
    <li key={reason.code}>
      <Icon name={reasonIcon(reason.code)} size={ICON.sm} className="marker" />
      <span>{reason.explanation || reason.label}</span>
    </li>
  )
  return (
    <>
      <ul className="reasons t-body-sm">{shown.map(line)}</ul>
      {rest.length > 0 && (
        <details className="disclosure">
          <summary>
            {rest.length} weitere{rest.length === 1 ? 'r' : ''} Grund
          </summary>
          <ul className="reasons t-body-sm">{rest.map(line)}</ul>
        </details>
      )}
    </>
  )
}

/** Jede Begründungsart bekommt ein Symbol – schneller erfassbar als ein Wort. */
function reasonIcon(code: string): IconName {
  if (code.includes('overdue') || code.includes('due')) return 'clock'
  if (code.includes('wait')) return 'pause'
  if (code.includes('process')) return 'route'
  if (code.includes('owner') || code.includes('assignee')) return 'shield'
  if (code.includes('cost') || code.includes('energy')) return 'battery'
  if (code.includes('critical') || code.includes('severity')) return 'flag'
  return 'sparkle'
}

/** Was passiert, wenn nichts passiert (§2). Leise, aber vorhanden. */
export const Consequence = ({ children }: { children: ReactNode }) => (
  <p className="consequence t-caption">
    <Icon name="clock" size={ICON.sm} />
    {children}
  </p>
)

export function Disclosure({ summary, children, open }: { summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="disclosure" open={open}>
      <summary>{summary}</summary>
      <div className="body">{children}</div>
    </details>
  )
}

export const Steps = ({ children }: { children: ReactNode }) => <ol className="steps">{children}</ol>

export function Step({
  state,
  title,
  meta,
  action,
}: {
  state: 'done' | 'next' | 'open' | 'blocked'
  title: string
  meta?: string
  action?: ReactNode
}) {
  return (
    <li data-state={state}>
      <span className="marker" aria-hidden="true" />
      <span className="step-body">
        <span className="step-title">{title}</span>
        {meta && <span className="step-meta">{meta}</span>}
      </span>
      {action}
    </li>
  )
}

export { Icon }
export type { IconName }
