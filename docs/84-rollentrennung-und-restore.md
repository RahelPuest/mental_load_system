# 84 – Rollentrennung der Worker und die Restore-Skripte

Zwei offene Punkte aus [docs/78](78-selbstbetrieb-rpi5.md) §12, vor dem ersten Ausrollen
abgearbeitet. Beim Abarbeiten sind zwei weitere Dinge aufgefallen, die schwerer wiegen als
das, womit ich angefangen habe.

## 1 · Die Rollentrennung war eine Behauptung

`WORKER_QUEUES` stand seit jeher im Zod-Schema und wurde von `apps/worker/src/main.ts`
**nie gelesen**: Jeder Prozess startete alle drei BullMQ-Worker. Damit war die in
README §Betrieb und [docs/27](27-deployment.md) §2 beschriebene Aufteilung in drei
Deployments mit je eigener Datenbankrolle nicht möglich — drei Container hätten sich die
Jobs weggenommen und wären an fehlenden Rechten gescheitert.

INV-006 („eine fehlgeschlagene Zustellung ändert nichts am Quellobjekt") und INV-012
(„ein Integrationsausfall löscht und schließt nichts") waren deshalb dokumentiert, aber
nicht durchgesetzt. Genau das ist der Unterschied zwischen einer Zusage und einer Regel:
Eine Rolle, die es nicht darf, **kann** es nicht.

Jetzt liest der Worker die Liste, und das Produktions-Compose fährt drei Dienste:

| Dienst | Schlange | Datenbankrolle | darf dadurch nicht |
| --- | --- | --- | --- |
| `worker-default` | `default` | `thealotta_app_user` | – |
| `worker-sync` | `sync` | `thealotta_sync_user` | Aufgaben und Vorgänge schreiben (INV-012) |
| `worker-notify` | `notify` | `thealotta_notifier_user` | fachliche Objekte ändern (INV-006) |

Jeder bekommt außerdem nur die Geheimnisse, die er braucht: VAPID und SMTP liegen allein beim
Zusteller, die Kalendereinstellungen allein beim Abgleich.

**Ein Tippfehler bricht den Start ab.** `WORKER_QUEUES=notifiy` wäre sonst der teuerste
Fehler überhaupt: Der Prozess liefe, meldete nichts, und die Zustellung stünde, ohne dass
es jemand bemerkt. Nur der Prozess mit der `default`-Schlange trägt die wiederkehrenden Jobs
ein — sonst reihte jemand Arbeit ein, die er selbst nie abarbeitet.

Nebenbei: Die beiden neuen Protokollfelder standen erst als `[redacted]` da. Die
Logging-Allowlist (docs/30 §1) schwärzt unbekannte Felder grundsätzlich — richtig so; sie
sind jetzt ausdrücklich erlaubt, weil sie Betriebsangaben ohne Personenbezug sind.

## 2 · Die beiden Restore-Skripte gab es nicht

`docs/29` §3 führt sie als Pflichtschritte eines Restores, `ops/runbooks/restore.md` ruft sie
auf — und keines der beiden existierte.

**`ops/scripts/verify-restore.ts`** prüft den zurückgespielten Bestand in acht Punkten und
beendet sich mit 1, sobald einer fällt. Gegen den Entwicklungsbestand gelaufen: 62 Tabellen,
alle acht bestanden.

**`ops/scripts/reapply-deletions.ts`** liest `deletion_tombstones` und wendet jede
festgehaltene Löschung erneut an. **Ohne `--jetzt` löscht es nichts** — ein Skript, das beim
ersten Aufruf löscht, wird im Ernstfall aus Angst nicht benutzt. Geprüft an einem
Wegwerfnutzer: Trockenlauf meldet und lässt stehen, `--jetzt` entfernt genau die eine Zeile,
die übrigen neun bleiben.

## 3 · Befund: Die Audit-Hashkette lässt sich nicht nachrechnen

`docs/11` führt die Hashkette als Nachweis gegen nachträgliche Veränderung. Beim Bau der
Integritätsprüfung wollte ich sie nachrechnen — und konnte es nicht. Gemessen an 349 Zeilen:

| Sitzungszeitzone | abweichende Zeilen |
| --- | ---: |
| UTC | 28 von 349 |
| Europe/Berlin | **349 von 349** |
| America/New_York | **349 von 349** |

**Ursache 1 — die Zeitzone.** Der Trigger aus Migration 0003 hasht unter anderem
`NEW.occurred_at::text`. Wie ein `timestamptz` als Text erscheint, hängt von der Zeitzone der
**Sitzung** ab. Wer prüfen will, müsste die Zeitzone des Schreibers raten.

**Ursache 2 — die Kette gabelt sich.** Der Trigger liest den Vorgänger mit
`SELECT row_hash … ORDER BY seq DESC LIMIT 1`, ohne Sperre. Bei gleichzeitigen Einfügungen
greifen zwei Zeilen denselben Vorgänger. Gemessen: genau die 28 Zeilen, deren `prev_hash`
nicht zum Vorgänger in der Nummernfolge passt, und **14 Vorgänger mit mehr als einem
Nachfolger**. Die Kette ist keine Kette, sondern ein Baum.

Beides zusammen heißt: Die Kette belegt derzeit **nichts**. Ein Angreifer, der eine Zeile
ändert und die Kette neu durchrechnet, wäre von einer legitim gegabelten Kette nicht zu
unterscheiden.

`verify-restore.ts` prüft deshalb, was es ehrlich prüfen kann: die **Vollständigkeit** des
Stroms — kein Hash ohne vorhandenen Vorgänger, keine doppelten Hashes, keine Sprünge in der
Nummernfolge. Eine abgeschnittene oder halb eingespielte Historie fällt damit auf; die
Unverfälschtheit nicht.

**Was zu tun wäre**, in dieser Reihenfolge: Der Trigger müsste eine zeitzonenunabhängige
Darstellung hashen (`to_char(… AT TIME ZONE 'UTC', …)`) und die Einfügungen serialisieren
(`pg_advisory_xact_lock`). Für den Altbestand bleibt die Frage, ob man neu durchrechnet —
was bei einem Nachweisprotokoll selbst erklärungsbedürftig ist — oder einen neuen
Kettenabschnitt beginnt. Das ist eine Entscheidung, kein Nebeneffekt, und deshalb hier
nur benannt.

## 4 · Befund: Löschanträge werden nie ausgeführt

`POST /households/:id/deletion-requests` legt einen Antrag an und antwortet:

> „Die Löschung wird in 30 Tagen ausgeführt und kann bis dahin abgebrochen werden."

Der Antrag wird gespeichert, lässt sich abbrechen — und **niemand führt ihn aus**. Es gibt
keinen Job, der fällige Anträge abarbeitet. `deletion_tombstones` ist im Schema deklariert
(Migration 0002) und wird von keiner Zeile Code beschrieben.

Damit ist das kein Ausführungsdetail, sondern eine Zusage, die das Produkt nicht einlöst:
`docs/05` §5 beschreibt Soft Delete mit 30 Tagen Karenz, danach Hard Delete, dazu die
Behandlung verwaister Bereiche und den Widerruf von Kalender-Tokens beim Anbieter. Nichts
davon geschieht.

Für `reapply-deletions.ts` heißt das: Es findet heute nichts, und das ist kein Zeichen von
Ordnung. Das Skript ist trotzdem fertig — der Schritt bleibt Pflicht im Runbook, und er
funktioniert, sobald der Ausführer existiert. Ein Restore-Runbook mit einer Lücke an
Schritt 4 wäre gefährlicher als eines, dessen Schritt 4 nichts findet.

## 5 · Was geprüft wurde

| | |
| --- | --- |
| Typecheck, Lint | grün |
| Tests | 1083 grün (sechs neue für `WORKER_QUEUES`) |
| Worker mit `WORKER_QUEUES=notify` | startet nur den Zusteller, trägt keine Wiederholungen ein |
| Worker mit `WORKER_QUEUES=default` | trägt die Wiederholungen ein |
| Produktions-Compose | drei Worker mit den richtigen Rollen und Schlangen, gerendert geprüft |
| `verify-restore.ts` | acht Prüfungen gegen den echten Bestand, alle bestanden |
| `reapply-deletions.ts` | Trockenlauf meldet ohne zu löschen; `--jetzt` löscht genau die eine Zeile |

Die Testspuren in der Entwicklungsdatenbank wurden wieder entfernt.
