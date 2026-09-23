# 62 – Eine Aufgabe wieder loswerden

Auf der Seite eines Bereichs stand eine Aufgabe zum Lesen da und zu sonst nichts. Kein Haken,
kein Weg sie zu entfernen – nur, wenn eine Einkaufsliste verbunden war, ein Knopf „an Bring".

## Wie eng die Lücke war

Der einzige Ort, an dem eine Aufgabe zu erledigen oder zu verwerfen war, ist die
Jetzt-Ansicht. Die zeigt aber nicht alles: Sie ist auf die angegebene Kapazität gedeckelt,
im Regelfall **drei Einträge**. Was darunter lag, ließ sich nirgends abhaken und nirgends
loswerden – auch nicht auf der Seite des Bereichs, in dem es steht, und auch nicht im Plan.

| Ort | erledigen | loswerden |
| --- | --- | --- |
| Jetzt | ja | ja („Nicht mehr nötig") |
| Bereich → Läuft gerade | **nein** | **nein** |
| Der Plan | nein | nein |
| Vorgang | ja (als Schritt) | nein |

## Zwei Wege statt einem

`drop` – „Nicht mehr nötig" – verlangt einen Grund und hinterlässt eine Spur. Das ist richtig
für eine Aufgabe, die einmal etwas bedeutet hat: Später erklärt der Satz, warum nichts mehr
passiert ist (§36, §4).

Für einen Vertipper ist es Zeremonie. Wer zwei Sekunden nach dem Anlegen merkt, dass er sich
verschrieben hat, soll nicht begründen müssen, warum das Verschriebene nicht mehr nötig ist.

Deshalb dieselbe enge Bedingung wie bei Regeln: **löschen, solange nichts daran hängt.**

| Bedingung | warum |
| --- | --- |
| Zustand noch `draft` oder `ready` | Ist sie begonnen, erledigt, verworfen, aufgeschoben oder wartend, wurde daran gearbeitet |
| Gehört zu keinem Vorgang | Ein Schritt einzeln zu löschen risse eine Lücke in eine Reihenfolge |
| Von einem Menschen angelegt (`origin: human`) | Was eine Regel erzeugt hat, käme beim nächsten Lauf wieder – dort gehört der Schalter hin, nicht hier |
| Keine abhängige Aufgabe | Eine andere Aufgabe wartet auf sie |
| Nie darauf gewartet | Der Wartezustand ist bereits Geschichte |

Trifft eine davon nicht zu, antwortet der Server mit **409** und einem Satz, der den Weg
nennt – nicht nur das Nein:

> „Angefangen" ist nicht mehr unberührt – daran wurde schon gearbeitet. Nimm sie stattdessen
> über „Nicht mehr nötig" aus der Übersicht – dann bleibt nachvollziehbar, was daraus wurde.

**Gelöscht heißt nicht spurlos.** Vor dem Löschen wird `task.deleted` in die Chronik
geschrieben, mit Titel und Bereich – sonst stünde dort später eine Lücke, die niemand
erklären kann (§4).

## Ein Knopf, zwei Ausgänge

In der Oberfläche gibt es dafür **einen** Knopf: „Entfernen". Er versucht zuerst das stille
Löschen. Geht es, ist die Sache mit einem Klick erledigt. Geht es nicht, öffnet sich der Bogen
„Nicht mehr nötig" – und in seiner Beschreibung steht **der Satz des Servers**, nicht eine
allgemeine Fehlermeldung. Wer „hat nicht geklappt" liest, sucht den Fehler bei sich; wer
liest, warum es nicht ging und was stattdessen geht, macht weiter.

Es ist derselbe Bogen wie in der Jetzt-Ansicht, nur nicht mehr an sie gebunden
(`DropSheet`). Zwei Bögen für dieselbe Sache würden früher oder später auseinanderlaufen.

Daneben steht der Haken: **erledigen geht jetzt auch hier**, mit „Rückgängig" im Toast statt
einer Rückfrage (§57).

## Was geprüft wird

| Datei | Was sie festhält |
| --- | --- |
| `apps/api/test/aufgabe-loeschen.spec.ts` | Die unberührte Aufgabe verschwindet ganz; der Verlauf behält ihren Titel; begonnen, erledigt, Vorgangsschritt und regelerzeugt werden mit 409 und einem Weg abgewiesen; nichts ist dabei halb passiert; verwerfen bleibt möglich, wo löschen es nicht ist |
| `apps/web/e2e/aufgabe-weg.spec.ts` | Ein Klick für den Vertipper – und nach dem Neuladen ist sie immer noch weg; der begonnene Fall führt in den Bogen, mit dem Satz des Servers darin; abhaken und zurücknehmen |

Die Gegenprobe im API-Test ist die wichtigere: Nach einem abgelehnten Löschversuch steht die
Aufgabe **unverändert** da. Ein Löschen, das die Hälfte tut und dann abbricht, wäre schlimmer
als eines, das gar nicht geht.
