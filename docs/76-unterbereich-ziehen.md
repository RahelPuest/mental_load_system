# 76 – Einen Bereich auf einen anderen ziehen

Gemeldet als: **„Bereiche lassen sich nicht so drag-and-droppen, dass sie zu Unterbereichen
anderer Bereiche werden."**

Das Verschieben konnte das – nur über eine Bewegung, die man kennen muss.

## Wie es vorher ging

Beim Ziehen sagte die **senkrechte** Bewegung, *zwischen welche* Zeilen etwas soll, und die
**waagerechte**, *auf welcher Ebene*. Um „Schuhe" zum Unterbereich von „Kleidung" zu machen,
musste man also:

1. „Schuhe" direkt unter „Kleidung" schieben, und
2. dort um eine Einrückung nach rechts ziehen.

Beides zusammen, und nur für die Zeile **unmittelbar darüber** – tiefer als eine Stufe unter
den oberen Nachbarn geht nicht, sonst hinge die Zeile in der Luft.

Wer stattdessen einen Bereich **auf** einen anderen zog, sah nichts passieren. Das ist die
Geste, die alle kennen, und sie war die einzige, die nichts tat.

## Zwei Gesten statt einer

Jede Zeile zerfällt jetzt in Drittel:

```
┌──────────────────────────┐
│ oberes Drittel  → davor  │   ← Reihenfolge, wie bisher
├──────────────────────────┤
│ Mitte           → hinein │   ← neu: wird sein Unterbereich
├──────────────────────────┤
│ unteres Drittel → danach │   ← Reihenfolge, wie bisher
└──────────────────────────┘
```

Ein halb so breites Band wäre am Finger nicht sicher zu treffen; ein breiteres ginge auf Kosten
des Sortierens, und das ist die häufigere Handlung. Die waagerechte Bewegung bleibt, wo sie
war: Sie verfeinert die Ebene beim Einsortieren zwischen zwei Zeilen.

**Hinein heißt: ans Ende.** Wer etwas in einen Bereich zieht, fügt hinzu; die vorhandenen
Unterbereiche waren vorher da und bleiben oben.

## Die Anzeige musste mitwachsen

Bisher zeigte eine **Linie** an, wohin die Zeile fällt, eingerückt auf die Zielebene. Für das
Hineinziehen ist das die falsche Aussage: „zwischen diesen beiden" und „wird Unterbereich von
diesem" sind zwei verschiedene Dinge, und eine Linie am oberen Rand einer Zeile sieht aus wie
das erste.

Das Ziel des Hineinziehens bekommt deshalb einen **Rahmen um die ganze Zeile**, in der
Akzentfarbe, mit einem `↳` dahinter. Der `DropPlan` trägt dafür ein eigenes Feld (`intoId`) –
die Oberfläche soll nicht raten müssen, welche der beiden Aussagen gerade gilt.

## Was geprüft wird

Fünf neue Prüfungen in `apps/web/test/tree-drag.spec.ts` (die Rechnung steht getrennt von
Zeigergesten, siehe Kopf der Datei): dass die Mitte einer Zeile zum Unterbereich führt, dass
das **ohne** jede waagerechte Bewegung geht, dass es hinter den vorhandenen Unterbereichen
landet, dass der eigene Teilbaum ausgeschlossen bleibt – und dass an den Rändern derselben
Zeile weiterhin einsortiert wird.

Die zwölf vorhandenen Prüfungen blieben inhaltlich gleich; ihre Hilfsfunktion zeigte auf
`Mitte − 1 px`, also genau dorthin, wo jetzt das Hineinziehen liegt. Sie zielen jetzt auf das
obere bzw. untere Drittel.

Dazu eine im Browser (`apps/web/e2e/unterbereich-ziehen.spec.ts`), mit echtem Zeiger: Zwei
Wegwerfbereiche anlegen, den einen auf den anderen ziehen, prüfen dass die Zielzeile **während**
des Ziehens hervorgehoben ist, dass die Einrückung nach dem Loslassen stimmt und dass der Server
denselben Elternbereich kennt – und im `finally` aufräumen.
