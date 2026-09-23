import type { IconName } from '../design/icons.js'

/**
 * Die Informationsarchitektur an genau einer Stelle (docs/41).
 *
 * Seitenleiste, mobile Übersicht und Befehlspalette lesen dieselbe Liste. Vorher gab es vier
 * Navigationsziele und fünf Seiten, die nur über Umwege erreichbar waren – Kalender und
 * Abläufe hingen an zwei Knöpfen der Familienseite, Vorgänge, Wissen und Beobachtung gab es
 * überhaupt nicht als Übersicht. Das verstößt gegen §64: Funktionen dürfen nicht
 * unauffindbar werden.
 *
 * Die Gruppen folgen dem Produktmodell: erst was jetzt zählt, dann wer wofür zuständig ist,
 * dann was wir wissen und beobachten.
 */
export interface NavEntry {
  to: string
  label: string
  icon: IconName
  /** Ein Satz, der erklärt, wofür der Ort da ist – für die Übersicht und für Vorleseprogramme. */
  purpose: string
  /** Zeigt einen Zähler in der Navigation. */
  counter?: 'inbox' | 'attention'
}

export interface NavGroup {
  label: string
  entries: NavEntry[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Täglich',
    entries: [
      {
        to: '/jetzt',
        label: 'Jetzt',
        icon: 'now',
        purpose: 'Was gerade zählt – kuratiert, begründet, mit nächstem Schritt.',
      },
      {
        to: '/plan',
        label: 'Der Plan',
        icon: 'calendar',
        purpose: 'Was diese Woche ansteht – Termine und Offenes aller.',
      },
      {
        to: '/eingang',
        label: 'Eingang',
        icon: 'inbox',
        purpose: 'Erfasstes einsortieren. Ein Vorschlag ist schon da.',
        counter: 'inbox',
      },
    ],
  },
  {
    label: 'Verantwortung',
    entries: [
      {
        to: '/bereiche',
        label: 'Bereiche',
        icon: 'domains',
        purpose: 'Der Baum eurer Themen und wer für welches mitdenkt.',
      },
      {
        to: '/familie',
        label: 'Familie',
        icon: 'family',
        purpose: 'Kapazität, Vertretungen, Verteilung und wer dazugehört.',
      },
    ],
  },
  {
    label: 'Übersicht',
    entries: [
      {
        to: '/vorgaenge',
        label: 'Vorgänge',
        icon: 'route',
        purpose: 'Alles Mehrschrittige, das gerade läuft – bereichsübergreifend.',
      },
      {
        to: '/wissen',
        label: 'Wissen',
        icon: 'book',
        purpose: 'Notizen, offene Fragen und Entscheidungen an einem Ort.',
      },
      {
        to: '/regeln',
        label: 'Regeln',
        icon: 'eye',
        purpose: 'Was von selbst passiert oder auffällt – und was sich gemeldet hat.',
        counter: 'attention',
      },
      {
        to: '/essen',
        label: 'Essen',
        icon: 'meal',
        purpose: 'Was diese Woche auf den Tisch kommt – und was ihr dafür braucht.',
      },
      {
        to: '/kalender',
        label: 'Kalender',
        icon: 'calendar',
        purpose: 'Verbundene Kalender, Sichtbarkeit und die nächsten Termine.',
      },
      {
        to: '/ablaeufe',
        label: 'Abläufe',
        icon: 'sparkle',
        purpose: 'Erprobte Schrittfolgen für Wiederkehrendes.',
      },
    ],
  },
]

export const ALL_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap((g) => g.entries)

/**
 * Das vollständige Verzeichnis. Auf dem Telefon der vierte Platz in der unteren Leiste –
 * kein Sammelbecken für Reste, sondern die erklärte Liste aller Orte.
 */
export const OVERVIEW_ENTRY: NavEntry = {
  to: '/uebersicht',
  label: 'Übersicht',
  icon: 'more',
  purpose: 'Alle Orte in Thealotta mit einem Satz dazu, wofür sie da sind.',
}

/** Mobil im Daumenbereich: vier Ziele plus Erfassen. */
export const MOBILE_PRIMARY: NavEntry[] = [
  ALL_ENTRIES.find((e) => e.to === '/jetzt')!,
  ALL_ENTRIES.find((e) => e.to === '/bereiche')!,
  ALL_ENTRIES.find((e) => e.to === '/eingang')!,
  OVERVIEW_ENTRY,
]

/** Hilfe gehört zu einer vollständigen Oberfläche (§61) – erreichbar, aber nicht im Weg. */
export const HELP_ENTRY: NavEntry = {
  to: '/hilfe',
  label: 'Wie Thealotta denkt',
  icon: 'book',
  purpose: 'Die Begriffe des Produkts in zwei Minuten erklärt.',
}

export const SETTINGS_ENTRY: NavEntry = {
  to: '/einstellungen',
  label: 'Einstellungen',
  icon: 'settings',
  purpose: 'Haushalt, Menschen, Zugriff, Benachrichtigungen, Konto und Daten.',
}
