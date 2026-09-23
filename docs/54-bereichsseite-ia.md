# 54 · Informationsarchitektur der Bereichsseite

Geprüfte Hypothese: Die lange vertikale Bereichsseite durch eine Master-Detail-Ansicht
ersetzen – links die Sektionen, rechts der Inhalt, wie in den Einstellungen.

**Ergebnis der Prüfung: nein, nicht als Ganzes** – die Begründung steht unten und ist
gemessen, nicht gefühlt.

**Entschieden wurde anders: die Sektionsleiste kommt.** Nach dem Review hat der Auftraggeber
sie ausdrücklich bestätigt. Gebaut ist damit die Leiste **plus** die Punkte, die aus der
Prüfung ohnehin richtig waren – vor allem der Deckel und ein Menüpunkt „Übersicht", der die
vertikale Zusammenschau erhält. Damit bleibt die stärkste Einwendung des Reviews entkräftet:
Dass ein leerer Bereich als leer zu erkennen ist, ohne sechs Türen abzuklopfen, leistet die
Übersicht – sie ist die Vorgabe, nicht ein siebter Punkt.

Was am Review bestehen bleibt: Die Inhaltsspalte verliert Breite (644 → 584 px ab 1440 px),
und unter 1080 px trägt das Muster nicht. Beides ist gelöst, nicht wegdiskutiert: unterhalb
der Schwelle steht die Navigation waagerecht als Chips über dem Inhalt statt als sechs
Zeilen, die man jedes Mal überspringen müsste.

## Was gemessen wurde

**Wie voll sind Bereiche wirklich?** Alle 13 Bereiche des Demohaushalts:

| | Bereiche |
| --- | --- |
| Vollständig leer | **6 von 13** |
| Nur Struktur (nur Unterbereiche, kein Inhalt) | **5 von 13** |
| Inhalt in genau einer Sektion | 1 von 13 |
| Inhalt in mehreren Sektionen | **1 von 13** (Schuhe) |

Das ist keine Eigenheit der Demodaten, sondern die Form jedes Baums: Die meisten Knoten sind
Gerüst, die Arbeit hängt an wenigen Blättern.

**Wie hoch ist die Seite?** Gemessen am vollsten Bereich (Schuhe):

| | Desktop (900 px Fenster) | Handy (915 px Fenster) |
| --- | --- | --- |
| Gesamt | 2185 px = **2,4 Bildschirme** | 2642 px = **2,9 Bildschirme** |
| „Was wir wissen" beginnt bei | 297 px (0,3) | 275 px (0,3) |
| „Regeln" beginnt bei | 955 px (1,1) | 1109 px (1,2) |
| „Läuft gerade" beginnt bei | 1246 px (1,4) | 1491 px (1,6) |
| „Diesen Bereich verwalten" beginnt bei | 1547 px (1,7) | 1867 px (2,0) |

**Wie wächst sie?** Eine Zeile kostet 78 px (Desktop) bzw. 121 px (Handy).

| Wissenseinträge | Seitenhöhe Desktop | „Regeln" beginnt bei | Handy |
| --- | --- | --- | --- |
| heute (3 Zeilen) | 2185 px (2,4 Bildschirme) | 1,1 Bildschirme | 2,9 Bildschirme |
| 5 | 2497 px (2,8) | 1,5 | 3,6 |
| 20 | 3667 px (4,1) | **2,7** | **5,5** |
| 50 | 6007 px (6,7) | **5,3** | **9,4** |

Die entscheidende Spalte ist die dritte. Nicht die Gesamthöhe ist das Problem – Scrollen ist
billig –, sondern dass **das Wachstum einer Sektion die anderen wegschiebt**. Bei 50
Wissenseinträgen liegen die Regeln des Bereichs fünf Bildschirme unter dem Anfang. Wer wissen
will, ob dieser Bereich sich selbst meldet, muss an allem vorbei, was er weiß.

## UX-Review

### B1 · „Diesen Bereich verwalten" ist keine Sektion wie die anderen

**Problem.** 578 px auf dem Desktop, 655 px auf dem Handy – **26 % der Seitenhöhe** – für
Umbenennen, Archivieren und Löschen.

**Ursache.** Die Sektion ist nach demselben Muster gebaut wie die Inhaltsabschnitte, obwohl
sie etwas anderes ist: Konfiguration, die im Leben eines Bereichs vielleicht zweimal
vorkommt, gegenüber Inhalt, den man täglich liest.

**Auswirkungen.** Ein Viertel jeder Bereichsseite ist dauerhaft für etwas reserviert, das
fast nie gebraucht wird. Beim Scrollen nach unten – der Bewegung, mit der man einen Bereich
zu Ende liest – landet man im Löschen-Bereich.

**Alternativen.** (a) Zusammenklappen. (b) In den Kopf verschieben. (c) Eigene Seite.

**Empfehlung: eigene Seite** (`/bereiche/:id/verwalten`), erreichbar über ein Zahnrad im
Kopf, neben dem Farbknopf. Zusammenklappen versteckt nur; der Kopf hat für drei Handlungen
keinen Platz. Eine eigene Seite ist außerdem der Ort, an dem die Folgen ausführlich stehen
dürfen, ohne die Inhaltsseite zu belasten.

---

### B2 · Sektionen wachsen unbegrenzt und verdrängen einander

**Problem.** Keine Sektion hat eine Obergrenze. Die Höhe einer Sektion bestimmt, wie
erreichbar alle folgenden sind (siehe Tabelle oben).

**Ursache.** Die Seite rendert jede Liste vollständig.

**Auswirkungen.** Der Bereich wird mit Nutzung schlechter bedienbar – genau umgekehrt zur
Erwartung. Und das trifft die Bereiche, an denen die meiste Verantwortung hängt.

**Alternativen.** (a) Sektionsleiste links (die Hypothese). (b) Reiter. (c) Deckeln mit
„alle N ansehen" auf eine eigene Listenseite.

**Empfehlung: deckeln.** Fünf Einträge je Sektion, darunter „alle 23 ansehen" → eigene Seite
mit vollständiger Liste, Suche und Filter. Ausschlaggebend: **Die Anwendung hat diese Antwort
schon.** `/jetzt` deckelt genauso und bietet „alle 9 ansehen". Ein zweites Muster für
dasselbe Problem einzuführen, wäre die teurere Lösung.

---

### B3 · Keine Sektion sagt, wofür sie da ist

**Problem.** „Was wir wissen", „Regeln", „Läuft gerade" tragen keine Erklärung. Die Grenze
zwischen einer Notiz und einer Regel ist für neue Nutzer nicht ableitbar.

**Ursache.** Die Titel sind gut gewählt, aber ein Titel kann keinen Begriff einführen.

**Auswirkungen.** Beim ersten Anlegen muss man raten, wohin etwas gehört. Falsch abgelegtes
Wissen ist verlorenes Wissen – das Kernversprechen.

**Empfehlung.** Eine Zeile unter jedem Sektionstitel, dauerhaft, nicht als Aufklapper. Das
`hint`-Feld der `Section` gibt es bereits, es wird nur nicht überall benutzt. **Nicht** als
eigene Erklärseite je Sektion: Eine Erklärung, die man erst aufsuchen muss, wird nicht
gelesen.

---

### B4 · Die Seite trägt bereits zwei Navigationen

**Problem.** Oben Brotkrumen (nach oben im Baum), darunter die Unterbereiche (nach unten).
Eine Sektionsleiste wäre die dritte Navigation auf einer Seite – und die zweite, die links
senkrecht steht, direkt neben der globalen Leiste.

**Ursache.** Ein Bereich hat zwei natürliche Achsen: seine Lage im Baum und seinen Inhalt.
Die Hypothese vermischt beide – sie nennt die linke Leiste „Navigation der Unterbereiche"
und füllt sie dann mit Sektionen. Das sind zwei verschiedene Dinge, und beide haben Anspruch
auf denselben Platz.

**Auswirkungen.** Wären es die Sektionen, verlöre der Baum seine Sichtbarkeit. Wären es die
Unterbereiche, bliebe für die Sektionen nur wieder das Scrollen.

**Empfehlung.** Die linke Achse gehört dem Baum – aber das leistet die globale Navigation
über „Bereiche" bereits. Auf der Seite selbst bleibt es bei Brotkrumen und Unterbereichen.

---

### B5 · Leere ist Information – eine Leiste verbirgt sie

**Problem.** Bei 11 von 13 Bereichen ist die Antwort auf „was ist hier drin?" *nichts* oder
*nur Unterbereiche*. Die vertikale Seite beantwortet das in einem Blick.

**Ursache.** Eine Sektionsleiste zeigt Türen, nicht Inhalte. Ob hinter „Regeln" etwas liegt,
sieht man erst nach dem Klick.

**Auswirkungen.** Sondieren statt Sehen. Bei einem Werkzeug gegen Mental Load ist „du musst
nachsehen, ob nichts da ist" die falsche Seite des Tauschs. Zähler an den Leisteneinträgen
mildern das, lösen es aber nicht: Eine Zahl sagt *wie viel*, nicht *was*.

**Empfehlung.** Vertikale Übersicht als Standardansicht behalten.

---

### B6 · Das Master-Detail-Muster kostet auf dieser Seite mehr als in den Einstellungen

**Problem.** Gemessen an der bestehenden Einstellungsseite, die dieses Muster benutzt:

| Fensterbreite | Verzeichnis | Inhaltsspalte |
| --- | --- | --- |
| 1024 px | – (Muster greift nicht) | gestapelt, 644 px |
| 1180 px | 256 px | 572 px |
| 1280 px | 256 px | 644 px |
| 1440 px und mehr | 304 px | **584 px** |

Zum Vergleich: Die Bereichsseite hat heute **644 px** Inhaltsbreite, unabhängig vom Fenster.

**Ursache.** `.split` greift erst ab 1080 px. Darunter – jedes Tablet, jedes schmale
Fensterlayout – fällt es auf genau die vertikale Seite zurück, mit einer sechszeiligen Liste
davor.

**Auswirkungen.** Das Muster löst das Problem nur oberhalb 1080 px und verschmälert dort die
Inhaltsspalte um 9 % gegenüber heute. Unterhalb ist es die alte Seite plus Zusatzweg.

**Empfehlung.** Für die Einstellungen bleibt das Muster richtig – dort sind die Abschnitte
tatsächlich unabhängig, es gibt kein Querlesen und keine Leere, die etwas bedeutet. Für die
Bereichsseite trifft keine dieser drei Bedingungen zu.

---

### B7 · Die Sektionen sind gekoppelt, nicht unabhängig

**Problem.** Eine Sektionsleiste behandelt Abschnitte als unabhängige Ablagefächer. Im
Modell sind sie es nicht: `monitors.state_definition_id` verbindet eine **Regel** mit einer
bestimmten **Angabe**; ein **Vorgang** entsteht aus einem Hinweis, den eine Regel erzeugt hat.

**Auswirkungen.** Die häufigste Frage an einen Bereich – „passen die Schuhe noch?" – braucht
die Angabe *und* die Regel *und* den laufenden Vorgang. Heute: einmal scrollen. Mit Leiste:
drei Klicks, und das zuerst Gelesene muss im Kopf behalten werden. Das ist zusätzliche
Arbeitsgedächtnislast – das Gegenteil des Ziels.

**Empfehlung.** Die Reihenfolge der Seite trägt eine Erzählung („was wir wissen → was das
beobachtet → was daraus läuft"). Sie ist nicht zufällig und sollte nicht in Fächer zerlegt
werden.

## 1 · Empfohlene Zielstruktur

**Eine Übersichtsseite, gedeckelt – plus Unterseiten für Tiefe und Verwaltung.**

```
/bereiche/:id                 Übersicht (vertikal, gedeckelt)
  Kopf: Brotkrumen · Name · Zuständigkeit · Farbe · ⚙ · [Aufgabe]
  Unterbereiche (falls vorhanden)
  Was wir wissen        max. 5 → „alle 23 ansehen"
  Regeln                max. 5 → „alle 8 ansehen"
  Läuft gerade          max. 5 → „alle 12 ansehen"

/bereiche/:id/wissen          vollständige Liste, Suche, Filter
/bereiche/:id/regeln          vollständige Liste
/bereiche/:id/laeuft          vollständige Liste
/bereiche/:id/verlauf         Historie (heute nirgends)
/bereiche/:id/verwalten       Umbenennen, Verschieben, Archivieren, Löschen
```

## 2 · Begründung

| Anspruch | Vertikal heute | Sektionsleiste | Empfehlung |
| --- | --- | --- | --- |
| Leerer Bereich auf einen Blick | ✓ | ✗ (sondieren) | ✓ |
| Querlesen Angabe → Regel → Vorgang | ✓ | ✗ (3 Klicks) | ✓ |
| Skaliert auf 50 Einträge | ✗ (6,7 Bildschirme) | ✓ | ✓ (gedeckelt) |
| Konfiguration außer Sichtweite | ✗ (26 % der Seite) | ✓ | ✓ |
| Funktioniert unter 1080 px | ✓ | ✗ | ✓ |
| Ort für Historie und Anhänge | ✗ | ✓ | ✓ |
| Neues IA-Muster nötig | – | ja | nein |

Die Sektionsleiste gewinnt in zwei Punkten. Beide werden vom Deckeln ebenfalls gelöst – ohne
die vier Punkte zu verlieren, in denen sie verliert.

## 3 · Desktop-Konzept

Keine zweite senkrechte Leiste. Die Inhaltsspalte bleibt bei 644 px – die Lesebreite, für die
die Typografie ausgelegt ist.

Ab 1080 px steht rechts neben dem Inhalt die vorhandene `.context-panel`-Spalte zur Verfügung
(sie existiert im Stylesheet und wird auf dieser Seite nicht genutzt). Dorthin gehört, was
**Zustand** ist und nicht **Inhalt**: Zuständigkeit, Kritikalität, letzte Änderung, Zugriff.
Das ist kein Navigationsersatz, sondern Kontext, der beim Scrollen stehen bleibt.

Die Unterseiten (`/wissen`, `/regeln`, …) sind gewöhnliche Seiten mit Brotkrumen und Zurück –
kein neues Layout.

## 4 · Mobile-Konzept

Dieselbe Seite, dieselbe Reihenfolge. Durch das Deckeln fällt sie von 2,9 auf etwa **1,8
Bildschirme** und wächst nicht mehr mit dem Inhalt.

Reiter, Drawer, Segment Control und Bottom Sheet werden **nicht** empfohlen:

- **Reiter/Segment Control** verbergen Leere genauso wie die Leiste und zerschneiden das
  Querlesen; bei fünf bis sechs Reitern reicht die Breite ohnehin nicht.
- **Drawer/Bottom Sheet** sind für Handlungen richtig, nicht für Navigation innerhalb eines
  Gegenstands – sie verdecken das, worüber man gerade nachdenkt.
- Sollte eine Seite doch lang werden, gibt es das Muster bereits: die **Sprungleiste** von
  `/hilfe` (`.jumpbar`), Chips als Ankerlinks. Konsistent, ohne Zustand, ohne Verdecken.

## 5 · Auswirkungen auf die Navigation

Keine Änderung an der globalen Navigation. Fünf neue Routen unter `/bereiche/:id/…`, alle
über die Übersicht erreichbar, alle mit Brotkrumen zurück. Der Verlauf bekommt zum ersten Mal
einen Ort.

## 6 · Auswirkungen auf Mental Load

| | vorher | nachher (erwartet) |
| --- | --- | --- |
| Höhe Desktop | 2185 px | ~1450 px |
| Höhe Handy | 2642 px | ~1650 px |
| Höhe bei 50 Wissenseinträgen | 6007 px | **unverändert ~1450 px** |
| Sichtbare Bedienelemente | 25 | ~16 |
| Entscheidungen vor der ersten Handlung | unverändert 0 | 0 |

Wesentlich für neurodivergente Nutzung: Die Seite wird **vorhersagbar**. Heute hängt die
Position jeder Sektion davon ab, wie viel darüber steht; danach steht jede Sektion immer an
derselben Stelle, unabhängig vom Inhalt. Wiederauffindbarkeit entsteht durch feste Orte, und
feste Orte entstehen durch Deckel – nicht durch eine Leiste, die selbst wieder gelesen werden
muss.

## 7 · Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Der Deckel versteckt etwas, das jemand sucht | Zähler nennt immer die Gesamtzahl („alle 23 ansehen"), nie nur „mehr" |
| Fünf neue Routen sind fünf neue leere Seiten | Unterseite entfällt, solange die Sektion unter dem Deckel bleibt – der Link erscheint erst ab dem sechsten Eintrag |
| Verwalten wird unauffindbar | Zahnrad im Kopf, an derselben Stelle wie auf jeder anderen Detailseite; zusätzlich aus der Bereichsliste erreichbar |
| Sortierung entscheidet, was sichtbar bleibt | Je Sektion die fachlich richtige: Angaben nach Bestätigungsalter, Regeln nach nächster Prüfung, Läuft gerade nach Fälligkeit |
| Zwei Wege zum selben Inhalt (Übersicht und Unterseite) | Die Unterseite ist dieselbe Liste ohne Deckel, kein zweites Layout |

## Gebaut

Umgesetzt wie beschrieben. Gemessen am Bereich „Schuhe":

| | vorher | nachher |
| --- | --- | --- |
| Höhe Desktop | 2185 px (2,4 Bildschirme) | **1697 px (1,9)** |
| Höhe Handy | 2642 px (2,9 Bildschirme) | **2154 px (2,4)** |
| Sichtbare Bedienelemente | 25 | **23** |
| Flächen | 11 | **9** |
| Abschnitte in der Übersicht | 4 | **3** |

**Die entscheidende Eigenschaft, gemessen:** Mit 25 und mit 200 Wissenseinträgen steht
„Regeln" auf dem Desktop bei 1372 px und „Läuft gerade" bei 1687 px – **auf den Pixel
identisch**. Vorher lagen die Regeln bei 50 Einträgen fünf Bildschirme unter dem Anfang.

Nicht im Konzept vorgesehen, beim Bauen als nötig erkannt: **ein Filterfeld auf
`/bereiche/:id/wissen`**. Ohne es verschiebt die Unterseite das Problem nur – 203 Einträge
sind 20 Bildschirme. Das Feld erscheint erst ab dem doppelten Deckel; darunter wäre es ein
Bedienelement ohne Anlass. Gemessen: 203 Zeilen / 18 695 px werden mit einem Stichwort zu
1 Zeile / 900 px.

Nachgezogen: `apps/web/test/domain-struktur.spec.tsx` (der Deckel, ohne Datenrückstände) und
`apps/web/e2e/domain-struktur.spec.ts` (Wege, Zwecksätze, Titel). Die Positionsprüfung liegt
bewusst in jsdom: Sie im Browser zu führen hieße, bei jedem Lauf Notizen im Demohaushalt
anzulegen – und für Notizen gibt es keinen Löschweg.

## 8 · Akzeptanzkriterien

```
GIVEN  ein Bereich ohne jeden Inhalt
WHEN   seine Seite geöffnet wird
THEN   ist in einem Bildschirm erkennbar, dass nichts hinterlegt ist –
       ohne einen Abschnitt zu öffnen oder eine Leiste zu lesen.

GIVEN  ein Bereich mit 50 Wissenseinträgen
WHEN   seine Seite geöffnet wird
THEN   beginnt „Regeln" an derselben Bildschirmposition wie bei einem Bereich
       mit drei Wissenseinträgen.

GIVEN  ein Bereich mit 23 Wissenseinträgen
WHEN   seine Seite geöffnet wird
THEN   stehen fünf davon da, und ein Verweis nennt die Gesamtzahl 23.

GIVEN  ein Bereich mit vier Wissenseinträgen
THEN   gibt es keinen Verweis auf eine Unterseite – vier Einträge sind die Liste.

GIVEN  eine Angabe, eine Regel darauf und ein laufender Vorgang
WHEN   jemand wissen will, warum der Vorgang läuft
THEN   sind alle drei ohne Seitenwechsel sichtbar.

GIVEN  ein beliebiger Bereich
WHEN   die Seite geöffnet wird
THEN   nimmt „Diesen Bereich verwalten" keinen Platz in der Übersicht ein
       und ist über ein Bedienelement im Kopf erreichbar.

GIVEN  ein Fenster von 1024 px Breite
WHEN   eine Bereichsseite geöffnet wird
THEN   ist die Darstellung dieselbe wie bei 1440 px, nur schmaler –
       kein anderes Bedienmuster.

GIVEN  eine Sektion mit Inhalt
THEN   steht unter ihrem Titel dauerhaft ein Satz, der ihren Zweck nennt.
```
