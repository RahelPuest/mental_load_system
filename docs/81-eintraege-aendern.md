# 81 – Bestehende Einträge ändern

Gemeldet als: „Ich kann immer noch nicht die Einträge in *Was wir wissen*, *Regeln* oder
*Läuft gerade* editieren."

Das stimmte. Auf der Bereichsseite ließ sich alles **anlegen** und über seinen Lebenszyklus
bewegen – abhaken, beantworten, verwerfen –, aber fast nichts **berichtigen**.

## 1 · Der Befund

Gezählt im laufenden Browser, nicht im Quelltext geschätzt:

| Abschnitt | Eintragsart | vorher | jetzt |
| --- | --- | --- | --- |
| Was wir wissen | Angaben | „Ändern" ✓ | unverändert |
| | Notizen | – | „Ändern" |
| | Fragen | nur „Beantworten" | „Ändern" + „Beantworten" |
| | Entscheidungen | **gar keine Aktion** | „Ändern" |
| Regeln | Regeln | „Ändern" ✓ | unverändert |
| Läuft gerade | Aufgaben | abhaken, loswerden – nicht ändern | „Ändern" |
| | Vorgänge | – | „Ändern" |

Dahinter lag keine Oberflächenlücke, sondern eine im Server: Für Notizen, Fragen,
Entscheidungen, Aufgabendetails und Vorgänge gab es **keine einzige Änderungsroute**. Nur
Anlegen und Zustandsübergänge.

Dass die Aufgabendetails unveränderlich waren, wog seit [docs/80](80-planung-tag-woche-monat.md)
schwerer als vorher: Die Schätzung entscheidet dort, was in einen Tag passt. Eine Schätzung,
die sich als falsch erweist und nicht korrigierbar ist, verzerrt jeden Plan danach.

## 2 · Was gebaut wurde

Fünf Routen, alle nach demselben Muster wie `updateDefinition` (docs/77):

```
PATCH /households/:id/tasks/:taskId          Titel, Schätzung, Anstrengung, Frist
PATCH /households/:id/processes/:processId   Titel, Ziel
PATCH /households/:id/knowledge/:knowledgeId Titel, Text, Art
PATCH /households/:id/questions/:questionId  Wortlaut
PATCH /households/:id/decisions/:decisionId  Titel, Text, Art, Verbindlichkeit
```

**Alles optional, `undefined` heißt unverändert.** Ein Formular, das nur den Titel ändert,
soll die Schätzung nicht mitschicken müssen. Für „leeren" steht ausdrücklich `null` bereit –
bei Frist, Schätzung und Ziel.

In der Oberfläche ein Bogen für fünf Arten statt fünf Bögen: Die Felder unterscheiden sich,
der Ablauf nicht (öffnen, ändern, speichern, neu laden). Fünf fast gleiche Komponenten wären
fünf Stellen, an denen dieselbe Regel gepflegt werden müsste.

## 3 · Drei Entscheidungen, die nicht offensichtlich sind

**Keine neue Berechtigung zum Ändern.** `updateTask` verlangt `task:create`, `updateProcess`
verlangt `process:manage` – dieselben Rechte wie zum Anlegen. Das folgt `updateDefinition`,
das `state:define` verlangt. Wer Arbeit in einem Bereich schaffen darf, darf ihre Beschreibung
auch berichtigen; eine Stufe dazwischen wäre eine Unterscheidung ohne Unterschied, und jede
neue Berechtigung muss in der Matrix gepflegt werden ([docs/04](04-permission-model.md)).

**Zustand, Zuweisung, Bereich und Sichtbarkeit fehlen in den Formularen.** Dafür gibt es
eigene Wege mit eigenen Regeln – Zustandsmaschine, INV-012, Umhängen (docs/72). Berichtigen
ist nicht umdisponieren. Und eine Sensitivity im selben Formular wie ein Tippfehler wäre eine
Rechteänderung nebenbei.

**Wer ändert, bestätigt.** INV-004 unterscheidet bestätigtes von abgeleitetem Wissen. Eine
Notiz, die ein Mensch gerade durchgesehen und angefasst hat, ist bestätigt – sie weiter als
„vermutet" zu führen, wäre schlicht falsch. `updateKnowledge` setzt deshalb `confirmedBy`
und `confirmedAt`, wenn ein Mensch speichert.

## 4 · Was dabei aufgefallen ist

**`listOpenTasks` lieferte `mentalEnergy` nicht.** Ein Formular, das den aktuellen Wert nicht
kennt, kann ihn nur überschreiben, nicht zeigen. Das Feld ist jetzt Teil der Bereichsdetails.

**„Ändern" allein ist kein Name.** Zehn Knöpfe mit demselben Wort sind für jemanden, der die
Seite hört statt sieht, nicht unterscheidbar. Aufgefallen ist es, weil
`getByRole('button', { name: 'Ändern' })` in den Angabentests (docs/77) plötzlich mehrere
Treffer fand – fünf Tests fielen. Sichtbar bleibt das kurze Wort, vorgelesen wird
„‚Fundort' ändern".

**Eine verschobene Frist macht die alte Überfälligkeit hinfällig.** `overdue_since` gehört zur
Frist, nicht zur Aufgabe. Ohne das Zurücksetzen stünde eine Aufgabe mit neuem Termin und
altem „seit 12 Tagen überfällig" da – und die Planung zöge sie aus einem Grund vor, den es
nicht mehr gibt.

## 5 · Was geprüft ist

`apps/api/test/eintraege-aendern.spec.ts` (8 Tests):

| Zusicherung | Warum sie zählt |
| --- | --- |
| Titel, Schätzung, Anstrengung und Frist lassen sich berichtigen | die gemeldete Lücke |
| Was nicht mitgeschickt wird, bleibt stehen | `undefined` heißt unverändert, nicht „leeren" |
| Eine Frist lässt sich ausdrücklich leeren | `null` heißt leeren – der Unterschied muss beide Richtungen können |
| Eine geänderte Notiz gilt als bestätigt | INV-004 |
| Ein fremder Haushalt kommt nicht heran (404) | Mandantentrennung gilt auch für neue Routen |

`apps/web/test/eintraege-aendern.spec.tsx` (3 Tests): In jedem Abschnitt trägt **jeder**
Eintrag einen Weg zum Berichtigen, und die Knöpfe nennen ihren Eintrag und unterscheiden sich
voneinander.

Zusätzlich im echten Browser durchgestochen: ändern, speichern, neu laden – die Änderung steht.
