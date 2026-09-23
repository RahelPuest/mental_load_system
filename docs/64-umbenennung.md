# 64 – Umbenennung: Mira → Thealotta

Das Produkt heißt jetzt **Thealotta**. Dieses Dokument hält fest, was umbenannt wurde, was
bewusst stehen geblieben ist und warum – damit der nächste Mensch, der `grep -i mira` laufen
lässt, jeden Treffer erklären kann, ohne zu raten.

## Die Schreibweise, einmal entschieden

| Zweck | Form | Beispiel |
| --- | --- | --- |
| Sichtbarer Name | `Thealotta` | Wortmarke, Seitentitel, Manifest, Fließtext |
| Technischer Bezeichner, Paket, Slug, Dateiname | `thealotta` | `@thealotta/db`, `thealotta-export.json` |
| Konstante, Umgebungsvariable | `THEALOTTA_…` | `THEALOTTA_NOW_LIMIT` |
| PascalCase im Code | `Thealotta` | – |

**Warum groß?** Die Vorgabe lautete „grundsätzlich thealotta", mit der Rückfrage, ob die
Anwendung sichtbare Eigennamen systematisch großschreibt. Sie tut es – „Mira" stand überall
groß, und deutsche Eigennamen werden großgeschrieben. Ein kleingeschriebenes „thealotta"
mitten im Satz („thealotta meldet sich nur, wenn …") läse sich als Tippfehler.

## Eine Konstante, kein Textersatzwerk

`packages/contracts/src/brand.ts` hält `APP_NAME`, `APP_SLUG` und `APP_DESCRIPTION`.

Sie gilt für **Metadaten und Kopfzeilen** – Stellen, an denen der Name allein steht: Wortmarke,
Seitentitel, Manifest, Absender, Dateinamen. Sie gilt **nicht** für Fließtext. `${APP_NAME}
meldet sich nur, wenn es einen Anlass gibt` ist für jeden Leser des Quelltextes schlechter als
der Satz selbst und bringt nichts, was ein `grep` nicht auch kann. Abstraktion um ihrer selbst
willen ist keine Vorsorge.

## Was umbenannt wurde

| Kategorie | Umfang |
| --- | --- |
| **Sichtbarer Name** | Wortmarke, Anmeldung, Onboarding, Navigation, Hilfe, alle Seiten, Bögen, Leerzustände, Fehlermeldungen, Tooltips, `aria-label`, Toasts |
| **Metadaten** | `<title>`, `meta description`, Manifest (`name`, `short_name`), Icon-`aria-label`, Service Worker (Titel einer Push-Nachricht ohne eigenen Titel) |
| **Pakete** | `@mira/*` → `@thealotta/*` in neun Arbeitsbereichspaketen, dazu `tsconfig.base.json`, alle Importe, Dockerfiles, Wurzel-`package.json` |
| **Dokumentation** | README, `docs/`, ADRs, Runbooks – 30 Dateien |
| **Kommentare** | Block- und Zeilenkommentare in allen Paketen |
| **Tests** | Erwartete Produktnamen, Testhilfen, e2e-Selektoren |
| **Etiketten** | `SERVICE_NAME`, Protokollname des Workers, Prüf-Image-Tags in CI, Containernutzer in den Images |
| **Interne Bezeichner** | `mira-css` → `thealotta-css`, `datalist`-Ids, Ziehdatentypen `application/x-thealotta-*`, `__thealottaDeferredSend`, `X-THEALOTTA-PROCESS-ID` |
| **Dateinamen für Nutzer** | Sicherungsdatei `mira-…json` → `thealotta-…json` |
| **Problem-URIs** | `https://mira.app/errors/*` → `https://thealotta.app/errors/*` |

Keine Datei und kein Ordner im Verzeichnis trug den Namen – es gab nichts umzubenennen.
Das Icon ist eine geometrische Marke ohne Schriftzug; sein `aria-label` war die Wortmarke und
wurde geändert. Ein Logo-Redesign hat nicht stattgefunden.

## Umzüge statt Schnitte

Vier Bezeichner waren **persistiert**. Sie einfach umzubenennen hätte Daten gekostet. Für jeden
gibt es einen Umzug: Der neue Name wird geschrieben, der alte noch gelesen.

| Was | Ohne Umzug wäre passiert | Lösung |
| --- | --- | --- |
| Cookies `mira_session`, `mira_csrf` | **Jede offene Sitzung beendet.** Der Browser sendet den alten Namen, der Server sucht den neuen | Server liest beide, schreibt und löscht auf den neuen (`apps/api/src/plugins/auth.ts`) |
| `localStorage`-Schlüssel `mira.*` | Farbschema, Dichte, zuletzt gewählter Haushalt **und der Puffer für offline Erfasstes** verloren | `apps/web/src/lib/storage.ts` – liest neu, sonst alt, zieht den Wert um und räumt den alten weg |
| Farbschema-Wert `mira` | Wer das Standardschema gewählt hatte, bekäme ein leeres `data-scheme` | Wird beim Lesen auf `thealotta` übersetzt |
| Kennung der Sicherungsdatei `mira.household` | **Alte Sicherungen nicht mehr einlesbar.** Eine Sicherung, die nach einer Umbenennung nicht zurückzuspielen ist, ist keine | Geschrieben wird `thealotta.household`, gelesen werden beide |

Dazu eine Umgebungsvariable: `MIRA_NOW_LIMIT` heißt `THEALOTTA_NOW_LIMIT` und wird unter dem
alten Namen noch gelesen – sie steht in Deployment-Konfiguration außerhalb dieses
Verzeichnisses, und sie still fallen zu lassen hieße, eine bewusst gesetzte Grenze ohne
Meldung durch die Vorgabe zu ersetzen.

**Diese Rückfälle sind kein Dauerzustand.** Sie dürfen entfernt werden, sobald keine Sitzung
und kein Gerät von vor der Umbenennung mehr im Umlauf ist; an jeder Stelle steht ein
Kommentar, der das sagt.

## Nachtrag (September 2026)

Die unter „Bewusst behalten" aufgeführten Punkte 1 bis 4 sind **inzwischen umbenannt** –
Datenbankrollen, SQL-Funktionen, Datenbank- und Superusername, Docker-Projektname und die
Cluster-Namen im Restore-Runbook. Siehe [79](79-umbenennung-zu-ende.md); dort steht auch,
warum die Begründung unter Punkt 2 (»sämtliche Policies neu schreiben«) so nicht zutraf.

Bestand haben weiterhin: die Rückfall-Pfade unter „Umzüge statt Schnitte", die angewendeten
Migrationen 0001–0010, die Nutzerdatei aus Punkt 5 und die historischen Aussagen aus Punkt 6 –
also auch dieses Dokument. Der Abschnitt unten bleibt stehen, weil er den damaligen Stand
festhält, nicht den heutigen.

## Bewusst behalten

Jeder verbleibende `mira`-Treffer im Verzeichnis fällt unter einen dieser Punkte.

### 1 – Datenbankrollen und ihre Zugangsdaten

`mira_app`, `mira_monitor`, `mira_notifier`, `mira_sync`, `mira_maintenance`, `mira_app_user`,
`mira_monitor_user`, `mira_notifier_user`, `mira_sync_user`, das Passwort `mira_dev_only`,
Datenbank- und Benutzername `mira`.

Das sind Objekte in einer **laufenden Datenbank** und in Zugangsdaten außerhalb dieses
Verzeichnisses. Sie hier umzubenennen, ohne sie dort umzubenennen, macht jede Verbindung
kaputt – und die Reihenfolge (erst Rolle anlegen, dann Rechte übertragen, dann Zugangsdaten
tauschen, dann alte Rolle löschen) ist ein eigenes Wartungsfenster, kein Nebeneffekt einer
Umbenennung.

Betroffen: `.env.example`, `.github/workflows/ci.yml`, `ops/docker/docker-compose.yml`,
`ops/docker/initdb/01-roles.sql`, `ops/scripts/create-roles.sql`, `packages/db/migrations/*`,
`packages/db/test/*`, dazu die Kommentare, die diese Rollen erklären.

### 2 – SQL-Funktionen und Trigger

`mira_bypass_rls`, `mira_current_households`, `mira_touch_updated_at`, `mira_check_domain_tree`,
`mira_audit_chain`, `mira_ownership_event`.

`mira_bypass_rls()` und `mira_current_households()` stehen in der `USING`- und `WITH CHECK`-
Klausel **jeder** Zeilensicherheitsregel; `mira_touch_updated_at()` hängt an jedem Trigger. Sie
umzubenennen hieße, sämtliche Policies und Trigger in einer Migration neu zu schreiben – ein
Eingriff in die Mandantentrennung, für einen Namen, den kein Nutzer je sieht. Das Risiko steht
in keinem Verhältnis.

### 3 – Docker-Projektname und Testdatenbanken

`name: mira` in `docker-compose.yml` bestimmt den Namensraum der **Volumes**. Ein anderer
Projektname heißt: neues, leeres Datenverzeichnis, und die lokale Entwicklungsdatenbank liegt
verwaist daneben. `mira_test` und die Testdatenbank in CI hängen an denselben Zugangsdaten.

### 4 – Objekte im Kubernetes-Cluster

`kubectl -n mira`, `deploy/mira-api`, `deploy/mira-worker-*` in `ops/runbooks/restore.md`.

Ein Runbook, das andere Namen nennt als der Cluster, ist genau dann falsch, wenn es gebraucht
wird. Der Hinweis steht jetzt im Runbook selbst.

### 5 – Nutzerinhalt

`mira-p-st-2026-09-10.json` im Wurzelverzeichnis ist eine **exportierte Sicherungsdatei eines
Haushalts**. Sie wurde nicht angefasst (§30) – und sie bleibt einlesbar, weil der Import beide
Kennungen kennt.

### 6 – Historische Aussagen

`packages/contracts/src/brand.ts` und dieses Dokument sprechen über den alten Namen. Das ist
die Aussage, nicht ein Rückstand.

## Außerhalb des Verzeichnisses

Diese Stellen lassen sich von hier aus nicht ändern und brauchen eine eigene Entscheidung:

| Stelle | Was zu tun wäre |
| --- | --- |
| **Datenbankrollen und Passwörter** | Rollen anlegen, Rechte übertragen, Zugangsdaten in den Secrets tauschen, alte Rollen löschen – in einem Wartungsfenster |
| **Kubernetes-Namensraum und Deployments** | Neu ausrollen unter neuem Namen, Ingress und DNS mitziehen |
| **Domain `thealotta.app`** | Die Problem-Typ-URIs zeigen jetzt dorthin. Sie müssen nicht auflösen (RFC 7807 verlangt das nicht), aber wenn, dann auf eine Fehlerbeschreibung |
| **Bring!-Konto** | Artikel tragen den Zusatz „aus Thealotta". Was vor der Umbenennung gesendet wurde, steht dort weiter als „aus Mira" – fremde Daten, nicht unsere |
| **Push-Dienst (VAPID)** | Der Absendername in den Push-Einstellungen des Betriebssystems folgt dem Manifest; installierte Geräte übernehmen ihn beim nächsten Neuinstallieren |
| **E-Mail-Absender** | `SMTP_FROM` steht in der Umgebung. Die Vorgabe im Code heißt jetzt „Thealotta", die gesetzte Variable im Betrieb muss nachgezogen werden |

## Was geprüft wurde

| | |
| --- | --- |
| Typecheck | grün |
| Lint | grün |
| Node-Tests | 928 grün |
| Web-Tests (jsdom) | 441 grün |
| Browsertests (chromium + touch) | 339 grün |
| Build | grün |
| Sichtprüfung | Anmeldung, Jetzt, Familie, Bereiche, Kalender, Essen, Einstellungen, Hilfe – Wortmarke, Seitentitel und Fließtext auf 1440 px und 390 px |

Ein Test wurde geändert und einer ergänzt: Der Export schreibt die neue Kennung (geändert),
und eine Datei mit der alten Kennung lässt sich weiterhin einlesen (neu). Kein Test wurde
abgeschwächt.

### Ein Layoutproblem, das die Umbenennung verursacht hat

„Thealotta" ist mehr als doppelt so breit wie „Mira" (75 gegen 34 px). In der Kopfzeile stand
daneben der Haushaltsname; auf 390 px blieb davon „F…" übrig – das sieht aus wie ein Fehler
und sagt weniger als nichts. Unter 460 px tritt der Haushaltsname jetzt zurück; er steht in
den Einstellungen, und die Auswahlliste bei mehreren Haushalten bleibt, weil sie dort
Bedienelement ist und nicht Auskunft.

Sonst nichts: keine Informationsarchitektur, keine Navigation, keine Funktion, kein
Datenmodell wurde nebenbei verändert (§37).
