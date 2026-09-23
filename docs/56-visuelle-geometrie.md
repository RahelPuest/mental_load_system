# 56 · Visuelle Geometrie – Audit und System

Vollständiger Audit über Abstände, Größen, Kanten, Rundungen und Proportionen. Gemessen an
der gerenderten Anwendung, nicht am Stylesheet: **31 Seiten und Unterseiten × 3 Breiten**,
dazu Dialoge und Zustände. Rohdaten entstehen reproduzierbar über `ops/scripts/geometrie.mjs`.

## Was gemessen wurde

| | |
| --- | --- |
| Seiten | 31 (alle Hauptseiten, alle sechs Bereichs-Unterseiten, alle zehn Einstellungsseiten, voller und leerer Bereich) |
| Breiten | 1440 px, 768 px, 412 px |
| Erfasst | Rundungen, Höhen, Innen- und Außenabstände, Rahmen, Ikonengrößen, Schriftgrößen, linke Kanten, Dialoggeometrie, Fokuszustand |

## Ein Befund vorweg: die Skala ist nicht der Fehler

Die erste Auswertung meldete 14, 20, 30 und 52 px als „nicht auf der Skala". Das war falsch:
Der Haushalt läuft auf der Dichte **„ruhig"**, die die Abstandsskala umdefiniert
(`--s-3: 14px; --s-4: 20px; --s-5: 24px; --s-6: 30px; --s-10: 52px`). Diese Werte **sind**
die Skala. Wer Geometrie prüft, muss die aktive Dichte kennen – sonst „repariert" er ein
System, das funktioniert.

## Befunde

### G1 · Neun Ikonengrößen ohne Regel — **P1**

**Problem.** Gemessen: 13, 15, 16, 17, 18, 19, 20, 22, 24 und 26 px. An fünfundzwanzig
Stellen war die Größe von Hand gesetzt, zwei davon steckten fest verdrahtet in der
`Button`-Komponente (`size === 'sm' ? 17 : 19`).

**Ursache.** `Icon` nimmt eine Zahl. Wer eine Zahl nehmen kann, nimmt die, die gerade passt.
Es gab keinen benannten Satz, gegen den man hätte prüfen können.

**Auswirkungen.** Zwei Symbole in vergleichbarer Lage lagen einen Pixel auseinander, ohne
dass ein Unterschied gemeint war. Das liest sich als Unruhe, die man nicht benennen kann –
genau die Art von Abweichung, die den Eindruck „aus einem Guss" zerstört.

**Empfehlung und Umsetzung.** Drei Stufen, jede an eine Textrolle gebunden:

| Token | px | Rolle | vorher |
| --- | --- | --- | --- |
| `ICON.sm` | 16 | neben Kleintext: Chips, Metazeilen, Marker, kleine Knöpfe | 13, 15, 16, 17 |
| `ICON.md` | 20 | Standard: Zeilen, Abschnittsköpfe, Navigation, Knöpfe, Kopfleiste | 17, 18, 19, 20 |
| `ICON.lg` | 24 | eigenständig: Leerzustände, große Schaltflächen | 22, 24, 26 |

Zwischen den Stufen liegt ein sichtbarer Sprung. Eine vierte Stufe dazwischen wäre wieder
ein Unterschied, den niemand als Absicht liest.

**Gemessen nachher:** 20 px (745×), 16 px (78×), 24 px (5×). Neun Werte → drei.

---

### G2 · Eingabefeld und Knopf sind verschieden hoch — **P1**

**Problem.** Knopf 44 px, Eingabefeld und Auswahlfeld 47 px. Nebeneinander in einer Zeile
fluchten sie nicht, und die Unterkante läuft nicht durch.

**Ursache.** `min-height: 44px` stand da – aber 10 px senkrechter Innenabstand plus 25 px
Zeilenhöhe ergeben 47. Die Mindesthöhe war wirkungslos, weil der Inhalt sie überschritt.

**Empfehlung und Umsetzung.** Einzeilige Felder brauchen keinen senkrechten Innenabstand:
Der Browser zentriert den Text selbst. `padding: 0 var(--s-3)` bei `min-height: 44px`. Das
mehrzeilige Textfeld behält seinen Innenabstand und bekommt eine eigene Mindesthöhe (88 px,
zwei Zeilen).

**Gemessen nachher:** Knopf 44 · Auswahlfeld 44 · Eingabefeld 44.

---

### G3 · Die Leitkarte steht einen Pixel zu weit rechts — **P2**

**Problem.** Auf `/jetzt` begann der Text der Leitkarte 25 px vom Kartenrand, bei allen
anderen Karten 24 px.

**Ursache.** `.card-accent` trägt eine 4 px starke Farbkante und glich sie mit
`calc(var(--s-5) - 3px)` aus – ein Pixel zu wenig.

**Umsetzung.** `- 4px`. **Gemessen nachher:** 24 px, bündig mit den übrigen Karten.

---

### G4 · Die Navigation lag neben der Kontrollskala — **P2**

**Problem.** Navigationseinträge 42 px hoch, während jede andere Bedienfläche 44 oder 36 px
misst. 42 kommt in der Skala nicht vor.

**Umsetzung.** 44 px – damit auf derselben Stufe wie Knopf und Eingabefeld, und zugleich auf
der Mindestgröße für Fingerbedienung. Geprüft: Die Leiste passt bei 1440 px weiterhin ohne
Scrollen; bei 1080 px scrollt sie wie zuvor.

---

### G5 · Kartentitel in drei Größen — **P3, dokumentiert statt geändert**

`h2.card-title` rendert 17 px (Ablauf- und Fragekarten), 20 px (Abschnittstitel) und 26 px
(die eine Leitkarte auf `/jetzt`). Das ist **begründet** – die Leitkarte ist die eine Antwort
der Seite und darf größer sein (§38) –, war aber nirgends als Regel festgehalten. Siehe
„Das System" unten.

---

### G6 · Zähler tragen die Chip-Klasse, sind aber keine Chips — **P3, dokumentiert**

Gemessen: `.chip` durchgängig 24 px hoch mit 8 px Radius – bis auf `.chip.num`, das 20 px
hoch und vollständig rund ist. Das ist die richtige Form für eine Zahl und die falsche
Klasse für ein Abzeichen. Keine Änderung: Ein Umbenennen berührt viele Stellen, ohne dass
sich etwas sichtbar bessert. Die Regel steht jetzt unten.

## Was geprüft wurde und in Ordnung ist

Ausdrücklich, weil ein Audit auch das Tragfähige benennen muss:

| Bereich | Befund |
| --- | --- |
| **Seitenachsen** | Auf **allen 31 Seiten** fluchten `h1`, Abschnitt und Fläche auf einer Kante – 294 px ohne, 662 px mit Navigationsspalte. Kein Versatz. |
| **Dialoge** | 544 px breit, Radius 22, Innenabstand 30 – Kopf, Körper und Fuß auf derselben Kante. Vier geprüfte Dialoge, keine Abweichung. |
| **Radienhierarchie** | Knopf/Eingabe/Zeile 12 · Karte/Fläche 16 · Dialog 22 · Abzeichen rund. Eine nachvollziehbare Staffelung nach Größe des Elements. |
| **Rahmen** | Genau eine Stärke (1 px), zwei Töne nach Rolle: `--border-subtle` an Kartenkanten, `--border` an Linien, die allein Struktur tragen. |
| **Strichstärke** | 1.6 px an **allen** 828 gemessenen Symbolen. |
| **Fokus** | 2 px Ring mit 2 px Abstand; die Geometrie des Knopfes ändert sich dabei nicht (184 × 44 px vorher wie nachher). |
| **Dichte** | `calm`/`compact` verschieben nur Abstände und Zeilenhöhe, nie Funktionsumfang – ein bewusstes, vollständiges Subsystem. |
| **Knopfgrößen** | 44/36 px mit 20/14 px Innenabstand – der Unterschied folgt streng dem `size`-Prop, nicht dem Zufall. |

## Das System

Damit die nächste Komponente nicht wieder neu verhandelt wird:

**Abstände.** Eine Skala, von der Dichte skaliert. Beziehung bestimmt Stufe:
innerhalb eines Elements < zwischen zusammengehörigen < zwischen Gruppen < zwischen
Abschnitten. Konkret: `--s-2` im Element, `--s-3`/`--s-4` zwischen Geschwistern, `--s-5`
über einer Abschnittslinie, `--s-10` zwischen Abschnitten.

**Rundungen.** Nach Größe des Elements, nicht nach Geschmack:

| Radius | Für |
| --- | --- |
| `--r-sm` 8 | Abzeichen, Chips |
| `--r-md` 12 | Knöpfe, Eingabefelder, Zeilen, Navigationseinträge |
| `--r-lg` 16 | Karten, Flächen |
| `--r-xl` 22 | Dialoge |
| `--r-full` | rein numerische Abzeichen |

**Kontrollhöhen.** 44 px (Standard, zugleich Fingermindestmaß) · 36 px (`size="sm"`). Keine
dritte Höhe. Zeilen: 52 px im Inhalt, 44 px in Verzeichnissen, 40 px in dritter Stufe –
jeweils eine Stufe niedriger als die Ebene darüber.

**Ikonen.** 16 / 20 / 24, gebunden an die Textrolle daneben (G1).

**Typografie.** Sechs Rollen, absteigend: 26 / 20 / 17 / 16 / 15 / 13. Eine Karte darf ihren
Titel eine Rolle **unter** dem Abschnittstitel führen (17), die eine Leitkarte einer Seite
eine Rolle darüber (26). Mehr als eine Stufe Abweichung braucht einen Grund.

**Container.** Eine Breite für alle Seiten: die verfügbare. Fließtext behält über
`--measure` seine 64 Zeichen.

## Die Abstandsleiter (§36), gemessen

Der Abstand muss mit der semantischen Distanz wachsen. Über acht geprüfte Seiten:

| Beziehung | Abstand |
| --- | --- |
| innerhalb eines Elements (Titel → Untertitel) | 0 px – die Zeilenhöhe trägt |
| Listenzeilen, durch eine Linie getrennt | 2 px |
| Karte → Karte | 14 px (`--s-3`) |
| Formularfeld → Formularfeld | 24 px (`--s-5`) |
| verschachtelter Abschnitt | 30 px (`--s-6`) |
| Abschnitt → Abschnitt | 52 px (`--s-10`) |

Streng monoton. Keine Verletzung gefunden.

## Nachgemessen

| | vorher | nachher |
| --- | --- | --- |
| Ikonengrößen im Einsatz | 9 | **3** |
| Höhe Knopf / Auswahl / Eingabe | 44 / 47 / 47 | **44 / 44 / 44** |
| Textkante der Leitkarte | 25 px | **24 px** |
| Navigationshöhe | 42 px | **44 px** |
| Seiten mit fluchtenden Achsen | 31 von 31 | 31 von 31 |
| Strichstärken | 1 | 1 |
