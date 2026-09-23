# 65 · Visuelle Geometrie – dritter Durchgang

Dritter vollständiger Audit von Geometrie, Abständen und Konsistenz. Der erste (`docs/56`)
prüfte die Systemebene – Kanten, Radienhierarchie, Ikonenskala. Der zweite (`docs/57`) ging
in die Bauteile hinein – Mikroabstände, Overlays, Punkte. Seither sind zwei große
Funktionsbereiche dazugekommen (Essensplanung, `docs/63`), der Bereichskopf ist umgebaut
worden (`docs/61`) und das Produkt wurde umbenannt (`docs/64`). Dieser Durchgang fragt, was
dabei aus dem Raster gefallen ist.

**Nicht vorausgesetzt, dass der Bestand stimmt.** Jeder Wert wurde an der **gerenderten**
Anwendung gemessen, nicht im Stylesheet gelesen – ein Stylesheet sagt, was jemand gemeint
hat, der Browser sagt, was dasteht. Die vier folgenreichsten Befunde dieses Durchgangs waren
im Quelltext unsichtbar.

## Wie gemessen wurde

| Werkzeug | Was es liefert |
| --- | --- |
| `ops/scripts/geometrie.mjs` | Rundungen, Höhen, Innenabstände, Rahmen, Ikonen, Schriftgrößen und linke Kanten über 35 Seiten → `geo-<breite>.json` |
| `ops/scripts/responsive.mjs` | Inhaltsbreite, Seitenpolster und waagerechter Überlauf über neun Breiten (360 … 1920) |
| `ops/scripts/cognitive-load.mjs` | Anzahl Bedienelemente, Schriftgrößen, Primäraktionen je Seite |
| Bildschirmfotos | Sichtprüfung auf 1440, 834 und 390 px (§54) |

Gemessen wurde vor und nach jeder Änderung. Wo unten „gemessen nachher" steht, ist es eine
Zahl aus `geo-1440.json`, nicht eine Erwartung.

## Befunde

### W1 · Derselbe Chip sah anders aus, je nachdem woraus er gebaut war — **P1**

**Problem.** `.chip` war 24 px hoch, wenn er ein `<span>` war, und **28 px**, wenn er ein
`<button>` war. Schriftart und Textausrichtung wichen ebenfalls ab.

**Ursache.** Ein Knopf bringt vom Browser einen 2 px starken Außenrahmen, eine eigene
Schriftfamilie und `text-align: center` mit. `.chip` setzte keines davon zurück – im
Stylesheet stand **eine** Regel, im Browser standen zwei Bauteile.

**Auswirkung.** Tagfilter (Knöpfe) und Etiketten (Spans) standen in derselben Zeile 4 px
auseinander hoch. Das fällt einzeln nicht auf und macht jede Reihe aus beidem unruhig.

**Umsetzung.**

```css
.chip { …; border: 0; font-family: inherit; text-align: inherit; }
button.chip { cursor: pointer; }
```

**Gemessen nachher:** 114 Chips, alle 24 px, alle `--r-sm` – unabhängig vom Element.

---

### W2 · Der Seitentitel der Einstellungen begann 368 px weiter rechts — **P1**

**Problem.** Auf 34 Seiten begann die Überschrift bei x = 294. Auf `/einstellungen` bei
**x = 662**.

**Ursache.** Die Seite baute ihren Kopf **innerhalb** der rechten Spalte auf, statt über
beiden. Der Titel begann damit dort, wo das Verzeichnis aufhörte.

**Auswirkung.** Die eine Seite, auf der man nach etwas sucht, war die einzige ohne die
gemeinsame Achse. Beim Wechsel von jeder anderen Seite hierher sprang die Überschrift.

**Umsetzung.** Der Kopf steht jetzt über beiden Spalten – dieselbe Form wie auf der
Bereichsseite (`docs/61`), inklusive der durchgehenden Linie darunter:

```tsx
<Page back={…} title="Einstellungen" lede="Haushalt, Menschen, Zugriff, Konto und Daten.">
  <div className="split bereich-spalten">
    <nav className="master" aria-label="Einstellungsbereiche">…</nav>
    <div className="split-detail">…</div>
  </div>
</Page>
```

**Gemessen nachher:** `h1` an genau einer linken Kante – 294 px, 35 Seiten.

---

### W3 · Formularfelder hatten keine Breitengrenze — **P1**

**Problem.** Auf 1920 px war ein Auswahlfeld **1580 px** breit. Direkt daneben stand eine
Karte mit 378 px.

**Ursache.** `.input`, `.select` und `.textarea` hatten `width: 100%` ohne Obergrenze. In
einem Bogen (544 px) fiel das nie auf; in einem breiten Abschnitt lief das Feld bis zum Rand.

**Auswirkung.** Ein Eingabefeld, das dreimal so breit ist wie sein längster denkbarer Inhalt,
behauptet Platzbedarf, den es nicht hat – und der Weg von der Beschriftung zum Feldende wird
zu einer Augenreise.

**Umsetzung.** Ein Token, das den Bogen als Maß nimmt: Ein Feld wird nie breiter als das
Blatt, auf dem es sonst steht.

```css
--measure-field: 34rem;   /* = Bogenbreite */
.input, .select, .textarea { width: 100%; max-width: var(--measure-field); }
.field-row .input, … { max-width: none; }   /* in einer Zeile gilt die Zeile */
```

---

### W4 · Fünf Bedienhöhen, zwei davon nebeneinander — **P1**

**Problem.** Im Bereichskopf stand der Farbknopf mit **40 px** direkt neben „Aufgabe" mit
**44 px**. Über die ganze Anwendung gemessen gab es fünf Höhen für Bedienelemente.

| Höhe | Bauteile |
| --- | --- |
| 44 | `.btn`, `.btn-icon`, `.toggle`, `.input`/`.select`, Menüzeile der Befehlspalette, Navigationszeile |
| 40 | `.appbar-btn`, `.account-pop button`, `.back`, `.color-button`, `.disclosure > summary` |
| 36 | `.btn-sm`, `.btn-icon.btn-sm`, `.appbar-search`, `.grip`, `.toast button`, Haushaltsauswahl |
| 34 | `.swatch` |

**Ursache.** `.btn` und `.btn-sm` waren eine bewusste Zweierskala – aber sie stand nur in
`.btn`. Wer ein anderes Bauteil baute, schrieb eine Zahl hin. Fünf Autoren, fünf Zahlen; 40
war dabei die Zahl, die entsteht, wenn man „etwas kleiner als ein Knopf" meint.

**Auswirkung.** In der Kopfleiste standen drei Höhen nebeneinander (Suche 36, Knöpfe 40,
Konto 40), im Bereichskopf zwei (40 und 44). Beides liest sich als ungenaue Ausrichtung, nicht
als Hierarchie.

**Umsetzung.** Die Skala bekommt einen Namen, und jedes Bedienelement bezieht sich darauf:

```css
--control-h:    44px;   /* steht für sich */
--control-h-sm: 36px;   /* steht in einer Leiste, einer Zeile, neben einer Hauptaktion */
```

Die 40er wurden zugeordnet, nicht gemittelt: Was in der Kopfleiste steht, wurde `sm` – damit
hat die Leiste **eine** Höhe statt drei. Der Farbknopf wurde 44, weil er neben einer
Hauptaktion steht. Das Farbfeld (34) wurde `sm`.

**Nicht angetastet:** Die Trefferflächen. `@media (pointer: coarse)` schreibt weiterhin
`44px` als Zahl – das ist das Mindestmaß aus §23, nicht die Bedienhöhe. Beide sind heute
zufällig gleich; sie über dasselbe Token zu führen hieße, dass eine Gestaltungsentscheidung
still die Barrierefreiheit verschiebt.

**Gemessen nachher:** Zwei Höhen, 36 und 44. Der Prüftest in `apps/web/test/a11y.spec.tsx`
prüft jetzt beides – dass `.btn` das Token benutzt **und** dass das Token ≥ 44 px ist.

---

### W5 · Auf dem Tablet stand das Verzeichnis über dem Abschnitt — **P1**

**Problem.** Zwischen 768 und 1079 px zeigten die Einstellungen elf Verzeichniszeilen **und**
darunter den geöffneten Abschnitt.

**Ursache.** `.split` stapelt unter 1080 px. Für Chips (Bereichsseite) ist das richtig; für
ein Verzeichnis mit elf Zeilen heißt es: elf Zeilen Scrollen bis zum Inhalt – obwohl der Weg
zurück als „‹ Einstellungen" schon im Kopf steht.

**Umsetzung.** Schmal wird entweder das Verzeichnis oder ein Abschnitt gezeigt, nie beides.
Die Routen bleiben unverändert – es ist eine Layout-, keine IA-Änderung (§55).

---

### W6 · Drei Flächen, drei Innenabstände, keine Regel — **P2**

**Problem.** `.panel` 24, `.card` 16, `.notice` 12 px – ohne erkennbaren Unterschied im
Zweck.

**Umsetzung.** Eine Regel statt dreier Werte: Eine Fläche, die **für sich steht**, bekommt
`--s-5`; eine Fläche, die **in einem Lesefluss liegt**, `--s-4`.

| Fläche | vorher | nachher |
| --- | --- | --- |
| `.panel` | `--s-5` | `--s-5` (24) |
| `.card` | `--s-4` | `--s-5` (24) |
| `.notice` | `--s-3` | `--s-4` (20) |

**Gemessen nachher:** Zwei Innenabstände für Flächen, jeder mit einem Satz begründbar.

---

### W7 · `.num` überschrieb die Schriftrolle — **P2**

**Problem.** `.num` setzte Größe und Gewicht. Ein Zähler neben einer Abschnittsüberschrift
war damit kleiner **und** fetter als der Text, zu dem er gehört – und zwar anders, je nachdem
welche Rolle daneben stand.

**Ursache.** `.num` meinte zwei Dinge zugleich: „hier stehen Ziffern" und „das ist ein
Zähler". Das erste ist eine Ziffernform, das zweite eine Rolle.

**Umsetzung.** `.num { font-variant-numeric: tabular-nums; }` – sonst nichts. Die Rolle wird
dort gesagt, wo der Zähler steht:

```tsx
<span className="t-body-sm c-muted num" style={{ fontWeight: 400 }}>
```

**Gemessen nachher:** Jede Schriftrolle rendert in genau einer Ausprägung – `.t-body-sm`
230 × als 15/400/23, `.t-caption` 22 × als 13/500/20, `h3` und `.t-sub` 146 × als 17/620/23.

---

### W8 · Eine Handlung mit Rand war 2 px höher als ihre Nachbarn — **P2**

**Problem.** In der Zuständigkeitszeile des Bereichskopfs standen drei Elemente: Abzeichen
24 px, Chip 24 px, „Verantwortung ändern" **26 px**.

**Ursache.** Die Handlung ist ein Chip mit Rand statt Fläche – und trug denselben
Innenabstand wie die gefüllten. Der Rand kam obendrauf.

**Umsetzung.** Der Rand wird vom Innenabstand abgezogen, nicht addiert:
`padding: calc(var(--s-hair) - 1px) calc(var(--s-2) - 1px)`. Ein Rand darf ein Bauteil anders
aussehen lassen, aber nicht größer machen.

**Gemessen nachher:** Drei Elemente, eine Höhe.

---

### W9 · Verschachtelte Überschriften, zwei Zeilenhöhen bei einer Größe — **P2**

**Problem.** Ein `h3` in einem verschachtelten Abschnitt hatte dieselbe Schriftgröße wie
eines auf erster Ebene, aber eine andere Zeilenhöhe und Laufweite.

**Umsetzung.** Der verschachtelte Fall wird auf dieselbe Rolle gezogen:

```css
.section .section > header h3 {
  font-size: var(--t-sub-size); font-weight: var(--t-sub-weight);
  line-height: var(--t-sub-lh); letter-spacing: -0.006em;
}
```

---

### W10 · Höhen im Wochenkalender lagen neben der Skala — **P2**

**Problem.** Die Zellen des Wochenplans standen auf `4.5rem` und `3.5rem` – zwei Werte, die
in keiner Skala vorkommen, gesetzt als „sieht gut aus".

**Umsetzung.** `min-height: var(--s-16)` für die Zelle, `min-height: var(--s-12)` für den
Knopf darin. In der Dichte „ruhig" ergibt beides 64 px – die Zelle ist damit **eine**
Rasterhöhe, keine zwei nahe beieinander.

---

### W11 · Der Leerzustand skalierte sein Symbol über die Schriftgröße — **P3**

**Problem.** Ikonen aus dem Markup kamen aus `ICON.sm/md/lg` (16/20/24), Ikonen aus dem
Stylesheet griffen ersatzweise auf die Punkt-Token zu oder erbten die Schriftgröße. Zwei
Quellen für dieselbe Größe.

**Umsetzung.** Die Ikonenskala steht jetzt auch als Token da und spiegelt `ICON`:

```css
--icon-sm: 16px;  --icon-md: 20px;  --icon-lg: 24px;
```

**Gemessen nachher:** Drei Ikonengrößen (20 × 900, 16 × 134, 24 × 9), eine Strichstärke
(1,6 px, 1043 ×).

---

### W12 · Drei Betonungen in einer Knopfgruppe — **P3**

**Problem.** In der Leitkarte auf `/jetzt` stand „Ich bin dran" als `secondary` zwischen
einer Primäraktion und drei `ghost`-Handlungen: drei Gewichte für zwei Ränge.

**Umsetzung.** `variant="ghost"`. Eine Hauptaktion, der Rest gleichrangig.

---

## Bewusste Abweichungen

Was gemessen aus der Reihe fällt und trotzdem so bleibt – mit Grund, damit der nächste
Durchgang es nicht „repariert".

| Abweichung | Warum sie bleibt |
| --- | --- |
| **Zählabzeichen** in der Seitenleiste: 20 px, `--r-full` statt 24 px, `--r-sm` | Eine Zahl an einer Navigationszeile ist kein Etikett. Rund und kleiner heißt „Anzahl", eckig heißt „Eigenschaft". 35 Vorkommen, alle gleich |
| **`h2` in drei Größen** | Die Größe kommt aus der Rolle (`.t-title`, `.t-sub`), nicht aus der Ebene. Die Leitkarte auf `/jetzt` ist ein `h2` in Titelgröße (eine Seite hat eine wichtigste Sache), Kartentitel sind `h2` in `.t-sub` |
| **`.card-accent { padding-left: calc(var(--s-5) - 4px) }`** | Optischer Ausgleich für den 4 px starken Farbstreifen – der Text steht damit auf derselben Kante wie in einer Karte ohne Streifen |
| **`.panel .panel` setzt Rundung und Polster zurück** | Ein Feld im Feld mit eigener Rundung sieht aus wie ein Fehler. Der innere Rahmen ist eine Gruppierung, keine zweite Fläche |
| **Feld mit Höhe 1 px** | Der versteckte Datei-Auswähler. Er muss im Layout bleiben, damit der Knopf davor ihn auslösen kann |
| **`.tier3-group .row` mit 40 px** | Eine Zeilenmindesthöhe, kein Bedienelement – 40 ist in der Dichte „ruhig" ein Wert der Abstandsskala (`--s-8`) |
| **Zelle im Wochenkalender 64 px** | Höher als jede andere Zeile, weil dort zwei Zeilen Text plus Zustand stehen und ein leerer Platz trotzdem treffbar sein muss |
| **Hinweis schmaler als das Feld darunter** | Ein Hinweis ist Fließtext und endet bei `--measure`; ein Feld mit rechtsbündigen Handlungen braucht Breite. Die **linke** Kante fluchtet – das ist die tragende Achse |
| **`44px` als Zahl in `@media (pointer: coarse)`** | Das ist die Fingerbreite aus §23, nicht die Bedienhöhe. Siehe W4 |

## Bestand nachher

Gemessen auf 1440 px über 35 Seiten:

| | |
| --- | --- |
| Linke Kante `h1` | **eine**: 294 px (35 ×) |
| Bedienhöhen | **zwei**: 36, 44 |
| Innenabstände von Flächen | **zwei**: 20 (im Lesefluss), 24 (steht für sich) |
| Rundungen | 8 (Chip), 12 (Bedienelement, Zeile, Hinweis), 16 (Fläche), `--r-full` (Zähler, Punkte, Farbfelder) |
| Ikonen | 16, 20, 24 – eine Strichstärke (1,6 px) |
| Schriftrollen | jede in genau einer Ausprägung |
| Rahmenstärke | durchgehend 1 px |

Über neun Breiten (360 … 1920):

| Breite | Inhaltsbreiten | Seitenpolster | Überlauf |
| --- | --- | --- | --- |
| 360 / 390 | 360 / 390 | 20 | keiner |
| 480 | 480 | 24 | keiner |
| 768 / 834 / 1024 | 680 / 746 / 936 | 30 | keiner |
| 1280 / 1440 / 1920 | 1025 / 1161 / 1641 | 30 | keiner |

**Eine** Inhaltsbreite und **ein** Polster je Breite – Seiten rechnen nicht verschieden.

## Was nicht angefasst wurde

§55: Keine Produktlogik, keine Begriffe, keine Informationsarchitektur, keine Funktion, kein
Arbeitsablauf, kein Datenmodell. W5 verschiebt ein Layout, keine Route. Neue ästhetische
Entscheidungen wurden nicht getroffen – jeder neue Wert ist entweder ein vorhandener, der
einen Namen bekommen hat (`--control-h`, `--icon-*`), oder ein vorhandenes Maß, das zum
Bezugspunkt wurde (`--measure-field` = Bogenbreite).

Eine Beobachtung ohne Änderung: Der Farbknopf im Bereichskopf zeigt „keine eigene Farbe" als
leeren Ring. Das ist konsequent – er zeigt die geltende Farbe, und es gilt keine –, liest sich
beim ersten Blick aber wie ein Symbol, das nicht geladen hat. Das ist eine Produktfrage
(was soll „geerbte Farbe" aussehen?), keine Geometrie, und deshalb hier nur notiert.

## Werkzeug

`ops/scripts/responsive.mjs` ist aus diesem Durchgang hervorgegangen und bleibt: Die Frage
„rechnen alle Seiten gleich?" lässt sich nicht lesen, nur messen. `ops/scripts/geometrie.mjs`
hat beim Import eine vollständige Messung ausgelöst – ein Import darf nichts tun; das ist
behoben.

## Nachgemessen

| | |
| --- | --- |
| Lint | grün |
| Typecheck | grün |
| Node- und Web-Tests | 928 grün, 9 übersprungen |
| Browsertests (chromium + touch) | 339 grün |
| Build | grün |
| Kognitive Last | alle Seiten innerhalb der Budgets |
| Waagerechter Überlauf | keiner, auf neun Breiten |
| Sichtprüfung | `/jetzt`, `/essen`, Bereichsseite, `/familie` auf 1440 px; Einstellungen auf 834 px; `/jetzt` auf 390 px |

Ein Test wurde nachgezogen, keiner abgeschwächt: Die Prüfung der Knopfhöhe suchte die Zahl
`44px` im Stylesheet. Sie prüft jetzt, dass `.btn` das Token benutzt **und** dass das Token
mindestens 44 px ist – eine Bedingung mehr als vorher.
