# 42 – Designsystem

Implementiert in `apps/web/src/design/`. Kein Wert im Produktcode darf außerhalb dieser
Token entstehen.

## 1. Designprinzipien

| # | Prinzip | Konsequenz im Interface |
|---|---|---|
| 1 | **Ruhe vor Vollständigkeit** | Standardmäßig das Wichtigste; Rest hinter Aufklappen. Nie alle Begründungen, nie alle Chips. |
| 2 | **Das System trägt, nicht der Nutzer** | Jede Ansicht beantwortet ungefragt „warum jetzt" und „was als Nächstes". Keine Sortier- und Filterarbeit als Nutzeraufgabe. |
| 3 | **Eine Handlung pro Ort** | Genau eine Primäraktion je Ansicht. Alles andere ist visuell zurückgenommen. |
| 4 | **Stabile Orte** | Gleiche Dinge stehen immer an derselben Stelle. Bei schwankender Aufmerksamkeit ist Wiedererkennung wichtiger als Eleganz. |
| 5 | **Farbe erklärt nicht, sie betont** | Bedeutung immer zusätzlich als Text oder Symbol. |
| 6 | **Nichts geht verloren, auch visuell nicht** | Zurückgestelltes bleibt auffindbar. Erledigtes ist mit Undo zurückholbar. |
| 7 | **Leiser statt weniger** | Bei geringer Kapazität sinkt die Dichte, nicht der Funktionsumfang. |

## 2. Farbsystem

### Neutralskala (warm, nicht grau)

`--n-0` bis `--n-1000` in zwölf Stufen. Warm gebrochen (Hue 40°, sehr geringe Sättigung),
damit Flächen nach Papier aussehen und nicht nach Bildschirm.

| Rolle | Hell | Dunkel |
|---|---|---|
| `--bg` | `--n-50` | `--n-950` |
| `--surface` | `--n-0` | `--n-900` |
| `--surface-raised` | `--n-0` + Schatten | `--n-850` |
| `--surface-sunken` | `--n-100` | `--n-1000` |
| `--border-subtle` | `--n-150` | `--n-800` |
| `--border` | `--n-200` | `--n-750` |
| `--text` | `--n-900` | `--n-100` |
| `--text-secondary` | `--n-600` | `--n-300` |
| `--text-muted` | `--n-500` | `--n-400` |

### Akzent

Gedämpftes Tannengrün, 5 Stufen. Verwendet für: Primäraktion, aktive Navigation, Fokus,
Verantwortungskennzeichnung. **Nicht** für Status.

### Semantische Farben

| Token | Bedeutung | Verwendung |
|---|---|---|
| `--success` | Abgeschlossen, bestätigt, aktuell | Bestätigungshinweise, frische Angaben |
| `--attention` (Bernstein) | Braucht Aufmerksamkeit, veraltet, unklar | Hinweise, veraltete Zustände, fehlender Kontext |
| `--critical` (gedämpftes Rot) | Echte Kritikalität oder Zerstörung | Versorgungskritische Bereiche, Löschen, Rechteentzug |
| `--info` (Blaugrau) | Neutraler Kontext, Wartezustand | „Wartet auf", Vertretung, Systemherkunft |

**Regel:** Ein überschrittener Zeitpunkt ist **nicht** kritisch, sondern `attention`.
Rot bleibt echten Konsequenzen und destruktiven Aktionen vorbehalten (§26 des Auftrags).

### Kontrast

Alle Text-auf-Fläche-Paare erreichen ≥ 4.5:1, Sekundärtext ≥ 4.5:1, große Titel ≥ 3:1.
Fokusring ≥ 3:1 gegen Nachbarflächen.

## 3. Typografie

| Rolle | Größe | Gewicht | Zeilenhöhe | Verwendung |
|---|---|---|---|---|
| `display` | 30/34 px | 660 | 1.15 | Einstieg, Anmeldung |
| `title` | 23/25 px | 640 | 1.2 | Seitentitel |
| `heading` | 18 px | 620 | 1.3 | Abschnittsüberschrift |
| `subheading` | 15 px | 620 | 1.35 | Kartentitel |
| `body` | 16 px | 400 | 1.55 | Fließtext |
| `body-sm` | 14.5 px | 400 | 1.5 | Sekundärtext, Begründungen |
| `label` | 13.5 px | 600 | 1.4 | Formularbeschriftung |
| `caption` | 12.5 px | 500 | 1.4 | Metadaten, Zeitangaben |
| `overline` | 11.5 px | 700, `0.06em` | 1.3 | Rubriken über Titeln |

Zwei Gewichte im Fließtext (400/600), zwei in Überschriften (620/660). Keine weiteren.
Zahlen in Metadaten nutzen `font-variant-numeric: tabular-nums`.

## 4. Abstände

4-px-Basis: `1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64`.

**Rhythmusregel:** Innerhalb einer Gruppe `2`, zwischen Gruppen `4`, zwischen Abschnitten `8`,
zwischen Seitenbereichen `12`. Diese vier Werte tragen 90 % des Layouts.

## 5. Radien, Tiefe, Bewegung

| Token | Wert | Verwendung |
|---|---|---|
| `--r-sm` | 8 px | Chips, kleine Knöpfe |
| `--r-md` | 12 px | Eingabefelder, Knöpfe |
| `--r-lg` | 16 px | Karten, Panels |
| `--r-xl` | 22 px | Sheets, Dialoge |
| `--r-full` | 999 px | Auswahlchips, Avatare |

Tiefe in drei Stufen: `flat` (nur Rahmen) · `raised` (Karte) · `overlay` (Sheet, Dialog,
Palette). Im Dunkelmodus ersetzt Flächenhelligkeit den Schatten.

Bewegung: `--motion-fast 120ms`, `--motion-base 180ms`, `--motion-slow 260ms`, Kurve
`cubic-bezier(0.2, 0, 0, 1)`. Nur für Ein-/Ausblenden, Aufklappen und Sheets.
`prefers-reduced-motion` schaltet alles auf 0.01 ms.

## 6. Komponenten

| Komponente | Zweck | Regel |
|---|---|---|
| `Page` | Titel, Untertitel, Primäraktion | Genau eine Primäraktion |
| `Section` | Gliederung mit Überschrift | Ersetzt Karten für reine Gruppierung |
| `Panel` | Abgegrenzte Einheit mit Rahmen | Nur wenn eine echte Einheit vorliegt |
| `Card` | Interaktive Einheit | Nur für Listeneinträge mit Aktion |
| `Tile` | Kompakte Datenanzeige (Zustandswert) | Kein Rahmen, nur Fläche |
| `Button` | primary/secondary/ghost/destructive/icon | Eine Primary pro Ansicht |
| `Chip` | *Nur Status*, nicht interaktiv | Interaktive Auswahl heißt `Toggle` |
| `Toggle` | Auswahl (Kontext, Kanal, Kapazität) | `aria-pressed`/`aria-checked` |
| `Field` | Label + Hinweis + Fehler + Eingabe | Fehler per `aria-describedby` |
| `Sheet` | Mobil unten, ab Tablet zentriert | Fokusfalle, Escape, Rückgabefokus |
| `Toast` | Rückmeldung, optional Undo | Höflich, 6 s, nie modal |
| `Skeleton` | Ladeplatzhalter | Form entspricht dem echten Inhalt |
| `EmptyState` | Erklärung + Primäraktion | Nie „keine Daten" |
| `ErrorState` | Was, Bedeutung, Folge, Handlung | Nie technischer Text |
| `OwnerBadge` | Verantwortung vs. Ausführung | Verantwortung mit Rahmen, Ausführung ohne |
| `Disclosure` | Progressive Offenlegung | Standard zu |
| `CommandPalette` | Suche + Aktionen | ⌘K, nur ab Tablet |

## 7. Zustandsmuster

### Leer
Erklärung, wozu der Bereich da ist · konkretes Beispiel · genau eine Primäraktion.
Nie „Noch keine Daten."

### Laden
Skeletons in der Form des erwarteten Inhalts. Spinner nur für Aktionen im Knopf.
Optimistische Aktualisierung bei Abhaken, Zurückstellen und Wegklicken.

### Fehler
Vier Fragen beantworten: Was ist passiert · Was bedeutet es · Ist etwas verloren · Was kannst du tun.

> Die Kalenderverbindung ist gerade unterbrochen. Deine Bereiche und Aufgaben bleiben
> unverändert – es kommen nur keine neuen Termine dazu. Wir versuchen es weiter.
> [Jetzt erneut versuchen]

### Teilweise Daten
Anzeigen, was da ist; fehlende Teile benennen statt weglassen.

### Ohne Berechtigung
Erklären, wer Zugriff geben kann – keine leere Seite, kein 403-Text.

## 8. UX-Writing

| Nicht | Sondern |
|---|---|
| Überfällig | Zeitpunkt ist vorbei |
| Du bist im Rückstand | Wartet seit … |
| 14 unerledigte Aufgaben | 14 offen |
| Fehler beim Speichern | Das konnte nicht gespeichert werden |
| OK | Speichern · Übernehmen · Erledigt |
| Abbrechen (bei Zerstörung) | Behalten |
| Sind Sie sicher? | Was passiert konkret |

Knöpfe benennen die Handlung. Erklärungen stehen dort, wo entschieden wird – nicht in einer
Hilfeseite. Kein „Sie". Kein Ausrufezeichen in Statusmeldungen.

## 9. Barrierefreiheit

Verbindlich:

- Semantisches HTML; `<nav>`, `<main>`, `<section>` mit `aria-labelledby`.
- Fokus immer sichtbar, 2,5 px, ≥ 3:1 Kontrast, nie entfernt.
- Trefferflächen ≥ 44 × 44 px, Abstand ≥ 8 px.
- Jede Statusfarbe zusätzlich als Text oder Symbol.
- Sheets: Fokusfalle, Escape schließt, Fokus kehrt zum Auslöser zurück.
- Live-Regionen für Toasts (`role="status"`) und Ladezustände (`aria-busy`).
- Formularfehler über `aria-describedby` + `aria-invalid`.
- 200 % Zoom ohne horizontales Scrollen.
- `prefers-reduced-motion` und `prefers-color-scheme` respektiert.

## 10. Definition of Done je Ansicht

Desktop · Tablet · Mobile · leer · lädt · Fehler · Teildaten · sehr lange Namen ·
ohne Berechtigung · Tastatur · Fokus · Trefferflächen · hell · dunkel.
