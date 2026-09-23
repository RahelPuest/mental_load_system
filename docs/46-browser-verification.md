# Prüfung im echten Browser

> Auftrag §3.6 (Ästhetik), §38 (Barrierefreiheit), §50 (Breakpoints), §59 (Design QA), §67.

Bis hierher stand in jedem Bericht derselbe Satz: *das Aussehen ist nicht verifiziert*.
jsdom rechnet kein Layout – Proportionen, Überdeckungen, Trefferflächen und berechnete
Kontraste bleiben dort unsichtbar. Playwright und axe schließen diese Lücke.

```bash
pnpm test:e2e        # 153 Prüfungen in Chromium, gegen das gebaute Bündel
pnpm test:all        # Fachlogik, Oberfläche und Browser zusammen
```

Geprüft wird gegen `vite preview`, nicht gegen den Entwicklungsserver: der übersetzt Module
erst beim Aufruf, was unter Last zu Wartezeiten führt, die es im Betrieb nicht gibt – und
damit zu sprunghaften Tests.

| Datei | Prüft |
|---|---|
| `apps/web/e2e/layout.spec.ts` | Jede Ansicht bei 390, 480, 768, 1280 und 1680 px: nichts läuft seitlich heraus, kein Querscrollen, die richtige Navigation ist sichtbar, nur eine dominante Primäraktion |
| `apps/web/e2e/touch.spec.ts` | Mit Berührungsemulation (Pixel 7): jede Trefferfläche misst mindestens 44 px – gemessen als tatsächliche Fläche, nicht als Elementhöhe |
| `apps/web/e2e/a11y.spec.ts` | axe nach WCAG 2.0/2.1 Stufe A und AA auf jeder Ansicht, dazu Fokusführung im Erfassen-Dialog |
| `apps/web/e2e/detail.spec.ts` | Bereichsdetail und Vorgang – über die Navigation erreicht, nicht über geratene Pfade |

Jeder Lauf legt in `apps/web/e2e/.shots/` 85 Aufnahmen ab – eine je Ansicht und Breite.
Die Aufnahmen sind der eigentliche Zweck: Ein Test misst Geometrie, ob etwas *gut aussieht*,
sieht nur, wer hinschaut.

---

## Was die Prüfung gefunden hat

### C4 · Kritisch · Ein einzelner fehlgeschlagener Aufruf meldete den Nutzer ab

Mitten in der Prüfung erschien der Anmeldebildschirm. Ursache: `SessionProvider` behandelte
**jeden** Fehler beim Laden des Profils als „nicht angemeldet" – ein Netzwerkaussetzer, ein
429 aus der Ratenbegrenzung, ein kurzer Serverfehler.

Wer mitten in der Arbeit auf dem Anmeldeformular landet, verliert das Vertrauen in ein
System, dem er seine Verantwortung überlassen soll. Jetzt gilt: nur 401 und 403 heißen
„abgemeldet". Alles andere heißt „gerade nicht erreichbar" – die Sitzung bleibt bestehen,
eine Zeile erklärt es, und ein Knopf versucht es erneut.

### H5 · Hoch · Ein Knopf im Knopf zerstörte den Bedienbarkeitsbaum

`Row` wurde bei Klickbarkeit selbst zu einem `<button>`. Zeilen mit einer Aktion rechts
hatten damit einen Knopf im Knopf – ungültiges HTML. Der Browser bricht die Verschachtelung
auf, der Bedienbarkeitsbaum wird unbrauchbar; im Test äußerte sich das als sprunghaft „nicht
gefundene" Überschriften.

Jetzt trägt der Titel den Knopf, eine aufgespannte Fläche macht die ganze Zeile zur
Trefferfläche, und Aktionen rechts bleiben eigenständig.

### H6 · Hoch · Die Umstandsauswahl stand zweimal auf der Seite

`.context-inline` hatte überhaupt keine CSS-Regel. Ab 1080 px erschien die Auswahl deshalb
doppelt: einmal im Textfluss, einmal in der Nebenspalte – mit doppelten Bedienelementen und
doppelten Beschriftungen.

### H7 · Hoch · Die „Jetzt"-Ansicht war 6657 px lang

Vier Abschnitte mit bis zu sechs vollen Karten: 21 Karten auf der Startseite eines Produkts,
dessen Zweck es ist, Überforderung zu verhindern. Jetzt trägt nur der hervorgehobene
Abschnitt Karten; alles Weitere läuft als kompakte Zeile mit Titel, stärkstem Grund und
Aufwand. Höhe auf dem Tablet: 2916 px statt 6657.

### M4 · Mittel · Modellwerte standen im Text

„Der Bereich ist als **„critical"** eingestuft", „Der auslösende Hinweis ist als
**„important"** eingestuft". Beides kam aus Servertexten und rutschte an jeder Prüfung der
Oberfläche vorbei, weil die Zeichenketten dort erzeugt werden. Jetzt in klarer Sprache –
und ein Test in `views.spec.tsx` prüft die Oberfläche gegen eine Liste von Modellwerten.

### M5 · Mittel · Beschriftungen liefen aus der schmalen Seitenleiste

Auf dem Tablet war die Leiste 4,5 rem breit; „Beobachtung" und „Einstellungen" liefen
seitlich heraus. Jetzt 5,5 rem, kleinere Schrift, Umbruch erlaubt, Zähler als Abzeichen am
Symbol.

### M6 · Mittel · Kleine Knöpfe waren am Finger zu klein

`.btn-sm` maß 36 px, Auswahlchips 40 px. Am Zeigegerät ist das richtig, am Finger nicht.
Jetzt wachsen sie unter `pointer: coarse` auf 44 px – der Unterschied zwischen Maus und
Fingerkuppe ist kein Widerspruch, sondern eine Eigenschaft des Geräts.

### M7 · Mittel · Zwei gleich starke Primäraktionen

Auf „Wissen" konkurrierten „Notiz anlegen" im Kopf und „Erste Notiz anlegen" im leeren
Zustand; auf „Abläufe" das Anlegen mit dem Starten. Jetzt tritt die Kopfaktion zurück,
sobald der leere Zustand oder die Einträge selbst den Hauptweg zeigen. Ein Test zählt
*verschiedene* Primäraktionen – dieselbe Aktion an zehn Karten ist keine Konkurrenz.

### M8 · Mittel · Navigationsknöpfe sahen dauerhaft gedrückt aus

„Suchen" und „Meldungen" sind `<button>`, die übrigen Ziele `<a>`. Ohne zurückgesetzten
Rahmen wirkten die beiden wie ein aktiver Zustand.

### Zweite Runde: was das Ansehen der Aufnahmen ergab

Die ersten Korrekturen kamen aus automatischen Kriterien – Überlauf, Kontrast, Trefferfläche.
Was ein Kriterium nicht erfasst, findet nur das Hinsehen. Nach dem Durchsehen aller 60
Aufnahmen:

| Befund | Vorher | Jetzt |
|---|---|---|
| **Eingang: 42 Auswahlknöpfe** – sechs Zielarten offen an jeder von sieben Karten, auf einer Seite, die „möglichst wenige Entscheidungen" verlangt (§17) | Karte 320 px hoch | Vorschlag als Satz, Alternativen hinter „Anders einsortieren"; Karte 215 px |
| **Vorgänge ohne Stand** – die Liste zeigte nur Titel und Bereich; §14 verlangt Ziel, Stand und nächsten Schritt | Titelliste | „Als Nächstes: Füße messen" und „0 von 10", in einer Abfrage mitgeliefert |
| **Ein leerer Bereich war eine Wüste** – vier große Leerzustände untereinander, über 2000 px | vier Kacheln | ein Satz, Aktionen bleiben oben an ihrem festen Platz |
| **Karten im Raster standen versetzt** – `.card + .card` erzeugte 14 px Versatz je Karte | Oberkanten 232/246 | bündig, gleich hoch; ein Test misst es |
| **Wand aus Warnfarbe** – „niemand zuständig" an 7 von 12 Zeilen in Bernstein, direkt unter dem eigenen Text „Das ist kein Fehler" | Alarmoptik | gedämpft mit gestricheltem Rand; dasselbe für „wartet" in der Vorgangsliste |
| **Baumhierarchie unlesbar** – vier Ebenen nur durch Einrückung | – | Führungslinie je Ebene |
| **Kalender und Abläufe** trugen einen Zurück-Link auf „Familie", obwohl sie längst erste Ebene sind | falscher Weg zurück | entfernt; Kalender bekam außerdem einen echten leeren Zustand statt „Keine Termine im Blick." |

Dazu zwei Prüfungen, die das künftig abfangen: Ausrichtung im Raster und *verschiedene*
Primäraktionen je Ansicht (dieselbe Aktion an zehn Karten ist keine Konkurrenz).

Und ein Testfehler, der wie ein Produktfehler aussah: Nach einem Klick steht die alte
Überschrift noch da, während die neue Seite lädt. Wer auf „irgendeine Überschrift" wartet,
fotografiert die alte Seite – so entstand eine Aufnahme der Bereichsliste, die als
Detailseite abgelegt war. Jetzt wird auf den *Wechsel* der Überschrift gewartet.

---

## Was weiterhin offen ist

1. **Nur Chromium.** Firefox und WebKit sind nicht eingerichtet.
2. **Kein visueller Abgleich gegen Referenzbilder.** Geprüft werden Geometrie und
   Barrierefreiheit, nicht Pixelgleichheit – ein Rückschritt in der Optik fiele erst auf,
   wenn er ein geometrisches Kriterium verletzt.
3. **Ein Screenreader wurde nicht benutzt.** axe prüft, was aus dem Baum ableitbar ist.
4. **Dunkelmodus ist nur rechnerisch geprüft** (Kontraste in `tokens.spec.ts`), nicht
   gerendert.
