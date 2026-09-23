# Navigationsmodell und Erreichbarkeit

> Auftrag §5 (Informationsarchitektur), §6 (Primäre Navigation), §64 (nichts verstecken).

## Der Befund

Die Navigation hatte vier Ziele: Jetzt, Bereiche, Eingang, Familie. Der Funktionsumfang
dahinter war deutlich größer. Die Gegenprobe – jede Funktion des API-Clients gegen jeden
Aufrufer in der Oberfläche – ergab:

| Funktion | Zustand vorher |
|---|---|
| **Kalender** | nur über einen Knopf auf der Familienseite |
| **Abläufe** | nur über einen Knopf auf der Familienseite |
| **Vorgänge** | keine Übersicht. Ein laufender Vorgang war nur über den Bereich auffindbar, in dem er lebt |
| **Wissen** (haushaltsweit) | gar nicht. Notizen nur je Bereich |
| **Offene Fragen** (haushaltsweit) | gar nicht |
| **Entscheidungen** (haushaltsweit) | gar nicht |
| **Beobachtung** | keine Übersicht. Regeln nur je Bereich hinter einem Aufklapper |
| **Aufmerksamkeitspunkte** | keine Liste |

Fünf Client-Funktionen – `processes`, `knowledge`, `questions`, `decisions`, `monitors`,
`attention` – hatten überhaupt keinen Aufrufer.

Der Kern des Problems: Wer einen Vorgang suchte, musste wissen, in welchem Bereich er
einsortiert ist. Also genau das im Kopf behalten, was dieses Produkt abnehmen soll.

## Die neue Struktur

Die Gruppen folgen dem Produktmodell – erst was jetzt zählt, dann wer wofür zuständig ist,
dann was wir wissen und beobachten:

| Gruppe | Orte |
|---|---|
| **Täglich** | Jetzt · Eingang |
| **Verantwortung** | Bereiche · Familie |
| **Übersicht** | Vorgänge · Wissen · Beobachtung · Kalender · Abläufe |
| **Verwaltung** | Einstellungen |

### Kopfleiste statt Seitenleiste für Werkzeuge

Über allem liegt eine Kopfleiste – auf jeder Bildschirmgröße. Sie trägt:

**Thealotta · Haushalt** ......... **Suchen (⌘K) · Meldungen · Einstellungen · Konto**

Der Grund: Suchen, Meldungen, Einstellungen und das eigene Konto sind **Werkzeuge, keine
Orte**. In der Ortsliste standen sie gleichrangig neben „Bereiche" und „Familie" und
konkurrierten mit ihnen um Aufmerksamkeit. Die Seitenleiste trägt jetzt nur noch Navigation
und die eine Primäraktion (**Erfassen**, ⌘N).

Ein Klick auf das eigene Zeichen meldet nicht sofort ab – das wäre eine folgenreiche Aktion
ohne Absicht. Es öffnet ein Menü, das sagt, wer angemeldet ist, und den Weg hinaus anbietet.

Auf schmalen Bildschirmen schrumpfen die Beschriftungen auf Symbole; die Kopfleiste bleibt.

**Mobil** bleiben vier Ziele im Daumenbereich – Jetzt, Bereiche, Eingang, Übersicht – plus die
erhöhte Erfassen-Taste. „Übersicht" ist kein Sammelbecken für Reste, sondern das erklärte
Verzeichnis aller Orte mit je einem Satz dazu, wofür sie da sind.

Die Struktur steht in `apps/web/src/lib/navigation.ts`. Seitenleiste, mobile Übersicht und
Befehlspalette lesen dieselbe Liste – sie können nicht auseinanderlaufen.

## Die drei neuen Ansichten

**Vorgänge** (`/vorgaenge`) – alles Mehrschrittige aus allen Bereichen, nach Zustand
gefiltert (läuft / wartet / abgeschlossen), mit den erprobten Abläufen darunter.

**Wissen** (`/wissen`) – Notizen, offene Fragen und Entscheidungen über alle Bereiche
hinweg, auf Wunsch auf einen Bereich eingeschränkt. Fragen lassen sich hier direkt
beantworten; die Antwort wird als Wissen gespeichert.

**Beobachtung** (`/beobachtung`) – was Thealotta im Blick behält, in klarer Sprache: was, wie oft,
wann als Nächstes. Darüber, was sich gemeldet hat. Das ist die Ansicht, die die Kernzusage
überprüfbar macht: Wer dem System das Mitdenken überlässt, muss nachsehen können, *was* es
tatsächlich beobachtet. Ohne sie ist es Vertrauen ins Blaue.

Kalender und Abläufe sind aus `/familie/…` in die erste Ebene gezogen. Die alten Pfade
leiten weiter – gespeicherte Links brechen nicht.

## Layout

Bisher lief jede Seite in einer festen Spalte von 44 rem. Für Fließtext ist das richtig, für
Rasterlisten falsch: auf einem großen Bildschirm blieben zwei Drittel leer, während man
scrollte.

- **Kartenraster** (`.card-grid`) ab 860 px: Karten füllen die Breite, statt sich zu strecken.
- **Breite nach Bedarf**: Seiten mit Raster oder Nebenspalte bekommen mehr Platz
  (`:has()`-Regel auf `.content`); Lesetext behält über `--measure` seine Zeilenlänge.
- **Bereichsdetail** hat jetzt eine Nebenspalte (`.with-rail`): Zuständigkeit, Beobachtung,
  Verlauf und Unterbereiche stehen ab 1180 px daneben statt darunter. Auf schmalen
  Bildschirmen rutscht die Spalte unter den Inhalt – sie verschwindet nicht.

## Was das absichert

`apps/web/test/reachability.spec.tsx` prüft strukturell:

1. **Jede** Funktion des API-Clients wird von der Oberfläche benutzt.
2. Jeder Ort der Navigation hat eine Route.
3. Jede Route der App ist von der Navigation aus erreichbar (Weiterleitungen ausgenommen).
4. Keine Gruppe ist länger als sieben Einträge, mobil bleiben es vier Ziele, und jeder Ort
   erklärt sich in einem Satz.
5. Seitenleiste und Befehlspalette nennen jeden Ort.

Damit ist §64 nicht mehr eine Absicht, sondern eine Bedingung: Eine neue Seite ohne
Navigationseintrag lässt die Suite fehlschlagen.

## Anzahl-Anzeigen

Eingang und Beobachtung tragen eine Anzahl. Sie folgt in jeder Anordnung dem dort üblichen
Muster – nicht überall demselben:

| Breite | Anordnung | Anzeige |
| --- | --- | --- |
| < 720 px | untere Leiste, Kacheln | Abzeichen an der Ecke des Symbols, mit Zahl (ab 100: `99+`) |
| 720–1079 px | schmale Symbolleiste, Kacheln | Abzeichen an der Ecke des Symbols |
| ≥ 1080 px | Seitenleiste, Zeilen mit Text | Pille am Ende der Zeile, auf der Zeilenmitte |

Eine Zahl in einer Textzeile gehört ans Zeilenende; auf einer Kachel gehört sie an die Ecke.
Beides ist Konvention, und beides ist hier umgesetzt.

**Was hier einmal schiefging.** Der Block für breite Fenster stellte den Eintrag von der
Kachel auf eine Zeile um, ließ die Zahl aber absolut in der Ecke stehen – sie hing elf Pixel
über der Zeilenmitte. Erschwerend hielt ein `margin: 0 !important` in der Kachel-Regel jede
spätere Ausrichtung auf; das `!important` verteidigte gegen einen Inline-Stil im Markup, der
seinerseits nur existierte, weil die Ausrichtung nicht im Stylesheet stand. Beides ist weg,
die Ausrichtung steht vollständig im Stylesheet.

Auf dem Handy stand vorher ein Punkt ohne Zahl. Er sagte „irgendetwas ist offen", obwohl die
Anzahl bekannt war.

`apps/web/e2e/counters.spec.ts` misst je Breite die Position gegen die Zeile beziehungsweise
die Kachel – einschließlich einer dreistelligen Anzahl, damit die Kachel nicht auseinanderläuft.
