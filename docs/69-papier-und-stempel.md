# 69 – Richtung A umgesetzt: „Papier & Stempel"

Aus den sechs Entwürfen in `docs/66` wurde **Richtung A** gewählt und durchgesetzt. Sie ersetzt
Richtung C (`docs/67`) vollständig — kein Umschalter, keine zweite Gestalt. Der Dunkelmodus
gehört dazu und wurde mitentworfen.

Dieses Dokument hält fest, was sich geändert hat und wo A gegen C entscheidet. `docs/67` bleibt
als Akte der vorigen Gestalt bestehen; was dort steht, gilt für das Produkt nicht mehr.

## Die zwei Erkennungszeichen

**Der Rand ist Tinte.** Zwei Pixel, schwarz, sichtbar — an jeder Karte, jedem Feld, jedem
Knopf, jedem Chip. Das ist der genaue Gegenentwurf zu C, wo fast nichts einen Rahmen hatte und
Gruppen nur eine Linie darüber trugen. A behauptet das Gegenteil: Eine Gruppe ist ein Bogen
Papier auf dem Tisch, und ein Bogen hat eine Kante.

**Der versetzte Schatten bedeutet etwas.** Drei Pixel nach rechts unten, in Tinte, ohne
Weichzeichnung — und **nur an Dingen, die man drücken kann**. Beim Drücken senkt sich das
Element auf seinen eigenen Abdruck (`transform: translate(3px, 3px)`, Schatten weg). Flächen
bekommen ihn nie. Wer den Versatz sieht, weiß ohne Beschriftung, dass dort etwas passiert.

Dazu kommt das dritte Merkmal aus dem Musterbuch: **die Schraffur**. Ein Bereich ohne
Zuständigkeit bekommt eine diagonal schraffierte Zeile — ein sichtbar unbestelltes Feld. Das
ist die wörtlichste Umsetzung von Prinzip 3 („Das Fehlende wird lauter gezeigt als das
Vorhandene") und im Bereichsbaum sofort wirksam: fünf von dreizehn Zeilen, auf einen Blick.

## Eine Schrift, zwei Ausprägungen

> **Bricolage Grotesque**, 400–800, Breitenachse 75–100 %.

A trennt Benennen und Arbeiten **nicht über zwei Schriften** (so machte es C), sondern über
Gewicht und Breite derselben. Titel stehen groß, eng (`font-stretch: 86%`) und schwer; alles
andere klein und fett. Die Breitenachse ist der Grund für die Schriftwahl — ohne sie wäre „groß
und eng" eine gestauchte Schrift, mit ihr ist es ein eigener Schnitt.

`apps/web/e2e/typografie.spec.ts` prüft das an 22 gerenderten Seiten: **genau eine Familie**,
und der schmale Schnitt kommt an keinem Text unter 22 px vor. Die Datei ist nicht gelöscht,
sondern auf die Regel umgestellt, die jetzt gilt — die vorige Fassung prüfte die
Arbeitsteilung zweier Familien.

Zwei Schriftdateien statt acht: 128 kB für deutschen Text, `latin-ext` nur bei Bedarf.
Fraunces und Public Sans sind entfernt.

## Haferpapier, Tinte, vier Flächen

| | hell | dunkel |
| --- | --- | --- |
| Grund | `#f3ede0` Haferpapier | `#17140e` |
| Fläche (Karte) | `#fbf7ec` | `#201c14` |
| Text **und Rand** | `#141210` Tinte | `#f3ede0` |
| Kritisch | Tomate `#c0401c` | `#a8381a` |
| Aufmerksamkeit | Senf `#f5b700` | `#e0aa14` |
| In Ordnung / Handlung | Tanne `#2f5d50` | `#57a08a` |
| Termin / Hinweis | Flieder `#c9c5ec` | `#a9a3dd` |
| Fokusring | Tomate | Tomate, aufgehellt |

**Vier Flächenfarben mit fester Bedeutung** — keine Verläufe, keine Zwischentöne, keine fünfte.
Sie sind *Flächen*, nicht Text: deckend gefüllt und mit Tinte beschriftet. Genau darin liegt
der Unterschied zur Tönung, die C benutzte, und der Grund, warum die Semantikwerte hier satt
sind statt pastellig.

**Im Dunkeln dreht sich das Paar um.** Ein schwarzer Rand auf dunklem Grund ist kein Rand —
also wird der Rahmen Papier und der Grund Tinte. Der Versatzschatten zeigt auf `--border` und
dreht sich automatisch mit.

Alle vierzehn Kontrastpaare, der Fokusring, drei Randstufen und zwölf Personenfarben wurden vor
dem ersten Pixel durchgerechnet: **null Verstöße in beiden Modi**. Die vier Fremdpaletten
(Dracula, Catppuccin, Nord, Solarized) bleiben bestehen und überschreiben nur Farbe.

## Personen und Zustände trennen sich über die Form

Das Musterbuch hatte an A eine konkrete Schwäche benannt: *„Die kräftigen Flächenfarben
konkurrieren direkt mit den zwölf Personenfarben — Tomate und Mustard belegen genau die Töne,
die sonst Menschen gehören."*

Die Gegenmaßnahme ist keine Farbkorrektur, sondern eine Formregel:

> **Fläche heißt Zustand. Punkt und Kante heißen Person.**

Personenfarben kommen ausschließlich als Punkt (Avatar), als Strang im Bereichsbaum und als
6-px-Kante an der Karte vor — nie als gefüllte Fläche. Die vier Flächenfarben kommen
ausschließlich gefüllt vor — nie als Punkt. Damit können sich die beiden Ebenen nicht
verwechseln, obwohl sie denselben Farbkreis benutzen.

## Ein Fehler, den der Umbau erzeugt hat

`--critical-fg` hat in A die Bedeutung gewechselt: Es ist jetzt die Farbe, die **auf** der
tomatenroten Fläche steht — also Papier. An drei Stellen wurde es aber als *Seitentext* benutzt:
die Dringlichkeitsstufe „kritisch" im Bereichsbaum, Feldfehler und das Vertretungsabzeichen.
„Kritisch" war damit unsichtbar — weißer Text auf hellem Papier.

Wo Dringlichkeit einen **Text** färbt und keine Fläche, steht jetzt `--tomate`. Der Ton hat
dafür eine eigene Dunkelmodus-Fassung bekommen, weil er sonst unter die Lesbarkeitsgrenze
fiele.

Das ist die Art Fehler, die ein Wechsel der Gestaltsprache typischerweise erzeugt: Nicht die
Werte sind falsch, sondern eine **Rolle hat ihre Bedeutung geändert**, und die Bauteile wissen
es nicht.

## Der Stempel

Das Musterbuch nennt zwei Merkmale als unverwechselbar: *„Der Stempel und die Schraffur.
Beides trägt Bedeutung und kommt sonst nirgends vor."* Die Schraffur war zuerst da, der
Stempel kam nach – zunächst hatte ich ihn als „gefüllte Fläche mit Tintenrand" abgehakt, was
ihn eher wegdiskutiert als umgesetzt hat.

**Was er trägt:** in einem kategorialen Wort, warum eine Sache gerade oben steht — „Zeitpunkt
ist vorbei", „Kritischer Bereich", „Wartet schon länger". Das ist das `label` eines
Rangfaktors (`packages/domain/src/prioritization/rank.ts`), und es war in der Oberfläche
bisher **nicht sichtbar**: Richtung C hatte es bewusst entfernt, weil es als
„**Etikett:** Erklärung" in derselben Zeile stand — zwei Schnitte, zwei Bedeutungsebenen, und
es las sich wie zwei Anforderungen.

**Warum das trotzdem kein Rückschritt ist:** Hier steht es nicht *in* der Zeile, sondern
darüber, als Marke auf Senf mit Tintenrand. Ein Stempel liest sich nicht als zweiter Satz. Die
Erklärung darunter bleibt, wo sie war — „ZEITPUNKT IST VORBEI" über „Der vorgesehene Zeitpunkt
war der 26.08.2026."

**Genau einer je Seite.** Er sitzt nur an der Leitkarte, und davon gibt es genau eine
(`NowPage`: „Es gibt genau **einen** prominenten Abschnitt").

> **Nachtrag (September 2026): Er steht jetzt gerade.** Ursprünglich war er um 1,4° gedreht –
> die Idee war ein Aufdruck auf Papier, und bei `prefers-reduced-motion` stand er schon damals
> gerade. Die Drehung blieb die **einzige** schiefe Fläche der ganzen Anwendung, und eine
> einzelne Ausnahme liest sich nicht als Absicht, sondern als Fehler. Den Aufdruck tragen die
> übrigen Mittel ohnehin: Rahmen, Versalien, Sperrung, Farbfläche. Damit entfällt auch die
> Sonderregel für reduzierte Bewegung – sie hatte nichts mehr zu regeln.

## Abweichungen vom Musterbuch, mit Grund

| Musterbuch | Umgesetzt | Warum |
| --- | --- | --- |
| Farbige **Kopfkante** an der Karte als Rollenanzeige | Farbige **linke** Kante, 6 px, in Personenfarbe | Der Bereichsbaum benutzt links seit jeher für Zugehörigkeit. Zwei Konventionen für dieselbe Aussage wären eine zu viel |

## Was A kostet — und was das Musterbuch dazu gesagt hat

Die Bewertungsmatrix hatte A bei **Skalierbarkeit** und **Ruhe** als *problematisch* markiert:
„Bei dreizehn Bereichen untereinander werden dreizehn 2-px-Tintenränder zu einem Gitter, das
lauter ist als sein Inhalt."

Umgesetzt wurde deshalb die Gegenmaßnahme, die schon im Musterbuch stand: **Verschachtelte
Felder bekommen keinen zweiten Rahmen** (`.panel .panel`), und Listenzeilen tragen Haarlinien
statt eigener Kästen. Der Rahmen gehört der Gruppe, nicht der Zeile.

Das nimmt der Schwäche die Spitze, es beseitigt sie nicht. A ist lauter als C — das war beim
Entscheiden bekannt und steht in der Matrix.

## Nachgemessen am gerenderten Bild

Zwei Ausreißer fand erst die Messung, nicht das Auge:

- **Formularfelder trugen 1 px, alles andere 2.** Ein Eingabefeld, das dünner umrandet ist als
  der Knopf daneben, liest sich als weniger belastbar. Jetzt 2 px wie alles.
- **Der Ikonenstrich lag noch bei 1,6 px** — neben schweren Schriftgraden und 2-px-Rahmen
  wirkte er zerbrechlich. A verlangt Piktogramm statt Linienzeichnung: jetzt 2 px.

Danach über 35 Seiten gemessen:

| | |
| --- | --- |
| Randstärken im Bild | **eine**: 2 px, 424 Vorkommen |
| Ikonenstrich | **einer**: 2 px, 1036 Vorkommen |
| Ikonengrößen | 16, 20, 24 |
| Radien | 3 (Chip), 5 (Bedienelement, Zeile, Hinweis), 6 (Fläche), `--r-full` (Zähler, Punkte) |
| Schriftrollen | jede in genau einer Ausprägung: h1 32/800, h2 22/800, h3 und Eintrag 17/800, Fließtext 15/400, Etikett 13/700, Versalzeile 12/800 |
| Waagerechter Überlauf | keiner auf neun Breiten; eine Inhaltsbreite und ein Polster je Breite |

## Ein Test, der zu Recht Alarm gab

`domain-struktur.spec.ts` prüft, dass die Spalten der Bereichsseite beim Wechsel des Abschnitts
nicht springen — die Ursache war früher eine nicht reservierte Scrollbalken-Rinne. Der Test
enthält eine **Selbstprüfung**: Unter den geprüften Abschnitten müssen beide Fälle vorkommen,
einer der scrollt und einer der es nicht tut, sonst prüft er die Grenze nicht, um die es geht.

Genau die schlug an: Richtung A benutzt größere Grade und gerahmte Felder, dadurch scrollte auf
dem voreingestellten Fenster (720 px) **jeder** Abschnitt. Die Zusage war nicht verletzt — die
Messung war wertlos geworden.

Behoben durch eine begründete Fensterhöhe: 900 px liegt gemessen zwischen den Abschnitten
(„Regeln" und „Läuft gerade" passen mit 900, „Was wir wissen" nicht mit 1090). Nicht durch
Abschwächen der Selbstprüfung — die hat ihren Zweck erfüllt.

## Was geprüft wurde

| | |
| --- | --- |
| Lint | grün |
| Typecheck | grün |
| Farbtokens (14 Paare × 2 Modi, 4 Fremdpaletten, 12 Personenfarben) | 196 grün |
| Node- und Web-Tests | 928 grün, 9 übersprungen |
| Browsertests (chromium + touch) | grün, einschließlich axe WCAG A/AA, 44-px-Trefferflächen und der Budgets für kognitive Last |
| Typografie-Regel | 22 Seiten, eine Familie, kein gestauchter Kleintext |
| Sichtprüfung | Jetzt, Bereiche, Bereichsseite, Essen — hell und dunkel, 1440 px und 390 px |

**Kein Test wurde abgeschwächt.** Einer wurde auf die neue Regel umgestellt (`typografie.spec.ts`).

## Was nicht passiert ist

Keine Produktlogik, kein Datenmodell, kein Zuständigkeitsmodell, keine Arbeitsabläufe, keine
Berechtigungen, keine Kalenderlogik, kein Mental-Load-Modell. Geändert wurden Schrift, Tokens
und Bauteilstile.
