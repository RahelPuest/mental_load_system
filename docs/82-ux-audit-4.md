# 82 – UX-Audit, vierter Durchgang

Gleiche Methode wie [docs/48](48-cognitive-load.md): `ops/scripts/cognitive-load.mjs` öffnet
jeden Bildschirm im **gebauten** Bündel mit echten Daten und zählt, was tatsächlich sichtbar
ist. Dazu Kontrastmessungen in beiden Farbschemata und Layoutmessungen auf 390 px.

Nichts in diesem Bericht ist geschätzt. Wo eine Zahl steht, ist sie gemessen.

## 1 · Der Ausgangsstand

Gegen die Werte aus docs/48 (1280 px):

| Bildschirm | Bedien damals | Bedien jetzt |
| --- | ---: | ---: |
| `bereiche` | 14 | **29** |
| `familie` | 21 | **26** |
| `jetzt` | 17 | **23** |
| `einst-daten` | 11 | 15 |
| `vorgaenge` | 8 | 8 |

Der Zuwachs ist zum Teil Inhalt (der Demohaushalt hat mehr Bereiche), zum Teil Funktion
(Umbenennen im Baum, Unterbereich ziehen, die Planung aus docs/80). Die Zahl allein ist
deshalb kein Befund — erst der Blick darauf, **woraus** sie besteht.

## 2 · Befund A: Getönte Karten hatten keine eigene Textfarbe

**Der schwerste Fund.** Eine getönte Karte tauschte nur den Hintergrund; die Schrift behielt
die Farben der normalen Fläche — und die sind für die normale Fläche gerechnet, nicht für Gelb.

Gemessen auf der Aufmerksamkeitskarte (`/regeln`), WCAG-AA verlangt 4,5:1 bei diesen Größen:

| Element | hell vorher | dunkel vorher | nachher hell | nachher dunkel |
| --- | ---: | ---: | ---: | ---: |
| Bereichszeile (12 px) | **3,70** | **1,27** | 11,64 | 9,92 |
| Überschrift (17 px) | 10,37 | **1,81** | 10,37 | 8,84 |
| Fließtext (15 px) | 4,68 | **1,01** | 11,65 | 9,92 |
| Primärknopf | **1,68** | 9,24 | 10,37 | 8,84 |
| zwei Nebenknöpfe | 4,68 | **1,01** | 11,65 | 9,92 |

Im dunklen Schema war eine Aufmerksamkeitskarte damit **ein gelbes Rechteck mit praktisch
unsichtbarem Text** — fünf von sechs Elementen unter dem Schwellenwert, drei davon unter 2:1.

Die Tokens `--attention-fg`, `--critical-fg` und `--info-fg` gab es längst; sie wurden nur nie
benutzt. Statt einzelne Regeln zu flicken, werden die Texttokens **innerhalb** der getönten
Fläche neu belegt. Dann stimmen `c-muted`, `c-secondary` und jeder Knopf automatisch — auch
die, die es dort heute noch gar nicht gibt.

## 3 · Befund B: Zwei Primäraktionen auf `/regeln`

`open.map(...)` erzeugte je Aufmerksamkeitskarte einen Primärknopf „Kümmern wir uns drum",
dazu der Primärknopf „Regel einrichten" in der Kopfzeile. Ein Primärknopf, der dreimal
untereinander steht, ist nicht dominant — er ist Tapete (§13, §30).

Die Kartenaktion ist jetzt sekundär. Die Dringlichkeit trägt die Karte ohnehin: getönte
Fläche, eigener Rahmen, die Frage als Überschrift.

| | vorher | nachher |
| --- | ---: | ---: |
| verschiedene Primäraktionen | 2 | **1** |
| laute Elemente | 7 | **4** |

Der Browsertest `layout.spec.ts › nicht zwei gleich starke Aktionen` fiel darüber seit Tagen.

## 4 · Befund C: Ein Bauteil für zwei Aufgaben

`Toggle` trägt vor dem Wort ein „＋", solange es nicht gewählt ist — die Form sagt
„hinzufügen". An **acht** Stellen stand es für eine Einfachauswahl, wo „auswählen" gemeint war:

Kapazität, Dauer einer Auszeit, Eingangsfilter, Zugriffsvoreinstellung, Informationsdichte,
Farbschema, Thema — und bis zum letzten Durchgang auch der Zeitraum der Planung.

„＋ Pause" liest sich als „Pause hinzufügen", nicht als „Pause wählen". Dazu lagen die Knöpfe
in einem `Chips`-Behälter ohne `radiogroup`: für Hilfsmittel nicht einmal als zusammengehörige
Auswahl erkennbar.

Neu im Baukasten: **`Auswahl`** — ein zusammenhängender Streifen mit `role="radiogroup"`, der
schon durch seine Form sagt, dass genau eines gilt. Alle acht Stellen sind umgestellt. `Toggle`
bleibt, wo es hingehört: an/aus.

## 5 · Befund D: Der Name kam zuletzt

Im Bereichsbaum auf 390 px: Zeile 319 px, davon **218 px für „alle: Ben, Anna" und 59 px für
den Namen**. Bei 59 px griff `overflow-wrap: anywhere` — richtig gesetzt für deutsche
Komposita — und zerlegte „Urlaube" in „Urlaub" und „e". Vier von dreizehn Titeln brachen
mitten im Wort.

Ursache: `.row-main` steht auf `flex: 1`, also `flex-basis: 0`. Es bekommt damit nur den
**Rest**, nachdem das Beiwerk seine volle Inhaltsbreite genommen hat. Die Rangfolge war falsch
herum — wer eine Zeile liest, sucht zuerst den Namen.

Drei Varianten gegeneinander gemessen:

| Variante | gebrochene Titel | gekürzte Zuständigkeiten | Höhe |
| --- | ---: | ---: | ---: |
| ohne Eingriff | 4 | 5 | 1571 px |
| **Name bekommt Untergrenze** | **0** | 5 | **1528 px** |
| Zeile umbrechen | 0 | 5 | 1984 px |

Die fünf gekürzten Zuständigkeiten stehen in **allen** Varianten, auch im unveränderten
Zustand — das Kürzen kommt aus der Plakette selbst. Der erste Verdacht („ich tausche einen
Fehler gegen Informationsverlust") war damit widerlegt, und Umbrechen hätte 456 px Höhe
gekostet, ohne etwas zu retten.

## 6 · Ein Fehler beim Beheben

Der erste Versuch zu Befund D setzte `overflow: hidden` auf das Beiwerk. Das kaschierte nur:
Der Layoutkasten der Erbe-Plakette ragte weiter bis 402 px hinaus, und zwei Überlauftests
fielen prompt — sie messen Kästen, nicht Sichtbarkeit. Jetzt geben die Kinder wirklich nach.

Festgehalten, weil es die Regel dieses Projekts bestätigt: Eine Messung, die nur die eigene
Prüfung zufriedenstellt, ist keine Lösung.

## 7 · Was gemessen, aber nicht geändert wurde

**`bereiche`, 29 Bedienelemente — davon 13 „Unterbereich anlegen", eines je Zeile.** Das sind
45 % aller Bedienelemente der Seite für dieselbe Handlung. Es wächst linear mit dem Baum: bei
40 Bereichen sind es 40 Knöpfe.

Nicht geändert, weil die Alternative — den Knopf erst bei Auswahl oder Überfahren zeigen —
gegen die Regel aus docs/48 verstieße: „Wo etwas nicht mehr sofort ins Auge fällt, ist es
einen **benannten** Klick entfernt, nie einen geratenen." Ein Knopf, der erscheint, wenn man
zufällig darüberfährt, ist ein geratener. Das verdient eine eigene Entscheidung, keinen
Nebeneffekt eines Audits.

**`hilfe`, 4600 px Höhe auf dem Telefon.** Schon in docs/48 bewusst in Kauf genommen: eine
Spalte mit lesbarer Zeilenlänge statt eines Rasters, auf einer Seite, die man einmal liest
und nicht bedient.

## 8 · Was geprüft wurde

| | |
| --- | --- |
| Typecheck, Lint | grün |
| Node- und Web-Tests | 1077 grün |
| Kontrast, beide Schemata | 12 von 12 Messungen über dem Schwellenwert (vorher 7 darunter) |
| Layouttests im Browser | 160 grün, einschließlich der beiden zuvor gefallenen |
| `a11y`, `cognitive-load`, `dark` | grün — die `/regeln`-Fehler der letzten Tage sind weg |
| Sichtprüfung | Aufmerksamkeitskarte hell und dunkel, Kapazitätswahl, Bereichsbaum auf 390 px |

Kein Test wurde abgeschwächt.
