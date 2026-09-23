# 60 · Wissenschaftlich fundierter Konzept- und UX-Audit

**Status: nichts implementiert.** Dieser Bericht analysiert, belegt und schlägt vor. Alle
Empfehlungen sind Diskussionsgrundlage.

Alle zitierten Quellen wurden während der Recherche gegen die Publikation geprüft. Wo die
Evidenz schwach ist oder die Übertragung auf diesen Kontext ungetestet, steht das ausdrücklich
dabei.

---

## 1 · Executive Summary

**E1 · Der stärkste Befund ist eine Lücke im Objektmodell.** Thealotta kennt neun Regelarten –
alle knüpfen an **Zeit** oder an **Zustand** an, keine an eine **Situation**. Für
ereignisgebundene Vorsätze („wenn X, dann Y") liegt die stärkste Evidenz des gesamten
Feldes vor (Meta-Analyse, 94 Studien, *d* = 0,65). Die Anwendung *formuliert* solche Sätze
bereits im Demobestand („Beim nächsten Schuheanziehen Zehenraum prüfen") – aber nur als Text.
Das Modell kann den Auslöser nicht darstellen, also wird daraus eine Aufgabe mit Datum.

**E2 · Das größte Risiko ist der Family-Administrator-Effekt.** Feldforschung an 44 Familien
unterscheidet monozentrische, perizentrische und polyzentrische Kalendernutzung – in
monozentrischen Haushalten pflegt **eine** Person das System für alle. Thealottas Einrichtung
(Bereiche, Angaben, Regeln, Schwellen) ist umfangreich genug, dass genau das der Regelfall
werden dürfte. Damit reproduziert das Werkzeug die Asymmetrie, die es abbauen soll.

**E3 · Die dokumentierten Schutzmaßnahmen gegen Meldungsmüdigkeit sind teilweise nicht
gebaut.** `docs/23` beschreibt Bündelung, Staleness-Gate und Ratenbegrenzung. Im Zusteller
(216 Zeilen) kommt keine davon vor; `bundle_after` existiert nur als Spalte. Umgesetzt sind
Dedupe (auf Signalebene) und das Kapazitäts-Gate.

**E4 · „Weniger Auswahl ist besser" ist schwächer belegt als angenommen.** Die
Meta-Analyse zu Choice Overload findet einen mittleren Effekt von **praktisch null**. Thealottas
harte Grenze von drei Einträgen unter „Jetzt relevant" (Q-14) ist eine begründete
Designentscheidung – aber keine evidenzgestützte Regel. Sie sollte als Produktwette
bezeichnet werden, nicht als Wissenschaft.

**E5 · Der Verzicht auf eine Fairness-Kennzahl ist gut belegt.** Wahrgenommene Fairness der
Hausarbeit folgt nicht der gezählten Gleichverteilung; es gibt keinen objektiven
Vergleichsmaßstab. INV-015 („keine scheinpräzise Fairness-Behauptung") ist damit eine der am
besten gestützten Entscheidungen des Produkts. **Beibehalten.**

**E6 · Erklärbarkeit ist richtig, aber aus einem anderen Grund als vermutet.** INV-008 liefert
Faktoren statt Punktzahlen. Die Forschung zu Vertrauen in Automation begründet das nicht mit
„Transparenz ist gut", sondern mit **kalibriertem Vertrauen**: Nutzer müssen erkennen können,
*wann sie sich nicht* verlassen sollten. **Beibehalten.**

**E7 · Daminger unterscheidet vier Teile kognitiver Hausarbeit** – antizipieren, **Optionen
ermitteln**, entscheiden, überwachen. Thealotta hat Objekte für drei davon. Für das Ermitteln von
Optionen (welcher Arzt, welche Schuhe, welche Kita) gibt es keins: Wissen ist das *Ergebnis*,
die Frage ist der *offene Zustand* – die Suche selbst bleibt unsichtbar.

**E8 · Externe Erinnerungen werden häufiger gesetzt als nötig, nicht seltener.** Menschen
lagern auf Basis metakognitiver Urteile aus, die systematisch danebenliegen. Ein System, das
das Auslagern billig macht, senkt nicht automatisch die Last – es verschiebt sie in die
Pflege der Auslagerung.

---

## 2 · Das Modell der bestehenden Anwendung

Aus Code und Dokumentation rekonstruiert.

### Objekte und ihre Rolle

| Objekt | Rolle im mentalen Modell |
| --- | --- |
| **Bereich** (`domains`) | Raum, in dem Verantwortung lebt; Baum über `ltree`; trägt Kritikalität und Sichtbarkeit |
| **Zuständigkeit** (`responsibility_assignments`) | Wer *mitdenkt*, dauerhaft, vererbbar, historisiert |
| **Vertretung** (`temporary_coverages`) | Wer *jetzt* mitdenkt, ohne die dauerhafte Zuständigkeit zu ändern |
| **Angabe + Wert** (`state_definitions`, `state_values`) | Was der Haushalt weiß; `unknown` ist ein eigener Zustand, kein leeres Feld |
| **Regel** (`monitors`) | Was von selbst geprüft wird; erzeugt Signal → Hinweis oder Aufgabe |
| **Hinweis** (`attention_items`) | Etwas verlangt Aufmerksamkeit; bündelt Signale je (Bereich, Art) |
| **Vorgang** (`processes`) + **Aufgabe** (`tasks`) | Mehrschrittige Arbeit und einzelne Handlung; „nächster Schritt" ist eine Projektion, keine Entität |
| **Wissen, Frage, Entscheidung** | Externalisiertes Gedächtnis: Ergebnis, offener Zustand, Festlegung |
| **Kapazität** (`capacity_states`) | Selbstauskunft; ordnet um, blendet nicht aus |

### Das mentale Modell, das die Anwendung abbildet

> Ein Haushalt besteht aus **Bereichen**. Für jeden denkt jemand mit. Was man über einen
> Bereich weiß, steht dort. **Regeln** prüfen dieses Wissen von selbst und melden sich, bevor
> jemand daran denken muss. Was daraus entsteht, ist **Arbeit** – und die trägt ihre
> Begründung mit sich.

Der zentrale Zug: **Zustand vor Aufgabe.** Nicht „erinnere mich, die Schuhe zu prüfen",
sondern „die Schuhgröße ist 42 Tage alt" – die Aufgabe entsteht daraus.

### Durchsetzungspunkte

Fünfzehn Invarianten mit benannten Durchsetzungspunkten (Datenbankrechte, Zustandsautomaten,
Tests), nicht als Absichtserklärung. Das ist für die Bewertung wichtig: Was hier steht, gilt
meist auch.

---

## 3 · Fundamentale konzeptionelle Fragen

### F1 · Sollte es eine ereignisgebundene Regelart geben? 🔵

**Beobachtung.** `MONITOR_RULE_KINDS` = `state_freshness`, `state_unknown`,
`state_threshold`, `schedule`, `seasonal`, `lead_time_before_event`, `date_field_lead_time`,
`absence`, `dependency_recheck`. Neun Arten, alle zeit- oder zustandsgetrieben.
`lead_time_before_event` bezieht sich auf einen **Kalendertermin**, nicht auf eine Situation
im Alltag.

**Problem.** Die Anwendung schreibt bereits ereignisgebundene Sätze („Beim nächsten
Schuheanziehen Zehenraum prüfen") – als Titel einer gewöhnlichen Aufgabe. Der Auslöser
existiert im Kopf des Nutzers, nicht im Modell. Damit fällt der Vorsatz auf zeitbasiertes
Erinnern zurück, also auf genau die Form, die am meisten Aufmerksamkeit kostet.

**Wissenschaftliche Grundlage.**
- Gollwitzer & Sheeran (2006): Meta-Analyse, 94 Studien, N > 8.000, *d* = 0,65 für
  Implementation Intentions („Wenn Situation X eintritt, dann tue ich Y") gegenüber bloßer
  Zielsetzung. **Evidenz A.**
- McDaniel & Einstein, Multiprocess Framework: **fokale** Hinweisreize – solche mit hoher
  Verarbeitungsüberlappung zur laufenden Tätigkeit – ermöglichen **spontanen Abruf** ohne
  aufmerksamkeitszehrendes Überwachen. **Evidenz B.**

**Übertragbarkeit.** Mittel bis hoch. Die Forschung untersucht menschliche Vorsatzbildung,
nicht Software. Die Übertragung lautet: Ein System, das den Auslöser **mitführt und im
richtigen Moment zeigt**, könnte denselben Mechanismus stützen. **Ungetestet in diesem
Kontext.**

**Hypothese.** Eine Regelart `situation_cue` mit einem benannten Alltagsanker (Schuhe
anziehen, Einkauf, Abendessen, Kita-Abgabe) – kombiniert mit einer Rückfalldatumsgrenze.

**Gegenargument (§32).** Ein System kann eine Alltagssituation nicht beobachten. Der Hinweis
erscheint also weiterhin über Zeit oder Ort – nur die *Formulierung* ist ereignisgebunden.
Ob der Effekt aus der Meta-Analyse dann noch trägt, ist offen: Dort formulierten die
Teilnehmenden den Vorsatz **selbst**. Eine vom System vorformulierte Wenn-Dann-Regel ist
möglicherweise etwas anderes.

**Mental-Load-Bilanz.** Vorher: selbst daran denken. Neu: einmal den Anker benennen.
Entfallend: Überwachen. Verbleibend: der Moment der Ausführung. **Träger: die Person, die die
Regel anlegt.**

**Empfehlung.** Prototyp mit Nutzertest. Nicht ohne Validierung bauen.

---

### F2 · Fehlt ein Objekt für „Optionen ermitteln"? 🟡

**Wissenschaftliche Grundlage.** Daminger (2019) zerlegt kognitive Hausarbeit in vier
Schritte: **anticipate · identify · decide · monitor**. 70 Interviews mit 35 Paaren,
qualitativ. Der Befund: Diese Arbeit ist anstrengend und **beiden Partnern oft unsichtbar**,
deshalb häufige Konfliktquelle. **Evidenz C** für den konkreten Vierschritt (eine qualitative
Studie), **B** für die Grundaussage „kognitive Hausarbeit ist eine eigene Dimension" (breit
rezipiert, 300+ Zitationen).

**Beobachtung.** Thealotta hat Objekte für *antizipieren* (Regeln), *entscheiden*
(`decisions`) und *überwachen* (Angaben mit Frist). Für *identify* – die Recherche, das
Vergleichen, das Optionenfinden – gibt es keins. Eine Frage ist der offene Zustand, eine
Notiz das Ergebnis; die Arbeit dazwischen bleibt unsichtbar. Genau das, was die Studie als
unsichtbar beschreibt.

**Gegenargument.** Ein weiteres Objekt erhöht die Modellkomplexität. Möglicherweise genügt
ein Vorgang mit Schritten. Zu prüfen wäre, ob Nutzer diese Arbeit überhaupt festhalten wollen
oder ob das Erfassen teurer ist als der Nutzen.

**Empfehlung.** Weiter untersuchen; Interviews vor Prototyp.

---

### F3 · Sollte die Startseite Situationen statt Aufgaben zeigen? 🟡

Die Now-Ansicht zeigt Aufgaben und Hinweise. Aus der Prospective-Memory-Forschung ließe sich
ableiten, dass die **Situation** der bessere Anker ist („gleich ist Kita-Abholung – dabei:
Wechselsachen mitgeben"). Belegbar ist das nicht direkt: Es gibt keine mir bekannte Studie,
die Aufgabenlisten gegen Situationslisten in Haushaltssoftware vergleicht. **Evidenz D.**

**Empfehlung.** Als Forschungshypothese vormerken, nicht bauen.

---

## 4 · Evidence Map

| Forschungsfeld | Relevanz | Evidenzqualität | Wichtigste Erkenntnis | Produktimplikation |
| --- | --- | --- | --- | --- |
| Implementation Intentions | sehr hoch | **A** (Meta, 94 Studien, *d*=0,65) | Wenn-Dann-Vorsätze schlagen bloße Zielsetzung deutlich | F1: ereignisgebundene Regelart fehlt |
| Prospective Memory / Multiprocess | hoch | **B** | Fokale Hinweisreize erlauben spontanen Abruf ohne Überwachen | F1; Formulierung von Regeln |
| Kognitive Hausarbeit (Mental Load) | sehr hoch | **B/C** | Vier Teile: antizipieren, Optionen ermitteln, entscheiden, überwachen; unsichtbar für beide Partner | F2; Produktzweck bestätigt |
| Cognitive Offloading | hoch | **A/B** | Auslagerungsentscheidungen folgen fehlerhaften metakognitiven Urteilen; eher zu viel als zu wenig | E8; Vorsicht bei „mehr erfassen" |
| Family Calendars / CSCW | hoch | **B** | Monozentrisch/perizentrisch/polyzentrisch; oft pflegt eine Person | E2: Family-Administrator-Risiko |
| Alert Fatigue (klinisch) | mittel | **A**, Übertragung **C** | Override-Raten 46–96 % | E3: Schutzmaßnahmen bauen |
| Unterbrechungskosten | mittel | **B** | Unterbrochene Arbeit wird schneller erledigt, aber mit mehr Stress und Frustration | Bündelung statt Einzelmeldung |
| Choice Overload | mittel | **A**, aber **null** | Mittlerer Effekt ≈ 0; Moderatoren umstritten | E4: Grenze von 3 ist Wette, keine Regel |
| Wahrgenommene Fairness | hoch | **B** | Fairness ≠ gezählte Gleichverteilung; kein objektiver Maßstab | INV-015 beibehalten |
| Vertrauen in Automation | hoch | **A** (Standardwerk) | Kalibriertes Vertrauen braucht Informationen über Zweck, Prozess, Leistung | INV-008 beibehalten |
| ADHS und Prospective Memory | mittel | **B/C** | Beeinträchtigung vor allem in der **Planung**, weniger in Abruf/Ausführung | Systemseitige Zerlegung in nächste Schritte stützen |
| Autismus und Exekutivfunktionen | mittel | **A** (235 Studien, N>14.000), aber heterogen | Moderate Effekte über Domänen; Fragebogen- > Testbefunde; hohe Streuung | Keine Gruppenannahmen; Vorhersagbarkeit als Prinzip |

---

## 5 · Empfehlungen

### ⚪ K1 · Keine Fairness-Kennzahl — **beibehalten**

**Beobachtung.** INV-015: Die Balance-API liefert Verteilungsbänder, keine Prozentwerte.
INV-P02: kein Schemafeld für Streaks, Scores oder Rankings.

**Wissenschaftliche Grundlage.** Forschung zur Verteilungsgerechtigkeit im Haushalt zeigt:
Die meisten Frauen **und** Männer bezeichnen die Aufteilung als fair, obwohl Frauen rund
70 % der Hausarbeit leisten. Wahrgenommene Fairness hängt an Vergleichsmaßstäben, erlebtem
Nutzen und Rechtfertigungen – nicht an gezählten Aufgaben. Es gibt keinen objektiven
Vergleichsmaßstab. **Evidenz B.**

**Konsequenz.** Eine Zahl „14 zu 12" wäre nicht nur ungenau, sondern konzeptuell falsch: Sie
suggeriert einen Maßstab, den es nicht gibt, und lädt zum Vergleich zwischen Personen ein.
**Empfehlung: keine Änderung.**

---

### ⚪ K2 · Faktoren statt Punktzahl — **beibehalten**

INV-008 liefert `ScoreFactor[]` mit Begründung, der Score selbst bleibt intern.

**Grundlage.** Lee & See (2004): Angemessenes Verlassen auf Automation setzt **kalibriertes**
Vertrauen voraus; dafür braucht der Mensch Informationen über *Zweck*, *Prozess* und
*Leistung* des Systems. Eine Punktzahl liefert keine davon. **Evidenz A** (Standardwerk der
Human-Factors-Forschung, Übertragung auf Alltagssoftware plausibel).

**Empfehlung: keine Änderung.** Ergänzend zu prüfen wäre, ob die Faktoren auch die *Grenzen*
des Systems zeigen („diese Regel lief noch nie") – das wäre die *Prozess*-Dimension.

---

### 🔴 R1 · Die Schutzmaßnahmen gegen Meldungsmüdigkeit sind nicht gebaut

**Beobachtung.** `docs/23-notification-model.md` nennt sechs Maßnahmen. Geprüft:

| Maßnahme | Zustand |
| --- | --- |
| Dedupe über `dedupe_key` | **gebaut** (Signalebene, partieller Unique-Index) |
| Kapazitäts-Gate | **gebaut** |
| Kein Wiederholungs-Nörgeln | **gebaut** (es gibt keinen Wiederholungspfad) |
| Bündelung (`bundle_after`) | **nur Spalte**, kein Code im Zusteller |
| Staleness-Gate (6 h) | **nicht gefunden** |
| Ratenbegrenzung 4/h, 12/Tag | **nicht gefunden** |

**Grundlage.** Systematische Reviews zu klinischen Entscheidungsunterstützungssystemen finden
Override-Raten von **46–96 %**. **Evidenz A** – aber die Übertragung auf Familiensoftware ist
**C**: andere Population, andere Einsatzhäufigkeit, andere Konsequenzen. Der Mechanismus
(Habituation bei hoher Frequenz) ist gut belegt, die konkrete Schwelle für diesen Kontext
nicht.

Ergänzend: Mark, Gudith & Klocke (2008) – unterbrochene Arbeit wird **schneller** erledigt,
aber mit signifikant mehr Stress, Frustration und Zeitdruck. **Evidenz B.** Das spricht gegen
Einzelzustellung und für Bündelung.

**Warum es heute nicht auffällt.** Der Demohaushalt erzeugt wenige Meldungen. Das Problem
erscheint erst bei realer Nutzung mit mehreren Bereichen und Regeln – also genau dann, wenn
die Anwendung anfängt zu tragen.

**Mental-Load-Bilanz.** Ohne Bündelung: jede Regel eine Unterbrechung. Mit Bündelung: eine
Unterbrechung mit mehreren Inhalten. Träger der Arbeit: das System.

**Empfehlung: hohe Priorität.** Kein neues Konzept – die Umsetzung eines bereits
entschiedenen.

---

### 🔴 R2 · Family-Administrator-Effekt

**Beobachtung.** Ein nutzbarer Haushalt in Thealotta verlangt: Bereiche anlegen, Baum ordnen,
Angaben definieren (Schlüssel, Datentyp, Frist, Kritikalität), Regeln einrichten,
Zuständigkeiten vergeben. Die Beispieldatei aus dem Import umfasst 21 Bereiche, 10 Angaben,
15 Regeln – das ist die Größenordnung eines echten Haushalts.

**Grundlage.** Neustaedter, Brush & Greenberg untersuchten 44 Familien und unterscheiden
**monozentrische**, **perizentrische** und **polyzentrische** Kalendernutzung. In
monozentrischen Haushalten führt eine Person den Kalender für alle. Neuere CSCW-Arbeiten
berichten, dass oft ein Partner – häufig die Mutter – den Großteil der Terminplanung
übernimmt. **Evidenz B.**

**Das Problem in einem Satz.** Wenn die Einrichtung des Systems selbst kognitive Hausarbeit
ist, dann verschiebt Thealotta die Arbeit, statt sie zu reduzieren – und zwar zu derselben Person,
die sie schon trägt.

**Verschärfend:** Die kürzlich gebaute Import-/Export-Funktion macht es *leichter*, dass eine
Person die Struktur kuratiert und die anderen sie übernehmen. Das ist bequem und
zentralisiert.

**Mögliche Gegenmaßnahmen (Hypothesen, nicht bauen).**
- Eine Kennzahl, die *nicht* zwischen Personen vergleicht, aber sichtbar macht, **wer das
  System pflegt** – Anlegen von Regeln, Beantworten von Fragen, Bestätigen von Angaben.
- Einrichtung als geteilte Handlung gestalten: Jede Person richtet ihre Bereiche selbst ein,
  statt dass eine alles vorbereitet.
- Ausdrücklich messen: Anteil der Objekte, die von der meistaktiven Person angelegt wurden.

**Gegenargument.** Eine solche Kennzahl kann selbst zum Kontrollwerkzeug werden – genau das,
was INV-P02 und INV-P03 verhindern sollen. Der Grat ist schmal.

**Empfehlung: hohe Priorität für Untersuchung**, nicht für sofortiges Bauen. Zuerst messen,
ob der Effekt eintritt.

---

### 🔴 R3 · Die Drei-Elemente-Grenze ist eine Wette, keine Evidenz

**Beobachtung.** Q-14 begrenzt „Jetzt relevant" hart auf drei Einträge (bei reduzierter
Kapazität auf einen). Begründung im Produkt: gegen Todo-Listen-Drift.

**Widersprüchliche Evidenz (§36).**

*Dafür:* Chernev, Böckenholt & Goodman (2015), 99 Beobachtungen: Choice Overload tritt auf
unter vier Bedingungen – hohe Komplexität des Auswahlsatzes, **schwierige Entscheidungsaufgabe**,
**Präferenzunsicherheit**, unklares Entscheidungsziel. Mehrere davon treffen auf „was mache
ich jetzt?" zu. **Evidenz A für die Moderatoren.**

*Dagegen:* Scheibehenne, Greifeneder & Todd (2010), 63 Bedingungen aus 50 Experimenten,
N = 5.036: mittlere Effektstärke **praktisch null**, große Streuung zwischen Studien.
**Evidenz A für die Nullaussage.**

*Mögliche Erklärung.* Choice Overload ist kein allgemeines Gesetz, sondern ein
bedingungsabhängiger Effekt. Die Bedingungen könnten hier vorliegen – belegt ist das nicht.

*Konsequenz für das Produkt.* Die Grenze darf gerne bleiben. Sie sollte im Produkt und in der
Dokumentation aber als **Designentscheidung** bezeichnet werden, nicht als wissenschaftlich
gestützt. Und sie ist ein guter Kandidat für einen eigenen Test.

**Empfehlung: beibehalten, aber Begründung korrigieren** – und als A/B-Kandidat vormerken.

---

### 🟡 H1 · Auslagern ist billig – das ist nicht nur gut

**Beobachtung.** Thealotta macht das Auslagern sehr leicht: Quick Capture, Regeln, Angaben.

**Grundlage.** Risko & Gilbert (2016): Die Neigung zum Auslagern hängt von metakognitiven
Einschätzungen der eigenen Fähigkeiten ab – und **diese Einschätzungen sind fehlerhaft**, was
zu suboptimalem Auslagern führt. Gilbert und Kollegen zeigen wiederholt: Menschen setzen
**mehr** Erinnerungen, als optimal wäre; die Neigung wird durch metakognitive
Unterschätzung des eigenen Gedächtnisses vorhergesagt, nicht durch die tatsächliche
Vergessenswahrscheinlichkeit. **Evidenz A/B.**

**Implikation, vorsichtig formuliert.** Ein System, das das Erfassen verbilligt, erhöht
möglicherweise die Menge des Erfassten stärker als den Nutzen. Die Frage „soll das überhaupt
ins System?" stellt Thealotta nirgends.

**Gegenargument.** In der Forschung geht es um Laboraufgaben mit klarem Optimum. Im Haushalt
gibt es kein Optimum, und das Auslagern hat einen zweiten Zweck: Es macht Arbeit **für andere
sichtbar**. Mehr zu erfassen kann also richtig sein, auch wenn es fürs eigene Gedächtnis
suboptimal wäre.

**Empfehlung: weiter untersuchen.** Kein Handlungsdruck.

---

### 🟡 H2 · Was, wenn das System ausfällt?

**Grundlage.** Ein wiederkehrender Befund der Offloading-Forschung: Starkes Vertrauen auf ein
externes System verändert das interne Erinnern. Für den Ausfallfall liegt weniger Evidenz vor,
als der Fragestellung angemessen wäre – **Evidenz C/D**.

**Beobachtung.** Thealottas Zuverlässigkeitsarchitektur (Outbox, keine automatischen
Terminalzustände, Restore-Tests) adressiert den Systemausfall. Nicht adressiert ist der
**Nutzerausfall**: Was, wenn jemand die App zwei Wochen nicht öffnet?

**Empfehlung: weiter untersuchen.**

---

### 🟢 Q1 · Regeln zeigen ihre eigene Verlässlichkeit nicht

**Beobachtung.** Eine Regel zeigt „Zuletzt geprüft: noch nie". Sie zeigt nicht, ob sie je
etwas gefunden hat, ob sie sinnvoll greift, oder ob ihre Schwelle passt.

**Grundlage.** Lee & See (2004): Kalibriertes Vertrauen braucht die **Prozess-** und
**Leistungs-**Dimension, nicht nur den Zweck. Ohne Rückmeldung über die Trefferqualität kann
ein Nutzer nicht lernen, wann er sich auf eine Regel verlassen kann. **Evidenz A**,
Übertragung **B**.

**Hypothese.** Je Regel eine knappe Bilanz: wie oft ausgelöst, wie oft daraufhin etwas getan
wurde, wie oft weggeklickt.

**Gegenargument.** Das ist wieder eine Kennzahl – und Kennzahlen laden zum Optimieren ein.
Sie darf sich auf keinen Fall auf Personen beziehen.

**Mental-Load-Bilanz.** Neu: nichts (System berechnet). Entfallend: das ungute Gefühl, nicht
zu wissen, ob die Regel taugt.

**Empfehlung: Prototyp testen.**

---

## 6 · UX-Empfehlungen

### 🟢 U1 · Meldungen bündeln statt einzeln zustellen
Siehe R1. Grundlage: Mark et al. (2008), Alert-Fatigue-Reviews.
**Empfehlung: hohe Priorität** (Umsetzung einer bestehenden Entscheidung).

### 🟡 U2 · Wiedererkennen statt Erinnern beim Anlegen einer Regel
Das Regelblatt verlangt die Wahl einer Regelart aus neun Möglichkeiten mit Modellnamen.
Grundlage: Recognition-vs-Recall ist ein etabliertes HCI-Prinzip, aber die konkrete
Übertragung ist **D**. **Empfehlung: Usability-Test**, keine Sofortmaßnahme.

### ⚪ U3 · Kapazität ordnet um, statt auszublenden — beibehalten
INV-007. Direkte Evidenz fehlt (**D**), die theoretische Begründung ist stark: Ausblenden
erzeugt Ungewissheit darüber, was man nicht sieht – und Ungewissheit ist selbst kognitive
Last. **Keine Änderung.**

---

## 7 · Visual-Design-Empfehlungen

Nach zwei Geometrie-Audits (`docs/56`, `docs/57`) ist das visuelle System konsistent. Aus der
Forschung ergibt sich hier **keine** vorrangige Empfehlung; die Gestaltprinzipien (Nähe,
gemeinsame Region) sind bereits umgesetzt und geprüft (Abstandsleiter §36 streng monoton).

Eine offene Frage: **Informationsdichte bei geringer Kapazität.** Thealotta verändert die
*Menge* der Einträge, nicht die *Dichte* der Darstellung. Ob eine luftigere Darstellung bei
reduzierter Kapazität hilft, ist mir nicht belegt bekannt – **keine ausreichende Evidenz
gefunden**. Nicht ändern.

---

## 8 · Risiken und Nebenwirkungen

| Risiko | Bewertung |
| --- | --- |
| **Family-Administrator-Effekt** | hoch, siehe R2 – das gravierendste |
| **Meldungsmüdigkeit** | mittel bis hoch bei realer Nutzung, siehe R1 |
| **Werkzeug wird selbst zur Last** | mittel – jede Angabe braucht Pflege; Fristen erzeugen Bestätigungsarbeit |
| **Überwachungsempfinden** | gering – INV-P02/P03 verhindern Rankings und Freitext-Push |
| **Automation Bias** | gering – Regeln schlagen vor, entscheiden nicht (Autonomiestufen) |
| **Schuldgefühle durch offene Aufgaben** | mittel – INV-001 lässt nichts verschwinden; das ist richtig, kann aber als Vorwurf gelesen werden |
| **Overreliance** | offen, siehe H2 |

**Zur Pflegearbeit im Besonderen:** Eine Angabe mit Frist erzeugt wiederkehrende
Bestätigungsarbeit. Bei 10 Angaben mit 7- bis 180-Tage-Fristen sind das über ein Jahr grob
50–100 Bestätigungen. Ob dieser Aufwand kleiner ist als das Daran-denken-Müssen, ist **die**
empirische Kernfrage des Produkts – und sie ist unbeantwortet.

---

## 9 · Opportunity Map

| Opportunity | Betroffener Mental Load | Evidenz | Impact | Risiko | Aufwand | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| R1 Bündelung + Ratenbegrenzung | Unterbrechung | A/C | hoch | gering | mittel | **hohe Priorität** |
| R2 Family-Administrator messen | Koordination, Pflege | B | hoch | mittel | mittel | **zuerst messen** |
| F1 Ereignisgebundene Regelart | Erinnern, Überwachen | A/B | hoch | mittel | hoch | Prototyp + Test |
| Q1 Regelbilanz | Vertrauen, Monitoring | A→B | mittel | mittel | gering | Prototyp |
| F2 Objekt für Optionenfindung | Planung, Entscheidung | C | mittel | mittel | hoch | Interviews |
| R3 Grenze von 3 prüfen | Entscheidung | A (widersprüchlich) | gering | gering | gering | A/B-Test |
| F3 Situationen statt Aufgaben | Erinnern | D | offen | hoch | sehr hoch | nur Forschung |

---

## 9b · Nach Umsetzbarkeit sortiert

Aufwand geschätzt am tatsächlichen Bestand, nicht nach Gefühl. „Bereit" heißt: Die
Produktentscheidung ist gefallen, es fehlt nur die Umsetzung. Wo das nicht so ist, ist ein
geringer Programmieraufwand **kein** Quick Win – dann wäre es nur schnell gebauter Zufall.

### Stufe 1 · Fertig entschieden, nur nicht gebaut

| # | Was | Aufwand | Warum billig | Bereit? |
| --- | --- | --- | --- | --- |
| 1 | **R3** Begründung der Drei-Elemente-Grenze richtigstellen | **sehr gering** – zwei Kommentare, ein Absatz in `docs` | Reine Textänderung; das Verhalten bleibt | ✅ die Evidenz ist eindeutig widersprüchlich |
| 2 | **R1a** Ratenbegrenzung im Zusteller (4/h, 12/Tag außer kritisch) | **gering** – eine Zählabfrage über `notification_deliveries` je Empfänger | Der Zusteller hat mit 216 Zeilen genau eine Stelle dafür | ✅ steht seit jeher in `docs/23` |
| 3 | **R1b** Staleness-Gate (älter als 6 h → in die Zusammenfassung) | **gering** – ein Vergleich auf `created_at` im selben Durchlauf | Kein neues Schema, kein neuer Job | ✅ ebenda |
| 4 | **R1c** Bündelung über `bundle_after` | **mittel** – Spalte existiert, Zustellpfad und Textbau fehlen | Schema ist da; die Arbeit liegt im Zusammenfassen mehrerer Meldungen | ✅ ebenda |

Stufe 1 ist zusammen genommen die Umsetzung einer Entscheidung, die dieses Projekt vor
langem getroffen und dokumentiert hat. Sie braucht keine Nutzerforschung – nur Code und
Tests.

### Stufe 2 · Billig zu messen, bevor irgendetwas gebaut wird

| # | Was | Aufwand | Warum jetzt |
| --- | --- | --- | --- |
| 5 | **R2-Messung** Pflegekonzentration sichtbar machen (intern, nicht im Produkt) | **gering bis mittel** – neun Tabellen führen `created_by`; `FamilyService.balance()` ist die Vorlage für genau diese Art Auswertung | Der schwerste Befund des Audits ist eine **Vermutung**. Eine Kennzahl im Hintergrund beantwortet sie, ohne dass eine Produktentscheidung nötig wird. |
| 6 | **Q1-Datenlage** Regelbilanz aus `signals` ableiten | **gering** – `signals` führt `monitor_id`, `detected_at`, `resolved_at`, `superseded_at` | Alles Nötige liegt schon vor. Erst rechnen, dann entscheiden, ob es ins Produkt gehört. |

Beides erzeugt **keine** sichtbare Änderung und kann deshalb ohne Diskussion über Gestaltung
passieren.

### Stufe 3 · Sichtbare Änderung, geringes Risiko

| # | Was | Aufwand | Vorbedingung |
| --- | --- | --- | --- |
| 7 | **Q1** Regelbilanz anzeigen | **gering** nach Stufe 2 | Usability-Test mit 6 Personen: wird sie als Auskunft oder als Bewertung gelesen? |
| 8 | **R3-Test** Grenze 3 gegen 7 | **gering** – ein Schalter, eine Messung | Definierte Metrik „Zeit bis zur ersten Handlung" |

### Stufe 4 · Erst forschen, dann bauen

| # | Was | Aufwand | Warum nicht früher |
| --- | --- | --- | --- |
| 9 | **F1** Ereignisgebundene Regelart | **hoch** – Vokabular, Auswerter, Formular, Migration | Stärkste Evidenz des Audits, **aber** die Übertragung auf software-vermittelte Wenn-Dann-Sätze ist ungetestet. Erst Prototyp. |
| 10 | **R2-Maßnahmen** gegen die Pflegekonzentration | **mittel bis hoch** | Setzt Stufe 2 voraus. Ohne Messung baut man gegen ein Phantom – und riskiert ein Kontrollwerkzeug. |
| 11 | **F2** Objekt für Optionenfindung | **hoch** – neues Objekt im Modell | Evidenz C. Erst Interviews. |
| 12 | **F3** Situationen statt Aufgaben auf der Startseite | **sehr hoch** | Evidenz D. Nur Forschung. |

### Was dabei nicht passieren darf

Die Reihenfolge oben ist nach **Umsetzbarkeit** sortiert, wie erbeten – nicht nach
Wichtigkeit. Nach Wichtigkeit stünde **R2** an erster Stelle, und der steht hier auf Platz 5
und 10. Ein Konzeptfehler wiegt schwerer als zehn kleine Verbesserungen (§38); die
Sortierung nach Aufwand darf ihn nicht nach hinten schieben.

## 9c · Umgesetzt (Stufen 1–3)

| # | Was | Ergebnis |
| --- | --- | --- |
| 1 | **R3** Begründung richtiggestellt | Der Kommentar an `nowLimitFor` nennt die Grenze jetzt eine **Produktwette** und die Meta-Analyse, die die naheliegende Begründung nicht trägt. Ebenso als Nachtrag in `docs/12` (Q-14). |
| 2 | **R1a** Ratenbegrenzung | 4 laute Zustellungen je Stunde, 12 je Tag – Kritisches geht immer durch. Gezählt werden **gesendete** Zustellungen, nicht angelegte. |
| 3 | **R1b** Staleness-Gate | Älter als 6 h: kein Push mehr, nur noch in der App – mit sichtbarem Grund an der Meldung. |
| 4 | **R1c** Bündelung | Eine Unterbrechung je Person und Durchlauf statt einer je Meldung; `bundle_after` wird endlich gelesen. |
| 5 | **R2-Messung** | `ops/scripts/pflegekonzentration.ts` – misst, wer **Struktur** anlegt, getrennt von Inhalt. Ohne Anzeige im Produkt. |
| 6/7 | **Q1** Regelbilanz | `MonitorService.statistik()` aus den Signalen; die Regelzeile sagt in Worten, was die Regel bisher bewirkt hat. |
| 8 | **R3-Schalter** | `THEALOTTA_NOW_LIMIT` verstellt die Obergrenze (1–20) für einen Vergleich 3 gegen 7. Bei wenig Kapazität bleibt es bei einer Sache. |

### Zwei Funde beim Bauen

**Für den Zusteller gab es keinen einzigen Test.** Das ist der Grund, warum drei der sechs
dokumentierten Maßnahmen nie gebaut wurden und es niemandem auffiel. Es gibt jetzt sechs.

**Welche Meldung den Push trägt, war zufällig.** Die Abfrage nach offenen Meldungen hatte
keine Sortierung – bei mehreren gleichzeitig entschied die Reihenfolge der Datenbank, wer
angetippt wird. Jetzt: das Dringendste zuerst, bei gleicher Dringlichkeit das Älteste. Ohne
Bündelung wäre das nie aufgefallen, weil vorher schlicht alle angetippt wurden.

### Erste Messung der Pflegekonzentration

Im Demohaushalt: **Struktur zu 100 % von einer Person** (monozentrisch). Das ist **kein
Befund über echte Nutzung** – der Haushalt wurde von einem Skript unter einem Namen angelegt.
Der Wert zeigt nur, dass das Messgerät funktioniert. Die Frage aus R2 bleibt offen, bis
echte Haushalte gemessen werden.

## 10 · Erfolgsmetriken (§41)

Engagement ist hier ein **Gegenindikator**: Eine gute Anwendung führt zu weniger Nutzung.
Vorschläge, jeweils mit Messbarkeit:

| Metrik | Messbar durch | Bezug zur Forschung |
| --- | --- | --- |
| Anteil erfüllter Vorsätze | Aufgaben, die vor Fristablauf erledigt wurden | Prospective-Memory-Erfolgsrate |
| Partner-Erinnerungen | Fragen mit `directedTo`, die eine Erinnerung sind | Kernindikator für Mental Load nach Daminger |
| Ungeklärte Zuständigkeit | Bereiche ohne wirksamen Zuständigen über Zeit | Ownership-Klarheit |
| Wiederholte Fragen | Fragen, deren Text sich einer beantworteten ähnelt | Externalisierung von Wissen |
| Pflegequote | Anteil Angaben, die überfällig bestätigt sind | „Wird das Werkzeug selbst zur Last?" |
| **Konzentration der Pflege** | Anteil der Objekte, die von der aktivsten Person stammen | **Family-Administrator-Effekt** |
| Zeit bis zur nächsten Handlung | von Öffnen bis erster Handlung | Suchaufwand |

Ausdrücklich **nicht**: App-Öffnungen, Sitzungsdauer, Anzahl erstellter Aufgaben.

---

## 11 · Validierungsplan

| Hypothese | Methode | Bestätigung sähe so aus | Widerlegung sähe so aus |
| --- | --- | --- | --- |
| R2 Family-Administrator | Tagebuchstudie, 5 Haushalte, 4 Wochen | Pflegekonzentration sinkt über Zeit; mehrere Personen legen Regeln an | > 80 % aller Objekte stammen dauerhaft von einer Person |
| R1 Bündelung | A/B über 4 Wochen | Weniger weggeklickte Meldungen bei gleicher Erledigungsrate | Erledigungsrate sinkt, weil Dringendes untergeht |
| F1 Ereignisregel | Prototyp, Within-Subject | Höhere Erledigungsrate für ereignis- vs. zeitgebundene Vorsätze | Kein Unterschied, oder Nutzer finden keinen passenden Anker |
| Q1 Regelbilanz | Usability-Test, 6 Personen | Nutzer schalten schlecht treffende Regeln ab statt sie zu ignorieren | Bilanz wird als Bewertung gelesen und erzeugt Unbehagen |
| R3 Grenze von 3 | A/B (3 vs. 7 Einträge) | Schnellere erste Handlung bei 3 | Kein Unterschied → Begründung streichen |
| Pflegeaufwand insgesamt | Feldstudie, 8 Wochen | Subjektiver Mental Load sinkt trotz Pflegeaufwand | Pflege wird als neue Last erlebt |

---

## 12 · Forschungsunsicherheiten

Wo ich **keine ausreichende Evidenz gefunden** habe:

- Ob Software-vermittelte Wenn-Dann-Vorsätze denselben Effekt haben wie selbst formulierte.
- Ob eine geringere Informationsdichte bei reduzierter kognitiver Kapazität hilft.
- Ob Aufgabenlisten oder Situationslisten auf einer Startseite besser funktionieren.
- Welche Meldungsfrequenz im Familienkontext zu Habituation führt (die klinischen Zahlen sind
  nicht übertragbar).
- Ob das Sichtbarmachen kognitiver Arbeit die Verteilung tatsächlich verändert – oder nur das
  Bewusstsein dafür.

---

## 13 · Quellenverzeichnis

1. **Daminger, A. (2019).** The Cognitive Dimension of Household Labor. *American Sociological
   Review*, 84(4), 609–633. DOI: 10.1177/0003122419859007 — Qualitativ, 70 Interviews mit 35
   Paaren (USA, überwiegend gebildete Doppelverdiener). Kognitive Hausarbeit als eigene
   Dimension mit vier Teilen; oft für beide Partner unsichtbar. **Evidenz B/C.**

2. **Risko, E. F., & Gilbert, S. J. (2016).** Cognitive Offloading. *Trends in Cognitive
   Sciences*, 20(9), 676–688. PMID: 27542527 — Review. Auslagerungsneigung folgt fehlerhaften
   metakognitiven Urteilen. **Evidenz A** (Review).

3. **Gollwitzer, P. M., & Sheeran, P. (2006).** Implementation Intentions and Goal Achievement:
   A Meta-Analysis of Effects and Processes. *Advances in Experimental Social Psychology*, 38,
   69–119 — Meta-Analyse, 94 Studien, N > 8.000, *d* = 0,65, robust gegen Publikationsbias.
   **Evidenz A.**

4. **McDaniel, M. A., & Einstein, G. O.** Multiprocess Framework der Prospective Memory; siehe
   auch Einstein & McDaniel (2005), *Current Directions in Psychological Science*, 14(6),
   286–290, DOI: 10.1111/j.0963-7214.2005.00382.x — Fokale Hinweisreize ermöglichen spontanen
   Abruf ohne aufmerksamkeitszehrendes Überwachen. **Evidenz B.**

5. **Neustaedter, C., Brush, A. J. B., & Greenberg, S. (2009).** The Calendar is Crucial:
   Coordination and Awareness through the Family Calendar. *ACM Transactions on
   Computer-Human Interaction*, 16(1) — Feldstudie, 44 Familien. Typologie monozentrisch /
   perizentrisch / polyzentrisch. **Evidenz B.**

6. **Mark, G., Gudith, D., & Klocke, U. (2008).** The Cost of Interrupted Work: More Speed and
   Stress. *CHI '08*, 107–110. DOI: 10.1145/1357054.1357072 — Experiment. Unterbrochene Arbeit
   wird schneller erledigt, aber mit mehr Stress, Frustration, Zeitdruck. **Evidenz B.**

7. **Scheibehenne, B., Greifeneder, R., & Todd, P. M. (2010).** Can There Ever Be Too Many
   Options? A Meta-Analytic Review of Choice Overload. *Journal of Consumer Research*, 37(3),
   409–425 — Meta-Analyse, 63 Bedingungen aus 50 Experimenten, N = 5.036. Mittlerer Effekt
   praktisch null. **Evidenz A.**

8. **Chernev, A., Böckenholt, U., & Goodman, J. (2015).** Choice Overload: A Conceptual Review
   and Meta-Analysis. *Journal of Consumer Psychology*, 25(2), 333–358 — Meta-Analyse, 99
   Beobachtungen. Vier Moderatoren. **Evidenz A**, widerspricht Quelle 7 teilweise.

9. **Lee, J. D., & See, K. A. (2004).** Trust in Automation: Designing for Appropriate
   Reliance. *Human Factors*, 46(1), 50–80. PMID: 15151155 — Konzeptioneller Review;
   Standardwerk. Kalibriertes Vertrauen über Zweck, Prozess, Leistung. **Evidenz A.**

10. **Poly-Ana / Übersicht Alert Fatigue:** *Appropriateness of Overridden Alerts in
    Computerized Physician Order Entry: Systematic Review.* JMIR Medical Informatics (2020),
    8(7):e15653 — Systematischer Review, 23 Artikel. Override-Raten 46,2–96,2 %.
    **Evidenz A**, Übertragung auf Familienkontext **C**.

11. **Demetriou, E. A., et al. (2018).** Autism spectrum disorders: a meta-analysis of
    executive function. *Molecular Psychiatry*, 23(5), 1198–1204 — Meta-Analysen, 235 Studien,
    N > 14.000. Moderate Effekte über EF-Domänen; Fragebogenmaße zeigen größere Unterschiede
    als Leistungstests; hohe Heterogenität. **Evidenz A**, aber ausdrücklich **keine**
    Ableitung universeller Gestaltungsregeln.

12. **Perceived Fairness:** Forschungsstrang zur Verteilungsgerechtigkeit im Haushalt (u. a.
    *Social Justice Research*; *Social Science Research*) — Wahrgenommene Fairness folgt nicht
    der Gleichverteilung; kein objektiver Vergleichsmaßstab. **Evidenz B.**

13. **Gilbert, S. J., u. a.** Arbeiten zu strategischem Erinnerungssetzen und
    Intention Offloading, u. a. *Journal of Experimental Psychology*, *Consciousness and
    Cognition*, *Quarterly Journal of Experimental Psychology* (2015–2025) — Menschen setzen
    mehr Erinnerungen als optimal; vorhergesagt durch metakognitive Unterschätzung.
    **Evidenz B.**
