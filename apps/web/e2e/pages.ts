/** Jeder Ort der Oberfläche, den es zu prüfen gibt – eine Quelle für alle Browserprüfungen. */
export interface Target {
  name: string
  path: string
  /** Woran man erkennt, dass die Seite steht. */
  heading: RegExp
  /**
   * Abweichendes Budget an Bedienelementen für `cognitive-load.spec.ts`.
   *
   * Nur für Ansichten, deren Zahl mit dem Inhalt wächst und deren Ziele **gleichartig** sind:
   * Eine Einkaufsliste mit dreißig Zeilen verlangt keine Sortierarbeit vom Blick, sie ist
   * eine Reihenfolge zum Abarbeiten. Das allgemeine Budget von 40 bleibt, wofür es gedacht
   * ist – Ansichten, auf denen verschiedene Dinge um Aufmerksamkeit konkurrieren.
   *
   * Wer hier eine Zeile hinzufügt, muss diesen Satz für seine Seite belegen können.
   */
  interactiveBudget?: number
}

export const BREAKPOINTS = [
  { name: 'mobil', width: 390, height: 844 },
  { name: 'gross-mobil', width: 480, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'breit', width: 1680, height: 1050 },
] as const

export const TARGETS: Target[] = [
  { name: 'jetzt', path: '/jetzt', heading: /Was zählt gerade/i },
  { name: 'plan', path: '/plan', heading: /Der Plan/i },
  { name: 'eingang', path: '/eingang', heading: /Eingang/i },
  { name: 'bereiche', path: '/bereiche', heading: /Bereiche/i },
  { name: 'familie', path: '/familie', heading: /Familie/i },
  { name: 'vorgaenge', path: '/vorgaenge', heading: /Vorgänge/i },
  { name: 'wissen', path: '/wissen', heading: /Wissen/i },
  { name: 'regeln', path: '/regeln', heading: /Regeln/i },
  /*
    Der Wochenplan ist ein Raster aus vierzehn gleichen Zellen, und jede trägt dieselben drei
    Ziele: den Namen, „anderes Gericht", „aus dem Plan nehmen". Voll geplant sind das 42 – die
    Zahl kommt nicht daher, dass die Seite viel anbietet, sondern daher, dass die Woche sieben
    Tage hat. Gleichartige Ziele in einem Raster verlangen keine Sortierarbeit vom Blick: Man
    sucht den Tag, nicht den Knopf.

    Der Rest der Seite bleibt klein – Kopf, Register, Filter und die gedeckelte Gerichteliste
    kommen zusammen auf 22. Genau die wären das, was ein Budget begrenzen soll, und sie
    wachsen nicht.
  */
  { name: 'essen', path: '/essen', heading: /Essen/i, interactiveBudget: 70 },
  { name: 'essen-sammlung', path: '/essen/sammlung', heading: /Essen/i },
  /*
    Zwei Ziele je Zeile – abhaken und „haben wir schon" –, und die Zeilen sind der Inhalt.
    Bei einer Wocheneinkaufsliste von dreißig Posten sind das sechzig gleichartige Ziele.
  */
  { name: 'essen-einkauf', path: '/essen/einkauf', heading: /Essen/i, interactiveBudget: 80 },
  { name: 'essen-einstellungen', path: '/essen/einstellungen', heading: /Essen/i },
  { name: 'kalender', path: '/kalender', heading: /Kalender/i },
  { name: 'ablaeufe', path: '/ablaeufe', heading: /Abläufe/i },
  { name: 'uebersicht', path: '/uebersicht', heading: /Übersicht/i },
  { name: 'hilfe', path: '/hilfe', heading: /Wie Thealotta denkt/i },
  /* Auf breiten Bildschirmen zeigt /einstellungen sofort den ersten Bereich – dort steht
     „Haushalt" als Überschrift, auf schmalen „Einstellungen". */
  { name: 'einstellungen', path: '/einstellungen', heading: /Einstellungen|Haushalt/i },
  { name: 'einstellungen-haushalt', path: '/einstellungen/haushalt', heading: /Haushalt/i },
  { name: 'einstellungen-mitglieder', path: '/einstellungen/mitglieder', heading: /Mitglieder/i },
  { name: 'einstellungen-farben', path: '/einstellungen/farben', heading: /Farben/i },
  { name: 'einstellungen-rechte', path: '/einstellungen/rechte', heading: /Wer sieht was|Zugriff/i },
  { name: 'einstellungen-daten', path: '/einstellungen/daten', heading: /Daten/i },
]
