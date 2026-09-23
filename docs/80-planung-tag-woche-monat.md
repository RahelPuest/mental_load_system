# 80 – Planung für Tag, Woche und Monat

Eine Liste dessen, was zu tun ist, mit wählbarer Reihenfolge. Die Reihenfolgen stammen aus
zwei Quellen: der Ablaufplanung (Betriebssysteme, Fertigung) und der klinischen Psychologie.

Dieses Dokument hält fest, **wie gut jede davon belegt ist** – im Maßstab von
[docs/60](60-evidenz-audit.md), wo „weniger Auswahl ist besser" als praktisch unbelegt
entlarvt wurde. Ein Werkzeug gegen mentale Last darf seine eigenen Versprechen nicht
schlechter prüfen als die der anderen.

## 1 · Der Widerspruch, der zuerst geklärt werden musste

`now.service.ts` sagt über die Grenze von drei Einträgen wörtlich: „damit daraus keine
Todo-Liste wird". `capacity.ts` nennt sie „eine Produktwette, keine wissenschaftliche Regel".
Und jetzt gibt es eine Todo-Liste.

Das ist eine Produktentscheidung, keine Widerlegung. Aufgelöst ist der Widerspruch so:

- **Ungefragt erscheint keine Liste.** Ohne Planparameter und ohne gemerkte Vorgabe antwortet
  `/now` byte-gleich wie vorher. „Jetzt" behält seinen Charakter für alle, die ihn wollen.
- **Wer die Liste anfordert, bekommt sie an der Stelle der Abschnitte**, nicht zusätzlich.
  Beides gleichzeitig zeigte jede Sache zweimal – genau der teuerste Posten des
  Kognitionsaudits ([docs/48](48-cognitive-load.md), Gedächtnislast auf `familie`).
- **Die Wahl gilt für den Betrachter**, nicht für den Haushalt (wie die Farben in 0007).

Gewechselt wird über eine Reiterleiste unter der Kapazitätszeile: **Jetzt · Heute · Woche ·
Monat**. `Jetzt` ist der erste Reiter und die Voreinstellung – wer nie auf einen der anderen
klickt, sieht die Seite, die es vorher gab. Keine ARIA-Reiter, sondern eine `radiogroup`:
Deren Tastaturverhalten verspricht nicht mehr, als eine Leiste ohne eigene Bereiche einlöst.

Alles Weitere (Reihenfolge, Alterung, Puffer) liegt hinter „Wie sortiert wird" und erscheint
nur, wenn eine Liste gewählt ist. Eine Einstellung ohne Gegenstand ist eine Frage ohne Anlass.

## 2 · Die sechs Reihenfolgen

| Strategie | Herkunft | Was sie beweisbar leistet | Psychologische Begründung | Stärke |
| --- | --- | --- | --- | --- |
| **Frist zuerst** | EDF, Liu & Layland 1973 | Optimal auf einem Prozessor: Existiert ein Plan, der alle Fristen hält, findet EDF ihn | – | **stark**, aber nur unter Annahme |
| **Kurzes zuerst** | SJF/SPT, 1‖ΣCⱼ | Minimiert beweisbar die mittlere Fertigstellungs- und Wartezeit | Graded Task Assignment der Verhaltensaktivierung | Verfahren **stark**, Baustein **nicht isoliert** |
| **Eine Sache** | WIP-Grenze 1, Little's Law | Weniger gleichzeitige Arbeit senkt die Durchlaufzeit | Kosten des Aufgabenwechsels (Monsell 2003) | Wechselkosten **robust**, Übertrag **ungeprüft** |
| **Nach Kapazität füllen** | Bin Packing / Backfilling | Füllt ein Budget, ohne es zu überschreiten | Aufwand-Nutzen-Abwägung bei Anhedonie (EEfRT) | **schwach bis mittel** (Labor, Replikation gemischt) |
| **Nach Bedeutung** | – | – | Verhaltensaktivierung: Auswahl nach Wert statt Dringlichkeit | Verfahren **stark**, diese Umsetzung **nicht geprüft** |
| **Nach Anlass** | – | – | Vorsatzbildung „wenn X, dann Y" | **stark** (94 Studien, *d* = 0,65) |

### Was „stark, aber nur unter Annahme" bei EDF bedeutet

EDFs Optimalität setzt voraus, dass die Aufgabenmenge überhaupt in die Zeit passt. Ist sie
überlastet, ist EDF eine der **schlechtesten** Reihenfolgen: Es arbeitet an der jeweils
nächsten Frist, verliert sie, wechselt zur nächsten und reißt so eine nach der anderen.

Überlast ist aber genau die Lage, in der Menschen mit Depression oder ADHS ein solches
Werkzeug aufmachen. Deshalb sagt die Anwendung diesen Satz selbst, direkt über der Liste, und
er ist als Test festgehalten: *„Bei mehr Arbeit als Zeit verliert diese Reihenfolge ihre
Stärke: Sie hält dann keine Frist, sondern reißt sie der Reihe nach."* Das ist kein
Kleingedrucktes, sondern kalibriertes Vertrauen ([docs/60](60-evidenz-audit.md) E6).

### Was die Verhaltensaktivierung hier trägt und was nicht

Verhaltensaktivierung ist eines der am besten belegten Verfahren gegen Depression: Die
COBRA-Studie (*Lancet* 2016, n = 440) fand sie der kognitiven Verhaltenstherapie nicht
unterlegen, bei geringeren Kosten. Ihr Kern ist Aktivitätsplanung nach **Wert**, nicht nach
Dringlichkeit, zusammen mit **gestuften Aufgaben** – klein anfangen, damit etwas gelingt.

Beides ist hier abgebildet: „Nach Bedeutung" und „Kurzes zuerst". Was **nicht** gilt: dass
eine Anwendung damit dasselbe leistet wie das Verfahren. Geprüft ist es als Therapie mit
Begleitung. Eine Liste, die nach Bedeutung sortiert, ist eine Anlehnung, keine Intervention –
und sie behauptet in der Oberfläche auch nichts anderes.

## 3 · Die zwei Zusätze

Getrennt von den Reihenfolgen, weil sie mit jeder kombinierbar sind – und weil der erste eine
Zusicherung ist, keine Vorliebe.

**Alterung** (voreingestellt an). Aus der Ablaufplanung: Multilevel-Feedback-Queues heben
wartende Prozesse an, damit keiner verhungert. Ohne diesen Zusatz gewinnt „Kurzes zuerst"
immer, und die große unangenehme Sache erscheint nie. Wer sie seit Wochen umgeht, bekommt sie
nach 21 Tagen einmal nach oben – **höchstens eine je Abschnitt**, denn ein Plan, der nur aus
Altlasten besteht, wird nicht angefasst.

**Puffer** (voreingestellt an). Verplant werden 69,3 % des Budgets. Die Zahl ist nicht
gefühlt: Es ist die Auslastungsschranke der ratenmonotonen Planung, n·(2^(1/n)−1) → ln 2
(Liu & Layland 1973). Der Übertrag von Prozessorlast auf Menschentage ist eine Analogie und
kein Beweis. Was dagegen gut belegt ist: der **Planungsfehlschluss** – Menschen unterschätzen
den eigenen Aufwand systematisch (Buehler, Griffin & Ross 1994). Eine begründete Zahl ist mehr
als „plane 80 % ein".

## 4 · Wo eine Angabe fehlt und was stattdessen gerechnet wird

„Nach Bedeutung" bräuchte eine persönliche Wertangabe je Bereich. Die gibt es noch nicht.
Solange sie fehlt, rechnet die Strategie mit **Wichtigkeit des Bereichs plus eigener
Verantwortung** – und sagt das am Eintrag: *„Behelf: gewichtet nach Wichtigkeit des Bereichs
und eigener Verantwortung – keine eigene Bedeutungsangabe vorhanden."*

Das ist kein Ersatz. Wichtigkeit ist eine Aussage des Haushalts über Folgen, Bedeutung eine
Aussage der Person über sich. Sie fallen oft auseinander, und die Verhaltensaktivierung meint
die zweite. Die Tabelle dafür ist vorbereitet (`meaningByDomain` als Eingabe der
Domänenschicht), die Oberfläche dazu fehlt.

Ebenso fehlt eine Minutenzahl mit Begründung: `dayBudgetMinutes` ordnet jeder Kapazitätsstufe
eine zu (120 / 60 / 20 / 15). Dafür gibt es keine Studie. Es ist eine Produktwette, über
`THEALOTTA_DAY_BUDGET` verstellbar, damit sie sich messen lässt – wie `THEALOTTA_NOW_LIMIT`.

## 5 · Wenn–dann: die Lücke aus docs/60 E1

docs/60 nannte als stärksten Einzelbefund eine Lücke im Objektmodell: Alle neun Regelarten
knüpfen an Zeit oder Zustand, keine an eine **Situation**. Für ereignisgebundene Vorsätze
liegt die stärkste Evidenz des Feldes vor (Gollwitzer & Sheeran 2006, 94 Studien, *d* = 0,65).

Geschlossen ist sie **nicht** als zehnte Monitor-Regelart. Das war der erste Entwurf und er
war falsch: Eine Monitor-Regel muss der Worker auswerten können, und ein Anlass („beim
nächsten Einkauf") tritt nicht messbar ein – ein Mensch bestätigt ihn. Eine Regelart, die nie
feuern kann, ist eine Behauptung im Modell, die niemand einlöst.

Der Anlass ist deshalb ein eigenes Objekt: `situational_cues` je Haushalt, `tasks.cue_id` als
nullbare Spalte (Migration 0013, additiv nach ADR-0014). Er wirkt in der Planung, nicht in der
Überwachung.

**Und er ist nicht die Umstandsauswahl aus Migration 0006.** Die wurde entfernt, weil sie
filterte: „im Supermarkt", „Telefonat möglich" – wer seinen Zustand nicht meldete, bekam
falsche Ergebnisse, und niemand meldet das laufend. Der Unterschied ist grundlegend:

| | Umstandsauswahl (0006, entfernt) | Anlass (0013) |
| --- | --- | --- |
| Wirkung | **filtert** – ohne Selbstauskunft falsch | **gruppiert** – ohne Angabe fehlt nichts |
| Pflegeaufwand | laufende Meldung des Zustands | einmal beim Fassen des Vorsatzes |
| Woher der Nutzen kommt | die Anwendung errät die Lage | der Vorsatz ist gefasst worden |

Anlässe gehören dem Haushalt, nicht der Person: „beim nächsten Einkauf" ist für alle dasselbe,
und wer einkauft, kann die Sachen der anderen mitnehmen. Genau dafür ist es da.

## 6 · Was ausdrücklich nicht gebaut wurde

- **Pomodoro** und **Body Doubling**. Beides ist in Ratgebern für neurodivergente Menschen
  verbreitet; kontrollierte Wirksamkeitsbelege in dieser Anwendungsform fehlen. Eine Funktion,
  die mit einer Wirkung beworben wird, die sie nicht nachweisen kann, wäre genau der Fehler,
  den docs/60 bei „weniger Auswahl" aufgedeckt hat.
- **Punktzahlen, Serien, Erledigungsquoten.** Die Liste zeigt Reihenfolge und Begründung, nie
  eine Zahl, die sich vergleichen lässt (INV-008, INV-015, §42).
- **„Spoon Theory" als Beleg.** Das Bild ist hilfreich und wird von vielen Betroffenen genutzt,
  aber es ist ein Erfahrungsbericht, keine Studie. Die Kapazitätsstufen gab es ohnehin schon.

## 7 · Zusicherungen, die als Eigenschaft geprüft sind

`packages/domain/test/planning.spec.ts`, 41 Tests, je Strategie durchgespielt:

| Zusicherung | Warum sie zählt |
| --- | --- |
| **Kein Eintrag geht verloren** – jeder liegt in genau einem Abschnitt, im Überhang oder unter „nicht planbar" | INV-007. Eine fehlende Aufgabe fällt niemandem auf; das ist der gefährlichste Fehler, den diese Ansicht machen kann |
| **Nichts wird nach seiner Frist eingeplant** | Ein Plan, der eine Sache auf nach ihren Termin legt, gibt eine Zusage, die er nicht halten kann |
| **Kein Abschnittsbudget wird überschritten** | Sonst wäre der Puffer eine Behauptung |
| **Jede Platzierung ist in Worten begründet**, und in keiner steht „Punkte" oder „Score" | INV-008 |
| **Alterung zieht höchstens eine Sache vor** | Ein Plan aus Altlasten wird nicht angefasst |
| Tag = 1, Woche = 7, Monat = 4 Abschnitte; der Monat rechnet in Wochen | Tagesgenaue Planung über einen Monat behauptet eine Genauigkeit, die niemand hat |

Dazu in `apps/web/test/tagesplan-ansicht.spec.tsx`, weil die Domänenschicht davon nichts sieht:

| Zusicherung | Warum sie zählt |
| --- | --- |
| **Jeder Eintrag trägt „Erledigt" und die weiteren Wege** | Die erste Fassung baute die Einträge aus `Row`, einer Navigationszeile. In der Liste ließ sich nichts abhaken, nichts verschieben, nichts abgeben – eine Todo-Liste, in der man nichts tun kann, ist keine |
| **Auch im Überhang lässt sich abhaken** | Nicht eingeplant heißt nicht unerreichbar |
| **Unter „Lässt sich nicht einplanen" gibt es nichts abzuhaken** | Was auf andere wartet, hakt man nicht ab |
| **Die Reiterleiste heißt Jetzt · Heute · Woche · Monat, und ohne Liste steht „Jetzt" auf gewählt** | Der Voreinstellung darf man ansehen, dass sie eine ist |
| **Die Sortiereinstellungen liegen geschlossen dahinter** | docs/48: einen benannten Klick entfernt, nie einen geratenen |

## 8 · Ein Fehler, den diese Arbeit aufgedeckt hat

`rank()` konnte **null** Faktoren liefern – bei einer Aufgabe ohne Frist, ohne Zuweisung,
nicht überfällig, in einem normal eingestuften Bereich. Jeder Faktor dort hängt an einer
Bedingung, und diese Aufgabe erfüllte keine. Der Vertrag verlangt aber `why.min(1)` mit dem
Vermerk „INV-008: jedes Element muss begründet sein".

Erreichbar war das schon vorher über „Kann ich jetzt erledigen"; aufgefallen ist es erst, als
die Planung auch die Einträge zeigte, die hinter den Abschnittsgrenzen lagen. Behoben durch
einen Rückfallfaktor mit Beitrag 0 – die Eigenschaft `score === Σ contributions` bleibt
unberührt, und der Satz sagt, was wahr ist: *„Hier drängt nichts."*

## 9 · Quellen

| Behauptung | Quelle |
| --- | --- |
| EDF optimal auf einem Prozessor; RMS-Schranke ln 2 | Liu & Layland (1973), *JACM* 20(1) |
| SPT minimiert die mittlere Fertigstellungszeit | Standardergebnis der Ablaufplanung, 1‖ΣCⱼ |
| Alterung gegen Verhungern | Standardverfahren in Betriebssystem-Schedulern |
| Verhaltensaktivierung nicht unterlegen gegenüber KVT | Richards et al. (2016), *Lancet* 388, COBRA, n = 440 |
| Vorsatzbildung, *d* = 0,65 | Gollwitzer & Sheeran (2006), Meta-Analyse, 94 Studien |
| Planungsfehlschluss | Buehler, Griffin & Ross (1994) |
| Kosten des Aufgabenwechsels | Monsell (2003), *Trends in Cognitive Sciences* |
| Aufwandsabwägung bei Anhedonie | Treadway et al. (2009), EEfRT – Labor, Replikation gemischt |
| Choice Overload praktisch null | Scheibehenne, Greifeneder & Todd (2010) – siehe docs/60 E4 |
