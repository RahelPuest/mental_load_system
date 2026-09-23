# 40 – UX- und UI-Audit

Bestandsaufnahme der ausgelieferten Oberfläche (14 Seiten, 5.350 Zeilen) gegen die
Produktphilosophie aus §48 der Spezifikation und gegen gängige UX-Heuristiken.

**Bewertungsmaßstab:** Nicht „funktioniert es", sondern „würde ein erstklassiges Designteam das
so ausliefern".

---

## 1. Zusammenfassung

Die Anwendung ist funktional vollständig und fachlich sauber. Sie fühlt sich aber an wie eine
*Verwaltungsoberfläche für ein gutes Datenmodell* – nicht wie ein Produkt, das Last abnimmt.

Die drei schwerwiegendsten Befunde:

| # | Befund | Wirkung |
|---|---|---|
| **A** | **Die Oberfläche reicht die Modellkomplexität durch.** Sechs Reiter im Bereichsdetail, sechs in den Einstellungen, elf Abschnitte in der Jetzt-Ansicht. Der Nutzer navigiert die Datenstruktur statt seine Situation. | Überforderung genau bei den Menschen, für die das Produkt gebaut ist |
| **B** | **Quick Capture ist eine eigene Seite.** Etwas aus dem Kopf zu bekommen kostet einen Tabwechsel und einen Kontextverlust. | Verstößt gegen §1.8 (Low Friction) – die häufigste Aktion ist die umständlichste |
| **C** | **Alles ist eine Card.** Karte in Karte in Karte, überall Rahmen und Schatten. Es entsteht kein Rhythmus, keine Hierarchie, keine Ruhe. | Das Gegenteil des angestrebten Gefühls („Das System hat den Überblick") |

---

## 2. UX-Audit nach Heuristiken

### 2.1 Visibility of System Status — **mittel**

| ✓ | Die Jetzt-Ansicht erklärt jeden Eintrag mit `why`-Faktoren. Das ist die Stärke des Produkts. |
| ✗ | Ladezustände sind eine 2-px-Linie. Der Nutzer sieht nicht, *was* geladen wird. |
| ✗ | Nach einer Aktion (Aufgabe erledigt, Hinweis weggeklickt) gibt es keine Rückmeldung – die Liste springt nur. |
| ✗ | Offline-Zustand nur als schmales Band ganz oben; auf langen Seiten unsichtbar. |

### 2.2 Match Between System and Real World — **gut, mit Lücken**

| ✓ | Modellbegriffe (Signal, Attention Item, Domain) tauchen konsequent nicht auf. |
| ✗ | „Bereich" ist trotzdem abstrakt. Nutzer denken in „Kind A", „Wäsche", „Auto". |
| ✗ | Monitoring-Regeln werden als Auswahl technischer Regeltypen konfiguriert, nicht in natürlicher Sprache (§12 des Auftrags). |
| ✗ | Der Reiter „Beobachtung" heißt fachlich richtig, sagt aber nicht, was er tut. |

### 2.3 User Control and Freedom — **schwach**

| ✗ | **Kein Undo.** „Erledigt" ist sofort endgültig sichtbar; das Zurücknehmen erfordert Wissen darüber, dass es geht. |
| ✗ | Keine Bestätigung bei „Passt bei uns nicht" – schaltet dauerhaft eine Regel ab, ohne Warnung. |
| ✗ | Kein Weg zurück aus einer Detailseite außer dem Browser-Zurück oder einem kleinen Textlink. |

### 2.4 Consistency and Standards — **schwach**

Dokumentierte Inkonsistenzen:

- Drei verschiedene Button-Größen ohne System (`tiny`, Standard, in Karten).
- Chips mal als Status, mal als Filter, mal als Auswahlschalter – gleiche Optik, drei Bedeutungen.
- Abschnittsüberschriften mal als `.block > h2` (Versalien, klein), mal als `.page-title`.
- Formulare mal in `.card flat`, mal direkt auf der Seite.
- Aktionen mal unter der Karte, mal rechts oben, mal beides.
- Zwei Muster für Auswahl: `<select>` und Chip-Gruppen mit `aria-pressed`.

### 2.5 Error Prevention — **mittel**

| ✓ | Löschbestätigung per Namenseingabe. Gut. |
| ✗ | „Passt bei uns nicht" ist einen Klick entfernt und irreversibel wirksam. |
| ✗ | Rollenwechsel per `<select>` – ein Fehlgriff ändert sofort Rechte. |
| ✗ | Keine Vorschau, was ein Rollenwechsel konkret bedeutet. |

### 2.6 Recognition Rather Than Recall — **schwach**

| ✗ | Kontextschalter („zuhause", „Kind A anwesend") stehen nur in der Jetzt-Ansicht. Wer sie woanders braucht, muss zurück. |
| ✗ | Keine globale Suche. Wer weiß, dass irgendwo „Marke X passt gut" steht, muss den Bereich erraten. |
| ✗ | Keine Command Palette auf Desktop. |
| ✗ | Bereichspfade werden als `kinder / kind_a / kleidung` gezeigt – technische Slugs statt Namen. |

### 2.7 Flexibility and Efficiency — **schwach**

| ✗ | Keine Tastaturkürzel. |
| ✗ | Quick Capture nur über Tabwechsel. |
| ✗ | Keine Swipe-Aktionen auf Mobile. |
| ✗ | Aufgabe erledigen erfordert Scrollen zur Karte, dann Klick auf einen von vier gleich aussehenden Buttons. |

### 2.8 Aesthetic and Minimalist Design — **schwach**

| ✗ | Die Jetzt-Ansicht zeigt bis zu sechs Abschnitte gleichzeitig, jeder mit Zähler. |
| ✗ | Jede Karte trägt bis zu sechs Chips – Verantwortung, Ausführung, Dauer, Energie, fehlender Kontext. |
| ✗ | Die `why`-Liste zeigt *alle* Faktoren, auch negative („Voraussetzung fehlt: −40"). Erklärbarkeit wird zu Rauschen. |
| ✗ | Kein Weißraum-Rhythmus: alles hat denselben Abstand. |

### 2.9 Help and Documentation — **gut**

| ✓ | Erklärtexte an den richtigen Stellen (Einstellungen, Kapazität, Konflikt). |
| ✗ | Aber: als graue Fließtextabsätze, die man überliest. |

---

## 3. Produktspezifische Heuristiken

### 3.1 Cognitive Load — **kritisch**

Die Jetzt-Ansicht ist der Kern des Produkts und zeigt im Demo-Datenbestand:
Kontextschalter (7 Buttons) + Kapazitätshinweis + „Jetzt relevant" (3 Karten à ~5 Zeilen `why`)
+ „Kann ich jetzt erledigen" + „Braucht Klärung" (4 Einträge) + „Wartet" + „Demnächst"
+ „Geht auch mit wenig Energie".

Das sind über 20 Entscheidungsangebote auf einem Screen – bei einem Produkt, dessen erklärtes
Ziel Entlastung bei eingeschränkter exekutiver Kapazität ist.

### 3.2 Ownership-Klarheit — **mittel**

| ✓ | Verantwortung und Ausführung sind getrennt sichtbar. Fachlich korrekt. |
| ✗ | Beides als gleich aussehender Chip – der wichtige Unterschied ist visuell nicht kodiert. |
| ✗ | Die fünf Zuweisungsarten (Primary, Secondary, Shared, Support, Observer) sind in der Oberfläche gar nicht unterscheidbar; es gibt nur „übernehmen" und „übergeben". |

### 3.3 No-Shame — **gut**

| ✓ | Sprache durchgehend sachlich. Keine Streaks, keine Scores, kein Rot als Dauerzustand. |
| ✗ | Aber: die Zähler an jedem Abschnitt („Braucht Klärung 4") wirken wie ein Rückstandsanzeiger. |

### 3.4 Low-Capacity-Modus — **mittel**

| ✓ | Begrenzung auf einen Eintrag funktioniert und ist erklärt. |
| ✗ | Der Rest der Oberfläche wird nicht ruhiger: gleiche Dichte, gleiche Zähler, gleiche Chips. Es fühlt sich an wie „Funktionen weggenommen", nicht wie „die App wird leiser". |

### 3.5 Trust und Erklärbarkeit — **gut**

| ✓ | Der stärkste Teil. Jede Empfehlung nennt ihren Grund im Klartext. |
| ✗ | Wird durch Vollständigkeit entwertet: fünf Faktoren pro Eintrag liest niemand. |

### 3.6 Privacy-UX — **schwach**

| ✗ | Sensitivity ist im Datenmodell zentral, in der Oberfläche unsichtbar. Nirgends steht, wer etwas sehen kann. |
| ✗ | Berechtigungen sind gar nicht bedienbar – die Grant-API existiert, die Oberfläche nicht. |
| ✗ | Der Kalender-Share-Level ist die einzige sichtbare Sichtbarkeitseinstellung. |

---

## 4. UI-Audit

### 4.1 Farbe

| Befund | Bewertung |
|---|---|
| Nur ein Akzent (Tannengrün) + Bernstein + Blaugrau | Zu wenig für semantische Unterscheidung: Erfolg, Warnung, Kritisch, Info sind nicht getrennt |
| Keine Neutralskala – nur `--text`, `--text-muted`, `--text-subtle` | Zu grob für abgestufte Hierarchie |
| Rot existiert nur für „danger"-Buttons | Richtig zurückhaltend, aber ohne definierten kritischen Zustand |
| Flächen: 4 Stufen ohne klares Elevationsmodell | Karten auf Karten wirken flach |

### 4.2 Typografie

| Befund | Bewertung |
|---|---|
| 6 Größen, aber ohne benannte Rollen | Keine Hierarchie zum Wiederverwenden |
| Abschnittsüberschriften: 0.78 rem, Versalien, `letter-spacing: 0.07em` | Zu klein und zu dekorativ für die wichtigste Gliederungsebene |
| Kartentitel 1.04 rem vs. Body 0.9 rem | Zu geringer Sprung – nichts hebt sich ab |
| Keine Display-Stufe | Der Einstieg wirkt beliebig |

### 4.3 Abstände

Werte `6/10/16/24/36/56` sind eine brauchbare Skala, werden aber kaum genutzt:
Fast alles verwendet `--step-2` oder `--step-3`. Es entsteht kein Rhythmus.

### 4.4 Komponenten

| Komponente | Befund |
|---|---|
| Card | Überall eingesetzt, auch für Formulare und einzelne Werte. Verliert Bedeutung. |
| Chip | Drei Bedeutungen, eine Optik. |
| Button | `tiny`/Standard, `primary`/`quiet`/`danger` – aber mehrere Primary nebeneinander (Attention-Karte hat vier gleichrangige Aktionen). |
| Empty State | Vorhanden, aber ohne Primary Action. |
| Loading | Nur Sweep-Linie, keine Skeletons. |
| Error | Nur ein Textkasten mit „Nochmal versuchen". |
| Toast/Undo | Fehlt vollständig. |
| Modal/Sheet | Fehlt vollständig – alles inline, was Seiten aufbläht. |
| Tabelle | Fehlt (gut – wird nicht gebraucht). |

### 4.5 Responsive

| Breakpoint | Befund |
|---|---|
| Mobile | Bottom-Tabs korrekt, Trefferflächen ok. Aber: kein FAB, keine Sheets, keine Swipes. |
| Desktop (> 860 px) | Die Tabs werden zu einer *oberen* Leiste, der Inhalt bleibt in 760 px Spalte. Der ganze Bildschirm bleibt leer. Kein Master-Detail, kein Kontextpanel. |
| Tablet | Nicht bedacht. |

---

## 5. Priorisierte Befundliste

Legende — **UX** = Nutzungswirkung · **VIS** = visuelle Wirkung · **A11Y** = Barrierefreiheit · **E** = Aufwand (S/M/L)

### Critical

| # | Befund | UX | VIS | A11Y | E |
|---|---|:--:|:--:|:--:|:--:|
| C1 | Jetzt-Ansicht überfordert: 6 Abschnitte, alle Faktoren, alle Chips gleichzeitig | ●●● | ●●● | ●● | M |
| C2 | Quick Capture nicht global erreichbar | ●●● | ● | ● | S |
| C3 | Kein Undo bei erledigten Aufgaben und weggeklickten Hinweisen | ●●● | – | ● | M |
| C4 | Desktop verschenkt den gesamten Bildschirm; keine eigene IA | ●●● | ●●● | – | L |
| C5 | Keine globale Suche – Wissen ist faktisch nur über den richtigen Bereich auffindbar | ●●● | – | ● | M |
| C6 | Berechtigungen und Sichtbarkeit sind nicht bedienbar, obwohl fachlich zentral | ●●● | ● | ● | M |

### High

| # | Befund | UX | VIS | A11Y | E |
|---|---|:--:|:--:|:--:|:--:|
| H1 | Card-in-Card, kein Weißraumrhythmus, keine Elevation | ●● | ●●● | – | M |
| H2 | Semantische Farben fehlen (Erfolg/Warnung/Kritisch/Info nicht getrennt) | ●● | ●●● | ●● | S |
| H3 | Typografische Hierarchie zu flach; Abschnittsüberschriften zu schwach | ●● | ●●● | ● | S |
| H4 | Vier gleichrangige Aktionen auf Attention-Karten | ●●● | ●● | ● | S |
| H5 | Ownership-Arten visuell nicht unterscheidbar | ●● | ●● | ● | M |
| H6 | Monitoring-Regeln als technische Auswahl statt natürlicher Sprache | ●●● | ● | – | M |
| H7 | Keine Skeletons – Ladezustand nicht nachvollziehbar | ●● | ●● | ● | S |
| H8 | Low-Capacity-Modus macht nur die Jetzt-Ansicht kürzer, nicht die App ruhiger | ●●● | ●● | ● | M |
| H9 | Bereichspfade zeigen technische Slugs | ● | ●● | – | S |
| H10 | Keine Tastaturkürzel, keine Command Palette | ●● | – | ●● | M |

### Medium

| # | Befund | UX | VIS | A11Y | E |
|---|---|:--:|:--:|:--:|:--:|
| M1 | Chips mit drei Bedeutungen bei gleicher Optik | ● | ●● | ●● | S |
| M2 | Empty States ohne Primary Action | ●● | ● | – | S |
| M3 | Kein Zurück-Muster; nur Textlink | ●● | ● | ● | S |
| M4 | Zähler an Abschnitten wirken wie Rückstandsanzeige | ●● | ● | – | S |
| M5 | Kontextschalter nur in der Jetzt-Ansicht | ●● | – | – | S |
| M6 | Formulare immer vollständig sichtbar statt progressiv | ● | ●● | – | M |
| M7 | Keine Sheets auf Mobile – alles wächst inline | ● | ●● | ● | M |
| M8 | Fehlermeldungen zeigen technische Texte durch (`409 …`) | ●● | ● | ● | S |

### Low

| # | Befund |
|---|---|
| L1 | Icons als Unicode-Glyphen – uneinheitliche Strichstärken |
| L2 | Keine Motion für Zustandswechsel |
| L3 | Kein Tablet-Breakpoint |
| L4 | `title`-Attribut als einzige Erklärung bei Inbox-Zieltypen (auf Touch unsichtbar) |

---

## 6. Was erhalten bleibt

Nicht alles muss ersetzt werden. Bewusst behalten:

- **Die `why`-Begründungen.** Das ist das Alleinstellungsmerkmal. Sie werden nur kuratiert
  statt vollständig gezeigt.
- **Die sachliche Sprache.** Durchgehend richtig getroffen.
- **Die Trennung Verantwortung / Ausführung.** Wird visuell verstärkt, nicht verändert.
- **Die harte Begrenzung der Jetzt-Ansicht.** Bleibt, wird aber besser inszeniert.
- **Die Erklärtexte in den Einstellungen.** Werden nur besser platziert.
