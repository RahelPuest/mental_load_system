# 53 · Zweiter vollständiger Audit

Zweiter Durchlauf über die gesamte Anwendung. Der erste (`docs/52-audit.md`) prüfte vor allem
Informationsarchitektur und Oberfläche. Dieser geht zuerst in die Logik: Was zeigt die
Anwendung, wann, wem – und stimmt das.

Alle Zahlen sind gemessen, nicht geschätzt: Antworten der laufenden Anwendung gegen die
Demodaten, gelesen im echten Browser.

## Zusammenfassung

Der schwerste Befund liegt genau dort, wo das Produktversprechen liegt. `/jetzt` beantwortet
die Frage „was verdient gerade Aufmerksamkeit" mit einer Liste, in der **neun von zehn
Einträgen gar nicht bearbeitbar sind** – sie hängen an unerfüllten Vorbedingungen. Die
einzige wirklich machbare Aufgabe aus einem kritischen Bereich steht auf Platz zehn.

Die Anwendung weiß es besser: `nextActions()` in der Domänenschicht rechnet Abhängigkeiten
und Zurückstellungen korrekt heraus, und `/vorgaenge` zeigt damit richtig „Als Nächstes: Füße
messen". Die Now-Ansicht ruft diese Funktion nicht auf.

Der zweite Befundblock betrifft die Auszeit. Sie wirkt auf Benachrichtigungen, aber nicht auf
das, was die Anwendung zeigt – und sie hat kein Ende: Wer pausiert, muss selbst daran denken,
sich wieder zurückzuschalten. Das ist die Art von Merkarbeit, die diese Anwendung abnehmen soll.

| ID | Bereich | Priorität | Stand |
| --- | --- | --- | --- |
| K1 | Blockierte Aufgaben gelten als sofort machbar | **Kritisch** | **behoben** |
| K2 | Zurückgestellte Aufgaben ebenso – und doppelt gezeigt | **Kritisch** | **behoben** |
| H1 | Auszeit wirkt auf Push, nicht auf die Ansicht | **Hoch** | **behoben** |
| H2 | Auszeit hat kein Ende | **Hoch** | **behoben** |
| H3 | „Wo niemand mitdenkt" kennt nur einen Ausweg: selbst übernehmen | **Hoch** | **behoben** |
| H4 | Niemand kann einen Haushalt verlassen | **Hoch** | **behoben** (Variante B) |
| M1 | Modellvokabular in servergeschriebenen Texten | Mittel | **behoben** |
| M2 | „Geht auch mit wenig Energie" wiederholt nur | Mittel | **behoben** |
| M3 | „Sonst noch offen · 13" macht `/jetzt` doch zur Todo-Liste | Mittel | **behoben** (13 → 9, und die neun warten wirklich) |
| M4 | `/vorgaenge` und `/ablaeufe` zeigen dieselbe Sache | Mittel | offen – hängt an derselben Frage wie M6 |
| M5 | `/wissen` öffnet auf dem einzigen leeren Reiter | Mittel | **behoben** |
| M6 | `/uebersicht` ist eine zweite Navigation | Mittel | offen – Entscheidung nötig |
| M7 | Quick Capture liest kein Datum aus dem Text | Mittel | **behoben** |
| N1 | Kleinigkeiten | Niedrig | **behoben** |

### Was die Behebung gebracht hat

Gemessen an denselben Demodaten, `GET /now`:

| | vorher | nachher |
| --- | --- | --- |
| „Jetzt relevant" davon blockiert | 2 von 3 | **0 von 3** |
| „Kann ich jetzt erledigen" davon blockiert | 9 von 10 | **0 von 1** |
| „Wartet" | 0 | **9**, jeder mit dem Vorgänger als Grund |
| Einträge in mehr als einem Abschnitt | 5 | **0** |
| `Wocheneinkauf` (kritischer Bereich, machbar) | Platz 10 | **Platz 4** |

Bei erklärter Pause zusätzlich: „Jetzt relevant" trägt nur noch die überschrittene Frist,
zwei nicht drängende Aufgaben rücken in „Ruht, solange du pausierst" – und die Angabe endet
von selbst („Gilt bis 10.09., 08:00, danach wieder normal").

Preis der Behebung von H3: `/familie` hat fünf Bedienelemente mehr (21 → 26), je eines pro
Bereich ohne Zuständige. Ein zweiter Ausweg kostet einen zweiten Knopf; die Alternative wäre,
die Falle zu behalten.

## Befunde

### K1 · Blockierte Aufgaben werden als „jetzt machbar" präsentiert

| | |
| --- | --- |
| **Bereich** | Produktlogik, Kontextlogik (§7) |
| **Ort** | `now.service.ts` → `/jetzt`, `/plan` |
| **Priorität** | **Kritisch** |

**Problem.** `ready()` prüft nur `!isWaiting`, und `isWaiting` kennt allein den Zustand
`waiting` sowie offene `waiting_states`. Der Zustand **`blocked`** – gesetzt, wenn eine
Vorbedingung offen ist – gilt damit als machbar.

**Gemessen** (Demohaushalt, Antwort von `GET /now`):

| Abschnitt | Einträge | davon `blocked` |
| --- | --- | --- |
| Jetzt relevant | 3 | **2** |
| Kann ich jetzt erledigen | 10 | **9** |
| Wartet auf jemand anderen | 0 | – |

Alle neun blockierten Aufgaben haben in `task_dependencies` je einen offenen Vorgänger. Es
sind die Schritte des Vorgangs „Neue Schuhe": *Passform beurteilen* steht als sofort machbar
oben, obwohl *Anprobieren*, *Bestellen* und *Modelle auswählen* davor offen sind. Die
tatsächlich machbare Aufgabe *Wocheneinkauf* – aus einem als kritisch markierten Bereich –
steht auf Platz 10.

Der Faktor `low_cost` schreibt an diese Einträge „Schnell erledigt, geschätzt 2 Minuten", und
jeder trägt einen Knopf **Erledigt**.

**Warum problematisch.** Das ist die Kernfrage der Anwendung, falsch beantwortet. Ein Nutzer,
der dreimal auf etwas klickt, das er nicht tun kann, hört auf zu glauben, dass die Liste
stimmt – und führt wieder seine eigene. Damit ist der Mental Load zurück, plus die Pflege der
App obendrauf.

**Auswirkung.** Falsche Reihenfolge, falsches Versprechen, „Erledigt" an Schritten, deren
Vorgänger offen sind. Die Abschnitte „Wartet auf jemand anderen" und „Demnächst relevant"
bleiben leer, obwohl neun Aufgaben genau dorthin gehören.

**Empfohlene Änderung.** Machbarkeit an einer Stelle entscheiden, und zwar dort, wo sie schon
richtig gerechnet wird. `nextActions()` schließt blockierte, wartende und zurückgestellte
Aufgaben aus; `/vorgaenge` benutzt das bereits korrekt. Die Now-Ansicht muss denselben Begriff
verwenden. Blockierte Aufgaben verschwinden nicht – sie gehören unter „Wartet", mit dem
Vorgänger als Grund.

**Abhängigkeiten.** Keine.

**Akzeptanzkriterium.**

```
GIVEN  eine Aufgabe hat eine Vorbedingung, die noch offen ist
WHEN   die Ansicht „Jetzt" aufgebaut wird
THEN   erscheint sie nicht unter „Jetzt relevant" oder „Kann ich jetzt erledigen",
       sondern unter „Wartet auf jemand anderen" – mit der Vorbedingung als Grund.

GIVEN  ein Vorgang mit zehn aufeinander aufbauenden Schritten, von denen keiner erledigt ist
WHEN   die Ansicht „Jetzt" aufgebaut wird
THEN   erscheint höchstens der erste Schritt als machbar.
```

---

### K2 · Zurückgestellte Aufgaben gelten als machbar – und stehen doppelt

| | |
| --- | --- |
| **Bereich** | Produktlogik |
| **Ort** | `now.service.ts` |
| **Priorität** | **Kritisch** (gleiche Ursache wie K1) |

**Problem.** Wer eine Aufgabe auf nächste Woche zurückstellt, hat eine Entscheidung getroffen.
`now.service` übernimmt sie nicht: Der Zustand `deferred` wird geladen, `deferUntil` in der
Zukunft schließt nichts aus. Dieselbe Aufgabe ist damit gleichzeitig Kandidat für „Kann ich
jetzt erledigen" **und** für „Demnächst relevant".

Zusätzlich ist „Demnächst relevant" falsch benannt: Es enthält ausschließlich zurückgestellte
Aufgaben. Eine Aufgabe, die in drei Tagen fällig ist, steht dort nicht – sie steht unter
„Kann ich jetzt erledigen".

**Auswirkung.** Die eigene Entscheidung „nicht jetzt" wird ignoriert. Das ist schlimmer als
eine falsche Sortierung: Es entwertet die Bedienung.

**Akzeptanzkriterium.**

```
GIVEN  eine Aufgabe ist bis zum 20. des Monats zurückgestellt, heute ist der 9.
WHEN   die Ansicht „Jetzt" aufgebaut wird
THEN   erscheint sie ausschließlich unter „Demnächst" und in keinem anderen Abschnitt.

GIVEN  eine Aufgabe ist in drei Tagen fällig und nicht zurückgestellt
WHEN   die Ansicht „Jetzt" aufgebaut wird
THEN   erscheint sie unter „Demnächst" – der Abschnitt heißt nach dem Zeitpunkt,
       nicht nach der Zurückstellung.
```

---

### H1 · Auszeit wirkt auf Benachrichtigungen, aber nicht auf die Ansicht

| | |
| --- | --- |
| **Bereich** | Kapazität (§10), Kontextlogik |
| **Ort** | `capacity` → `notification-dispatch.ts` vs. `now.service.ts` |
| **Priorität** | **Hoch** |

**Problem.** Wer „Pause" oder „Sehr wenig" wählt, setzt `criticalOnly`. Im Versand wird das
durchgesetzt: nichtkritische Meldungen verlieren alle Kanäle außer „in der App". In der
Anwendung selbst wirkt es **nirgends** – `/jetzt` zeigt weiter nichtkritische Aufgaben,
`/plan` zeigt unverändert alles. Die Oberfläche verspricht beim Umschalten wörtlich:
*„Übernommen. Es wird dir weniger gezeigt."* Weniger wird nur die Zahl unter „Jetzt relevant"
(3 → 1), nicht die Auswahl.

**Warum problematisch.** Dieselbe Selbstauskunft bedeutet auf zwei Wegen Verschiedenes. Und
sie verfehlt den Zweck: Wer pausiert, öffnet die App trotzdem – und sieht dann doch alles.

**Empfohlene Änderung.** `criticalOnly` in der Ansicht durchsetzen: Bei aktiver Auszeit tragen
„Jetzt relevant" und „Kann ich jetzt erledigen" nur, was aus einem als wichtig oder kritisch
markierten Bereich stammt oder eine überschrittene Frist hat. Der Rest verschwindet nicht,
sondern rückt in einen ausdrücklich benannten Abschnitt („Ruht während deiner Pause") –
INV-007 verlangt Umsortieren statt Ausblenden.

**Akzeptanzkriterium.**

```
GIVEN  eine Person hat „Pause" erklärt
WHEN   in einem ihrer nicht als wichtig markierten Bereiche eine neue Aufgabe entsteht
THEN   erscheint diese Aufgabe nicht unter „Jetzt relevant",
       sondern in einem Abschnitt, der die Pause benennt.

GIVEN  dieselbe Person, und in einem als kritisch markierten Bereich entsteht eine Aufgabe
THEN   erscheint sie weiterhin unter „Jetzt relevant".
```

---

### H2 · Eine Auszeit hat kein Ende

| | |
| --- | --- |
| **Bereich** | Kapazität (§10), Mental Load (§8) |
| **Ort** | `FamilyPage.tsx` → `setCapacity` |
| **Priorität** | **Hoch** |

**Problem.** Das Datenmodell kennt `endsAt`, der Versand wertet es aus (`capacityActive`).
Die Oberfläche sendet **immer `null`**: Es gibt kein Feld dafür. Eine Pause gilt damit, bis
jemand daran denkt, sie zu beenden.

**Warum problematisch.** Genau die Merkarbeit, die die Anwendung abnehmen will. Wer krank ist,
setzt „Pause" – und muss sich merken, sie nach der Genesung zurückzunehmen. Vergisst er es,
bekommt er wochenlang keine Meldungen mehr, ohne dass etwas darauf hinweist.

**Empfohlene Änderung.** Beim Setzen einer Stufe unter „Normal" nach dem voraussichtlichen
Ende fragen, mit brauchbaren Vorgaben („bis heute Abend", „bis morgen", „diese Woche",
„offen"). Läuft der Zeitraum ab, kehrt die Stufe von selbst auf Normal zurück. „Offen" bleibt
möglich – dann aber als bewusste Wahl.

**Abhängigkeiten.** Ein Job, der abgelaufene Kapazitätszustände aufräumt (der Versand
behandelt sie bereits als inaktiv, die Anwendung liest sie aber weiter).

**Akzeptanzkriterium.**

```
GIVEN  eine Person erklärt „Weniger als sonst" bis morgen 20 Uhr
WHEN   morgen 20 Uhr vorbei ist
THEN   gilt wieder „Normal", ohne dass jemand etwas tun musste.

GIVEN  eine Person erklärt „Pause" ohne Enddatum
THEN   ist das möglich, und die Anwendung weist sichtbar darauf hin, dass die Pause
       ohne Ende gilt.
```

---

### H3 · „Wo niemand mitdenkt" kennt nur einen Ausweg: selbst übernehmen

| | |
| --- | --- |
| **Bereich** | Verantwortung (§9) |
| **Ort** | `/familie` |
| **Priorität** | **Hoch** |

**Problem.** Der Abschnitt listet fünf Bereiche ohne Zuständige. Neben jedem steht genau ein
Knopf: **Ich übernehme**. Es gibt keinen Weg, jemand anderen zu fragen, und keinen Weg zu
sagen, dass hier niemand nötig ist.

**Warum problematisch.** Das kehrt das Produktziel um. Wer nachsieht, wo etwas offen ist,
bekommt es angehängt – und das ist üblicherweise die Person, die ohnehin schon am meisten
trägt. Die Anwendung soll Verantwortung verteilen, nicht bei der aufmerksamsten Person
sammeln.

**Zweites Problem am selben Ort.** Die Einleitung lautet *„Bei diesen Bereichen hätte
Liegenbleiben spürbare Folgen"* – in der Liste steht „Reparaturen · **nebensächlich**". Der
Satz behauptet etwas, das die Daten daneben widerlegen.

**Empfohlene Änderung.** Neben „Ich übernehme" mindestens „Jemanden fragen" (erzeugt eine
gerichtete Frage an eine Person, keine stille Zuweisung). Die Einleitung an die tatsächlich
gezeigte Menge anpassen oder die Liste auf wichtige und kritische Bereiche begrenzen.

**Akzeptanzkriterium.**

```
GIVEN  ein Bereich ohne Zuständige
WHEN   eine Person die Übersicht „Wo niemand mitdenkt" ansieht
THEN   kann sie den Bereich übernehmen ODER eine andere Person fragen,
       ohne dass die Frage bereits eine Zuweisung ist.

GIVEN  die Einleitung nennt spürbare Folgen
THEN   enthält die Liste keinen Bereich, der als nebensächlich markiert ist.
```

---

### H4 · Niemand kann einen Haushalt verlassen

| | |
| --- | --- |
| **Bereich** | Berechtigungen (§21), Grenzfälle (§26) |
| **Ort** | fehlender Endpunkt |
| **Priorität** | **Hoch** |

**Problem.** Es gibt Einladen, Rolle ändern und Einladung zurückziehen. Es gibt **keinen**
Weg, ein Mitglied zu entfernen oder selbst zu gehen.

**Warum problematisch.** §26 nennt die Fälle ausdrücklich: Beziehung endet, Person zieht aus,
Kind wechselt den Haushalt. Alle enden hier in einer Sackgasse. Die Verantwortung dieser
Person bleibt an einem Zugang hängen, den niemand mehr benutzt – und die Anwendung zeigt
weiterhin „Anna denkt mit", wo niemand mehr mitdenkt.

**Entschieden: Variante B.** Die Verantwortung fällt auf „niemand" zurück und wird sichtbar –
sie wandert nicht stillschweigend zu der Person, die entfernt (das wäre eine Zuweisung ohne
Frage), und sie blockiert das Ausscheiden nicht (wer im Streit geht, kann den Haushalt nicht
als Geisel nehmen).

**Gebaut.** `DELETE /households/:id/members/:membershipId` – gehen darf jeder, andere
hinausbitten nur, wer `member:manage` hat. In einer Transaktion:

| | |
| --- | --- |
| Verantwortung | offene Zuweisungen enden mit `endReason: 'member_left'` – beendet, nicht gelöscht (INV-013) |
| Kritische Bereiche ohne Zuständige | erzeugen denselben Hinweis wie bei einer Auszeit (INV-014) |
| Vertretungen dieser Person | gehen auf `cancelled` |
| Offene Aufgaben | bleiben stehen, verlieren nur den Namen |
| Fragen an diese Person | bleiben offen, richten sich wieder an alle |
| Kapazität, Push-Geräte | zurückgesetzt bzw. abgeschaltet |
| Mitgliedschaft | `status: 'left'`, `leftAt` – der Name bleibt lesbar, sonst wäre der Verlauf voller „unbekannt" |

Zwei Sperren, beide mit einem Weg nach vorn im Text: die letzte verwaltende Person kann nicht
gehen („Vorher muss jemand anderes die Verwaltung übernehmen"), die letzte Person überhaupt
auch nicht („Statt zu gehen, kannst du den Haushalt löschen").

**Dabei gefunden.** `household_memberships.status` erlaubte in der Datenbank seit jeher
`left` – in `@thealotta/contracts` kam der Wert nicht vor. ADR-0013 verlangt das Gegenteil
(Vokabular in den Verträgen, Datenbank spiegelt), aber nichts setzte es durch. Der Wert ist
jetzt im Vertrag, und `apps/api/test/vokabular-spiegel.spec.ts` liest die CHECK-Bedingungen
aus der laufenden Datenbank und vergleicht sie Wert für Wert – für fünf Vokabulare.

---

### M1 · Modellvokabular in servergeschriebenen Texten

| | |
| --- | --- |
| **Bereich** | Sprache (§17) |
| **Ort** | `work.routes.ts:246`, `work.service.ts:392`, `monitor.service.ts:191` |
| **Priorität** | Mittel |

Auf `/ablaeufe` steht sichtbar: *„Ein **Playbook** ist eine Vorlage. Sie wird nicht
abgearbeitet – aus ihr entsteht jedes Mal ein neuer Vorgang mit eigenen Schritten."* Der Satz
kommt als `note` vom Server. Dazu `notFound('Das Playbook')` und `notFound('Der Monitor')` –
beide erreichen als Fehlertext die Oberfläche, seit `ApiError` das `detail` des Servers
benutzt.

Der erste Audit führte „Kein Modellbezeichner erreicht die Oberfläche" als geprüft und in
Ordnung. Das war falsch: Der Test prüft die Zeichenketten im Client, nicht die, die der
Server hineinschreibt.

**Empfohlene Änderung.** Texte korrigieren und den Sprachtest auf servergeschriebene Texte
ausweiten.

---

### M2 · „Geht auch mit wenig Energie" wiederholt nur

Gemessen: **5 von 5** Einträgen stehen bereits unter „Kann ich jetzt erledigen". Der
Abschnitt schließt zwar „Jetzt relevant" aus, nicht aber den Abschnitt direkt darüber. Er
kostet Seitenlänge und bringt keine neue Information.

---

### M3 · „Sonst noch offen · 13" macht `/jetzt` doch zur Todo-Liste

Q-14 begrenzt „Jetzt relevant" bewusst auf drei Einträge – und darunter steht die
vollständige Liste aller dreizehn offenen Aufgaben mit „alle 13 ansehen". Die harte Grenze
wird auf derselben Seite wieder aufgehoben.

---

### M4 · `/vorgaenge` und `/ablaeufe` zeigen dieselbe Sache

„Erprobte Abläufe" steht als Abschnitt auf `/vorgaenge` (mit „Alle ansehen") **und** als
eigener Navigationspunkt `/ablaeufe`. Zwei Wege zum selben Objekt.

---

### M5 · `/wissen` öffnet auf dem einzigen leeren Reiter

Notizen 0, Offene Fragen 1, Entscheidungen 1. Die Seite öffnet auf „Notizen" und zeigt einen
Leerzustand – sie wirkt leer, obwohl sie zwei Einträge enthält.

---

### M6 · `/uebersicht` ist eine zweite Navigation

„Alle Orte in Thealotta, und wofür sie da sind" – eine Seite, die die Navigation nachbaut. Nach der
Entscheidung, die breite Navigation zu behalten (`docs/52-audit.md`), ist das ein doppelter
Navigationsweg.

---

### M7 · Quick Capture liest kein Datum aus dem Text

`classify()` erkennt Fragen, Wiederholungen, Festlegungen und Sachverhalte – aber keine
Zeitangabe. „Donnerstag Müll rausbringen" wird eine Aufgabe **ohne Datum**; das Datum steht im
Text und muss trotzdem von Hand gesetzt werden. §8: Was ableitbar ist, soll abgeleitet werden.

---

### N1 · Kleinigkeiten

- Die URL lautet `/beobachtung`, die Seite heißt „Regeln".
- `nextStep` wird für jeden Now-Eintrag berechnet und übertragen, aber von keiner Ansicht
  gelesen.
- `temporaryCoverages.originalMembershipId` wird immer als `null` geschrieben.
- Zwei Abläufe „Neue Schuhe" stehen mit fast gleichem Auslösetext nebeneinander; die Liste
  bietet nichts, um sie zu unterscheiden.
- Demodaten enthalten einen Rest aus einem Testlauf („Müll 1788959206787").

## Was geprüft wurde und in Ordnung ist

| Bereich | Befund |
| --- | --- |
| Vertretung | Vollständig: anlegen, überlappungsfrei per Constraint, ablaufen, Rückgabe bestätigen; wirkt bis in die Priorisierung (`effectiveOwner`) |
| Trefferflächen | Die 25 px hohen Zeilentitel sind **kein** Mangel – die Trefferfläche wird über eine Pseudofläche aufgespannt, der bestehende Test misst korrekt |
| Bündelung | Zehn veraltete Angaben ergeben einen Eintrag mit zehn Belegen, nicht zehn Einträge |
| Push bei Auszeit | `mutePush` und `criticalOnly` werden im Versand tatsächlich durchgesetzt, kritische Meldungen kommen durch |
| Zustandsautomaten | Kein Übergang durch Zeitablauf in einen Endzustand (INV-001); Wiedereröffnen überall möglich |
| Nächster Schritt | `nextActions()` rechnet Abhängigkeiten und Zurückstellungen korrekt – `/vorgaenge` zeigt es richtig an |
| Überlauf | Kein horizontaler Überlauf an den geprüften Stellen, auch mobil |

## Offene Entscheidungen

**M4/M6 – die doppelten Wege.** Ob „Abläufe" und „Übersicht" eigene Navigationspunkte
bleiben, hängt an derselben Frage wie H1 des ersten Audits, die zugunsten der breiten
Navigation entschieden wurde. Die Doppelung bleibt trotzdem eine Doppelung: dieselbe Sache an
zwei Orten, nicht dieselbe Sache aus zwei Blickwinkeln. Dazu gehört `/kalender` mit einem
einzigen Bedienelement.
