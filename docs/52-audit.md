# 52 – Vollständiger Audit

Geprüft wurde die gesamte Anwendung: Informationsarchitektur, jeder Navigationspunkt, jeder
Screen, das Objektmodell, die wichtigen Abläufe, Kontext- und Kapazitätslogik,
Benachrichtigungen, Mobil- und Desktop-Darstellung, visuelle Hierarchie, Sprache und
Barrierefreiheit.

Gemessen statt geschätzt: Die Zahlen stammen aus `ops/scripts/cognitive-load.mjs` (18 Orte ×
3 Breakpoints), aus Abfragen gegen Quelltext und Datenbank, und aus den bestehenden
Prüfungen.

## Zusammenfassung

Die Grundlagen sind belastbar. Die Priorisierung in `packages/domain/src/prioritization/rank.ts`
arbeitet mit begründeten Faktoren (Fälligkeit, Kritikalität, Kapazität, Warten, Alter) und
**ordnet um, statt auszublenden** – die Zusage aus INV-007 wird eingehalten. Kapazität wirkt
tatsächlich: `mutePush` und `criticalOnly` werden im Versand durchgesetzt, nicht nur
gespeichert. Die Suche deckt acht Objektarten ab. Mandantentrennung ist erzwungen und getestet.

Die Befunde betreffen drei Muster:

1. **Das Objektmodell ist zur Navigation geworden.** Fünf der zehn Navigationspunkte sind
   Querlisten über je eine Objektart. Nutzer müssen die Systemlogik lernen, um ihrem Ziel zu
   folgen.
2. **Ein Bereich zeigt nicht, was in ihm los ist.** Aufgaben fehlen dort – ausgerechnet an dem
   Ort, den die Anwendung als „Raum, in dem Verantwortung lebt" definiert.
3. **Es gibt Modell ohne Wirkung.** Drei Aufgabenfelder werden geschrieben und nie gelesen.

### Stand

| Befund | | Stand |
| --- | --- | --- |
| K1 | Aufgaben im eigenen Bereich unsichtbar | **behoben** |
| H1 | Navigation bildet das Objektmodell ab | **entschieden: bleibt** – siehe unten |
| H2 | Drei Begriffe für mehrschrittige Arbeit | **behoben** |
| H3 | Ausführbarkeit ist nicht modelliert | **offen** – braucht eine Anwesenheitsquelle |
| H4 | Drei Felder ohne Leser | **behoben** (entfernt) |
| M1 | Dichteste Seite der Anwendung | **behoben** (−237 px Desktop, −472 px Handy) |
| M2 | Die Suche findet keine Regeln | **behoben** |
| M3 | Regeln heißen an drei Stellen verschieden | **behoben** |
| N1 | Kleinigkeiten | **teils behoben** |

Nach den Änderungen: 755 Prüfungen in Node und jsdom, 268 im echten Browser, Lint und
Typprüfung ohne Beanstandung.

## Befunde

### K1 · Aufgaben sind in ihrem eigenen Bereich unsichtbar

| | |
| --- | --- |
| **Bereich** | Objektmodell / Informationsarchitektur |
| **Ort** | `GET /households/:id/domains/:domainId/detail`, Bereichsseite |
| **Priorität** | **Kritisch** |

**Problem.** Die Detailantwort eines Bereichs führt `states`, `monitors`, `knowledge`,
`questions`, `decisions`, `processes`, `attention` und `children` – aber **keine Aufgaben**
(`apps/api/src/routes/work.routes.ts`, Zeile 81 ff.). Auf der Seite eines Bereichs ist deshalb
nicht zu sehen, was dort offen ist.

**Warum problematisch.** Die Hilfeseite definiert einen Bereich als „Zuständigkeitsraum … was
gerade läuft". Der Vorgang steht dort, die einzelne Aufgabe nicht. Seit Regeln Aufgaben
erzeugen, entstehen in einem Bereich laufend Aufgaben, die auf dessen Seite nicht vorkommen.

**Auswirkung.** Wer für „Schuhe" verantwortlich ist, kann nicht nachsehen, was für „Schuhe"
offen ist. Er muss auf `/jetzt` warten, bis die Aufgabe hoch genug bewertet wird, oder sie im
Plan zwischen allen anderen suchen. Genau die Kontrolle, die Verantwortung tragbar macht,
fehlt.

**Empfohlene Änderung.** Die Detailantwort um die offenen Aufgaben des Bereichs erweitern und
sie im Abschnitt „Läuft gerade" neben den Vorgängen zeigen – mit Fälligkeit und Zuständigkeit.

**Abhängigkeiten.** Keine.

**Akzeptanzkriterium.**
> **GIVEN** ein Bereich mit einer offenen Aufgabe
> **WHEN** die Seite dieses Bereichs geöffnet wird
> **THEN** erscheint die Aufgabe dort mit ihrer Fälligkeit, unabhängig davon, wie sie in der
> Jetzt-Ansicht bewertet wird.

---

### H1 · Die Navigation bildet das Objektmodell ab, nicht Nutzerziele

| | |
| --- | --- |
| **Bereich** | Informationsarchitektur |
| **Ort** | Hauptnavigation, Gruppe „Übersicht" |
| **Priorität** | **Hoch** |

**Problem.** Zehn Navigationspunkte plus drei in der Kopfleiste. Die Gruppe „Übersicht"
enthält fünf Querlisten – Vorgänge, Wissen, Beobachtung, Kalender, Abläufe –, von denen jede
genau eine Objektart über alle Bereiche hinweg auflistet.

**Warum problematisch.** Das ist die Datenbankstruktur als Menü. Ein Nutzer denkt nicht „ich
gehe in die Wissensliste", sondern „was weiß ich über die Schuhe". Der Weg über den Bereich
ist der natürliche; die Querlisten sind der Ausnahmefall (etwas suchen, dessen Bereich man
nicht weiß) – und dafür gibt es die Suche.

Gemessen: `/wissen` hat 4 Bedienelemente, `/vorgaenge` 8, `/kalender` 1. Drei Seiten, die
kaum etwas anbieten, aber dauerhaft Platz in der Navigation belegen.

**Auswirkung.** Die Navigation ist länger als nötig, und der Nutzer muss lernen, welche
Objektart wo wohnt.

**Empfohlene Änderung.** Zu klären: ob die Querlisten in einen gemeinsamen Ort („Alles")
zusammenwandern oder ganz zugunsten von Bereich + Suche entfallen. Das ist eine
Produktentscheidung – siehe „Offene Entscheidungen" unten.

**Abhängigkeiten.** K1 (der Bereich muss vollständig sein, bevor Querlisten entbehrlich werden).

---

### H2 · Drei Begriffe für mehrschrittige Arbeit

| | |
| --- | --- |
| **Bereich** | Sprache / Objektmodell |
| **Ort** | „Aufgabe", „Vorgang", „Ablauf" |
| **Priorität** | **Hoch** |

**Problem.** Ein *Ablauf* ist eine Schrittvorlage, ein *Vorgang* ist die laufende Umsetzung,
eine *Aufgabe* ein einzelner Schritt. Fachlich sauber getrennt – aber der Unterschied muss
gelernt werden, und die Oberfläche fragt früh danach („Vorgang starten" gegen „Einzelne
Aufgabe").

**Warum problematisch.** Der Nutzer muss die Systemlogik verstehen, bevor er sein Ziel
verfolgen kann. Beim Erfassen ist die Frage „ist das ein Vorgang oder eine Aufgabe?" eine
Entscheidung, die die Anwendung meist selbst treffen könnte.

**Empfohlene Änderung.** Beim Erfassen nicht mehr fragen: Es entsteht eine Aufgabe. Ergibt
sich später ein zweiter Schritt, wird daraus ein Vorgang – die Hilfeseite erklärt das bereits
so. Die Wahl bleibt erhalten, sie steht nur nicht mehr am Anfang.

**Akzeptanzkriterium.**
> **GIVEN** ein Nutzer erfasst etwas in einem Bereich
> **WHEN** er nichts weiter angibt
> **THEN** entsteht eine Aufgabe, ohne dass er zwischen Aufgabe und Vorgang wählen muss.

---

### H3 · Ausführbarkeit ist nicht modelliert

| | |
| --- | --- |
| **Bereich** | Kontextlogik |
| **Ort** | Aufgabenmodell, Priorisierung |
| **Priorität** | **Hoch** |

**Problem.** Die Priorisierung kennt Fälligkeit, Kritikalität, Energie, Zuweisung, Warten und
Alter – aber keine **Voraussetzung**. Eine Aufgabe, die nur zusammen mit einer bestimmten
Person oder an einem bestimmten Ort geht, kann nicht als solche markiert werden.

`waitingStates` deckt „blockiert durch" ab (Person, Termin, Lieferung). Das ist etwas anderes
als „geht nur, wenn X da ist": Ersteres heißt *ich kann nicht anfangen*, Letzteres *ich kann
gerade nicht, später schon*.

**Auswirkung.** Genau der Fall aus der Aufgabenstellung: Eine Aufgabe, die das Kind braucht,
kann prominent als „jetzt" erscheinen, während das Kind in der Schule ist. Der Nutzer muss den
Abgleich im Kopf machen – das ist der Mental Load, den die Anwendung abnehmen soll.

**Empfohlene Änderung.** Eine Aufgabe kann eine Voraussetzung tragen („braucht Anwesenheit von
…"). Ist sie nicht erfüllt, wirkt sie wie `above_capacity`: sie rutscht nach hinten, mit
sichtbarer Begründung – sie verschwindet nicht.

**Abhängigkeiten.** Braucht eine Quelle für Anwesenheit (Kalender oder Kapazität).

**Akzeptanzkriterium.**
> **GIVEN** eine Aufgabe, die die Anwesenheit einer Person voraussetzt
> **WHEN** diese Person zum Bewertungszeitpunkt nicht verfügbar ist
> **THEN** wird die Aufgabe nicht als „jetzt" geführt, bleibt aber sichtbar und nennt den Grund.

---

### H4 · Modell ohne Wirkung: drei Felder werden geschrieben und nie gelesen

| | |
| --- | --- |
| **Bereich** | Objektmodell |
| **Ort** | `tasks.socialLoad`, `tasks.physicalEnergy`, `tasks.focusRequired` |
| **Priorität** | **Hoch** |

**Problem.** Die drei Spalten werden beim Anlegen gesetzt und **nirgends gelesen** – weder in
der Priorisierung noch in der Oberfläche. Belegt: je vier Fundstellen, alle in Typdefinition
und Schreibpfad.

**Warum problematisch.** Sie suggerieren eine Feinsteuerung, die es nicht gibt. Wer sie über
die Schnittstelle setzt, erwartet Wirkung.

**Empfohlene Änderung.** Entweder in die Priorisierung aufnehmen (`focusRequired` ist der
naheliegendste Kandidat – er unterscheidet sich fachlich von `mentalEnergy`) oder entfernen.
Halbes Modell ist die schlechteste Variante.

---

### M1 · Die Bereichsseite ist die dichteste Seite der Anwendung

| | |
| --- | --- |
| **Bereich** | Visuelle Hierarchie |
| **Ort** | `/bereiche/:id` |
| **Priorität** | **Mittel** |

Gemessen: 25 Bedienelemente, 10 Größe-Gewicht-Paare, 14 Flächen, 2359 px. Zum Vergleich:
`/jetzt` 17 / 7 / 2 / 1131 px.

Der Zuwachs stammt aus den jüngsten Ergänzungen (Farbknopf, Regelwerkzeuge). Nach K1 kommen
Aufgaben dazu – das macht eine erneute Verdichtung nötig, nicht davor.

**Abhängigkeiten.** K1.

**Behoben.** Zwei Ursachen, beide ohne Funktionsverlust:

1. *Drei Bauformen für dieselbe Sache.* „Angaben" und „Notizen und Fragen" hatten ihren
   Anlegen-Knopf in der Kopfzeile und eine Zeile für den leeren Fall; „Entscheidungen" hatte
   stattdessen einen Dauer-Absatz und eine eigene Knopfzeile am Fuß – die auch dann noch
   erklärte, als schon zehn Entscheidungen darunterstanden. Jetzt alle drei gleich gebaut.
2. *Folgen vor der Wahl.* In „Diesen Bereich verwalten" stand unter jeder der drei Handlungen
   die Konsequenz ausformuliert, auch wenn niemand sie gewählt hatte. Sie steht jetzt nur
   noch dort, wo sie etwas erklärt: an einem gesperrten Knopf (*warum* geht das nicht) und im
   Moment des Bestätigens.

Dazu fielen drei Flächen weg, die seit `.panel .panel` ohnehin wirkungslos waren.

| | vorher | nachher |
| --- | --- | --- |
| Höhe Desktop | 2422 px | **2185 px** |
| Höhe Handy | 3178 px | **2706 px** |
| Flächen | 14 | **11** |
| „Was wir wissen" | 708 px / 4 Flächen | **607 px / 1 Fläche** |
| „Diesen Bereich verwalten" | 714 px / 6 Bedienelemente | **578 px / 3** |

Die Seite bleibt die dichteste der Anwendung – sie ist auch die inhaltsreichste. Die
Bedienelemente blieben bei 25: Es ging um Form, nicht um Umfang.

---

### M2 · Die Suche findet keine Regeln

| | |
| --- | --- |
| **Bereich** | Suche |
| **Ort** | `search.service.ts` |
| **Priorität** | **Mittel** |

Durchsucht werden Bereiche, Personen, Angaben, Wissen, Fragen, Entscheidungen, Vorgänge und
Aufgaben – **keine Monitore**. „Wo war noch die Regel für den Müll?" ist eine realistische
Frage, seit Regeln Aufgaben erzeugen und einen selbstgewählten Namen tragen.

---

### M3 · Regeln heißen an drei Stellen verschieden

| | |
| --- | --- |
| **Bereich** | Sprache |
| **Ort** | Navigation „Beobachtung", Abschnitt „Worauf wir achten", Knopf „Regel einrichten" |
| **Priorität** | **Mittel** |

Dasselbe Objekt heißt „Beobachtung", „Regel" und – im Modell – „Monitor". Nach der Erweiterung
um regelmäßige Aufgaben ist „Beobachtung" zudem inhaltlich zu eng: Eine Regel, die jeden
Donnerstag den Müll anlegt, beobachtet nichts.

**Empfohlene Änderung.** Ein Wort für das Objekt. „Regel" trägt beide Fälle.

---

### N1 · Kleinigkeiten

- `/kalender` hat ein einziges Bedienelement und belegt einen dauerhaften Navigationsplatz.
- `/hilfe` ist auf dem Handy 4394 px hoch (bekannte, dokumentierte Grenze; die Sprungleiste
  nimmt die Navigationslast).
- Die Beobachtungsseite zeigt Regeln ohne ihren Rhythmus im Klartext – der Satz existiert
  bereits (`describeRecurrence`) und wird dort nicht benutzt.
  **Behoben** – und dabei ein zweiter Fehler: Die Tabelle, die Regelarten in Sprache übersetzt,
  enthielt zwei Namen, die es im Vokabular nie gab (`calendar_lead_time`, `recurring`), und
  keinen einzigen der tatsächlich benutzten. Jede angelegte Regel fiel still auf
  „Regelmäßige Prüfung" zurück; die Liste sagte über keine Regel etwas aus. Die Tabelle ist
  jetzt über `MonitorRuleKind` typisiert, ein Test hält sie vollständig
  (`apps/web/test/rule-kinds.spec.ts`).

## Was geprüft wurde und in Ordnung ist

Damit der Bericht nicht nur Mängel zeigt:

| Bereich | Befund |
| --- | --- |
| Priorisierung | Begründete Faktoren, ordnet um statt auszublenden (INV-007), jede Karte nennt ihren Grund |
| Kapazität | `mutePush` und `criticalOnly` werden im Versand tatsächlich durchgesetzt |
| Mandantentrennung | RLS erzwungen, jede registrierte Haushaltsroute automatisch geprüft |
| Barrierefreiheit | axe auf 18 Ansichten, Kontrast numerisch geprüft, 44-px-Ziele unter `pointer: coarse` |
| Fehlerzustände | Beruhigend formuliert, mit Wiederholung, ohne Sackgasse |
| Sprache | Kein Modellbezeichner erreicht die Oberfläche; ein Test hält das fest |
| Layout | Kein horizontaler Überlauf an 54 gemessenen Stellen |

## Entschieden

**H1 – die Querlisten.** Drei Wege standen zur Wahl:

| Option | Vorteil | Nachteil |
| --- | --- | --- |
| **A – zusammenlegen:** ein Ort „Alles" mit Reitern | Navigation von 10 auf 6; Querzugriff bleibt | Ein Reiter mehr auf dem Weg |
| **B – auflösen:** Bereich + Suche genügen | Kürzeste Navigation, klarstes Modell | Wer den Bereich nicht kennt, ist auf die Suche angewiesen |
| **C – so lassen** | Jede Objektart ist mit einem Klick erreichbar, ohne zu wissen, wo sie liegt | Die Navigation bleibt breit und spiegelt das Modell |

**Gewählt: C.** Die Breite der Navigation ist damit eine bewusste Entscheidung, kein Versehen.
Wer nicht weiß, in welchem Bereich etwas liegt, kommt über die Querliste trotzdem hin – dieser
Weg wiegt schwerer als eine kürzere Leiste.

Was daraus folgt: Die Querlisten müssen ihre Berechtigung behalten. Eine Liste, die nur eine
Tabelle abbildet, ohne einen eigenen Blick auf die Sache zu geben, ist der eigentliche Mangel –
nicht ihre Existenz. `/kalender` mit einem einzigen Bedienelement (N1) ist der Punkt, an dem
das als Nächstes zu prüfen ist.

## Offen

**H3 – Ausführbarkeit.** „Braucht Anwesenheit von X" ist im Modell beschrieben, aber nicht
gebaut: Es fehlt eine Quelle dafür, wer wann da ist. Das ist ein eigenes Vorhaben, keine
Nacharbeit an diesem Audit.
