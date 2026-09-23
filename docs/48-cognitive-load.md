# 48 – Kognitive Last: gemessen, nicht geschätzt

> **Regel dieses Durchgangs:** Die wahrgenommene Komplexität sinkt, die Fähigkeiten bleiben
> vollständig. Keine Funktion, keine Option, keine Einstellung, kein Arbeitsweg wurde
> entfernt. Wo etwas nicht mehr sofort ins Auge fällt, ist es einen benannten Klick entfernt
> – nie einen geratenen.

Thealotta ist ein Werkzeug gegen mentale Last. Eine Oberfläche, die selbst mentale Last erzeugt,
widerspricht ihrem eigenen Zweck. Dieser Durchgang behandelt „wirkt überladen" deshalb nicht
als Geschmacksfrage, sondern als messbare Eigenschaft.

## Wie gemessen wird

Ein Skript öffnet jeden Bildschirm im gebauten Bündel (`vite preview`, nicht der
Entwicklungsserver) mit echten Daten und zählt nur, was tatsächlich sichtbar ist –
`checkVisibility({ contentVisibilityAuto, visibilityProperty })`. Inhalt hinter einem
geschlossenen Aufklapper zählt nicht: Er verlangt gerade keine Aufmerksamkeit.

| Kennzahl | Was sie erfasst |
| --- | --- |
| **Bedien** | Sichtbare Ziele: `button, a[href], select, input, textarea, summary` |
| **Paare** | Verschiedene Kombinationen aus Schriftgröße *und* -gewicht |
| **Größen** | Verschiedene Schriftgrößen |
| **Farben** | Verschiedene Textfarben |
| **Kästen** | Abgegrenzte Flächen: `.panel, .card, section.section, .notice, .tinted` |
| **Laut** | Elemente, die aktiv nach Aufmerksamkeit rufen (Primärknopf, Warnton) |
| **Primär** | *Verschiedene* dominante Aktionen (dieselbe Aktion mehrfach zählt als eine) |

„Paare" statt nur „Größen" ist der wichtigere Wert: Zwei Textzeilen gleicher Größe mit
verschiedenem Gewicht lesen sich nicht als Rangfolge, sondern als Unentschlossenheit.

## Phase 1 – Befund

Der Ausgangsstand, nach Schwere sortiert. Vier Bildschirme fielen heraus:

| Bildschirm | Bedien | Größen | Kästen | Höhe | Kernproblem |
| --- | ---: | ---: | ---: | ---: | --- |
| `familie` | 35 | 9 | 7 | 3206 px | Dieselben Bereiche standen in zwei Listen untereinander |
| `jetzt` | 17 | 7 | 2 | 1184 px | Zehn Größe-Gewicht-Paare auf einer Ansicht |
| `hilfe` | 8 | 6 | 14 | 2164 px | Acht gleich große Kästen ohne Lesereihenfolge |
| `einstellungen/mitglieder` | 14 | 7 | 6 | 1441 px | Zu viele Textränge für drei Inhaltsarten |

### Kognitive Last nach Art (A–G)

| Bildschirm | A Visuell | B Entscheidung | C Gedächtnis | D Navigation | E Deutung | F Interaktion | G Sinnesreiz |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `familie` | **Kritisch** | Hoch | **Kritisch** | Mittel | Hoch | Hoch | Niedrig |
| `jetzt` | Hoch | Mittel | Niedrig | Niedrig | Mittel | Mittel | Niedrig |
| `hilfe` | Hoch | Niedrig | Niedrig | Mittel | Niedrig | Niedrig | Niedrig |
| `einstellungen/*` | Mittel | Mittel | Niedrig | Niedrig | Mittel | Niedrig | Niedrig |
| `bereiche` | Mittel | Mittel | Niedrig | Niedrig | Niedrig | Mittel | Niedrig |
| übrige | Niedrig | Niedrig | Niedrig | Niedrig | Niedrig | Niedrig | Niedrig |

Der teuerste Posten war **C (Gedächtnis) auf `familie`**: „Ohne Zuständigkeit (5)" und
„Verantwortung im Überblick (13)" führten dieselben Bereiche. Wer beides sah, musste im Kopf
abgleichen, ob es dieselben Dinge sind – Arbeitsspeicher, der für nichts verbraucht wird.
Die zweite Liste war zudem eine Kopie der Seite `/bereiche`.

**G (Sinnesreiz)** war durchgehend niedrig und bleibt es: keine Animation über 200 ms, keine
automatisch bewegten Inhalte, `prefers-reduced-motion` wird respektiert.

## Phase 2 – Was wohin gewandert ist

Vollständige Liste der Verschiebungen. Die letzte Spalte ist die Bedingung, unter der dieser
Durchgang überhaupt zulässig war.

| Funktion | Vorher | Interaktion vorher | Nachher | Interaktion nachher | Erreichbar? |
| --- | --- | --- | --- | --- | --- |
| Suche | Seitenleiste | Knopf | Kopfzeile | Knopf + `⌘K` | ✅ zusätzlich |
| Meldungen | Seitenleiste | Knopf → Vollbild | Kopfzeile | Knopf → Ausklapp unter dem Knopf | ✅ |
| Konto / Abmelden | fehlte | – | Kopfzeile | Menü | ✅ neu |
| Einstellungen | Seitenleiste | Verweis | Kopfzeile | Verweis | ✅ |
| Hilfe | fehlte | – | Kopfzeile | Verweis | ✅ neu |
| Offene Zuständigkeiten | `familie`, Abschnitt 2 | Liste, 2 Knöpfe/Zeile | `familie`, „Wo niemand mitdenkt" | Zeile öffnet, 1 Knopf/Zeile | ✅ |
| Alle Bereiche + Zuständigkeit | `familie`, Abschnitt 3 (offen) | Liste | `familie`, „Wer was trägt" | Aufklapper *und* Verweis auf `/bereiche` | ✅ zwei Wege |
| Bereich ansehen | Knopf „Ansehen" | Knopf | Zeile selbst | Klick auf die Zeile | ✅ |
| Vertretung einrichten | eigener Abschnitt | Knopf | „Wenn jemand gerade nicht kann" | Knopf | ✅ |
| Sehen, was jemand trägt | eigener Abschnitt | Knopf | „Wenn jemand gerade nicht kann" | Knopf | ✅ |
| Mitgliederliste | eigener Abschnitt | Liste | „Der Haushalt" | Aufklapper mit Anzahl im Titel | ✅ |
| Rollen und Rechte | eigener Abschnitt | Knopf | „Der Haushalt" | Knopf im Aufklapper | ✅ |
| Verteilung (Balance) | eigener Abschnitt | Aufklapper | „Der Haushalt" | Aufklapper | ✅ |
| Abläufe / Kalender | Kopfzeile von `familie` | Knopf | Hauptnavigation | Verweis | ✅ |
| Begriffserklärungen | 8 Karten im Raster | Lesen | Glossar in einer Spalte | Lesen | ✅ |

Zwei Funktionen sind hinzugekommen (Abmelden, Hilfe). Keine ist verschwunden.

## Phase 3 – Hierarchie je Bildschirm

Ein Bildschirm beantwortet genau eine Frage. Alles andere ordnet sich darunter.

| Bildschirm | Zweck | Primäre Aktion | Primäre Information | Sekundär | Fortgeschritten |
| --- | --- | --- | --- | --- | --- |
| `jetzt` | „Was mache ich als Nächstes?" | Erledigen | Die eine Sache oben | Später/Abgeben | Begründung („weiterer Grund") |
| `plan` | „Was kommt auf uns zu?" | – (Übersicht) | Was liegen blieb | Nächste Tage | Ohne Datum, nach Person |
| `familie` | „Wer denkt woran mit?" | Kapazität setzen | Wo niemand mitdenkt | Wer was trägt | Vertretung, Verteilung, Rollen |
| `bereiche` | „Wo lebt dieses Thema?" | Bereich anlegen | Der Baum | Zuständigkeit je Zeile | Kritikalität |
| `hilfe` | „Wie ist das gemeint?" | – (Lesen) | Die Unterscheidung | Acht Begriffe | Zusagen, Abgrenzung |
| `einstellungen` | „Wo stelle ich das ein?" | – (Auswahl) | Die Kategorie links | Der Inhalt rechts | Daten, Rechte |

Auf `familie` ist bewusst **keine** dominante Aktion gesetzt: Die Seite ist eine
Nachschlage- und Verständigungsseite. Eine Seite, die nichts fordert, darf auch nichts
schreien.

## Phase 4/5 – Was geändert wurde

**Ein Rang, ein Gewicht.** `.tier3-group .row-title` war 16 px/500, während gleichrangige
Zeilen daneben 16 px/550 hatten. Gleiche Größe bei anderem Gewicht liest sich nicht als
Rangfolge. Die Zurücknahme trägt jetzt allein die Farbe.

**Die Skala hält, auch im Kleinen.** Die Initialen in den Personenpunkten lagen mit 11 px und
9 px neben der Skala und erzeugten zwei zusätzliche Größen. Sie rasten auf `--t-overline-size`
ein; die kleinen Punkte wachsen dafür von 17 auf 18 px. Der Buchstabe bleibt – er ist die
redundante Kodierung neben der Farbe und damit eine Barrierefreiheitszusage (§12).

**Eine Anzahl ist Begleitinformation.** `.num` stand fetter als der Text daneben und
konkurrierte mit seiner eigenen Überschrift. Jetzt Gewicht 400.

**Zwei Listen wurden eine.** Auf `familie` zeigt „Wo niemand mitdenkt" die offenen Fälle als
Handlungsliste; die vollständige Übersicht liegt darunter in „Wer was trägt", zusammengefasst
zu einem Satz (`{n} von {m} Bereichen haben jemanden, der mitdenkt.`) mit Aufklapper **und**
Verweis auf `/bereiche`. Sieben Abschnitte wurden fünf mentale Einheiten.

**Aus Karten wurde ein Glossar.** Acht gleich große Kästen im Raster geben dem Auge keine
Lesereihenfolge – man beginnt irgendwo. Als Definitionsliste in einer Spalte gibt es genau
einen Weg hindurch, und der Begriff ist der Ankerpunkt. Zwei Spalten wurden geprüft und
verworfen: Sie messen sich auf 39 Zeichen pro Zeile, weil die Inhaltsspalte begrenzt ist.
Eine Nachschlageseite darf lang sein; unlesbar darf sie nicht sein.

**Doppelte Sätze gestrichen.** Die Einleitung des Verteilungs-Aufklappers wiederholte wörtlich
den Hinweis, den `BalanceView` selbst führt – zwei identische Zeilen untereinander.

## Ergebnis

Gleiches Skript, gleiche Daten, gleicher Bildschirm (1280 px):

| Bildschirm | Bedien | Paare | Größen | Kästen | Abschnitte | Höhe |
| --- | --- | --- | --- | --- | --- | --- |
| `familie` | 35 → **21** | – | 9 → **5** | – | 7 → **5** | 3206 → **1901 px** |
| `jetzt` | 17 | 10 → **7** | 7 → **6** | 2 | 1 | 1184 → **1128 px** |
| `hilfe` | 8 | 6 | 6 | 14 → **7** | 3 | 2164 → 2992 px |
| `einstellungen/mitglieder` | 14 → **13** | – | 7 → **5** | 6 | 3 | 1441 → **1260 px** |

`hilfe` ist der eine Wert, der gewachsen ist: Die eine Spalte ist höher als das zweispaltige
Raster. Das ist ein bewusster Tausch – lineare Lesereihenfolge und lesbare Zeilenlänge gegen
Scrollweg auf einer Seite, die man einmal liest und nicht bedient.

Der Stand über alle 17 Ansichten:

```
Screen                    Bedien  Paare  Größen  Farben  Kästen  Abschn  Laut  Primär  Höhe
familie                   21      9      5       7       11      5       1     0       1901
jetzt                     17      7      6       5       2       1       1     1       1128
bereiche                  14      8      6       6       2       1       2     1       1207
einstellungen             13      8      6       5       4       2       0     0        949
einstellungen-haushalt    13      8      6       5       4       2       0     0        949
einstellungen-mitglieder  13      6      5       3       6       3       0     0       1260
uebersicht                12      5      5       3       4       4       0     0       1328
einstellungen-rechte      11      6      5       3       2       1       0     0        844
einstellungen-daten       11      6      4       4       4       2       1     1        844
vorgaenge                  8      6      5       4       2       2       0     0        844
hilfe                      8      6      6       3       7       3       0     0       2992
beobachtung                6      6      6       3       4       2       0     0        888
ablaeufe                   5      4      3       3       4       1       2     1        844
plan                       4      8      6       5       5       2       0     0        929
wissen                     4      4      4       3       0       0       1     1        844
eingang                    3      6      3       4       2       1       1     1        844
kalender                   1      4      4       2       3       2       0     0        940
```

Die sieben Textfarben auf `familie` sind kein Rückschritt: vier Textränge, eine
Umkehrfarbe (Häkchen auf Akzentfläche) und zwei Personenfarben. Die Personenfarben sind die
Kodierung, die diese Seite überhaupt lesbar macht.

## Phase 6 – Regressionsprüfung

Zusammenlegen und Einklappen ist genau die Stelle, an der eine Funktion nicht vereinfacht,
sondern verloren geht. Drei Prüfungen halten das fest:

- `apps/web/test/reachability.spec.tsx` – strukturell: jede Backend-Funktion, die der Client
  kennt, wird benutzt; jeder Ort der Informationsarchitektur hat eine Route und ist verlinkt.
- `apps/web/e2e/capability.spec.ts` – **neu**: geht auf `familie` jede einzelne Fähigkeit an,
  auch die hinter Aufklappern, und weist zusätzlich nach, dass keine Zeile doppelt sichtbar
  ist.
- `apps/web/e2e/cognitive-load.spec.ts` – **neu**: hält die Kennzahlen als Budget fest, damit
  der Rückschritt beim nächsten Mal ein roter Test ist und keine Geschmacksdiskussion.

| Funktion | Klicks vorher | Klicks nachher | Mehraufwand | Rückschritt |
| --- | ---: | ---: | ---: | --- |
| Kapazität setzen | 1 | 1 | 0 | nein |
| Offene Zuständigkeit übernehmen | 1 | 1 | 0 | nein |
| Bereich aus der Lückenliste öffnen | 1 | 1 | 0 | nein |
| Vollständige Zuständigkeitsliste sehen | 0 | 1 | +1 | nein – zweiter Weg über `/bereiche` |
| Vertretung einrichten | 1 | 1 | 0 | nein |
| Sehen, was jemand trägt | 1 | 1 | 0 | nein |
| Mitgliederliste sehen | 0 | 1 | +1 | nein – Anzahl steht im Titel |
| Rollen und Rechte verwalten | 1 | 2 | +1 | nein – auch über Einstellungen |
| Verteilung ansehen | 1 | 2 | +1 | nein |
| Abmelden | – | 2 | neu | nein |
| Suche | 1 | 1 (oder `⌘K`) | 0 | nein |
| Meldungen | 1 | 1 | 0 | nein |
| Begriff nachschlagen | – | 1 | neu | nein |

Drei Funktionen kosten einen Klick mehr. Alle drei sind Nachschlagevorgänge, die man selten
und bewusst macht – und alle drei tragen ihre Anzahl oder ihren Inhalt schon im geschlossenen
Zustand im Titel, sind also nicht zu erraten. Keine Funktion mit täglicher Nutzung wurde
verlangsamt.

## Phase 7 – Kognitive Barrierefreiheit

- **Keine Dunkelmuster (§19).** Zurückgenommen wurde ausschließlich Nachschlage-Inhalt.
  Datenschutzoptionen, Abbrechen-Wege und die Folgen zerstörerischer Aktionen stehen
  unverändert offen und in voller Textstärke. Der Aufklapper „Wer dazugehört – 2 Mitglieder"
  nennt seinen Inhalt im geschlossenen Zustand; ein Aufklapper, der verbirgt, wovon er
  handelt, wäre genau das verbotene Muster.
- **Findbarkeit vor Minimalismus (§31).** Die vollständige Bereichsliste ist eingeklappt, aber
  daneben steht ein benannter Verweis auf `/bereiche`. Zwei Wege statt eines versteckten.
- **Redundante Kodierung.** Personenfarbe steht nie allein: Initiale im Punkt, Name daneben.
  Prüfung: `apps/web/e2e/a11y.spec.ts`, `apps/web/test/tokens.spec.ts`.
- **Kontrast unverändert.** Kein Wert wurde zugunsten von Ruhe gesenkt; die 184 Prüfungen in
  `tokens.spec.ts` laufen unverändert.
- **Wörtliche Sprache.** Kein Modell-Bezeichner erreicht die Oberfläche; ein Test hält das
  fest.
- **Bewegung.** Nichts bewegt sich länger als 200 ms, nichts von selbst.

## Stand

```
pnpm test       622 bestanden | 9 übersprungen (631) – 40 Dateien
pnpm test:e2e   206 bestanden
pnpm lint       0
pnpm typecheck  sauber
```

---

# Zweiter Durchgang – das System statt der Symptome

Der erste Durchgang hat vier auffällige Bildschirme repariert. Der zweite hat gefragt, warum
sie auffällig wurden – und drei Dinge gefunden, die der erste gar nicht messen konnte.

## Was der erste Durchgang übersehen hat

**Die größte Seite der App war nicht in der Messung.** `TARGETS` in `apps/web/e2e/pages.ts`
listet Übersichtsseiten. Die beiden Detailseiten – `/bereiche/:id` (1567 Zeilen, die längste
Datei im Projekt) und `/vorgang/:id` – standen nicht darin. Genau dort passiert die Arbeit.

**Nur Desktop.** Alle Zahlen des ersten Durchgangs stammen von 1280 px. §27 verlangt aber
ausdrücklich, dass die Hierarchie auch mobil trägt.

**Nur Seiten, keine Bauteile.** Gemessen wurde das Ergebnis, nicht seine Ursache.

Das Messskript liegt jetzt als `ops/scripts/cognitive-load.mjs` im Projekt und deckt 18 Orte
× 3 Breakpoints ab, Detailseiten eingeschlossen.

## Befund: ein Systemfehler, keine Seitenfehler

`bereich-detail` hatte **12 Größe-Gewicht-Paare** – mehr als jede andere Ansicht. Sieben davon
waren Kollisionen: dieselbe Größe, verschiedenes Gewicht.

| Größe | Gewichte nebeneinander | Rollen |
| --- | --- | --- |
| 13 px | **550 / 600 / 700** | Chip / Zuständigkeits-Abzeichen / Schrittmarke |
| 15 px | 400 / 550 | Zähler / Aufklapper |
| 16 px | 400 / 550 | Wissenswert / Zeilentitel |

Die Ursache lag nicht auf der Seite, sondern im Design-System: **20 frei gesetzte
Schriftgewichte und 8 Größen außerhalb der Skala** in `components.css`. Jedes Bauteil hatte
sich seinen Wert selbst gewählt. Vier verschiedene Bauteile mit derselben Rolle – „kleines
Etikett auf eigener Fläche" – trugen drei verschiedene Gewichte.

Gleiche Größe bei anderem Gewicht liest sich nicht als Rangfolge, sondern als
Unentschlossenheit. Das war der messbare Kern von „clutterig mit vielen Schriftgrößen und
unklarer Hierarchie".

## Änderung: Rollen statt Bauteile

In `tokens.css` steht jetzt eine Rollentabelle. Jede Rolle hat **genau ein** Paar aus Größe
und Gewicht; Bauteile wählen eine Rolle, statt eigene Werte zu setzen.

| Rolle | Token | Wert | Wer sie benutzt |
| --- | --- | --- | --- |
| Eintragstitel | `--t-item-*` | 16 px / 550 | Zeilentitel, Aufklapper, Schritt, Trefferliste |
| Bedienelement | `--t-control-*` | 15 px / 600 | Knopf, Umschalter, Wortmarke, Sprungmarke |
| Etikett auf Fläche | `--t-tag-*` | 13 px / 600 | Chip, Abzeichen, Schrittmarke, Navigationstext |
| Zähler | `--t-count-*` | 12 px / 700 | Meldungszahl, Personenpunkt, Tastenkürzel |
| Begleitinformation | `--t-quiet-weight` | 400 | Anzahl neben einer Überschrift |

Zwei Tests halten das fest (`apps/web/test/tokens.spec.ts`):

- `components.css` darf **keine** Schriftgröße in `rem`/`px` und **kein** numerisches
  Gewicht mehr enthalten. `em` bleibt erlaubt – es skaliert mit seiner Rolle, statt neben ihr
  zu stehen.
- Jede Rolle muss beide Achsen definiert haben.

Nebenbefund: Der bestehende Skalentest las Tokenwerte als Zahlen und wäre an
`--t-tag-size: var(--t-caption-size)` mit `NaN` durchgerutscht. Er löst Verweise jetzt auf
und schlägt fehl, wenn ein Token ins Leere zeigt.

## Weitere Befunde des zweiten Durchgangs

**Hierarchie-Inversion auf `bereich-detail`.** Der Begriff einer Wissensangabe stand mit
17 px/620 größer *und* schwerer als sein Wert mit 16 px/400 – die Angabe, wegen der man die
Seite öffnet, war das Leiseste im Block. Jetzt benennt eine kleine Zeile das Feld, darunter
steht der Wert; dasselbe Muster wie die Eyebrow auf den Karten, also nichts Neues zu lernen.

**Zwei Regressionen aus dem ersten Durchgang.** `.person-dot.lg` hatte 13 px/700 gesetzt und
damit bei 13 px ein drittes Gewicht zurückgebracht. `.num` hatte nur in Abschnittsüberschriften
eine feste Größe und erbte sonst seinen Bezugstext – mal 15 px, mal 16 px. Beide behoben; sie
sind der Grund, warum der Gewichts-Test jetzt existiert.

**Navigationslast auf `hilfe`.** Die einspaltige Begriffsliste ist auf dem Handy 4394 px hoch.
„Schlag einen Begriff nach" hieß dort: scrollen und suchen. Die Seite hat jetzt eine
Sprungleiste mit allen acht Begriffen (§18) – sie sagt zuerst, welche Begriffe es gibt, und
bringt einen dann hin. Echte Anker, also tastaturbedienbar und ohne JavaScript;
`scroll-margin-top` sorgt dafür, dass die feste Kopfleiste das Ziel nicht verdeckt.

**Vom Touch-Test gefangen.** Die Sprung-Chips waren 24 px hoch. `touch.spec.ts` meldete zehn
zu kleine Ziele auf `hilfe`, bevor irgendjemand die Seite mit dem Finger gesehen hat. Ein Chip
ist sonst ein Etikett zum Lesen; hier ist er ein Ziel für die Fingerkuppe und bekommt unter
`pointer: coarse` 44 px.

## Was geprüft und für gut befunden wurde

Nicht jeder Befund führt zu einer Änderung. Diese Punkte wurden gemessen und blieben:

- **Kein horizontaler Überlauf** – 18 Orte × 3 Breakpoints, überall 0 px.
- **Ein Überlagerungsmuster.** 24 von 26 Überlagerungen sind `Sheet`; dazu ein Ausklapp für
  Meldungen und Aufklapper im Fließtext. Interaktionslast (F) ist niedrig, weil es wenig zu
  lernen gibt.
- **Bewegung.** Zwei Endlosanimationen, beide Ladeanzeigen (Skelett, Fortschrittsbalken).
  `prefers-reduced-motion` schaltet global ab. Sinneslast (G) niedrig.
- **Doppelrouten.** `/familie/ablaeufe` und `/familie/kalender` sind `Navigate replace` auf
  die Hauptrouten – alte Wege, die nicht ins Leere laufen, keine zweite Wahrheit.
- **Fehlerzustände.** Beim Prüfen mit einer fremden Bereichs-ID zeigte die Seite „Dieser
  Bereich konnte nicht geladen werden. Es ist nichts verloren gegangen." mit Wiederholung –
  kein Absturz, keine technische Meldung, keine Schuldzuweisung.
- **Sieben Textfarben auf `familie`** – vier Textränge, eine Umkehrfarbe, zwei Personenfarben.
  Die Personenfarben sind die Kodierung, die die Seite lesbar macht.

## Abschlusstabelle 1 – Screen / Problem / Änderung / Nutzen / Funktion erhalten

| Screen | Problem vorher | Änderung | Kognitiver Nutzen | Funktion erhalten? |
| --- | --- | --- | --- | --- |
| Design-System | 20 freie Gewichte, 8 Größen außerhalb der Skala | Rollentabelle in `tokens.css` + zwei Tests | Gleiche Rolle sieht überall gleich aus – Wiedererkennen statt Deuten | ✅ rein visuell |
| `bereich-detail` | 12 Typ-Paare, 3 Gewichte bei 13 px | Rollen statt Bauteilwerte | Hierarchie ist ablesbar statt zufällig | ✅ |
| `bereich-detail` | Begriff größer und schwerer als sein Wert | Begriff als Beschriftung, Wert als Inhalt | Die gesuchte Angabe ist das Auffälligste | ✅ |
| `familie` | 9 Typ-Paare, `.num` mal 15 px mal 16 px | `.num` und `.person-dot` an ihre Rolle gebunden | 8 Paare bei 6 Größen, klar absteigend | ✅ |
| `hilfe` | 4394 px auf dem Handy ohne Sprungpunkt | Sprungleiste mit allen acht Begriffen | Nachschlagen statt Scrollen; zeigt zugleich den Wortschatz | ✅ zusätzlicher Weg |
| `hilfe` | Sprung-Chips 24 px hoch | 44 px unter `pointer: coarse` | Mit dem Finger treffbar | ✅ |
| `familie` (1. Durchgang) | Zwei Listen zeigten dieselben Bereiche | „Wo niemand mitdenkt" + „Wer was trägt" | Kein Abgleich im Kopf mehr nötig | ✅ zwei Wege |
| `hilfe` (1. Durchgang) | 8 gleich große Kästen ohne Lesereihenfolge | Glossar in einer Spalte | Genau ein Weg durch den Text | ✅ |
| `jetzt` (1. Durchgang) | 10 Typ-Paare | Rang = ein Gewicht; Skala auch im Kleinen | 7 Paare, sichtbare Rangfolge | ✅ |

## Abschlusstabelle 2 – Funktionserhalt

Keine Änderung des zweiten Durchgangs verschiebt eine Funktion; alle sind rein visuell oder
fügen einen Weg hinzu.

| Funktion | Vorher erreichbar | Nachher erreichbar | Zusätzliche Klicks | Regression |
| --- | --- | --- | --- | --- |
| Wissensangabe lesen | ✅ | ✅ | 0 | nein – nur die Gewichtung getauscht |
| Wissensangabe ändern | ✅ | ✅ | 0 | nein |
| Beobachtung, Verantwortung, Übergabe, Verlauf, Entscheidungen | ✅ (5 Aufklapper) | ✅ unverändert | 0 | nein |
| Begriff nachschlagen | ✅ scrollen | ✅ scrollen **oder** springen | 0 (−1 in der Praxis) | nein |
| Alle übrigen Funktionen | ✅ | ✅ | 0 | nein |

Nachgewiesen durch `reachability.spec.tsx` (strukturell), `capability.spec.ts` (jede Fähigkeit
auf `familie`, auch hinter Aufklappern) und `cognitive-load.spec.ts` (Aufmerksamkeitsbudget).

## Neurodivergenz-Durchgang (§29)

*Der Nutzer wurde abgelenkt und kommt nach 30 Sekunden zurück.*

Der Seitentitel steht oben, der aktive Navigationspunkt ist markiert, die Kopfleiste steht auf
jeder Seite an derselben Stelle. Auf `familie` zeigt die Kapazitätsauswahl ihren Zustand als
gedrückten Umschalter mit Häkchen – nicht nur farblich. Aufklapper nennen ihren Inhalt und
dessen Anzahl im geschlossenen Zustand, man muss also nicht öffnen, um zu wissen, was drin
ist.

*Der Nutzer will Vorhersehbarkeit.*

Nach diesem Durchgang gilt: Was dieselbe Rolle hat, sieht überall gleich aus – erzwungen durch
Tokens, nicht durch Disziplin. Überlagerungen sind fast immer dasselbe Bauteil. Positionen
sind über alle Seiten stabil. Bewegung gibt es nur, solange etwas lädt.

*Restrisiko, offen benannt:* `hilfe` ist auf dem Handy 4394 px hoch. Zwei Spalten wären
kürzer, messen sich aber auf 39 Zeichen pro Zeile. Die Sprungleiste nimmt die
Navigationslast; der Scrollweg bleibt. Eine Nachschlageseite darf lang sein, unlesbar darf sie
nicht sein.

## Stand nach dem zweiten Durchgang

```
pnpm test       624 bestanden | 9 übersprungen (633) – 40 Dateien
pnpm test:e2e   206 bestanden
pnpm lint       0
pnpm typecheck  sauber

Messung        node ops/scripts/cognitive-load.mjs  (18 Orte × 3 Breakpoints)
Überlauf       0 px, überall
```
