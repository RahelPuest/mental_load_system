# Dritter Durchgang: die Behauptungen prüfen

> Auftrag §59 (Design QA), §60 (UX QA), §67 (Definition of Done pro View).

Der erste Durchgang hat die Oberfläche gebaut. Der zweite hat die Funktionen nachgezogen,
die dabei nicht mitgekommen waren ([docs/43](43-ux-audit-2.md)). Dieser Durchgang stellt eine
andere Frage: **Woher wissen wir eigentlich, dass irgendetwas davon stimmt?**

Die Antwort war unbequem.

---

## 1. Der Hauptbefund

Vor diesem Durchgang gab es **233 Tests und nicht einen einzigen davon für die Oberfläche**.
Keine Komponente wurde je gerendert. Damit war jede Aussage in [docs/42](42-design-system.md)
und im README eine Behauptung ohne Nachweis:

| Behauptung | Status vorher |
|---|---|
| „Barrierefreiheit ist Teil der Definition of Done" | ungeprüft |
| „jede Statusfarbe zusätzlich als Text" | ungeprüft |
| „Fokusfalle und Escape in Overlays" | ungeprüft |
| „Trefferflächen ≥ 44 px" | ungeprüft |
| „Kontraste erfüllen WCAG" | ungeprüft – **und falsch** |
| „durchdachte leere Zustände" | ungeprüft – **und teilweise falsch** |
| „Skeletons statt Spinner" | ungeprüft – **und teilweise falsch** |

Die §67-Liste des Auftrags – Desktop, Tablet, Mobile, Empty, Loading, Error, Partial Data,
Long Content, Very Long Names, Permission Restricted, Keyboard, Screenreader, Focus,
Touch Targets – stand als Vorsatz in der Dokumentation, ohne dass irgendetwas sie einforderte.

**Konsequenz:** ein zweites Testprojekt (`vitest.web.config.ts`, jsdom) mit einem
Fake-Backend, dessen Antworten **echte Mitschnitte des laufenden Servers** sind
(`ops/scripts/dump-fixtures.mts` → `apps/web/test/fixtures/api.json`). Damit prüfen die
Tests die Oberfläche gegen die Form, die sie im Betrieb wirklich bekommt, und fallen auf,
wenn sich ein Vertrag ändert.

Die Suite fährt jede Ansicht durch jeden Zustand aus §67. Sie hat die folgenden Befunde
nicht bestätigt, sondern **gefunden**.

---

## 2. Befunde

### C1 · Kritisch · Die App behauptete während des Ladens, es sei nichts da

`useAsync` behielt die Daten des vorigen Aufrufs, wenn sich die Abhängigkeiten änderten.
Beim ersten Rendern – Haushalt steht noch nicht fest – lieferte der Platzhalter-Loader
`{ items: [] }`, und das blieb stehen. Fünf Ansichten zeigten deshalb im Ladezustand ihren
**leeren Zustand**: „Noch keine Bereiche", „Nichts im Eingang".

Für ein Produkt, dem man Verantwortung überlässt, ist eine falsche Leermeldung schlimmer als
ein Platzhalter. Sie sagt: *dein Haushalt ist leer* – und widerspricht damit genau der
Zusage, die das Produkt gibt.

*Behoben:* `useAsync` verwirft Daten beim Wechsel der Abhängigkeiten und verwirft zusätzlich
Antworten überholter Anfragen (ein Zähler). Letzteres schließt einen zweiten, stillen Fehler:
eine langsame alte Antwort konnte eine neue überschreiben.

### C2 · Kritisch · Push war ein Versprechen ohne Anschluss

Der Knopf „Push einrichten" fragte den Browser um Erlaubnis und meldete „Erlaubnis erteilt".
Danach passierte **nichts**: kein Service Worker, kein `pushManager.subscribe`, kein Aufruf
von `addPushSubscription`. Es wäre nie eine Benachrichtigung angekommen, und die Geräteliste
wäre für immer leer geblieben – ohne Hinweis.

Das ist der Vertrauensbruch, den §46 ausschließt: Wer sich darauf verlässt, erinnert zu
werden, verliert genau dann etwas, wenn er sich am meisten darauf verlässt.

*Behoben:* `apps/web/public/sw.js` (Zustellung und Klickziel), `GET /api/v1/push/config`
für den öffentlichen VAPID-Schlüssel, `apps/web/src/lib/push.ts` für die echte Anmeldung –
und eine ehrliche Ansage, wenn der Server kein Push kann, statt eines Knopfes, der nichts tut.

### C3 · Kritisch · Die API bestätigte Schreibvorgänge, bevor sie geschrieben waren

Dieser Befund kam nicht aus der Oberfläche, sondern daraus, dass die Testsuite unter der neuen
Last **sprunghaft rot** wurde: Zeilen, die ein Test soeben angelegt hatte, waren im nächsten
Aufruf nicht auffindbar; geänderte Werte kamen veraltet zurück. Ohne die Web-Tests lag die
Quote bei **fünf roten von acht Läufen** – der Fehler war also schon vorher da und blieb
unbemerkt, weil eine grüne Suite nach ein, zwei Läufen überzeugend aussieht.

Die Messung: die Zeile existierte in der Datenbank, der Haushalt stimmte,
`app.household_ids` stimmte, ein sofortiger zweiter Versuch fand sie. Also kein
Berechtigungs-, sondern ein **Reihenfolgeproblem**.

Ursache: Jeder Handler ruft `reply.send(...)` **innerhalb** der Transaktion auf. Fastifys
`Reply` ist ein Thenable – `await reply` wartet, bis die Antwort beim Client ist. Da die
Handler `return reply.send(...)` schreiben, wurde dieses Objekt zum Rückgabewert der
Transaktion. Die Transaktion wartete damit auf das Absenden, und das Absenden lag zwingend
**vor** dem COMMIT.

Zwei Folgen, beide ernst:

1. Scheitert das COMMIT, hat der Client bereits „201 Created" gelesen, obwohl nichts
   gespeichert wurde. Das ist genau die stille Verlustart, die INV-001 ausschließt – und der
   Bruch der Zusage, auf die das ganze Produkt gebaut ist.
2. Der unmittelbar folgende Aufruf sah die eigene Schreiboperation nicht.

*Behoben:* `inHousehold` puffert `send` für die Dauer der Transaktion und sendet erst nach dem
COMMIT; der Ersatz für `send` gibt eine schlichte Marke statt des Reply-Objekts zurück, damit
kein Thenable mehr in die Transaktion gerät. Festgehalten in
`apps/api/test/write-durability.spec.ts`.

Danach: **acht von acht** vollen Läufen grün.

### H1 · Hoch · Vier von fünf Kontrastpaaren im Metatext fielen durch

`apps/web/test/tokens.spec.ts` rechnet die WCAG-Kontraste der tatsächlich verwendeten
Kombinationen nach:

| Paar | vorher | jetzt |
|---|---|---|
| Gedämpfter Text auf Fläche | 4.13 : 1 | 5.58 : 1 |
| Gedämpfter Text auf vertiefter Fläche | 3.64 : 1 | 4.92 : 1 |
| Rand auf Fläche (hell) | 1.38 : 1 | 1.55 : 1 |
| Rand auf Fläche (dunkel) | 1.30 : 1 | 1.49 : 1 |

Betroffen war die Neutralskala an drei Stufen. Die Randgrenzen sind kein WCAG-Kriterium,
sondern eine eigene Untergrenze: ein Rand, den man nicht sieht, gruppiert auch nichts.

### H2 · Hoch · Abgeben und Warten waren dort unerreichbar, wo man Aufgaben trifft

`AssignSheet` (§26) und `WaitSheet` (§27) existierten – aber nur in der Vorgangsansicht.
In der Jetzt-Ansicht, wo man einer Aufgabe tatsächlich begegnet, gab es genau zwei Ausgänge:
**Erledigt** und **Später**. Wer etwas nicht selbst machen konnte, musste lügen oder
verschieben.

*Behoben:* Unter „Geht gerade nicht" stehen jetzt *Abgeben*, *Ich warte auf jemanden* und
*Nicht mehr nötig*; bei der hervorgehobenen Sache zusätzlich *Ich bin dran*.

### H3 · Hoch · Die Gliederung sprang von h1 auf h3

Wer per Überschrift navigiert, landete im Nichts. Ursache: jede Datei setzte ihre
Überschriftenebene von Hand nach Schriftgröße, nicht nach Schachtelung. Ansichten ohne
Zwischenüberschrift übersprangen eine Ebene.

*Behoben:* Die Ebene ergibt sich jetzt aus der Schachtelung (`Heading`/`Deeper` im
Designsystem). `Page` ist Ebene 1, ein `Section` **mit** Titel vertieft, eines ohne nicht,
ein Dialog beginnt seine eigene Gliederung. Der Test prüft jede Ansicht auf Sprünge.

### H4 · Hoch · Fehler- und Sperrzustände waren keine Überschriften

`ErrorState` und `PermissionDenied` setzten ihren Titel als `<p>`. Sichtbar fett, für ein
Vorleseprogramm unauffindbar.

### M1 · Mittel · Der Fokusring der Befehlspalette war abgeschaltet

`.palette input:focus-visible { outline: none }` – ausgerechnet an dem Feld, das man nur
per Tastatur erreicht. Jetzt bleibt der Ring, nur nach innen versetzt.

### M2 · Mittel · Lange Namen wurden stumm abgeschnitten

Zeilentitel standen auf `white-space: nowrap` mit Ellipse und ohne `title`. Bei den langen
Bereichsnamen, die in echten Haushalten entstehen („Kind A / Kleidung / Schuhe / Winter"),
war der Name schlicht nicht lesbar. Jetzt zwei Zeilen, `overflow-wrap: anywhere` für
deutsche Komposita, und der volle Text im `title`.

### M3 · Mittel · Sechs Backend-Funktionen blieben unerreichbar

Die Gegenprobe über alle 99 Client-Funktionen fand: `startTask`, `dropTask`,
`playbookSuggestions`, `createContextTag`, `addPushSubscription` ohne jeden Aufrufer.

*Behoben:* siehe H2 und C2, dazu Ablauf-Vorschläge beim Starten eines Vorgangs (§46: der
bekannte Weg wird angeboten, nicht versteckt – gleichberechtigt neben „Ohne Ablauf starten")
und das Anlegen eigener Umstände (§13: „im Auto", „wenn Oma da ist" – der technische
Schlüssel wird abgeleitet, nicht erfragt).

`attention` als eigene Liste bleibt bewusst ungenutzt: Aufmerksamkeitspunkte erscheinen in
der Jetzt-Ansicht und im jeweiligen Bereich. Eine dritte Liste derselben Sachen wäre genau
die Listenvermehrung, die §2 ausschließt.

---

## 3. Was jetzt maschinell geprüft wird

| Datei | Prüft |
|---|---|
| `apps/web/test/tokens.spec.ts` | WCAG-Kontraste hell und dunkel, Abstands-, Radien-, Bewegungs- und Schriftskala, keine Farbwerte außerhalb der Tokendatei |
| `apps/web/test/views.spec.tsx` | Jede Ansicht in *mit Daten / leer / Fehler / ohne Berechtigung / lädt / sehr lange Namen*; keine Modellbegriffe; keine beschämende Sprache; Teilausfälle |
| `apps/web/test/a11y.spec.tsx` | Zugänglicher Name an jedem Bedienelement, Beschriftung an jedem Feld, Überschriftenebenen, `aria-hidden` an dekorativen Symbolen, Farbe nie allein, Fokusfalle und Rückgabe im Dialog, Live-Region, Trefferflächen, Fokusring |
| `apps/web/test/flows.spec.tsx` | Erfassen ohne Pflichteinordnung, Abhaken mit echtem Rückgängig, Abgeben mit Aussage, Warten ohne Schuldton, Push meldet wirklich an, Vorschläge mit Begründung, Verteilung ohne Prozentzahlen |

Dazu `apps/api/test/write-durability.spec.ts`: bestätigt heißt gespeichert.

**463 Tests** (vorher 233), davon 225 für die Oberfläche.

*Korrektur:* Zwischenzeitlich standen hier 544. Diese Zahl war zu hoch: `a11y.spec.tsx` und
`flows.spec.tsx` importierten eine Hilfsfunktion aus `views.spec.tsx` und führten damit deren
Tests erneut aus. Die Hilfsfunktion liegt jetzt im Harness; 463 ist die tatsächliche Zahl.

Die Suite läuft achtmal hintereinander grün. Vor diesem Durchgang war sie in fünf von acht
Läufen rot – gesehen hatte das niemand, weil man selten achtmal hintereinander testet.

---

## 4. Was weiterhin offen ist

Ehrlich, nicht beschönigt:

1. **Das Aussehen ist unverifiziert.** jsdom rendert kein Layout: Proportionen, Rhythmus,
   Whitespace, visuelle Tiefe (§3.6, §68) lassen sich so nicht prüfen. Geprüft sind Struktur,
   Semantik, Zustände, Sprache und die Farbwerte – nicht der Eindruck.
2. **Breakpoints sind nicht durchgespielt** (§50). Die Medienabfragen existieren, aber kein
   Test rendert bei 360, 768, 1024 und 1440 px.
3. **Kalendertermine sind nicht mit Bereich und Vorbereitung verknüpft** (§18). Das Modell
   kann es (`linked_domain_id`), die Oberfläche bietet es nicht an.
4. **Der Eingang wandelt in Aufgabe, Frage, Wissen und Entscheidung um** – nicht in Termin,
   Zustandsangabe oder Beobachtungsregel (§17).
5. **Ein Screenreader wurde nicht benutzt.** Geprüft ist, was aus dem DOM ableitbar ist.
6. **Die Testdatenbank wird zwischen Läufen nicht geleert.** Das ist Absicht (parallele
   Dateien teilen sie sich), führt aber zu wachsendem Altbestand. `DROP DATABASE thealotta_test`
   setzt zurück.
