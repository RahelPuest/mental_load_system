# Der erste CI-Lauf

Mit dem Push nach GitHub lief die Pipeline aus `.github/workflows/ci.yml` zum ersten Mal
überhaupt. Drei von sechs Jobs waren rot. Keiner davon wegen der Umbenennung – alle drei Ursachen
lagen seit dem Wurzelcommit im Repository und konnten vorher niemandem auffallen, weil es keine
Versionsverwaltung und damit keinen Auslöser gab.

## 1. Zwei Datenbankjobs: 33 rote Suiten, eine Ursache

```
password authentication failed for user "thealotta_app_user"
```

Der Workflow legte die Anmelderollen mit `ops/scripts/create-roles.sql` an. Diese Datei setzte
ihre Passwörter selbst:

```sql
\set app_pw 'BITTE_ERSETZEN_app'
```

Die Tests verbanden sich dagegen mit `thealotta_dev_only` (`ci.yml`, `env:`). Zwei Werte, die
zueinander passen mussten, standen an zwei Stellen – und niemand hielt sie zusammen.

Die naheliegende Abkürzung wäre gewesen, in CI stattdessen `ops/docker/initdb/01-roles.sql` zu
benutzen, das die Entwicklungspasswörter schon enthält. Dann wäre aber genau die Datei
ungeprüft geblieben, die Betreiber ohne Docker benutzen. Also umgekehrt: `create-roles.sql` nimmt
die Passwörter jetzt als psql-Variablen entgegen.

```sql
\if :{?app_pw}
\else
\set app_pw 'BITTE_ERSETZEN_app'
\endif
```

Wer eine Variable weglässt, bekommt weiterhin einen Platzhalter, mit dem sich niemand anmelden
kann. Ein vergessenes Passwort soll den Zugang verwehren und nicht still ein bekanntes setzen.
Beide Zweige sind gegen ein echtes Postgres 16 geprüft, von außerhalb des Containers, wo
`scram-sha-256` gilt: mit Variable meldet sich `thealotta_app_user` an und ein falsches Passwort
wird abgewiesen; ohne Variable ist es genau umgekehrt.

> Der erste Anmeldetest lief *innerhalb* des Containers gegen `127.0.0.1` und war wertlos: dort
> steht in der Standard-`pg_hba.conf` `trust`, also kam auch mit falschem Passwort eine Antwort.
> Ein Test, der eine Authentifizierung prüfen soll, muss dort verbinden, wo sie stattfindet.

## 2. Der Sicherheitsjob: ein Wächter, der nichts liest

`gitleaks/gitleaks-action@v2` prüft bei einem `push` nur die Spanne `<vorher>^..<nachher>`.
`4f8e8fbe` ist der Wurzelcommit dieses Repositorys und hat kein `^`:

```
fatal: ambiguous argument '4f8e8fbe…^..eebd750…': unknown revision
WRN scanned ~0 bytes (0)
WRN no leaks found in partial scan
```

Der Job scheiterte – aber das war der harmlose Teil. Der Satz darunter ist der Befund: gitleaks
meldete **„no leaks found"** nach null gelesenen Bytes. Wäre der Exitcode zufällig 0 gewesen,
hätte die Pipeline eine Entwarnung angezeigt, die auf keiner Messung beruht.

Deshalb wird gitleaks jetzt direkt aufgerufen statt über die Action. Der Aufruf liest bei jedem
Anlass dieselbe vollständige Historie (`fetch-depth: 0` war schon da).

Die vollständige Prüfung fand dann 6 Treffer, alle im Wurzelcommit. Einzeln angesehen:

| Wert | Ort | Einschätzung |
|---|---|---|
| `bitte_ersetzen_mindestens_32_zeichen_lang_1234` | `.env.example` | Vorlage; muss die Mindestlänge zeigen |
| `test_secret_that_is_definitely_long_enough_1234` | `apps/api/test/helpers.ts` | Testharness |
| `entwicklung_nur_lokal_mindestens_32_zeichen_lang` | `ops/docker/docker-compose.yml` | nur lokal; der Produktivstack liest aus `.env.prod` |
| `ZGV2ZWxvcG1lbnRfb25seV9rZXlfMzJfYnl0ZXNfISE=` | ebenda | base64 von „development_only_key_32_bytes_!!" |
| `Korrekt-Pferd-Batterie-Klammer-7`, `Neues-Sicheres-Kennwort-99` | Tests, Demo-Seed | Konten in Wegwerfdatenbanken |
| `cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp` | `packages/services/src/bring/client.ts` | öffentlicher Web-App-Schlüssel von Bring!, im Quelltext auch so dokumentiert |

Kein echtes Geheimnis. `.gitleaks.toml` stellt diese sieben Zeichenketten frei – **Werte, keine
Pfade und keine Regeln.** Der Unterschied ist geprüft: legt man in `apps/api/test/helpers.ts`
neben den erlaubten Wert einen Stripe-Schlüssel, einen AWS-Schlüssel, einen GitHub-Token und
einen `api_key`, schlagen alle vier an.

Zwei Dinge, die dabei über gitleaks selbst sichtbar wurden und für die Konfiguration gelten:

- Global liest gitleaks 8.24 nur `[allowlist]` im **Singular**. `[[allowlists]]` im Plural wird
  ohne Warnung ignoriert – die erste Fassung dieser Datei war deshalb wirkungslos, was erst der
  Gegentest zeigte und nicht der Aufruf.
- `paths` und `regexes` in einem Block sind mit **ODER** verknüpft. Ein Pfad hätte die ganze
  Datei freigestellt statt des Werts darin. Darum stehen dort nur Werte.

Die Regeln von gitleaks brauchen ein englisches Schlüsselwort in der Nähe (`key`, `secret`,
`token`, `password`). Ein hochentropischer Wert hinter `X-ECHTES-GEHEIMNIS` wird nicht gefunden.
Das ist eine Grenze des Werkzeugs, keine der Konfiguration – aber eine, die man kennen muss,
bevor man sich auf einen grünen Job verlässt.

## Was sich geändert hat

| Datei | Änderung |
|---|---|
| `ops/scripts/create-roles.sql` | Passwörter als psql-Variablen, Platzhalter nur als Rückfallebene |
| `.github/workflows/ci.yml` | `DEV_DB_PASSWORD` an einer Stelle; Rollen mit `-v …`; gitleaks direkt statt über die Action |
| `.gitleaks.toml` | neu: sieben freigestellte Werte, je mit Begründung |
| `README.md` | Betriebsanleitung zeigt den Aufruf mit Variablen |

Gegengeprüft wurde lokal gegen ein Wegwerf-Postgres auf Port 55433, nicht gegen die
Entwicklungsdatenbank: Rollen anlegen, migrieren, `pnpm vitest run packages/db apps/api
apps/worker` (42 Dateien, 341 Tests grün), Seed einspielen, erneut migrieren (0 angewendet).
