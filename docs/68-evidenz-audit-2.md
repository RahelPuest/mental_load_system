# 68 – Evidenzaudit II: was nach docs/60 dazugekommen ist

**Status: Audit abgeschlossen, drei Punkte umgesetzt** (siehe *Umgesetzt* weiter unten). Der
Bericht selbst entstand ohne jede Änderung am Produkt; gebaut wurde erst nach Freigabe, und nur
das, was keine weitere Entscheidung brauchte.

Der vollständige Bericht mit Evidenzgraden, Gegenargumenten und Validierungsplan
lag als eigenes Dokument vor; er ist nicht Teil dieses Repositorys.

## Zuschnitt

`docs/60` ist ein 639-Zeilen-Evidenzaudit mit dreizehn geprüften Quellen. Er deckt
Implementation Intentions, Prospective Memory, Cognitive Offloading, Familienkalender/CSCW,
Alert Fatigue, Choice Overload, wahrgenommene Fairness, Vertrauen in Automation, ADHS und
Autismus ab. **Diese Felder rollt dieser Durchgang nicht neu auf.**

Geprüft wird, was seither entstanden ist und nie gegen Forschung gespiegelt wurde:

- die **Essensplanung** (`docs/63`) – eigenes Datenmodell, Vorschlagsalgorithmus, rund 2.500
  Zeilen Oberfläche,
- der Umbau des **Bereichskopfs** (`docs/61`) und das **Entfernen von Aufgaben** (`docs/62`),
- die vollständig neue **Gestaltsprache** (`docs/66`, `docs/67`).

Dazu die Forschungsfelder, die der erste Durchgang offenließ: Gewohnheitsbildung,
Fehlertoleranz, verringerte Kapazität, Informationsduft, visuelle Komplexität, geteilte
mentale Modelle.

**Neun Quellen wurden in dieser Sitzung gegen die Publikation geprüft.** Eine Autorenangabe
war zunächst falsch geraten und wurde bei der Prüfung korrigiert.

## Die neun Befunde

| # | Befund | Evidenz | Marker |
| --- | --- | --- | --- |
| E1 | **Die Essensplanung hat keine Evidenzgrundlage.** Zur Wirkung digitaler Essensplanung auf Planungslast fand ich keine kontrollierte Untersuchung; die peer-reviewte Literatur misst Ernährungsqualität | keine gefunden | 🟡 |
| E2 | **Die Gerichtesammlung ist die pflegeintensivste Struktur des Produkts.** Der Nutzen wächst proportional zur Pflege – der Family-Administrator-Effekt hat eine neue, größere Angriffsfläche | B | 🔴 |
| E3 | **Entscheidungsmüdigkeit trägt nicht** (*d* = 0,04 in der vorregistrierten Multilab-Replikation). Thealotta beruft sich nirgends darauf – eine Stärke, die man kennen sollte | A | ⚪ |
| E4 | **Drei Navigationspunkte ohne Informationsduft:** *Vorgänge*, *Abläufe*, *Regeln*. Die Erklärungen stehen im `title`-Attribut, auf dem Telefon gar nicht | B | 🟢 |
| E5 | **Die neue Gestalt senkt visuelle Komplexität – dafür gibt es Evidenz. Die Serife ist davon unabhängig** und nicht durch Lesbarkeitsforschung gedeckt | B | ⚪ |
| E6 | **Gewohnheiten brauchen 18–254 Tage.** Die Wochenplanung setzt eine wöchentliche Nutzergewohnheit voraus und hat keine Systemseite | A | 🔵 |
| E7 | **Eine zerstörende Handlung ohne Rückgängig** – der neue Löschknopf im Wochenplan, obwohl das Designsystem Undo-Toasts kennt | D | 🟢 |
| E8 | **Depression trifft Planung am stärksten** (*d* bis 0,91) und teilweise über die Remission hinaus. Stützt „Zustand vor Aufgabe"; stellt ein Kapazitätsmodell in Frage, das nur „heute" kennt | A | 🔵 |
| E9 | **Geteilte mentale Modelle erklären ~14–18 % der Varianz** – in Arbeitsteams. Familien sind keine Arbeitsteams. Die Kernthese bleibt eine Wette | A, Übertragung C | 🟡 |

## Mental-Load-Bilanz der Essensplanung (§43)

| | |
| --- | --- |
| **Arbeit vorher** | Jede Woche neu überlegen, gegen Vorräte/Termine/Vorlieben prüfen, Einkaufszettel bauen |
| **Neue Arbeit durch das System** | Gerichtesammlung anlegen und pflegen; Zutaten mit Menge und Einheit; Tags; Eignung; Tagesregeln; Bewertungen je Person |
| **Entfallende Arbeit** | Wöchentliche Auswahl; Zusammenstellen des Einkaufszettels; Erinnern an „lange nicht gehabt" |
| **Verbleibende Arbeit** | Einkaufen, kochen, Plan nachführen |
| **Wer trägt sie** | Die neue Arbeit fällt **fast vollständig bei einer Person** an; der Nutzen verteilt sich auf alle. Genau die Asymmetrie, gegen die das Produkt antritt |

**Die Frage aus §44:** Kann das System ohne dauerhafte Verwaltung durch eine Person
funktionieren? Für Bereiche, Regeln und Wissen: vermutlich ja, aber ungemessen. **Für die
Essensplanung nach heutigem Stand nein** – ohne gepflegte Sammlung liefert sie nichts, und
diese Pflege ist nicht teilbar gestaltet.

## Vorschläge

Alle im vollständigen Bericht im geforderten Format (Beobachtung, Problem, Grundlage,
Evidenzstärke, Übertragbarkeit, Hypothese, Nutzen, Risiken, Mental-Load-Wirkung, Betroffene,
Validierungsbedarf, Empfehlung).

| # | Kategorie | Vorschlag | Empfehlung |
| --- | --- | --- | --- |
| A1 | fundamental | Die Essensplanung muss ohne Pflege einen Nutzen haben | **zuerst messen** |
| A2 | fundamental | Kapazität ist kein Tagesdatum | nur Interviews, nicht bauen |
| A3 | fundamental | Regelart „Ablauf ausgeblieben" | Prototyp mit *einem* Ablauf |
| B1 | UX | Beschriftungen *Vorgänge / Abläufe / Regeln* testen | Baumtest vor jeder Änderung |
| B2 | UX | Rückgängig beim Entfernen im Wochenplan | hohe Priorität |
| B3 | UX | Festgehaltene Plätze im Gitter sichtbar machen | erst Nutzung messen |
| C1 | visuell | Begründung der Serife richtigstellen | beibehalten, Akte korrigieren |

**A2 und A3 tragen beide eine ernste Warnung:** Sie sind einen Schritt von „das System
beobachtet uns" entfernt. Keiner von beiden sollte gebaut werden, ohne dass Menschen dazu
befragt wurden.

## Was zuerst gemessen werden sollte

Drei Messungen, alle mit vorhandenen Mitteln, keine sichtbare Änderung:

1. **Pflegekonzentration in der Essensplanung** – `ops/scripts/pflegekonzentration.ts` um
   Gerichte, Zutaten und Bewertungen je `created_by` erweitern. Stützt A1, wenn über 80 % von
   einer Person stammen; widerlegt es, wenn sich die Pflege wie die Nutzung verteilt.
2. **Nutzung des Festhaltens** – Anteil der Plätze mit `locked = true`. Kommt es praktisch
   nicht vor, gehört das Merkmal auf den Prüfstand, nicht seine Anzeige.
3. **Baumtest der Navigation** – sechs bis acht Personen, vier Suchaufgaben, ungemoderiert.

Ergänzung zu den Erfolgsmetriken aus `docs/60 §10`: *Anteil der Wochen, die geplant wurden,
ohne dass jemand daran erinnert werden musste.*

## Umgesetzt

Nach Freigabe wurde umgesetzt, was **ohne weitere Entscheidung reif** war. Die übrigen
Vorschläge bleiben ausdrücklich liegen – sie setzen Messung, Interviews oder einen Nutzertest
voraus, und sie jetzt zu bauen hieße, gegen den eigenen Bericht zu handeln.

| # | Was | Ergebnis |
| --- | --- | --- |
| **Messung 1+2** | `ops/scripts/pflegekonzentration.ts` erweitert | Gerichte zählen jetzt als **Struktur** (nicht als Inhalt); dazu drei neue Zahlen: Zutatentiefe je Autor, Bewertungen je Person, Anteil festgehaltener Plätze. Nichts davon erscheint im Produkt |
| **B2** | Rückgängig beim Entfernen im Wochenplan | Undo-Toast wie beim Abhaken (§57). Stellt Gericht, Portionen, Notiz und Festhalten wieder her; die Herkunft nicht – ein zurückgeholter Platz gilt als von Hand geplant und wird beim nächsten „neu vorschlagen" nicht wieder ausgetauscht |
| **C1** | Begründung der Serife | `docs/67` sagt jetzt ausdrücklich, dass die Serife eine Identitäts- und keine Lesbarkeitsentscheidung ist, mit Quelle und der Einschränkung, dass die Studien zusammenhängendes Lesen messen |

Ein Test kam hinzu: *„ein versehentlich entferntes Gericht kommt zurück"* prüft auch, dass
die Portionsangabe das Zurückholen überlebt. Kein Test wurde abgeschwächt.

### Was die erste Messung ergab

Im Demohaushalt: Struktur zu 100 % von einer Person, Zutaten zu 100 % von derselben,
**Meinungen: nichts vorhanden**, **Festhalten: 0 von 10 Plätzen**.

Das ist **kein Befund über echte Nutzung** – der Haushalt wurde von einem Skript unter einem
Namen angelegt. Zwei Dinge sind trotzdem bemerkenswert und betreffen den Demobestand selbst:

- Die Vorschläge gewichten nach Meinung (lieben +2 … lieber nicht −3). Im Demobestand gibt es
  **keine einzige Bewertung** – die Gewichtung, die das Bewertungsmodell rechtfertigt, läuft
  dort also leer.
- Festhalten wird nie benutzt. Für B3 heißt das: Die Frage bleibt offen, aber es gibt keinen
  Anlass, die Anzeige zu reparieren, bevor jemand das Merkmal überhaupt benutzt.

### Was ausdrücklich nicht gebaut wurde

**A1** (Nutzen ohne Pflege) wartet auf echte Messdaten – das Messgerät steht jetzt.
**A2** (Kapazität über den Tag hinaus) und **A3** (Regelart „Ablauf ausgeblieben") sind beide
einen Schritt von „das System beobachtet uns" entfernt und brauchen zuerst Gespräche mit
Menschen. **B1** (Navigationsbeschriftungen) braucht einen Baumtest, keine Meinung.
**B3** braucht Nutzungsdaten, die es noch nicht gibt.

## Widersprüchliche Evidenz (§36)

**Reduzieren oder zeigen?** Für Reduktion spricht die Evidenz zu visueller Komplexität; dagegen
die Regel, dass Wiedererkennen günstiger ist als Abruf. *Auflösung:* Die Befunde reden über
Verschiedenes – „Komplexität" meint Zierat, nicht Informationsgehalt. Die Regel lautet
**weniger Zierat bei gleichem Informationsgehalt**, nicht „weniger zeigen".

**Umkehrbarkeit.** Dafür die etablierte Heuristik; dagegen eine CHI-Arbeit von 2023, die
Irreversibilität als Strategie vorschlägt – allerdings an *physischen* Rechensystemen. Als
Einwand gegen einen Undo-Toast trägt sie wenig.

## Forschungsunsicherheiten

- Ob digitale Essensplanung Planungslast senkt (keine kontrollierte Untersuchung gefunden).
- Ob Serife oder Grotesk beim **Überfliegen kurzer Namen** unterschiedlich abschneiden – die
  Studien messen zusammenhängendes Lesen längerer Texte.
- Wie sich Gewohnheitsbildung verhält, wenn ein Ablauf von mehreren getragen wird.
- Ob Befunde zu geteilten mentalen Modellen aus Arbeitsteams auf Familien übertragbar sind.
- Die fünf Unsicherheiten aus `docs/60 §12` sind **unverändert offen**.

## Neu geprüfte Quellen

1. **Hagger et al. (2016).** A Multilab Preregistered Replication of the Ego-Depletion Effect.
   *Perspectives on Psychological Science*, 11(4), 546–573. DOI: 10.1177/1745691616652873 —
   23 Labore, N > 2.000, *d* ≈ 0,04. **A**
2. **Carter & McCullough (2014).** Publication bias and the limited strength model of
   self-control. *Frontiers in Psychology*, 5:823. DOI: 10.3389/fpsyg.2014.00823 — Nach
   Bias-Korrektur nicht von null unterscheidbar. Gegenrede: Inzlicht u. a. halten
   Bias-Korrektur allein für nicht entscheidungsfähig. **A**
3. **Lally et al. (2010).** How are habits formed. *European Journal of Social Psychology*,
   40(6), 998–1009. DOI: 10.1002/ejsp.674 — N = 96, 12 Wochen, 18–254 Tage. **A**
4. **Rock, Roiser, Riedel & Blackwell (2014).** Cognitive impairment in depression.
   *Psychological Medicine*, 44(10), 2029–2040. DOI: 10.1017/S0033291713002535 —
   *d* = −0,34 bis −0,65. **A**
5. **Tuch et al. (2009).** Visual complexity of websites. *International Journal of
   Human-Computer Studies*, 67(9), 703–715. DOI: 10.1016/j.ijhcs.2009.04.002 — **B**
6. **Millhagen, Schmidt, Metz, Feser & Retelsdorf (2026).** Just the font types?
   *Behaviour & Information Technology*. DOI: 10.1080/0144929X.2026.2678378 — N = 132, keine
   Wechselwirkung zwischen Medium und Schriftart. **B** *(Volltext hinter Bezahlschranke; die
   Richtung eines etwaigen Haupteffekts der Schriftart konnte ich nicht verifizieren.)*
7. **Pirolli & Card (1999).** Information Foraging. *Psychological Review*, 106(4), 643–675.
   DOI: 10.1037/0033-295X.106.4.643 — **B**
8. **DeChurch & Mesmer-Magnus (2010).** The cognitive underpinnings of effective teamwork.
   *Journal of Applied Psychology*, 95(1), 32–53. DOI: 10.1037/a0017328 — 65 Studien,
   N = 3.738. **A**, Übertragung auf Familien **C**
9. **Rossmy, Terzimehić, Döring, Buschek & Wiethoff (2023).** Point of no Undo. *CHI '23*.
   DOI: 10.1145/3544548.3581433 — Gegenposition, Gegenstand sind physische Systeme. **D**

**Nicht verwendet:** Die kursierenden Zahlen zur Essensplanung („82 % der Familien haben eine
zuständige Person", „37 Minuten täglich") stammen aus Anbieterumfragen und erfüllen §34 nicht.
