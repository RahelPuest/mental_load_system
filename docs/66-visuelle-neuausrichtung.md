# 66 – Visuelle Neuausrichtung: Exploration (Phase 1)

**Status: Entscheidung offen.** Dieses Dokument hält die Bestandsaufnahme, die untersuchten
Gestaltungsrichtungen und die Empfehlung fest. Es wurde **keine Zeile Produktionscode
verändert** – das ist Absicht (Auftrag §1, §50).

Die gerenderten Muster – dieselben vier Bauteile in allen sechs Welten, mit echten Inhalten –
lagen als eigenes Musterbuch vor; es ist nicht Teil dieses Repositorys.

Beschreibungen von Typografie und Farbe sind als Entscheidungsgrundlage wertlos; die Richtungen
mussten sichtbar sein. Dieses Dokument ist die Akte dazu, nicht ihr Ersatz.

## Die Ausgangslage in einem Satz

Drei Geometrie-Audits (`docs/56`, `docs/57`, `docs/65`) haben Thealotta gestalterisch
widerspruchsfrei gemacht – und dabei ist genau das entstanden, was ein System hervorbringt,
das nur Widersprüche entfernt: **der Durchschnitt.** Der Durchschnitt ist die
widerspruchsfreieste Lösung. Was fehlt, ist eine Behauptung.

## Bestandsaufnahme

### Was bleiben muss

| | Warum |
| --- | --- |
| **Der Bereichsbaum mit farbigen Strängen** | Die einzige Stelle, an der Struktur, Zugehörigkeit und Farbe heute *ein* Bild ergeben. Dreizehn Bereiche über vier Ebenen, ohne einen Namen lesen zu müssen |
| **Die zwölf Personenfarben** | Aus einer Formel statt aus dem Gefühl, ≥ 20° Abstand, ≥ 4,5 : 1 in Hell und Dunkel, nie ohne Wort daneben (`tokens.spec.ts`) |
| **Die Dichteumschaltung** | ruhig / standard / kompakt ist bereits die halbe Antwort auf „wenig Kapazität" |
| **Der Ton der Texte** | „Das ist kein Fehler – nur etwas, das jemand entscheiden sollte." Diese Stimme ist Thealottas stärkstes Markenmerkmal; das Bild hat sie nie eingeholt |

### Was generisch wirkt

| Befund | Beleg |
| --- | --- |
| **Es gibt keine Schrift** | `--font: ui-sans-serif, system-ui` – auf einem Mac ist Thealotta in San Francisco gesetzt, also in derselben Schrift wie jede andere Anwendung auf dem Gerät. Typografisch existiert die Marke nicht |
| **Weiße Karten auf Fast-Weiß** | Grund `#f6f7f6`, Fläche `#ffffff`. Anderthalb Prozent Helligkeit tragen die gesamte Flächenhierarchie |
| **Ein Grün für alles Klickbare** | Primärknopf, aktiver Filter, Textlink, aktiver Navigationspunkt, Aufklapper, Fokusring – dieselbe Farbe. Farbe sagt „hier kann man etwas tun", nie *was* |

### Wo die Gestaltung gegen das Produkt arbeitet

1. **„Kritisch" sieht aus wie „nebensächlich".** Alle drei Dringlichkeitsstufen stehen als
   13 px in `--text-muted` unter dem Namen. Die Frage „Was ist kritisch?" ist nur durch Lesen
   zu beantworten – bei dreizehn Bereichen dreizehnmal.
2. **Die Lücke ist leiser als das Ausgefüllte.** „verantwortlich: Anna" erscheint farbig,
   „niemand zuständig" grau – obwohl die Lücke der Grund ist, warum man auf der Seite ist.
3. **Filter und Primäraktion haben dieselbe Form.** Auf `/wissen` sind „Frage stellen" und der
   aktive Filter „Offene Fragen" formgleiche grüne Knöpfe. Eines ändert Daten, eines nur die
   Ansicht.
4. **640 px Leere zwischen Frage und Antwort.** Im Baum endet der Name bei ~470 px, die
   Zuständigkeit beginnt bei ~1110 px.
5. **Leerzustände stehen woanders als Inhalte.** Überschriften beginnen bei 294 px,
   Leerzustände sind zentriert und beginnen bei 522 px.
6. **Fünf Handlungen in vier Betonungen** auf der Fokuskarte; auf 390 px in drei Zeilen.

## Acht Gestaltungsprinzipien

Sie gelten unabhängig von der gewählten Richtung.

1. **Linien gehören Menschen, Felder gehören Zuständen.** Farbiger Strang = das gehört
   jemandem. Ausgefüllte Fläche = hier ist etwas los. Nie vertauscht.
2. **Ein Kasten ist eine Behauptung.** Ein Rahmen sagt „das hier hat eine Grenze". Die meisten
   Listeneinträge haben keine.
3. **Das Fehlende wird lauter gezeigt als das Vorhandene.**
4. **Farbe bedeutet eine Sache pro Ebene – und nie allein.** Personenebene: wer.
   Zustandsebene: wie dringend. Die beiden teilen sich nie eine Farbfamilie.
5. **Rang kommt aus der Schrift, nicht aus der Fläche.**
6. **Papier statt Grau.** Der Grund ist ein Ton mit Temperatur.
7. **Was laut ist, muss leise gestellt werden können.** Wenig Kapazität ist kein anderes
   Produkt, sondern derselbe Raum mit weniger Licht.
8. **Der Weißraum liegt links, nicht rechts.**

## Die fünf Richtungen

Jede wurde an denselben vier Bauteilen durchgespielt: Fokuskarte („Jetzt"), drei Zeilen
Bereichsbaum, Termin, Gericht – mit identischen Inhalten.

| | Richtung | Haltung | Stärke | Bruchstelle |
| --- | --- | --- | --- | --- |
| **A** | Papier & Stempel<br>*Soft Colorful Brutalism* | Der Bildschirm ist ein Bogen Papier; Wichtiges wird gestempelt, nicht umrandet | Charakter, Freude – sofort wiedererkennbar | Dreizehn 2-px-Ränder werden ein Gitter; Flächenfarben konkurrieren mit den Personenfarben |
| **B** | Raster & Signal<br>*Playful Swiss* | Struktur wird sichtbar; Spalten und Haarlinien statt Kästen, Farbe selten und eindeutig | Orientierung, Skalierbarkeit, Langlebigkeit | Wärme – ein Plakat, kein Zuhause |
| **C** | Familienhandbuch<br>*Warm Editorial Utility* | Kein Software-Fenster, sondern ein gesetztes Handbuch, das dieser Familie gehört | Wärme, Charakter, Ruhe | Überfliegen und Mobil – „Jetzt" wird gescannt, nicht gelesen |
| **D** | Weiche Ordnung<br>*Warm Modernism* | Keine Ränder, nur Flächen; Tiefe aus Ton und weichem Licht | Wärme, Mobil, Verträglichkeit | Charakter – könnte jede App sein; Tonstufen gehen bei vier Ebenen aus |
| **E** | Werkbank<br>*Soft Neo-Industrial* | Ein Werkzeug, das seine Mechanik zeigt; Zustände beschriftet, Zahlen monospaced | Dichte, Eindeutigkeit | Der Gegenstand – Sorgearbeit darf nicht wie ein Ticketsystem aussehen |

Vollständige Steckbriefe (Typografie, Farbprinzip, Karten, Ränder, Ikonen, Motion, Dichte) und
die Bewertungsmatrix über elf Kriterien stehen im Musterbuch.

**Was die Matrix zeigt:** B ist in allem stark, was Orientierung heißt, und fällt genau bei
Wärme durch. C ist die wärmste Richtung und fällt genau bei Übersicht und Mobil durch. Die
beiden Schwächen sind komplementär – deshalb ist die Empfehlung ein Hybrid und kein Kompromiss.

## Empfehlung: Hauslinie

**Die Struktur von B auf dem Papier von C, mit einem Element aus A.** Zwei Formen tragen die
gesamte Bedeutung:

**Die Linie.** Ein 4-px-Strang am linken Rand in der Farbe der Person, die mitdenkt – an der
Baumzeile, der Fokuskarte, dem Termin, dem Vorgang. Gestrichelt heißt: gehört niemandem. Damit
beantwortet Thealotta „Wer ist verantwortlich?" ohne ein gelesenes Wort, und zwar links, wo das
Auge beginnt. Die Linie ist keine Erfindung – sie steht heute schon im Bereichsbaum und ist
dort das einzige Element, das wirklich funktioniert.

**Das Feld.** Eine flache, randlose Farbfläche, die immer einen *Zustand* bedeutet, nie eine
Person. Weil Felder randlos und Linien farbig sind, können sich die Bedeutungsebenen nicht
verwechseln – die Voraussetzung dafür, dass zwölf Personenfarben und Zustandsfarben auf einem
Bildschirm koexistieren.

**Warum das passt:** Thealotta muss zwei Dinge gleichzeitig tun, die selten zusammengehen – es
muss **überblicken lassen** und **trösten**. Die Schweizer Seite liefert das Überblicken, die
editoriale den Ton. Die Serife bleibt auf drei Aufgaben beschränkt: Seitentitel, Bereichsname,
Uhrzeit. Alles Funktionale ist Grotesk.

Zur Marke: Das Zeichen zeigt eine Form, die auf einem Stiel in einem gemeinsamen Rahmen wächst.
Die Linie *ist* dieser Stiel – verschiedene Menschen, jeder mit eigener Farbe, alle im selben
Raster. Verwandtschaft, keine Nachahmung.

## Risiken und Gegenmittel

| Risiko | Gegenmittel (Regel, nicht Absicht) |
| --- | --- |
| **Zu kühl** | Der Grund ist nie Weiß, sondern Leinen; Weiß kommt in der Anwendung nicht vor. Die Serife hat drei feste Aufgaben – fällt eine weg, war die Entscheidung falsch |
| **Zu viele Farben** | Harte Obergrenze: **ein** Feld je sichtbarem Abschnitt. Linien ausgenommen (4 px, fluchten in einer Spalte, lesen sich als Register). Als Budget testbar wie die kognitive Last |
| **Serife bei Zoom und Komposita** | Nie unter 17 px, nie in einer Spalte unter 12 rem. Beides testbar |
| **Linie kollidiert mit der Baumeinrückung** | Einrückung bleibt Abstand, Linie bleibt Farbe – sie wandert mit der Einrückung. Der heutige Baum ist der Beweis, dass es trägt |
| **Zwei Webfonts kosten den Sofortstart** | Selbst ausliefern (kein fremdes CDN), variable Schnitte auf die nötigen Achsen beschnitten, `font-display: swap`, Serife nachrangig |
| **Die vier alternativen Paletten** | Entscheidung nötig. Vorschlag: Paletten bleiben, verlieren aber den Anspruch, die Marke zu tragen – Linie, Feld, Raster und Typografie bleiben identisch, nur die Töne wechseln |

## Der Weg, falls zugestimmt wird

Nach Ebenen, nicht nach Bildschirmen: eine neue Startseite auf alten Bedienelementen sähe aus
wie ein Fehler statt wie ein Zwischenstand (§46).

| Phase | Inhalt |
| --- | --- |
| 1 | **Fundament** – Schriften, Papierstufen, Personenlinien, Zustandsfelder, Radien, Ränder, Bewegung; alles als Token, abgeleitet aus der Richtung |
| 2 | **Bauteile** – vollständiges Inventar vorher, damit nichts übrig bleibt |
| 3 | **Navigation und Rahmen** |
| 4 | **Kernbildschirme** – Jetzt, Bereiche, Bereichsseite, Familie |
| 5 | **Dichte Bildschirme** – Essen, Kalender, Regeln, Abläufe, Verlauf |
| 6 | **Breiten** – 360 bis 1920, Desktop mit eigener Komposition |
| 7 | **Zustände und Zugänglichkeit** – wenig Kapazität, Fokus, Tastatur, Zoom 200 %, Farbsehschwächen, reduzierte Bewegung, Dunkelmodus, vier Paletten |
| 8 | **Sichtprüfung an der gerenderten Anwendung**, danach derselbe Audit noch einmal von vorn |

**Was dabei ausdrücklich nicht passiert** (§49): keine Produktlogik, kein Datenmodell, kein
Zuständigkeitsmodell, keine Arbeitsabläufe, keine Berechtigungen, keine Kalenderlogik, kein
Mental-Load-Modell.

## Offene Entscheidungen

1. **Die Richtung** – Hauslinie oder eine der fünf in Reinform.
2. **Das neue Symbol** – im Verzeichnis liegt nur `apps/web/public/icon.svg`: ein
   dunkelgrünes abgerundetes Quadrat mit Kreis auf einem Stiel. Gibt es ein neues Zeichen, muss
   es vorliegen, **bevor** die Farbwelt festgelegt wird.
3. **Die vier alternativen Paletten** – bleiben, werden Varianten innerhalb der Identität,
   oder fallen weg.
4. **Webfonts** – Gesicht gegen Sofortstart. Ein echter Handel.
5. **Die Serife** – das Unterscheidungsmerkmal und zugleich das Riskanteste. Ohne sie
   funktioniert Hauslinie auch rein grotesk, rückt näher an B und verliert etwa ein Drittel
   ihrer Wärme.

## Nebenbefund, kein Geometriethema

Der Kalender besteht heute fast ausschließlich aus Leerzuständen: zwei gestrichelte Kästen in
der Mitte einer leeren Seite, weil kein Kalender verbunden ist. Das ist ein Produktproblem,
kein Gestaltungsproblem, und wird getrennt entschieden (§49).
