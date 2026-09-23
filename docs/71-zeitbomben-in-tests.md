# 71 – Zwei Tests, die von der Wanduhr abhingen

Ein voller Durchlauf am 15. September 2026 war rot – ohne dass sich eine Zeile Produktcode
geändert hatte. Der Befund ist klein, die Art des Fehlers nicht: Tests, die scheitern, weil
Zeit vergeht, verbrennen Vertrauen in die Suite, und zwar genau dann, wenn niemand mit einem
Fehler rechnet.

## Was passiert ist

`apps/api/test/family-invitations.spec.ts` prüfte, dass eine Einladung ein Ablaufdatum in der
Zukunft trägt:

```ts
expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
```

Die Frist entsteht aber nicht an der Wanduhr. Der Harness hat eine **feste Uhr**
(`apps/api/test/helpers.ts`: `2026-09-07T08:00:00Z`), und der Dienst rechnet
`now + 7 Tage` (`invitation.service.ts`). Das Ergebnis ist also immer der **14. September 2026**.
Ab dem 15. September liegt dieser Zeitpunkt in der Vergangenheit – die Behauptung wurde falsch,
obwohl sie über die Sache, die sie prüfen will, weiterhin stimmt.

Die feste Uhr ist kein Versehen, sondern Absicht (docs/26 §4): Freshness, Monitoring und
Vertretung sind zeitabhängig und nur mit steuerbarer Zeit deterministisch prüfbar. Der Fehler
liegt darin, in **derselben Behauptung** zwei Uhren zu mischen.

## Zwei weitere Stellen derselben Art

Beide waren noch grün und wären es nicht geblieben:

| Stelle | Was daran hing |
| --- | --- |
| `recurring-tasks.spec.ts` | Der Monatstag „übermorgen" kam aus der Wanduhr, ausgewertet wurde an der festen Uhr. Bei passender Kalenderlage hätte die Regel ausgelöst und der Test wäre gefallen |
| `family-invitations.spec.ts` | Start und Ende einer Vertretung kamen aus der Wanduhr, die Bewertung „gilt als versorgt" aus der festen Uhr |

Bemerkenswert: `recurring-tasks.spec.ts` schreibt die Regel selbst hin – *„Man muss die Daten
dann aber auch aus ihr ableiten und nicht aus `Date.now()`"* – und verstieß zwanzig Zeilen
weiter oben dagegen. Eine Regel im Kommentar ist kein Durchsetzungspunkt (siehe docs/08).

## Die Regel

**In einem Test, der gegen den Harness läuft, kommt jedes Datum aus `h.clock`.** `Date.now()`
bleibt zulässig, wo es nur Eindeutigkeit herstellt – etwa in erfundenen E-Mail-Adressen, weil
die Testdatenbank zwischen Läufen nicht geleert wird. Sobald ein Wert mit einer Zeitangabe des
Systems **verglichen** wird, ist die Wanduhr die falsche Quelle.

## Nebenbefund: die Browsersuite hängt am ersten Seed

Die Browsertests rufen Bereiche über feste UUIDs auf (`SCHUHE` in `domain-view.spec.ts` und
weitere). Diese IDs gehören dem Haushalt, den der **erste** `pnpm db:seed` angelegt hat. Wer
neu seedet und sich mit dem neuen Konto anmeldet, bekommt 45 rote Tests und auf jeder
betroffenen Seite „Das hat gerade nicht geklappt" – ohne dass irgendetwas kaputt ist.

Die Abhilfe steht jetzt in der README, samt Abfrage, die zur ID das richtige Konto findet.
Nicht über den Namen „Schuhe": den gibt es nach mehreren Seeds mehrfach, und die älteste Zeile
gehört dem falschen Haushalt.

## Stand nach dem Durchlauf

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | grün |
| `pnpm test` | 939 grün, 9 übersprungen, 67 Dateien |
| `pnpm test:e2e` | 363 grün (Chromium und Berührung), 6,6 min |
