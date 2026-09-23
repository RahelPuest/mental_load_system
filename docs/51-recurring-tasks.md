# 51 – Regelmäßige Aufgaben und Aufgaben, die anderen folgen

Eine Regel konnte bis hierher nur eines: auf eine Angabe sehen und sich melden. Im Untertitel
des Einrichtungsbogens stand das sogar ausdrücklich – „Das System beobachtet und meldet sich –
es legt keine Aufgabe an."

Damit fehlte das Naheliegendste an einem Haushaltssystem: **Müll kommt donnerstags. Wäsche
alle drei Tage. Die Miete am Ersten.** Und: **Wäsche aufhängen, einen Tag nachdem sie in der
Maschine war.**

## Was schon da war und nie benutzt wurde

Drei Dinge lagen im Modell bereit und waren nie verdrahtet:

| | Zustand vorher |
| --- | --- |
| `defaultResponse: 'create_task'` | wurde beim Anlegen gespeichert und beim Auswerten **nie gelesen** – jede Regel erzeugte einen Hinweis |
| Regeltyp `schedule` | vorhanden, aber nur mit einem einfachen Intervall und von der Oberfläche aus nicht erreichbar |
| Regeltyp `dependency_recheck` | stand in der Liste der Regeltypen und war als `notImplemented` eingetragen |

## Drei Arten von Regel

Die erste Frage im Bogen ist jetzt, welche Art es sein soll – die drei lassen sich nicht
ineinander übersetzen:

| Art | Was sie tut | Ergebnis |
| --- | --- | --- |
| **Auf eine Angabe achten** | sieht auf eine Angabe und meldet sich, wenn etwas auffällt | ein Hinweis |
| **Regelmäßig** | etwas ist in einem Rhythmus wieder dran | eine **Aufgabe** |
| **Folgt auf eine andere** | etwas ist fällig, nachdem etwas anderes erledigt wurde | eine **Aufgabe** |

## Die Rhythmen

Die Auswahl folgt dem Muster, das man aus Kalendern kennt: **erst das Datum, dann Vorschläge,
die sich daraus ableiten.** Wer den 12.03.2026 wählt – einen Donnerstag und den zweiten
Donnerstag des Monats – bekommt:

```
Täglich
Wöchentlich am Donnerstag
An jedem Werktag (Mo–Fr)
Monatlich am zweiten Donnerstag
Monatlich am 12.
Jährlich am 12. März
Benutzerdefiniert …
```

„Monatlich am zweiten Donnerstag" steht nur da, wenn der gewählte Tag auch einer ist – beim
30. eines Monats fehlt die Zeile, weil es keinen fünften Wochentag in jedem Monat gibt.

Gespeichert wird eines dieser Muster:

```
{ startsOn: '2026-03-12', every: 'P3D' }              alle drei Tage – ab dem letzten Mal
{ startsOn: '2026-03-12', weekdays: [1, 4] }          montags und donnerstags
{ startsOn: '2026-03-12', monthday: 15 }              am 15. jedes Monats
{ startsOn: '2026-03-12', nthWeekday: { nth: 2, weekday: 4 } }   am zweiten Donnerstag
{ startsOn: '2026-03-12', every: 'P1Y' }              jedes Jahr
```

Dazu ein Ende, wahlweise: `until: '2026-12-31'` oder `count: 6` – oder keines.

Der Unterschied zwischen der ersten und den beiden anderen ist der wichtige, und er steht als
Hinweis im Formular: **„Alle drei Tage" verschiebt sich mit, wenn man einen Termin verpasst;
„donnerstags" nicht.** Wäsche, die zwei Tage liegen bleibt, ist nicht plötzlich zweimal fällig
– der Müll kommt trotzdem donnerstags.

Kürzere Monate enden am letzten Tag: Aus dem 31. wird der 30., 29. oder 28. – **nicht** der 1.
des Folgemonats. Auch das steht im Formular, statt es im Februar zu überraschen.

## Das Datum gehört zur Aufgabe

`startsOn` ist der erste Termin. Ohne ihn hing die Reihe am Zeitpunkt der letzten Auswertung –
eine Aufgabe „am 15." wäre dann am 15. fällig gewesen oder am 16., je nachdem wann der
Hintergrundjob lief.

Und die erzeugte Aufgabe trägt **das Datum ihres Termins** als Fälligkeit, nicht „jetzt". Das
Signal führt den Termin mit (`evidence.dueOn`), der Dienst schreibt ihn in `dueAt`.

## Ein Satz statt einer Konfiguration – an beiden Enden derselbe

Die Vorschau im Formular und die Begründung, die der Server später in die Aufgabe schreibt,
kommen aus **derselben Funktion**. `describeRecurrence` steht deshalb in `@thealotta/contracts`,
nicht in der Domänenschicht: Zwei Formulierungen desselben Musters würden auseinanderlaufen,
und niemand würde es merken. Die Datumsarithmetik bleibt in `@thealotta/domain` – die gehört nicht
ins Vokabular.

Rhythmus und Ende sind getrennt abrufbar, weil sie im Satz nicht nebeneinander stehen:

> „Elternabend" ist **jedes Jahr** dran, **bis zum 31.12.2026**.

Nicht: *„ist jedes Jahr, bis zum 31.12.2026 dran"* – so stand es im ersten Anlauf, und die
Prüfung im Browser hat es gezeigt.

## „N Tage nach einer anderen Aufgabe"

Der Anker ist eine **Erledigung**, kein Kalendertag: Erst wenn die vorangehende Aufgabe
abgehakt ist, beginnt die Frist zu laufen. Vorher passiert nichts – eine Regel, die auf etwas
wartet, das nie geschieht, meldet sich zu Recht nie.

Die Kette hängt an `originRef`: Eine Aufgabe aus einer Regel trägt `monitor:<id>`, und die
Folgeregel sucht die letzte abgeschlossene Aufgabe mit dieser Kennung. Der Eimer ist der
Zeitpunkt der Erledigung – dadurch feuert **jede Erledigung genau einmal**, auch wenn der
Auswerter zwischendurch mehrfach läuft.

Zur Wahl stehen nur Regeln, die selbst eine Aufgabe anlegen. Gibt es keine, sagt der Bogen das
als Satz, statt eine leere Auswahl anzubieten.

## Aus einer Regel wird eine Aufgabe

`defaultResponse: 'create_task'` wird jetzt ausgewertet. Die Aufgabe entsteht mit
`origin: 'system_rule'`, der Begründung aus dem Signal (`rationale`) und der Kennung ihrer
Regel.

**Solange eine Aufgabe aus derselben Regel offen ist, entsteht keine zweite.** Wer die Wäsche
seit drei Wochen nicht gemacht hat, braucht keine drei Wäsche-Aufgaben, sondern eine, die seit
drei Wochen offen ist.

## Regeln wieder loswerden

Eine Regel ließ sich anlegen und danach nie wieder entfernen – bei einer, die jetzt Aufgaben
erzeugt, ist das eine Falle. Es gibt daher zwei Wege:

- **Abschalten** ist der übliche: Die Regel bleibt samt ihrer Vergangenheit stehen und meldet
  sich nur nicht mehr. Ein Hinweis, der noch auf der Liste steht, bleibt damit erklärbar.
- **Löschen** geht nur, solange die Regel nie etwas bewirkt hat. Sonst hingen Signale und
  Hinweise an einer Regel, die es nicht mehr gibt – die Meldung nennt dann den Ausweg.

In der Oberfläche erscheint „Löschen" nur bei Regeln, die noch nie gelaufen sind. Der Server
prüft genauer (er sieht auf die Signale); die strengere Bedingung im Client verhindert einen
Knopf, der abgelehnt würde.

## Wo man es einrichtet

Zwei Orte, und beide braucht es:

| Ort | Weg | Warum dort |
| --- | --- | --- |
| **Beobachtung** (Hauptnavigation) | „Regel einrichten" oben rechts | Hier stehen alle Regeln des Haushalts – hier sucht man auch danach |
| **Seite eines Bereichs** | Abschnitt „Worauf wir achten" → „Regel einrichten" | Wenn man ohnehin schon im Bereich ist |

Es ist derselbe Bogen. Auf der Beobachtungsseite steht der Bereich noch nicht fest, also ist
„Für welchen Bereich?" dort die erste Frage; im Bereich entfällt sie.

**Die Beobachtungsseite listete Regeln lange nur auf.** Wer eine regelmäßige Aufgabe einrichten
wollte, musste wissen, dass das auf der Seite eines Bereichs geht – auf einer Seite, die
„Beobachtung" heißt, ist das nicht zu erraten (§31).

## Eine Regel ändern

Bis hierher ließ sich eine eingerichtete Regel nicht mehr anfassen. Die Schnittstelle nahm
genau ein Feld entgegen – `enabled` –, und gelöscht werden darf eine Regel nur, solange sie
nie ausgewertet wurde. **Ab dem ersten Lauf war sie eingefroren.** Wer den Rhythmus falsch
gewählt hatte, konnte sie bloß stilllegen und daneben eine zweite anlegen; in der Liste
standen dann zwei fast gleiche Einträge, von denen einer nichts mehr tat.

Das ist mehr als eine fehlende Taste. Eine Regel ist eine Vermutung darüber, wie oft etwas
drankommt – und die stimmt beim ersten Versuch selten. Ein System, in dem man die Vermutung
nicht nachziehen kann, zwingt dazu, sie vorher richtig zu treffen.

**Derselbe Bogen macht jetzt beides.** Nicht zwei Formulare für dieselbe Sache: Die würden
früher oder später auseinanderlaufen, und jede Verbesserung wäre zweimal zu machen.

| Was | Wie |
| --- | --- |
| Weg dorthin | „Ändern" an jeder Regelzeile – neben „Jetzt prüfen" und dem Schalter |
| Was mitgeht | Name, Art, Rhythmus, gemeinte Angabe, was die Regel auslöst |
| Was nicht mitgeht | Der Bereich. Eine Regel gehört zu ihrem Bereich; sie umzuhängen wäre eine andere Regel |

### Die eigentliche Arbeit: zurückübersetzen

Gespeichert ist ein Muster – `{ weekdays: [4], startsOn: '2026-03-12' }`. Angezeigt wird eine
Auswahl – *„Wöchentlich am Donnerstag"*. Beim Öffnen muss der Bogen den Weg rückwärts gehen,
sonst stünde ein leeres Formular da und wer nur den Namen ändern will, müsste den Rhythmus neu
zusammensuchen. Fünf Werktage werden wieder zu „An jedem Werktag", `every: 'P6W'` wieder zu
„Benutzerdefiniert · alle 6 Wochen", `until` und `count` wieder zum gewählten Ende.

### Was der Server dabei tut

| | |
| --- | --- |
| Rhythmus geändert | `nextEvaluationAt` wird auf **jetzt** gesetzt, Fehlerzähler zurück auf null – der alte Termin gehörte zum alten Muster |
| Angabe geändert | Sie muss aus **demselben Bereich** stammen, sonst 422 und **nichts** ist halb geändert |
| Immer | Ein Eintrag `monitor.updated` in der Chronik, mit Vorher und Nachher |

Was die Regel bisher getan hat, bleibt unangetastet. Bestehende Hinweise werden nicht neu
bewertet und keine Aufgabe verschwindet – **die Vergangenheit wird nicht umgedeutet**, nur
das Weitere folgt der neuen Fassung.

## Was geprüft wird

| Datei | Was sie festhält |
| --- | --- |
| `packages/domain/test/recurrence.spec.ts` | 18 Fälle Datumsarithmetik: der 31. in kurzen Monaten, der 29. Februar im Schaltjahr, der Sprung über den Jahreswechsel, „nicht noch einmal heute" |
| `packages/domain/test/monitors-schedule.spec.ts` | Die Auswerter: Rhythmen, Unterdrückung, und dass jede Erledigung genau einmal feuert |
| `apps/api/test/recurring-tasks.spec.ts` | Die ganze Kette über HTTP: Regel → Aufgabe, keine zweite bei offener erster, Frist ab Erledigung, abschalten und löschen |
| `apps/api/test/regel-bearbeiten.spec.ts` | Das Ändern: Rhythmuswechsel, mehrere Felder auf einmal, ändern und abschalten zugleich, fremde Angabe abgelehnt, die Vergangenheit unverändert |
| `apps/web/e2e/rules.spec.ts` | Der Bogen: drei Arten, Wochentagsauswahl, die Vorschau im Klartext, abschalten, löschen – und dass der Bogen gefüllt aufgeht und danach wieder leer |

Die Vorschau ist dabei der Prüfstein: Wer die Regel liest, soll sie verstehen, ohne zu wissen,
was `{ weekdays: [4] }` bedeutet. Der Test vergleicht deshalb den Satz, nicht die
Konfiguration – *„Müll rausbringen" ist donnerstags dran.*
