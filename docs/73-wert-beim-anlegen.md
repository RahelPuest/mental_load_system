# 73 – Der Wert gehört ins Anlegen

Eine Angabe anzulegen war ein halber Vorgang. Der Bogen fragte, *was* festgehalten werden soll,
welche Art es ist und wie lange es verlässlich bleibt – und meldete dann:

> Angabe angelegt – noch ohne Wert.

Den Wert trug man danach nach: Bereich öffnen, Angabe suchen, „Ändern", eintippen, speichern.
Fünf Schritte für etwas, das man in dem Moment, in dem man die Angabe anlegt, meistens gerade
weiß. Die Schuhgröße ist ja der Anlass, aus dem jemand „Schuhgröße" anlegt.

Jetzt steht das Wertfeld im Bogen, direkt unter der Art.

## Freiwillig, und zwar aus einem Grund

Das Feld ist **nicht** Pflicht. Eine Angabe ohne Wert ist eine gültige und nützliche Aussage:
*„Das sollten wir wissen – und wir wissen es nicht."* Genau darum geht es in diesem Produkt;
eine Pflichtangabe an dieser Stelle hieße, dass man eine Wissenslücke nur festhalten kann,
indem man sie erfindet.

## „Weiß ich (noch) nicht" ist eine Aussage, kein leeres Feld

Der Bogen bietet dieselbe Möglichkeit wie das Ändern: **Weiß ich (noch) nicht.**

> **Korrektur (16.09.2026).** Die erste Fassung dieses Dokuments behauptete, ein leer
> gelassenes Feld hinterlasse *gar keinen* Wertsatz und sei damit für die Beobachtung
> unsichtbar. Das stimmt nicht. `defineState` legt zu **jeder** neuen Angabe sofort einen Wert
> mit `valueKind: 'unknown'` an – ausdrücklich, mit demselben Argument (INV-010: ein neuer
> Zustand startet als „unbekannt", nicht als leer). Nachgemessen am laufenden Server: Nach dem
> Anlegen steht eine Zeile in `state_values`, `value_kind = 'unknown'`, `verified_at` leer.

Der Unterschied ist trotzdem da, nur ein anderer – er liegt in der **Bestätigung**:

| | `value_kind` | `verified_at` | wann sich `state_unknown` meldet |
| --- | --- | --- | --- |
| Feld leer gelassen | `unknown` | leer | **sofort** – ohne Zeitpunkt rechnet der Auswerter mit „unendlich lange offen" |
| „Weiß ich nicht" angehakt | `unknown` | jetzt | erst nach den eingestellten Tagen |

Beides ist also derselbe Zustand, aber mit verschiedener Geschichte: Im einen Fall hat niemand
hingesehen, im anderen hat jemand hingesehen und festgestellt, dass es nichts zu wissen gibt.
Das Anhaken sagt „ich habe das geprüft" – und verschiebt den Hinweis um die eingestellte Frist,
statt ihn sofort auszulösen.

**Was das für die Bedienung heißt:** Das Kästchen ist keine Pflicht und kein Ersatz für ein
leeres Feld. Es ist die Antwort für den Fall, dass die Lücke selbst die Auskunft ist.

## Drei kleine Entscheidungen

**Ein Feld, nicht zwei Formulare.** Welche Eingabe zu welcher Art gehört – Wahl bei „Ja / Nein",
Zahlenfeld bei Zahl, Datumsfeld bei Datum – stand im Code, seit es das Ändern gibt. Statt sie
im Anlegen ein zweites Mal hinzuschreiben, ist sie jetzt ein gemeinsames Bauteil (`WertFeld`).
Zwei Listen für dieselbe Sache laufen auseinander, sobald eine fünfte Art dazukommt.

**Ein Wechsel der Art wirft den Wert weg.** „29" ist als „Ja / Nein" nichts. Ein
stehengebliebener Rest würde stillschweigend als `false` gespeichert – ein Wert, den niemand
eingegeben hat.

**„Weiß ich nicht" blendet das Feld aus, statt es zu sperren.** Ein leeres, graues Feld daneben
lädt dazu ein, doch etwas hineinzuschreiben, das dann nicht gespeichert wird.

## Was hinausgeht

Zwei Aufrufe, weil es zwei Dinge sind – die Angabe (was wir wissen wollen) und ihr Wert (was wir
wissen):

```
POST /households/:hid/domains/:did/state-definitions   { key, label, dataType, … }
PUT  /households/:hid/state-definitions/:sid/value     { valueKind, value?, confirm: true }
```

Der zweite fällt weg, wenn niemand etwas eingetragen hat. `confirm: true`, weil selbst
eingetragen heißt bestätigt: Der Wert ist in diesem Moment frisch, und die Frist bis zum
nächsten Bestätigen beginnt jetzt.

Die Rückmeldung sagt, welcher der drei Fälle eingetreten ist – „angelegt und bestätigt",
„als offen hinterlegt" oder „noch ohne Wert".

## Was geprüft wird

Fünf Prüfungen in `apps/web/test/angabe-anlegen.spec.tsx`: dass das Feld da ist, dass eine Zahl
als Zahl hinausgeht (nicht als Zeichenkette), dass ein leeres Feld **keinen** zweiten Aufruf
erzeugt, dass „weiß ich nicht" als `unknown` gespeichert wird – und dass ein Wechsel der Art den
Wert wegwirft.

Drei im Browser (`apps/web/e2e/angabe.spec.ts`): dass das Feld seinen Typ mit der Art wechselt,
dass „weiß ich nicht" es entfernt statt sperrt, und dass der Bogen mit dem zusätzlichen Feld auf
390 px nicht aus dem Bild läuft.
