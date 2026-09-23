# 57 · Visuelle Geometrie – zweiter Durchgang

Zweiter vollständiger Audit (§46 Phase 7). Der erste (`docs/56`) prüfte die Systemebene:
Kanten, Radienhierarchie, Kontrollhöhen, Ikonenskala. Dieser geht in die Bereiche, die dort
nur gestreift wurden – **Mikroabstände, vertikaler Rhythmus, Overlays, Zustände und
Extremwerte**.

Gemessen wie zuvor an der gerenderten Anwendung: 16 Seiten für Mikroabstände, alle 31 für
die Bestandsaufnahme, drei Breiten, dazu Overlays, Ladezustände und Extremtexte.

## Was der erste Durchgang nicht gesehen hat

Der erste Audit zählte Rundungen, Höhen und Kanten – also alles, was ein Element **als
Ganzes** betrifft. Er sah deshalb nicht in die Bauteile hinein: den Abstand zwischen einem
Symbol und seinem Wort, zwischen einer Überschrift und ihrem Hinweis, zwischen einem Punkt
und einem Namen. Genau dort lagen die verbliebenen willkürlichen Werte.

## Befunde

### V1 · Vier handgesetzte Werte für zwei Beziehungen — **P1**

**Problem.** In den Bauteilen standen 2, 3, 5 und 6 px als feste Zahlen im Stylesheet – für
zwei Absichten:

| Absicht | gefundene Werte | Stellen |
| --- | --- | --- |
| anhaften (Hinweis unter Titel, Haarlinie zwischen Zeilen, optische Nachjustierung) | 2, 3 | 9 |
| Symbol ↔ Text in kleinen Bauteilen (Chip, Augenbraue, Metazeile, Schalter) | 5, 6 | 6 |

**Ursache.** Die Abstandsskala beginnt bei 4 px. Wer 5 oder 6 braucht, schreibt sie hin –
es gab keinen benannten Wert dazwischen, gegen den man hätte prüfen können.

**Auswirkungen.** Dieselbe Beziehung – Symbol neben Kleintext – hatte an einer Stelle 5 px,
an der nächsten 6. Ein Pixel Unterschied ohne Absicht, fünfzehnmal.

**Empfehlung und Umsetzung.** Nicht auf 4 oder 8 zwingen: 4 px sind zwischen einem 16-px-Symbol
und seinem Wort zu eng, 8 px zu weit. Stattdessen **zwei benannte Stufen unterhalb der
Hauptskala**:

```css
--s-hair:  2px;   /* anhaften */
--s-micro: 6px;   /* Symbol ↔ Text in kleinen Bauteilen */
```

Sie skalieren bewusst **nicht** mit der Dichte: Ein Haaransatz bleibt ein Haaransatz, und der
Abstand zwischen Symbol und Wort hängt an der Schriftgröße, nicht am Luftbedürfnis der Seite.

**Gemessen nachher:** 20 Verwendungen der beiden Stufen, keine handgesetzten Mikroabstände
mehr in `components.css`.

---

### V2 · Die Suche trug eine andere Rundung als der Dialog — **P2**

**Problem.** Vier Overlay-Flächen, drei Rundungen:

| Overlay | Breite | Radius |
| --- | --- | --- |
| Konto-Popover (am Auslöser) | 208 px | 12 |
| Meldungen | 384 px | 12 |
| **Suche** | **608 px** | **16** |
| Dialoge und Blätter | 544 px | 22 |

**Ursache.** `.palette` benutzte `--r-lg`, `.sheet` `--r-xl`. Beide schweben mittig über der
Seite und sind etwa gleich groß – die Suche ist sogar die größere Fläche.

**Auswirkungen.** Zwei mittige Overlays derselben Größenordnung lasen sich als verschiedene
Bauteile, ohne dass ein Unterschied gemeint war.

**Umsetzung.** Suche auf `--r-xl`. Die Regel lautet damit: **Am Auslöser hängende Overlays
tragen den Radius eines Bedienelements (12), mittig schwebende den Dialogradius (22).**

---

### V3 · Personenpunkte lagen auf keinem Raster — **P2**

**Problem.** Drei Größen: 18, 22 und 30 px. Keine davon liegt auf dem 4-px-Raster, und keine
steht in Beziehung zur Ikonenskala (16/20/24), obwohl ein Personenpunkt an denselben Stellen
neben Text steht wie ein Symbol.

**Umsetzung.** Benannt und aufs Raster gelegt – eine Stufe größer als die Symbole, weil ein
Punkt eine Fläche ist und ein Symbol eine Linie:

```css
--dot-sm: 20px;  /* Metazeilen, Zuständigkeitsabzeichen */
--dot-md: 24px;  /* Zeilen */
--dot-lg: 32px;  /* Personenlisten */
```

**Gemessen nachher:** 20 / 24 / 32 px, drei Größen mit benannter Rolle.

---

### V4 · Was gemessen wurde und stimmt

| Prüfung | Ergebnis |
| --- | --- |
| **Knopf: Symbol → Text** | 8 px an **allen** 50 gemessenen Knöpfen, `gap` an allen 63 |
| **Seite: Titel → Unterzeile** | 8 px an allen 15 Seiten |
| **Abschnitt: Titel → Hinweis** | 2 px an allen 10 Vorkommen |
| **Abschnitt: Kopf → Inhalt** | 14 px an allen 12 Vorkommen |
| **Inhalt → Aktionen** | 20/24 px – eine Stufe, je nach Dichtekontext |
| **Langes deutsches Wort** | „Kraftfahrzeughaftpflichtversicherungsbescheinigung" bricht um, kein Überlauf, keine Abschneidung |
| **Ladezustand** | Skelette auf `/jetzt` und `/bereiche`; kein Sprung innerhalb der geladenen Seite |
| **Toast** | r12, Innenabstand 14/20 – dieselbe Geometrie wie die Hinweisfläche |
| **Leerzustände** | Zwei Familien mit klarer Rolle: `.empty` (ganze Seite, 40/24) und `.empty-line` (Abschnitt, 14/20) |

Der Abstand **Punkt → Name** ist kontextabhängig – 8 px in der Kopfleiste, 14 px in einer
Zeile (dort trägt der Zeilenabstand), 8 px in der Augenbraue. Jeder Kontext ist in sich
einheitlich; das ist kein Ausreißer, sondern die Zeilenlogik, die greift.

## Bestand nach beiden Durchgängen

Über 31 Seiten und drei Breiten bleibt an Varianz nur, was eine benannte Regel hat:

| Beobachtung | Regel |
| --- | --- |
| Knöpfe 44 / 36 px | folgt dem `size`-Prop |
| Chips 24 px r8, Zähler 20 px rund | Chip ist ein Etikett, Zähler ein Abzeichen |
| Fläche 16 px / verschachtelte Fläche 0 | eine Fläche in einer Fläche verliert ihren Rahmen |
| Ikonen 16 / 20 / 24 | gebunden an die Textrolle daneben |
| Punkte 20 / 24 / 32 | eine Stufe über den Symbolen |
| Overlays 12 / 22 | am Auslöser hängend oder mittig schwebend |

Keine unerklärte Abweichung mehr.

## Nachgemessen

| | vor Durchgang 1 | nach Durchgang 2 |
| --- | --- | --- |
| Ikonengrößen im Einsatz | 9 | **3** |
| Kontrollhöhen (Knopf/Auswahl/Eingabe) | 44 / 47 / 47 | **44 / 44 / 44** |
| Handgesetzte Mikroabstände | 15 Stellen, 4 Werte | **0** |
| Personenpunktgrößen | 18 / 22 / 30 | **20 / 24 / 32** |
| Radien mittiger Overlays | 16 und 22 | **22** |
| Seiten mit fluchtenden Achsen | 31 von 31 | 31 von 31 |

**Prüflauf nach den Änderungen:** 786 Tests in Node, API und jsdom, 273 im echten Browser,
Lint und Typprüfung ohne Beanstandung.
