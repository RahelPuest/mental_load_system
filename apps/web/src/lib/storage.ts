/**
 * Gerätelokale Einstellungen – mit Umzug vom alten Namensraum (§24).
 *
 * Die Schlüssel hießen `mira.*`. Sie einfach umzubenennen hieße: Jede Person verliert beim
 * ersten Öffnen nach dem Update ihr Farbschema, ihre Dichte, ihren zuletzt gewählten Haushalt
 * und alles, was offline erfasst und noch nicht gesendet wurde. Produktbranding hat Vorrang,
 * aber nicht vor Daten.
 *
 * Deshalb ein Umzug statt eines Schnitts: Beim Lesen wird der neue Schlüssel gesucht, und
 * wenn er fehlt, der alte – dessen Wert wird dann unter dem neuen abgelegt und der alte
 * entfernt. Nach einmaligem Öffnen ist der alte Namensraum leer.
 *
 * Das ist bewusst **kein** dauerhafter Doppelbetrieb: Ein Fallback, der ewig bleibt, ist ein
 * zweiter Schlüssel, den irgendwann niemand mehr erklären kann. Diese Datei darf verschwinden,
 * sobald alle Geräte einmal geöffnet wurden – der Hinweis dazu steht hier.
 */

/** Der alte Namensraum. Nur zum Lesen, nur einmal je Schlüssel. */
const ALT = 'mira.'
const NEU = 'thealotta.'

/** Ob `localStorage` benutzbar ist – im privaten Fenster und in Prüfumgebungen wirft es. */
function verfuegbar(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Einen Wert lesen und dabei mitnehmen, was noch unter dem alten Namen liegt.
 *
 * `name` ist der Schlüssel **ohne** Namensraum, also `theme` statt `thealotta.theme`.
 */
export function readSetting(name: string): string | null {
  if (!verfuegbar()) return null
  try {
    const neu = localStorage.getItem(NEU + name)
    if (neu !== null) return neu
    const alt = localStorage.getItem(ALT + name)
    if (alt === null) return null
    /* Umziehen, nicht kopieren: Der alte Schlüssel soll nicht als zweite Wahrheit liegen bleiben. */
    localStorage.setItem(NEU + name, alt)
    localStorage.removeItem(ALT + name)
    return alt
  } catch {
    return null
  }
}

export function writeSetting(name: string, value: string): void {
  if (!verfuegbar()) return
  try {
    localStorage.setItem(NEU + name, value)
    localStorage.removeItem(ALT + name)
  } catch {
    /* Voll oder gesperrt – eine Einstellung ist es nicht wert, dafür die Seite anzuhalten. */
  }
}

export function removeSetting(name: string): void {
  if (!verfuegbar()) return
  try {
    localStorage.removeItem(NEU + name)
    localStorage.removeItem(ALT + name)
  } catch {
    /* siehe oben */
  }
}

/**
 * Der Schlüssel des Standard-Farbschemas.
 *
 * Es hieß `mira` – nach dem Produkt. Gespeichert steht dieser Wert in den Einstellungen
 * jedes Geräts, und `data-scheme` in der CSS hängt daran. Der Wert wird deshalb beim Lesen
 * übersetzt: Wer `mira` gespeichert hat, bekommt `thealotta`.
 */
export const DEFAULT_SCHEME = 'thealotta'

export function readScheme(): string {
  const wert = readSetting('scheme')
  if (wert === null || wert === 'mira') return DEFAULT_SCHEME
  return wert
}
