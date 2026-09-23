# 55 · Bereichsseite, zweiter UX-Review

Der Auftrag beschreibt als Ausgangslage eine lange vertikale Seite. Die gibt es nicht mehr:
Seit der Entscheidung für die Sektionsleiste ist die Bereichsseite eine Zwei-Spalten-Ansicht
(`docs/54`). Dieser Review prüft deshalb **den jetzigen Aufbau** – die Leiste steht auf dem
Prüfstand, nicht mehr als Hypothese.

Die Entscheidung für das Muster wird nicht neu aufgerollt. Geprüft wird, ob es hält, was es
verspricht, und wo es nachgebessert werden muss.

## Gemessen

Bereich „Schuhe" (der vollste) und „Urlaube" (leer), je sechs Seiten, zwei Breiten:

| | Übersicht | /wissen | /regeln | /laeuft | /verlauf | /verwalten |
| --- | --- | --- | --- | --- | --- | --- |
| **voll**, Desktop | 1911 px | 906 px | **844 px** | **844 px** | 1355 px | **844 px** |
| **leer**, Desktop | **1975 px** | 936 px | **844 px** | **844 px** | **844 px** | **844 px** |
| voll, Handy | 2312 px | 1200 px | 694 px | 677 px | 1580 px | 814 px |
| leer, Handy | **2327 px** | 1114 px | 626 px | 631 px | 950 px | 814 px |

844 px ist die Mindesthöhe bei 900 px Fensterhöhe – diese Seiten sind **leer bis auf
Kopfzeile und Navigation**.

| | |
| --- | --- |
| Navigationsspalte | 274 px hoch, 6 Punkte, auf **jeder** der sechs Seiten |
| Inhaltsspalte ab 1440 px | 584 px (vertikal waren es 644 px – **−9 %**) |
| Bedienelemente auf `/regeln` eines leeren Bereichs | 9, davon **6 Navigation** |
| Bereiche im Demohaushalt ohne jeden Inhalt | 6 von 13 |
| Bereiche mit Inhalt in mehr als einer Sektion | **1 von 13** |

## Beobachtungen

### C1 · Sechs Türen, von denen meist fünf ins Leere führen

**Problem.** Die Leiste zeigt immer sechs Punkte. Für 11 der 13 Bereiche sind mindestens
fünf davon leer – und man sieht es erst nach dem Klick. Die Seite „Regeln" eines leeren
Bereichs ist ein voller Bildschirm für **einen Satz und einen Knopf**.

**Ursache.** Eine Navigationsleiste zeigt Wege, keine Inhalte. Das ist ihr Wesen und war der
Haupteinwand im ersten Review; die Entscheidung fiel trotzdem für sie, und die Übersicht als
erster Punkt fängt den Fall ab. Was fehlt, ist die Information **an der Leiste selbst**.

**Auswirkungen.** Sondieren statt Sehen – bei einem Werkzeug gegen Mental Load die teuerste
Art von Klick, weil er nichts einbringt. Auf `/regeln` eines leeren Bereichs sind zwei
Drittel der Bedienelemente Navigation.

**Alternativen.**
(a) Punkte ausblenden, solange sie leer sind – dann springt die Leiste von Bereich zu
Bereich, und Anlegen wäre nur über die Übersicht möglich.
(b) **Zähler an jedem Punkt** – die Leiste sagt, wo etwas ist, ohne dass man klickt.
(c) Leere Punkte gedämpft darstellen – schwächer als ein Zähler, aber ohne Zahlenrauschen.

**Empfehlung: (b), ergänzt um (c).** Ein Zähler an „Was wir wissen · 3", „Regeln · 1",
„Läuft gerade · 2"; Punkte ohne Inhalt bleiben klickbar, aber gedämpft. Das ist die
billigste Reparatur, sie behält die Entscheidung, und sie macht aus der Leiste eine Aussage
statt einer Vermutung. Für „Übersicht", „Verlauf" und „Verwalten" gibt es keinen Zähler –
sie sind nie leer.

---

### C2 · Ein leerer Bereich ist länger als ein voller

**Problem.** Gemessen: leer 1975 px, voll 1911 px auf dem Desktop; auf dem Handy 2327 gegen
2312 px. Die Richtung ist falsch – ein Bereich ohne Inhalt darf nicht mehr Platz brauchen als
einer mit.

**Ursache.** Auf der Übersicht steht bei einem leeren Bereich zusätzlich der Hinweis „Noch
ist dieser Bereich leer …", und jeder der drei Abschnitte zeigt eine Leerzeile mit eigenem
Knopf – zusammen mehr als der tatsächliche Inhalt von „Schuhe".

**Auswirkungen.** Der schlechteste Fall ist der häufigste: 6 von 13 Bereichen sind leer.

**Erschwerend:** Der Test, der genau das verhindern sollte
(`domain-view.spec.ts › ist nicht länger als ein voller Bereich`), misst seit dem Umbau die
falsche Spalte – er greift auf `.content` zurück, weil `.with-rail` nicht mehr existiert.
Er ist grün und prüft nichts. Das ist mein Fehler beim Umbau.

**Empfehlung.** Test auf `.split-detail` umstellen. Inhaltlich: Bei einem leeren Bereich
entweder der Eingangshinweis **oder** die drei Leerzeilen – nicht beides.

---

### C3 · Die Übersicht ist eine Kopie der fünf Unterseiten

**Problem.** Jeder Inhalt existiert zweimal: gedeckelt auf der Übersicht, vollständig auf
seiner Seite. Solange ein Abschnitt unter dem Deckel bleibt – der Regelfall – ist die
Unterseite eine **exakte Kopie** dessen, was zwei Zeilen höher schon stand.

**Ursache.** Der Deckel stammt aus dem vertikalen Entwurf, wo er die Seite kurz hielt. In der
Zwei-Spalten-Ansicht trifft er auf eine Navigation, die dieselben Abschnitte noch einmal
anbietet.

**Auswirkungen.** „Habe ich das schon gesehen?" – die Frage, die eine gute Struktur gerade
beantworten soll. Und der Verweis „alle 23 ansehen" konkurriert mit dem Menüpunkt daneben:
zwei Wege zum selben Ziel, unterschiedlich benannt.

**Alternativen.**
(a) Deckel senken (3 statt 5) – ändert nichts am Grundsatz.
(b) Übersicht auf **Zusammenfassung** umstellen: keine Einträge, sondern Zahlen und der
jeweils dringendste Fall je Abschnitt.
(c) Deckel entfernen, Übersicht als reine Startseite mit Zuständigkeit und Zustand.

**Empfehlung: (b).** Die Übersicht beantwortet „was ist hier los?" – dafür braucht sie
Zahlen und Ausreißer, nicht die ersten fünf Einträge. „3 Angaben, eine sollte bestätigt
werden · 1 Regel, nächste Prüfung Donnerstag · 2 Aufgaben, eine überfällig." Damit ist sie
keine Kopie mehr, sondern eine eigene Sicht, und der Verweis „alle N ansehen" entfällt
zugunsten des Menüpunkts.

---

### C4 · Vier von sechs Seiten füllen keinen Bildschirm

**Problem.** `/regeln`, `/laeuft` und `/verwalten` messen exakt 844 px bei 900 px
Fensterhöhe – das ist die Mindesthöhe, sie sind also leer bis auf Kopf und Navigation. Beim
leeren Bereich gilt das für fünf von sechs.

**Ursache.** Ein Bereich ist ein kleiner Gegenstand. Er auf sechs Seiten zu verteilen, gibt
jedem Teil mehr Platz, als er füllen kann.

**Auswirkungen.** Das Verhältnis kippt: 274 px Navigation zu wenigen Zeilen Inhalt.

**Empfehlung.** Aus C3 folgt die Reparatur mit: Werden die Unterseiten die *einzige*
vollständige Darstellung (statt Kopie), tragen sie auch etwas. Zusätzlich: `/laeuft` und
`/regeln` zusammenlegen wäre falsch – sie beantworten verschiedene Fragen. Der Leerlauf ist
der Preis des Musters und wird durch die Zähler aus C1 wenigstens vorhersehbar.

---

### C5 · Der Verlauf ist die einzige ungedeckelte Liste

**Problem.** `/verlauf` misst 1355 px auf dem Desktop und 1580 px auf dem Handy – die längste
Unterseite, mit fest verdrahtetem `limit=40`. Sie wächst mit jeder Handlung.

**Auswirkungen.** Was heute die längste Seite ist, wird die mit Abstand längste. Und die
Liste ist ungefiltert: 40 Ereignisse ohne Gruppierung nach Tag.

**Empfehlung.** Nach Tagen gruppieren, Nachladen statt festem Limit, und dieselbe Filterzeile
wie auf `/wissen`.

---

### C6 · Drei Muster für dieselbe Aufgabe

**Problem.** „Ein Objekt mit mehreren Teilen" wird in der Anwendung jetzt auf drei Arten
gelöst:

| Ort | Muster | Höhe |
| --- | --- | --- |
| Einstellungen | Liste links, Inhalt rechts | – |
| **Bereich** | Liste links, Inhalt rechts | 1911 px |
| Wissen | Reiter | 844 px |
| **Vorgang** | vertikal, 2 Abschnitte | 1462 px |
| Familie | vertikal mit Chips | 2028 px |

**Ursache.** Jedes Muster ist für sich begründet entstanden. Zusammen ergeben sie keine Regel.

**Auswirkungen.** Ein Vorgang ist der nächste Verwandte eines Bereichs – beides sind
Gegenstände mit Teilen, beide haben Schritte, Verlauf und Verwaltung. Der eine hat eine
Leiste, der andere nicht. Wer den Bereich gelernt hat, lernt den Vorgang neu.

**Alternativen.**
(a) Vorgang ebenfalls auf die Leiste umstellen – er hat nur zwei Teile, die Leiste wäre dort
noch leerer als beim Bereich.
(b) **Eine Regel formulieren und dokumentieren**, wann welches Muster gilt.
(c) Bereich zurück auf vertikal – die verworfene Option.

**Empfehlung: (b).** Vorschlag für die Regel: *Leiste, wenn die Teile unabhängig sind und
überwiegend Konfiguration (Einstellungen, Bereich). Reiter, wenn die Teile Sichten auf
dieselbe Menge sind (Wissen). Vertikal, wenn es weniger als vier Teile sind und sie
aufeinander aufbauen (Vorgang, Jetzt).* Damit ist die Bereichsseite regelkonform und der
Vorgang bleibt es auch.

---

### C7 · Die Inhaltsspalte verliert Breite

**Problem.** 584 px ab 1440 px Fensterbreite gegenüber 644 px in der vertikalen Fassung –
9 % weniger, ausgerechnet auf großen Bildschirmen.

**Ursache.** `.split-detail` teilt die Seitenbreite; die Leiste wächst ab 1440 px auf 304 px,
die Inhaltsspalte nicht mit.

**Empfehlung.** Kein Mangel, sondern der bekannte Preis. Falls er stören sollte: die Leiste
ab 1440 px bei 256 px festhalten, statt sie mitwachsen zu lassen – das gäbe der
Inhaltsspalte 48 px zurück.

---

### C8 · Mobil ist die Navigation gelöst, die Übersicht nicht

**Problem.** Die Chips über dem Inhalt kosten nur 56 px und lesen sich in einem Blick – das
funktioniert. Die Übersicht bleibt mit 2312 px aber 2,5 Bildschirme lang, und beim leeren
Bereich 2327 px.

**Empfehlung.** Wird durch C3 gelöst: Eine Zusammenfassung statt fünf Einträgen je Abschnitt
bringt die Übersicht unter zwei Bildschirme.

## 1 · Empfohlene Zielstruktur

Die Zwei-Spalten-Ansicht bleibt. Vier Änderungen daran:

```
┌────────────────────────────┬──────────────────────────────┐
│ Übersicht                  │  Zusammenfassung statt Kopie │
│ Was wir wissen        · 3  │                              │
│ Regeln                · 1  │  „3 Angaben, eine sollte     │
│ Läuft gerade          · 2  │   bestätigt werden"          │
│ Was hier passiert ist      │  „1 Regel, nächste Prüfung   │
│ Diesen Bereich verwalten   │   Donnerstag"                │
└────────────────────────────┴──────────────────────────────┘
```

1. **Zähler in der Leiste** (C1) – leere Punkte gedämpft.
2. **Übersicht wird Zusammenfassung** (C3, C8) – Zahlen und Ausreißer statt der ersten fünf
   Einträge; „alle N ansehen" entfällt, der Menüpunkt übernimmt.
3. **Verlauf gedeckelt und gruppiert** (C5).
4. **Musterregel dokumentiert** (C6), Test repariert (C2).

## 2 · Begründung

| Anspruch | heute | nach den Änderungen |
| --- | --- | --- |
| Leerer Bereich ohne Klick erkennbar | ✗ | ✓ (Zähler) |
| Übersicht sagt etwas Eigenes | ✗ (Kopie) | ✓ |
| Leerer Bereich nicht länger als voller | ✗ (1975 > 1911) | ✓ |
| Verlauf skaliert | ✗ | ✓ |
| Ein Muster je Situation, begründet | ✗ | ✓ |
| Entscheidung für die Leiste bleibt | – | ✓ |

## 3 · Desktop-Konzept

Leiste links, dauerhaft sichtbar, nicht einklappbar: Sechs Punkte rechtfertigen keinen
Schalter, und ein eingeklappter Zustand wäre ein Zustand mehr, den man sich merkt. Die Leiste
bleibt beim Scrollen stehen (ist bereits so). Ab 1440 px bei 256 px festhalten statt
mitwachsen (C7).

Keine dritte Spalte. „Über diesen Bereich" bleibt am Fuß der Übersicht.

## 4 · Mobile-Konzept

Unverändert: waagerechte Chips über dem Inhalt, 56 px, mit 44-px-Zielen unter
`pointer: coarse`. Ausdrücklich **nicht**: Drawer oder Bottom Sheet – beide verdecken den
Gegenstand, über den man gerade nachdenkt. Segment Control scheitert an sechs Punkten.
Die Zähler erscheinen als kleine Zahl im Chip.

## 5 · Auswirkungen auf die Navigation

Keine. Die globale Navigation bleibt unberührt, die Routen bestehen bereits.

## 6 · Auswirkungen auf Mental Load

| | heute | erwartet |
| --- | --- | --- |
| Übersicht, voller Bereich | 1911 px | ~1200 px |
| Übersicht, leerer Bereich | 1975 px | ~700 px |
| Klicks bis „hier ist nichts" | bis zu 5 | **0** |
| Inhalt, der zweimal dasteht | alle Abschnitte | keiner |

Für neurodivergente Nutzung ist der Zähler der eigentliche Gewinn: Er beantwortet die Frage
vor dem Klick. Eine Leiste ohne Zähler verlangt, sich zu merken, was hinter welchem Punkt
lag – genau die Merkarbeit, die die Anwendung abnehmen soll.

## 7 · Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Zähler lesen sich als Bewertung („zu wenig Wissen") | Keine Zahl, wo null – gedämpfter Punkt statt „· 0" |
| Zusammenfassung verbirgt, was man sehen wollte | Jeder Abschnitt nennt seinen dringendsten Fall im Klartext, nicht nur eine Zahl |
| Zwei Zahlen (Zähler links, Zusammenfassung rechts) widersprechen sich | Beide aus derselben Quelle im selben Aufruf |
| Sechs Punkte werden zu acht (Anhänge, Kalender) | Die Musterregel aus C6 setzt die Grenze: mehr als sieben Punkte heißt, der Gegenstand ist zu groß |

## Musterregel (C6)

Wann welche Struktur für „ein Gegenstand mit mehreren Teilen" gilt – damit die nächste
Detailseite die Frage nicht neu verhandeln muss:

| Muster | Wann | Beispiele |
| --- | --- | --- |
| **Leiste links** | Die Teile sind voneinander unabhängig, man liest selten quer, und ein Teil überwiegt als Konfiguration | Einstellungen, Bereich |
| **Reiter** | Die Teile sind Sichten auf dieselbe Menge – man vergleicht sie, statt zwischen ihnen zu wechseln | Wissen (Notizen · Fragen · Entscheidungen) |
| **Vertikal** | Weniger als vier Teile, und sie bauen aufeinander auf | Vorgang, Jetzt, Familie |

Die Grenze nach oben: **Mehr als sieben Punkte in der Leiste heißt nicht „mehr Punkte",
sondern dass der Gegenstand zu groß geworden ist.** Anhänge, Kalenderverknüpfungen und
Automationen gehören dann in einen bestehenden Punkt, nicht in einen neuen.

Der Vorgang bleibt damit bewusst vertikal: Er hat zwei Teile (Schritte, Verlauf), eine Leiste
wäre dort leerer als beim Bereich.

## 8 · Akzeptanzkriterien

```
GIVEN  ein Bereich ohne jeden Inhalt
WHEN   seine Seite geöffnet wird
THEN   ist an der Leiste ohne einen Klick erkennbar, dass alle Abschnitte leer sind.

GIVEN  ein Bereich mit drei Angaben, einer Regel und zwei Aufgaben
THEN   trägt die Leiste die Zahlen 3, 1 und 2 – und keine Zahl an Übersicht,
       Verlauf und Verwalten.

GIVEN  ein leerer und ein voller Bereich
WHEN   beide Übersichten gemessen werden
THEN   ist die leere kürzer als die volle – und der Test misst die Inhaltsspalte,
       nicht die Seite.

GIVEN  ein Abschnitt mit drei Einträgen
WHEN   die Übersicht geöffnet wird
THEN   steht dort eine Aussage über die drei, nicht die drei Einträge selbst –
       sie stehen auf der Seite des Abschnitts.

GIVEN  ein Bereich mit 200 Ereignissen im Verlauf
WHEN   „Was hier passiert ist" geöffnet wird
THEN   sind sie nach Tagen gruppiert und werden nachgeladen, nicht alle auf einmal.

GIVEN  eine neue Detailseite in der Anwendung
WHEN   entschieden wird, ob sie eine Leiste bekommt
THEN   gibt es eine dokumentierte Regel, die die Frage beantwortet.
```
