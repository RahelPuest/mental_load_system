/**
 * Ein einziges Icon-System (§33).
 *
 * Inline-SVG statt Unicode-Glyphen: einheitliche Strichstärke, einheitliches Raster,
 * vorhersehbare optische Größe. Icons sind grundsätzlich dekorativ – die Bedeutung steht
 * immer zusätzlich im Text (§38: Farbe und Form nie alleiniger Bedeutungsträger).
 *
 * **Der Strich ist 2 px stark** (Richtung A, docs/69): kräftig genug, um neben schweren
 * Schriftgraden und 2-px-Rahmen zu bestehen – ein Piktogramm, keine Linienzeichnung. In der
 * vorigen Gestalt war er 1,6 px und wirkte daneben zerbrechlich.
 *
 * **Jedes Zeichen muss bei 16 px lesbar sein.** Das ist die kleinste benutzte Stufe
 * (`ICON.sm`) und zugleich die härteste: Auf einem kleinen Knopf ohne Beschriftung trägt das
 * Zeichen die ganze Bedeutung allein.
 *
 * Drei Zeichen sind daran gescheitert und wurden neu gezeichnet (September 2026): `sparkle`
 * zerfiel in zwei Flusen, `route` in ein Knäuel, `battery` verlor seinen Pol. Die Ursache war
 * jedes Mal dieselbe – **ein kleines Detail weit weg vom Hauptkörper**. Bei 48 px ist das
 * Komposition, bei 16 px sind es Krümel.
 *
 * Als Faustregel beim Zeichnen: Ein abgesetztes Teil braucht mindestens etwa 4 Einheiten
 * Ausdehnung (von 24) und darf höchstens etwa 3 Einheiten Abstand zum Hauptkörper haben,
 * sonst löst es sich. Ausnahmen sind Zeichen, die **aus** Punkten bestehen und als Textur
 * gemeint sind (`grip`, `more`) – dort ist die Streuung die Aussage.
 *
 * Geprüft wird das mit dem Auge, nicht mit einer Zusicherung: Lesbarkeit lässt sich nicht
 * messen. Wer ein Zeichen hinzufügt, rendert das Set einmal bei 16 px nebeneinander.
 */
import type { SVGProps } from 'react'

export type IconName =
  | 'now'
  | 'domains'
  | 'inbox'
  | 'family'
  | 'plus'
  | 'search'
  | 'settings'
  | 'grip'
  | 'arrowUp'
  | 'chevronRight'
  | 'chevronLeft'
  | 'check'
  | 'clock'
  | 'calendar'
  | 'book'
  | 'flag'
  | 'eye'
  | 'lock'
  | 'battery'
  | 'route'
  | 'bell'
  | 'device'
  | 'shield'
  | 'trash'
  | 'more'
  | 'sparkle'
  | 'meal'
  | 'archive'
  | 'history'
  | 'pause'
  | 'move'
  | 'pencil'

const PATHS: Record<IconName, string> = {
  /*
    „Jetzt" und „Uhr" sind dasselbe Zeichen – vorher waren es zwei fast gleiche.

    Die Zeiger standen minimal verschieden (4 statt 3,8 Einheiten, 2,4 statt 3 lang). Das
    sieht niemand als Unterschied, sondern als Ungenauigkeit: dieselbe Aussage in zwei
    Ausprägungen. Eine Zeichnung, zwei Namen.
  */
  now: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 3.8V12l3 1.8',
  domains: 'M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1v-8.8Z',
  inbox: 'M4 13h4l1.2 2.4h5.6L16 13h4M4 13 6.4 5.6A1 1 0 0 1 7.35 5h9.3a1 1 0 0 1 .95.6L20 13v4.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V13Z',
  family: 'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19.5c0-2.8 2.2-5 5-5s5 2.2 5 5m2.5-6c2.2 0 4 1.8 4 4',
  plus: 'M12 5.5v13M5.5 12h13',
  search: 'M10.75 17.5a6.75 6.75 0 1 0 0-13.5 6.75 6.75 0 0 0 0 13.5Zm4.9-1.85L20 20',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.05a7.6 7.6 0 0 0 0-1.9l1.8-1.35-1.9-3.3-2.1.85a7.6 7.6 0 0 0-1.65-.95L15.2 3.2h-3.8l-.35 2.2a7.6 7.6 0 0 0-1.65.95l-2.1-.85-1.9 3.3 1.8 1.35a7.6 7.6 0 0 0 0 1.9L5.4 15.4l1.9 3.3 2.1-.85c.5.4 1.06.72 1.65.95l.35 2.2h3.8l.35-2.2c.59-.23 1.15-.55 1.65-.95l2.1.85 1.9-3.3-1.8-1.35Z',
  /* „Eine Ebene höher" im Bearbeiten-Modus der Bereiche. */
  /* Griff zum Ziehen: zwei Punktreihen, das übliche Zeichen dafür. */
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  arrowUp: 'M12 19V5m0 0-6 6m6-6 6 6',
  chevronRight: 'm9.5 5.5 6.5 6.5-6.5 6.5',
  chevronLeft: 'M14.5 5.5 8 12l6.5 6.5',
  check: 'm5 12.8 4.6 4.4L19 6.5',
  clock: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 3.8V12l3 1.8',
  calendar: 'M4.5 8.8h15M7.5 4.5v3m9-3v3M6 6.5h12a1.5 1.5 0 0 1 1.5 1.5v10.5A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5Z',
  book: 'M4.5 5.2A1.7 1.7 0 0 1 6.2 3.5H19a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H6.2a1.7 1.7 0 0 0-1.7 1.7V5.2Zm0 13.1a1.7 1.7 0 0 1 1.7-1.7H19M9.5 3.5v6l2-1.4 2 1.4v-6',
  flag: 'M6 20V4.8m0 0h11.5l-2.3 4 2.3 4H6',
  eye: 'M12 6.2c-4 0-7.2 2.9-8.5 5.8 1.3 2.9 4.5 5.8 8.5 5.8s7.2-2.9 8.5-5.8C19.2 9.1 16 6.2 12 6.2Zm0 8.3a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  lock: 'M7.5 10.5V8a4.5 4.5 0 1 1 9 0v2.5M6.5 10.5h11A1.5 1.5 0 0 1 19 12v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5V12a1.5 1.5 0 0 1 1.5-1.5Z',
  /* Der Pol saß 2,5 Einheiten neben dem Gehäuse und löste sich bei 16 px zu einem Fussel;
     jetzt sitzt er näher und trägt etwas mehr Länge. */
  battery:
    'M4.5 8.4h12.4a1.6 1.6 0 0 1 1.6 1.6v4a1.6 1.6 0 0 1-1.6 1.6H4.5A1.6 1.6 0 0 1 2.9 14v-4a1.6 1.6 0 0 1 1.6-1.6Zm15.6 2.2v2.8',
  /*
    Neu gezeichnet – bei 16 px war es ein Knäuel.

    Vorher: zwei Kreise mit Radius 2,5 und zwei Winkelstrecken, die sich überlagerten. Bei
    16 px verschmolz das zu einem Gekritzel ohne erkennbare Form – ausgerechnet am
    Navigationspunkt „Vorgänge". Jetzt zwei deutlich größere Knoten und **eine** Strecke
    dazwischen, die einmal abbiegt: ein Weg mit Stationen, was ein Vorgang ist.
  */
  route:
    'M6 9.4a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm12 11.6a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM6 9.4v4.4a4 4 0 0 0 4 4h4.8',
  bell: 'M9.5 18.5a2.5 2.5 0 0 0 5 0M6 18.5h12l-1.4-2.1V11a4.6 4.6 0 1 0-9.2 0v5.4L6 18.5Z',
  device: 'M8 3.5h8A1.5 1.5 0 0 1 17.5 5v14A1.5 1.5 0 0 1 16 20.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5Zm2.5 14h3',
  shield: 'M12 3.8 5.5 6.2v5.4c0 4 2.7 7.5 6.5 8.6 3.8-1.1 6.5-4.6 6.5-8.6V6.2L12 3.8Z',
  trash: 'M5.5 7.5h13M10 7.5V5.8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.7m3 0-.7 11.2a1 1 0 0 1-1 .93H8.7a1 1 0 0 1-1-.93L7 7.5',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  /* Teller mit Besteck – die Essensplanung (docs/63). */
  meal: 'M5 4v6a2.5 2.5 0 0 0 5 0V4M7.5 12.5V20M14.5 20v-6.5c-1 0-1.5-.8-1.5-2.5 0-3.4 1.3-6 3-7v16',
  /*
    Neu gezeichnet, weil es bei 16 px zerfiel.

    Vorher: ein Stern mit Spannweite 12 Einheiten und ein zweiter, fast gleich großer, weit
    unten rechts abgesetzt. Bei 48 px eine schöne Komposition – bei 16 px zwei getrennte
    Flusen im Diagonalen, die neben einer geschlossenen Form wie der Mülltonne wie ein
    Rendering-Fehler aussehen. Genau dort steht das Zeichen aber am häufigsten: als alleiniges
    Zeichen auf einem kleinen Knopf, wo es die ganze Bedeutung tragen muss.

    Jetzt: ein deutlich größerer Hauptstern und ein kleiner Trabant, der nah genug sitzt, dass
    beide eine Silhouette bilden. Die Doppelform bleibt – sie ist es, die „vorgeschlagen"
    heißt; ein einzelner Stern läse sich als „Favorit".
  */
  sparkle:
    'M10.6 3.4l2.15 5.55 5.55 2.15-5.55 2.15-2.15 5.55-2.15-5.55L2.9 11.1l5.55-2.15L10.6 3.4Z M18.4 15.2l.75 1.95 1.95.75-1.95.75-.75 1.95-.75-1.95-1.95-.75 1.95-.75.75-1.95Z',
  archive: 'M3 7.5h18M4.5 7.5v10.2a1.3 1.3 0 0 0 1.3 1.3h12.4a1.3 1.3 0 0 0 1.3-1.3V7.5M3 4.8h18v2.7H3zM9.7 11.5h4.6',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V9h4.5M12 7.6V12l3.2 1.9',
  pause: 'M9.5 6v12M14.5 6v12',
  /* Etwas geht nach drueben: Pfeil aus einer offenen Klammer heraus in die naechste. */
  move: 'M10 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H10M14 4.5h4.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H14M8.5 12h8m0 0-2.8-2.8M16.5 12l-2.8 2.8',
  /* Ein Stift auf einer Linie: aendern, nicht einstellen. */
  pencil: 'M4 20h4L19.3 8.7a2.1 2.1 0 0 0-3-3L5 17v3Zm10.8-13.2 3.4 3.4',
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

/**
 * Drei Größen, jede an eine Textrolle gebunden.
 *
 * Vorher standen neun Werte im Code – 13, 15, 16, 17, 18, 19, 20, 22, 24, 26 – an
 * fünfundzwanzig von Hand gesetzten Stellen. Zwei Symbole in vergleichbarer Lage waren
 * einen Pixel auseinander, ohne dass ein Unterschied gemeint war; das liest sich als
 * Unruhe, ohne dass man sie benennen kann.
 *
 *   sm  neben Kleintext – Chips, Metazeilen, Marker
 *   md  Standard – Zeilen, Abschnittsköpfe, Navigation, Knöpfe, Kopfleiste
 *   lg  eigenständig – Leerzustände, große Schaltflächen
 *
 * Zwischen den Stufen liegt jeweils ein sichtbarer Sprung. Eine vierte Stufe dazwischen
 * wäre wieder ein Unterschied, den niemand als Absicht liest.
 */
export const ICON = { sm: 16, md: 20, lg: 24 } as const

export function Icon({ name, size = ICON.md, ...rest }: IconProps) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
