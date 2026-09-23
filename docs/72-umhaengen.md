# 72 – Inhalte in einen anderen Bereich umhängen

Ein Bereich wächst, bis er zwei Dinge ist. „Jacken und Schuhe" war einmal eine sinnvolle
Einheit; irgendwann stehen darin zwei Größen, zwei Regeln, zwei Vorgänge, und die Antwort auf
„wer denkt hier mit" gilt nur noch für eine Hälfte. Der Bereich muss geteilt werden.

Bisher hieß das: den neuen Bereich anlegen und alles, was hineingehört, **noch einmal tippen**.
Das ist nicht nur Arbeit. Eine neu getippte Angabe hat keinen Verlauf, eine neu getippte Regel
keine letzte Prüfung, ein neu getippter Vorgang keine Vergangenheit. Man verliert genau das
Gedächtnis, wegen dem es dieses System gibt – und zwar an der Stelle, an der man gerade Ordnung
schaffen wollte.

## Mehrere auswählen, einmal verschieben

Im Kopf jedes Abschnitts steht **„In anderen Bereich"**. Danach trägt jede Zeile ein Kästchen,
und am unteren Rand steht eine Leiste: wie viele gewählt sind, und **„Zielbereich wählen"**.

Ein Knopf je Zeile wäre schneller gebaut gewesen. Er passt nur nicht zum Anlass: Wer einen
Bereich aufteilt, verschiebt zwölf Dinge, nicht eines – das wären zwölf Mal derselbe Weg durch
denselben Bogen.

### Die Knöpfe tragen das Ziel, nicht das Mittel

Der erste Knopf hieß **„Auswählen"**, die Leiste sagte „Nichts ausgewählt" und „Verschieben".
Das beschreibt jeweils, was der nächste Klick *tut*, und verschweigt, wozu. Auswählen kann man
in einer Anwendung an zwanzig Stellen, und jedes Mal folgt etwas anderes; wer einen Bereich
aufteilen will, sucht nicht „Auswählen", sondern das Wort für das, was er vorhat.

Jetzt liest sich der Weg als ein Satz: **In anderen Bereich → Zielbereich wählen → Wohin
verschieben? → Verschieben.** Jeder Schritt nennt den nächsten, und schon der erste sagt, wo
es endet.

Aus demselben Grund steht in der leeren Leiste **„Hak an, was umziehen soll"** statt „Nichts
ausgewählt": dieselbe Auskunft, nur nicht als Vorwurf, sondern als Anleitung. Die Leiste steht
auch bei null Gewählten da – eine, die erst beim ersten Haken erscheint, springt ins Bild und
schiebt die Liste unter dem Finger weg.

Die Auswahl endet, wenn man den Abschnitt verlässt. Einträge mitzunehmen, die man nicht mehr
sieht, wäre eine Auswahl im Blindflug.

## Was zusammengehört, bleibt zusammen

Zwei Paare sind untrennbar. Wer eine Hälfte wählt, verschiebt beide:

| Paar | Warum getrennt nicht geht |
| --- | --- |
| **Regel und die Angabe, die sie beobachtet** | Getrennt schaut die Regel über eine Bereichsgrenze. Man sieht die Angabe im einen Bereich und findet nicht, was sie prüft – im Baum ist der Zusammenhang unsichtbar |
| **Vorgang und seine Aufgaben** | Eine Aufgabe, die woanders liegt als ihr Vorgang, taucht in zwei Bereichen auf und gehört zu keinem |

Das wird **vorher angekündigt** (im Bogen steht der Satz) und **hinterher benannt**: Die
Rückmeldung nennt jeden Eintrag, der mitkam, samt Grund – „„Schuhgröße" (wird von „Schuhgröße
prüfen" beobachtet)". Wer das erst später bemerkt, sucht die fehlende Hälfte im alten Bereich.

Eine Aufgabe, die zu einem Vorgang gehört, lässt sich deshalb **nicht einzeln** verschieben. Der
Versuch endet nicht stillschweigend, sondern mit dem Satz, was stattdessen zu tun ist:
*„„Größe messen" gehört zu einem Vorgang. Verschiebe den Vorgang – seine Aufgaben kommen mit."*

## Was mitzieht, was bleibt

| | |
| --- | --- |
| **Zieht von allein mit** | Werte und Verlauf einer Angabe (sie hängen an der Angabe, nicht am Bereich); offene Hinweise einer verschobenen Regel |
| **Bleibt stehen** | Die Signale – und erledigte Hinweise |

Die Signale bleiben nicht aus Bequemlichkeit. Ein Signal ist kein Zustand, sondern Protokoll:
*zu diesem Zeitpunkt, in diesem Bereich, ist das aufgefallen.* Die Datenbank ist derselben
Meinung und lässt der Anwendungsrolle gar keine Wahl – `0003_rls_and_grants.sql` entzieht ihr
`UPDATE` auf `signals`, zusammen mit `domain_events`, `audit_events` und `state_observations`
(docs/20 §5). Der erste Entwurf wollte die Signale mitnehmen und lief in ein
`permission denied for table signals`. Die Rollentrennung hat hier eine Entwurfsfrage
beantwortet, bevor sie jemand gestellt hatte.

Aus demselben Grund ziehen nur **offene** Hinweise um. Ein erledigter Hinweis ist eine Aussage
über die Vergangenheit des alten Bereichs.

## Beide Bereiche erzählen davon

Der Verlauf eines Bereichs wird über `payload.domainId` gefiltert. Ein einziges Ereignis mit
dem Ziel darin hieße: Am Ziel steht, dass etwas kam – an der Quelle ist es einfach weg. Das ist
INV-001 („nichts geht still verloren") nur an der Stelle erfüllt, an der man ohnehin hinsieht.

Deshalb zwei Sorten:

- `domain.item_moved` – je Eintrag, `payload.domainId` ist das **Ziel**, `fromDomainId` die
  Quelle. Steht im Verlauf des Zielbereichs *und* im Verlauf des Eintrags selbst.
- `domain.items_left` – einmal je Verschiebung, `payload.domainId` ist die **Quelle**, mit der
  Liste dessen, was gegangen ist.

## Berechtigung

`domain:manage` auf **beiden** Bereichen. Verschieben ist eine Einordnung, keine Bearbeitung –
und ohne die Prüfung am Ziel wäre es ein Weg, etwas in einen Bereich zu legen, den man selbst
nicht verwalten darf.

Zwei weitere Grenzen: Quelle und Ziel dürfen nicht derselbe Bereich sein, und in einen
**archivierten** Bereich wird nichts gelegt – das Verschobene wäre nur noch übers Archiv
erreichbar. Archivierte Bereiche stehen deshalb gar nicht erst zur Wahl; sie anzubieten und
dann abzulehnen wäre eine Sackgasse mit Ankündigung.

Ein Eintrag, der gar nicht im Quellbereich steht, ergibt `404` – nicht „nichts passiert".
Stillschweigend nichts zu tun und „verschoben" zu melden ist die schlechtere Antwort.

## Die Schnittstelle

```
POST /households/:hid/domains/:did/move-items
     { targetDomainId, items: [{ kind, id }] }
     → { moved: [{ kind, id, title }], mitgenommen: [{ kind, id, title, grund }] }
```

Der Bereich in der Adresse ist die **Quelle**. Eine Anfrage statt sieben nach Objektart: Die
Untrennbarkeit lässt sich nur dort auflösen, wo alle gewählten Einträge zusammen bekannt sind –
und eine Teilverschiebung, die in der Mitte scheitert, gäbe es damit auch nicht. `kind` steht
dabei, weil die Kennung allein nicht sagt, in welcher Tabelle sie steht.

## Was geprüft wird

Elf Prüfungen in `apps/api/test/domain-items-move.spec.ts`, sieben in
`apps/web/test/umhaengen.spec.tsx`. Darunter:

- eine Regel nimmt ihre Angabe mit – **und umgekehrt**
- ein Vorgang nimmt seine Aufgaben mit, eine gebundene Aufgabe geht nicht allein
- ein offener Hinweis folgt seiner Regel
- ein Eintrag aus einem fremden Bereich wird nicht verschoben
- der Verlauf zeigt den Umzug an **beiden** Bereichen
- die Leiste zählt aufwärts *und* abwärts; „Abbrechen" wirft die Auswahl weg, nicht die Einträge
- ohne Auswahlmodus steht vor keiner Zeile ein Kästchen
- was an den Server geht, ist genau das Angehakte

## Offen

**Kein Rückgängig.** Abhaken lässt sich zurücknehmen (§57), Verschieben nicht. Der Weg zurück
ist derselbe Weg in die andere Richtung, und der Verlauf sagt, was wohin ging – aber ein
Umzug von zwanzig Einträgen ist damit nicht mit einem Griff rückgängig zu machen. Wenn sich
zeigt, dass das gebraucht wird, gehört es an dieselbe Stelle wie der Undo-Toast.

**Kein Verschieben über die Bereichsseite hinaus.** Aus den Übersichtslisten (*Wissen*,
*Regeln*, *Vorgänge*) heraus geht es nicht. Dort fehlt der Quellbereich als fester Bezug – jede
Zeile käme aus einem anderen.
