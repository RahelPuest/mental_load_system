# 79 – Umbenennung zu Ende gebracht: die Namen unter der Oberfläche

[docs/64](64-umbenennung.md) hat umbenannt, was Menschen sehen, und sechs Bereiche bewusst
stehen gelassen: Datenbankrollen, SQL-Funktionen, den Docker-Projektnamen, Objekte im
Kubernetes-Cluster, eine Nutzerdatei und historische Aussagen. Dieser Durchgang holt nach,
was davon ein Name war – und lässt stehen, was Verträglichkeit mit Altbestand ist.

Vorgabe: „alles Auftauchen von mira finden im Code, Datenbank, Dokumentation und Skripten
finden und ändern." Ausgangslage: 470 Treffer in 50 Dateien.

## Zwei Annahmen aus docs/64, nachgeprüft

docs/64 nannte zwei Gründe, die Datenbanknamen nicht anzufassen. Beide wurden an einer
Wegwerf-Datenbank auf PostgreSQL 16 gemessen, nicht geschätzt:

| Annahme in docs/64 | Messung |
| --- | --- |
| Funktionen umzubenennen hieße, „sämtliche Policies und Trigger in einer Migration neu zu schreiben" | **Trifft nicht zu.** Eine Regel speichert die OID der Funktion. Nach `ALTER FUNCTION … RENAME` steht der neue Name in `USING` und `WITH CHECK`, ohne dass eine Policy angefasst wird. Für Trigger gilt dasselbe. |
| Rollen umzubenennen sei „ein eigenes Wartungsfenster" (Rolle anlegen, Rechte übertragen, Zugangsdaten tauschen, alte Rolle löschen) | **Kleiner als gedacht.** `ALTER ROLE … RENAME` nimmt Rechte und Gruppenmitgliedschaften mit, und das Passwort bleibt gültig, weil SCRAM-SHA-256 den Rollennamen nicht einbindet. Bei MD5 wäre es gelöscht worden – PostgreSQL 16 verwendet SCRAM als Vorgabe. |

Die Vorsicht war also berechtigt, die Begründung im Detail nicht. Das Wartungsfenster bleibt
trotzdem eines: Zugangsdaten außerhalb des Verzeichnisses müssen mitgezogen werden.

## Der Fall, der nicht offensichtlich war

Migration 0012 benennt um. Der erste Entwurf davon war falsch, und zwar auf eine Weise, die
erst die **zweite** Datenbank im selben Cluster zeigt – bei uns die Testdatenbank:

**Rollen sind clusterweit, Rechte gelten pro Datenbank.** Nachdem die erste Datenbank
`mira_app` in `thealotta_app` umbenannt hat, existiert der alte Name nicht mehr. Legt man
danach eine zweite Datenbank an, läuft die Migrationskette dort von vorn: 0001 findet
`mira_app` nicht und legt es erneut an, 0003 vergibt die Tabellenrechte **dieser** Datenbank
an diesen neuen alten Namen. Jetzt stehen beide Namen im Cluster, und ein bloßes Umbenennen
fällt aus – die Anmelderolle ist im neuen Namen Mitglied, die Rechte hängen am alten.

Die Anwendung hätte danach auf keine Tabelle mehr gedurft. Zehn Tests der Grant-Matrix haben
das gezeigt, bevor irgendwas ausgerollt war.

0012 überträgt in diesem Fall die Rechte und entfernt die alte Rolle. Übertragen wird der
**tatsächliche ACL-Eintrag** aus `pg_class`, `pg_attribute` und `pg_namespace`, nicht die
Grant-Liste aus 0003. Das ist der Unterschied, auf den es ankommt: So bleibt erhalten, was
0003 hinterher wieder entzogen hat (`UPDATE`/`DELETE` auf `domain_events`, `audit_events`,
`state_observations`, `signals`) und was nur spaltenweise vergeben ist
(`monitors.next_evaluation_at` ja, `monitors.name` nein). Eine nachgebaute Grant-Liste hätte
beides stillschweigend verloren.

Am Ende der Migration steht die Gegenprobe in derselben Transaktion: keine Regel und kein
Trigger darf noch einen `mira_`-Namen nennen, und `thealotta_app` muss `SELECT` auf `tasks`
haben. Ohne diese Zeile wäre der Kollisionsfall grün durchgelaufen.

## Wer welche Rolle anlegt – umgedreht

Vorher legte das `initdb`-Skript Gruppen- **und** Anmelderollen an. Nach der Umbenennung wäre
daraus beim Frischaufbau ein Doppelbestand geworden: `initdb` hätte `thealotta_app` angelegt,
0001 daneben `mira_app`, und 0003 hätte die Rechte an das falsche vergeben.

Jetzt gilt eine klare Zuständigkeit:

| Wer | Was |
| --- | --- |
| `ops/docker/initdb/01-roles.sql`, `initdb-prod/01-roles.sh`, `ops/scripts/create-roles.sql` | **nur** die Anmelderollen (`*_user`) und `GRANT CONNECT` |
| Migration 0001 | Gruppenrollen (unter den alten Namen – die Datei ist unveränderlich) |
| Migration 0003 ff. | Tabellenrechte an die Gruppenrollen |
| Migration 0012 | benennt Gruppen- und Anmelderollen um, benennt die Funktionen um, hängt die Anmelderollen in ihre Gruppe |

## Was umbenannt wurde

| Kategorie | Umfang |
| --- | --- |
| **Datenbankrollen** | `mira_app`, `_monitor`, `_notifier`, `_sync`, `_maintenance` und die vier `*_user` → `thealotta_*` (Migration 0012) |
| **SQL-Funktionen** | `mira_bypass_rls`, `_current_households`, `_touch_updated_at`, `_check_domain_tree`, `_ownership_event`, `_audit_chain` → `thealotta_*` (Migration 0012) |
| **Datenbank und Superuser** | `mira` → `thealotta`, Passwort `mira_dev_only` → `thealotta_dev_only`, Testdatenbank `mira_test` → `thealotta_test` |
| **Docker** | Projektname `mira` → `thealotta` (damit auch die Containernamen), Images `mira-api/worker/web` → `thealotta-*` |
| **Pfade im Betrieb** | `/srv/mira` → `/srv/thealotta`, `/mnt/synology/mira` → `/mnt/synology/thealotta` |
| **Betriebswerkzeug** | `ops/scripts/mira` → `ops/scripts/thealotta` |
| **Dokumentation** | README, 08, 20, 21, 23, 27, 28, 44, 58, 59, 78 und `ops/runbooks/restore.md` inklusive der Cluster-Namen |
| **Kommentare** | die Stellen, die diese Rollen erklären (`Dockerfile.worker`, `state-machines/index.ts`, `notification-dispatch.ts`) |
| **Tests** | `packages/db/test/setup.ts`, `role-grants.spec.ts`, und in den e2e-Helfern der tote Rückfall auf die alten Browser-Namen |

## Bewusst behalten – und diesmal ist die Liste kürzer

### 1 – Rückfall-Pfade für Altbestand (Produktcode)

Sie lesen den alten Namen und schreiben den neuen. Sie zu ersetzen heißt nicht „umbenennen",
sondern „Verträglichkeit entfernen":

| Stelle | Was daran hängt |
| --- | --- |
| `apps/api/src/plugins/auth.ts` – `LEGACY_SESSION_COOKIE`, `LEGACY_CSRF_COOKIE` | jede offene Sitzung |
| `apps/web/src/lib/storage.ts` – `ALT = 'mira.'`, Farbschema-Wert `mira` | Farbschema, Dichte, zuletzt gewählter Haushalt, Puffer für offline Erfasstes |
| `apps/web/src/lib/api.ts` – zweiter Zweig in `csrfToken()` | Mutationen in einer Sitzung von vor der Umbenennung |
| `packages/services/.../transfer.service.ts` – `TRANSFER_FORMAT_ALT` | **`mira-p-st-2026-09-10.json` im Wurzelverzeichnis** – eine echte Sicherung, die einlesbar bleiben muss |
| `packages/domain/src/capacity.ts` – `MIRA_NOW_LIMIT` | eine bewusst gesetzte Grenze in einer Umgebung außerhalb dieses Verzeichnisses |
| `apps/api/test/transfer.spec.ts` | der Test, der genau das prüft |

Diese dürfen weg, sobald keine Sitzung, kein Gerät und keine Sicherungsdatei von vor
September 2026 mehr im Umlauf ist. Nicht früher.

### 2 – Angewendete Migrationen

`0001` bis `0010` nennen die alten Namen und bleiben unverändert: Eine nachträglich geänderte
Migration wird über ihre Prüfsumme abgelehnt ([ADR-0014](adr/ADR-0014-expand-contract-migrations.md)).
Sie legen die alten Namen an, 0012 räumt hinterher auf – auch bei einem Frischaufbau.

### 3 – Historische Aussagen

[docs/64](64-umbenennung.md), die Zeile im Dokumentenverzeichnis, der Hinweis in der README
und der Kommentar in `components.css` über die Breite der Wortmarke sprechen **über** den
alten Namen. Das ist die Aussage, nicht ein Rückstand.

### 4 – Die Nutzerdatei

`mira-p-st-2026-09-10.json` ist eine exportierte Sicherung eines Haushalts. Sie wurde nicht
angefasst – weder Name noch Inhalt. Fremde Daten werden nicht umbenannt, damit eine
Namensliste aufgeht.

## Zwei Fehler, die dabei aufgefallen sind

1. **`ops/scripts/dump-fixtures.mts` suchte das CSRF-Token im Cookie `mira_csrf`** – ohne
   Rückfall auf den neuen Namen. Da der Server nur noch `thealotta_csrf` setzt und den alten
   Namen beim Login sogar löscht, war das Token immer leer und jeder schreibende Aufruf des
   Fixture-Skripts lief in ein 403. Ein Rückstand der ersten Umbenennung, jetzt behoben.
2. **`docs/21-api-contract.md` nannte das Sitzungscookie `mira_session`**, während der Server
   `thealotta_session` schreibt. Ein Vertragsdokument, das den falschen Cookie-Namen nennt.

## Was geprüft wurde

| | |
| --- | --- |
| Typecheck | grün |
| Lint | grün |
| Tests | 995 grün, 9 übersprungen (73 Dateien) – gegen eine **isolierte** Postgres-Instanz, damit der Entwicklungsbestand unberührt bleibt |
| Migrationskette auf leerer Datenbank | 12 von 12 angewendet |
| Kollisionsfall (zweite Datenbank im Cluster) | Rechte übertragen, spaltenweise Rechte inklusive, alte Rolle entfernt |
| Nach der Migration | keine `mira`-Rolle, keine `mira`-Funktion, keine Regel mit `mira` im Cluster |
| Beide Compose-Dateien | `docker compose config` gültig |

Nicht gelaufen: die Browsersuite (braucht einen gebauten Stand und einen Seed) und der Umzug
des bestehenden Entwicklungsbestands – dafür liegt `ops/scripts/umbenennung-datenbank.sh`
bereit, das ohne `--jetzt` nur seinen Plan ausgibt.

## Der Umzug des bestehenden Bestands

Zwei Dinge können nicht in einer Migration stehen, deshalb gibt es dafür ein Skript:

- Der **Docker-Projektname** bestimmt den Namensraum der Volumes. Aus `name: mira` wurde
  `name: thealotta`, also sucht Compose ab jetzt `thealotta_pgdata` und fände ein leeres
  Verzeichnis, während der bisherige Bestand als `mira_pgdata` daneben liegt.
- **Datenbank- und Superusername** lassen sich nicht aus der laufenden Verbindung heraus
  umbenennen: weder die Datenbank, mit der man verbunden ist, noch die Rolle, als die man
  angemeldet ist. Dafür braucht es eine zweite Superuser-Rolle, die hinterher verschwindet.

Das Skript **kopiert** die Volumes statt sie zu verschieben. `mira_pgdata` bleibt liegen und
ist der Rückweg, solange man ihn nicht selbst entfernt.
