# Thealotta

**„Ich muss nicht daran denken, woran ich denken muss.“**

Thealotta ist ein Mehrbenutzersystem gegen familiären Mental Load. Es ist bewusst *kein*
Aufgabenverwalter mit Familienfreigabe. Der Kern ist die Trennung von vier Dingen, die in
gewöhnlichen To-do-Listen zu einer einzigen Zeile zusammenfallen:

| | |
| --- | --- |
| **Verantwortung** | Wer denkt an dieses Thema, auch wenn gerade nichts zu tun ist? |
| **Wissen** | Was wissen wir darüber – einschließlich „nichts, und das ist das Problem“? |
| **Aufmerksamkeit** | Was könnte demnächst nötig werden? |
| **Arbeit** | Was ist der nächste machbare Schritt? |

Das System geht davon aus, dass Aufmerksamkeit, Energie und Erinnerungsfähigkeit schwanken.
Das ist der Normalfall, nicht der Sonderfall.

> Die Anwendung hieß bis September 2026 **Mira**. Umbenannt wurde zuerst, was Menschen sehen
> ([docs/64](docs/64-umbenennung.md)), inzwischen auch Datenbankrollen, SQL-Funktionen,
> Container und Verbindungszeichenfolgen ([docs/79](docs/79-umbenennung-zu-ende.md)).
> Der alte Name lebt nur noch dort, wo Altbestand ihn braucht: in Sitzungscookies, in
> `localStorage`-Schlüsseln und in der Kennung alter Sicherungsdateien – jeweils lesend.

---

## Inhalt

- [Das Modell](#das-modell)
- [Was das System kann](#was-das-system-kann)
- [Schnellstart](#schnellstart)
- [Projektstruktur](#projektstruktur)
- [Die Oberfläche](#die-oberfläche)
- [Tests](#tests)
- [Betrieb](#betrieb)
- [Sicherheit](#sicherheit)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)
- [Dokumentation](#dokumentation)

---

## Das Modell

```
OWN        Wofür sind wir verantwortlich?        Domain + ResponsibilityAssignment
  ↓
KNOW       Was wissen wir – einschließlich       StateDefinition/Value, Knowledge, Question
           „nichts"?
  ↓
MONITOR    Was muss beobachtet werden?           Monitor + MonitoringRule
  ↓
ANTICIPATE Was könnte nötig werden?              Signal → AttentionItem → Need
  ↓
TRIGGER    Wann ist der richtige Moment?         ContextRequirement, WaitingState, Kalender
  ↓
ACT        Was ist der nächste Schritt?          Process → Task
  ↓
LEARN      Was haben wir gelernt?                Observation, Knowledge, Freshness-Reset
  ↓
KNOW       (Rückfluss)
```

Zwischen Beobachtung und Aufgabe liegt eine Schicht, und zwar absichtlich: Ein Monitor erzeugt
ein **Signal**, daraus wird ein **Aufmerksamkeitseintrag** – und erst eine menschliche
Entscheidung macht daraus einen Vorgang. So werden aus zehn beobachteten Risiken nicht zehn
Aufgaben ([ADR-0004](docs/adr/ADR-0004-attention-layer.md)).

Fünfzehn [System-Invarianten](docs/08-invariants.md) halten das Versprechen technisch zusammen.
Die wichtigste: **Nichts geht still verloren.** Es gibt im gesamten Modell keinen Übergang, bei
dem ein offener Vorgang allein durch Zeitablauf in einem Endzustand landet. Jede Invariante hat
einen Durchsetzungspunkt im Code **und** mindestens einen Test; ein Prüfskript vergleicht beides
und schlägt fehl, wenn eine Invariante ohne Test bleibt.

---

## Was das System kann

| Ort | Wofür |
| --- | --- |
| **Jetzt** | Was gerade zählt – kuratiert, begründet, mit nächstem Schritt. Harte Obergrenze; bei wenig Kapazität genau eine Sache. |
| **Der Plan** | Was diese Woche ansteht – Termine und Offenes aller. |
| **Eingang** | Erfasstes einsortieren. Ein begründeter Vorschlag ist schon vorausgewählt. |
| **Bereiche** | Der Baum eurer Themen und wer für welches mitdenkt. Fehlende Zuständigkeit wird schraffiert gezeigt, nicht verschwiegen. |
| **Familie** | Kapazität, Vertretungen, Care Mode, Verteilung, Mitglieder. |
| **Vorgänge** | Alles Mehrschrittige, bereichsübergreifend, nach Zustand gefiltert. |
| **Wissen** | Notizen, offene Fragen und Entscheidungen an einem Ort. |
| **Regeln** | Was von selbst passiert oder auffällt – Beobachtung, Wiederholung, Folgeaufgabe – und was sich gemeldet hat ([docs/51](docs/51-recurring-tasks.md)). |
| **Essen** | Gerichtesammlung, Wochenplan mit gewichteten Vorschlägen und die daraus abgeleitete Einkaufsliste ([docs/63](docs/63-essensplanung.md)). |
| **Kalender** | Verbundene Kalender, Sichtbarkeit je Kalender, nächste Termine. |
| **Abläufe** | Erprobte Schrittfolgen; daraus lässt sich ein Vorgang starten. |
| **Einstellungen** | Haushalt, Mitglieder, Einladungen, Wer sieht was, Benachrichtigungen, Darstellung, Geräte, Konto, Daten, Protokoll. |

Quer dazu liegen ein paar Entscheidungen, die das Produkt prägen:

- **Erfassen in zwei Sekunden**, von überall: erhöhte Taste, `⌘N` oder Befehlspalette. Es öffnet
  einen Bogen über der aktuellen Seite – der Kontext geht nie verloren, und offline geht es auch.
- **Rückgängig statt Rückfragen.** Abhaken wirkt sofort und meldet sich mit „Rückgängig“. Für
  etwas, das sich zurücknehmen lässt, gibt es keinen Bestätigungsdialog.
- **Abgeben ist nicht Zuweisen.** Wer eine Aufgabe weitergibt, sagt dabei, *was* er abgibt: nur
  die Ausführung, oder auch das Mitdenken. Beides ist erlaubt, aber es ist nicht dasselbe.
- **Warten ist ein Zustand, kein Versäumnis.** Wer auf jemanden wartet, hinterlegt worauf und
  wann erneut geschaut wird. Bis dahin verschwindet die Sache aus „Jetzt“, ohne aus der
  Verantwortung zu fallen.
- **Ohne Berechtigung sieht man, *dass* es etwas gibt** – nicht was. Das ist ein ruhiger eigener
  Zustand mit dem Weg zur zuständigen Person, keine Fehlermeldung.
- **Fließtextfelder verstehen Markdown**, erzeugen aber niemals HTML: Der Parser baut
  React-Knoten ([docs/70](docs/70-markdown-in-textfeldern.md)).
- **Einen Bereich aufteilen, ohne neu zu tippen**: Angaben, Notizen, Regeln und Vorgänge lassen
  sich mehrfach auswählen und in einen anderen Bereich umhängen. Eine Regel und die Angabe, die
  sie beobachtet, bleiben dabei zusammen; der Verlauf jedes Eintrags kommt mit
  ([docs/72](docs/72-umhaengen.md)).
- **Daten mitnehmen**: Export und Import eines Haushalts als eine JSON-Datei, direkt über die
  Leitung ([docs/58](docs/58-import-export.md)). Einkäufe lassen sich an **Bring!** schicken –
  gegen eine Schnittstelle ohne Zusage, mit einem Passwort, das nicht gespeichert wird
  ([docs/59](docs/59-bring.md)).

Die Modellbegriffe – Signal, Attention Item, Domain – tauchen in der Oberfläche nirgends auf.

---

## Schnellstart

**Voraussetzungen:** Node ≥ 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env

# Postgres, Redis und Mailpit starten
pnpm stack:up

# Schema anlegen – als Superuser; die Anwendung verbindet später als eingeschränkte Rolle
DATABASE_URL='postgres://thealotta:thealotta_dev_only@localhost:55432/thealotta' pnpm db:migrate

# Realistischen Demo-Haushalt anlegen
pnpm db:seed
```

In drei Terminals:

```bash
pnpm dev:api      # Port aus .env (PORT), Standard 3000
pnpm dev:worker   # Hintergrundjobs
pnpm dev:web      # http://localhost:5173  ← hier arbeiten
```

Die Weboberfläche leitet `/api` an die API weiter; im Browser wird nur Port 5173 gebraucht.
Das Passwort des Demo-Haushalts gibt `pnpm db:seed` aus, die Adressen stehen in `users`.

> **Port 3000 schon belegt?** Kommt häufig vor (Obsidian, Grafana, andere Entwicklungsserver).
> In der `.env` beide Werte auf denselben freien Port setzen – sonst zeigt der Proxy der
> Oberfläche ins Leere:
> ```
> PORT=3001
> VITE_API_URL=http://127.0.0.1:3001
> ```

### Sofort sehen, was das System tut

```bash
SMOKE_BASE_URL=http://localhost:3000 \
SMOKE_EMAIL='<E-Mail aus dem Seed>' \
pnpm tsx ops/scripts/smoke.ts
```

Ausgabe (gekürzt):

```
  Monitore            → 3 ausgewertet, 3 neue Hinweise
  Aufmerksamkeit      → 3 offen
      · Schuhgröße könnte inzwischen veraltet sein – „Schuhgröße" wurde zuletzt am 20.07.2026
        bestätigt (vor 49 Tagen). Vorgesehen ist eine Prüfung alle 6 Wochen.
  Jetzt-Ansicht:
      Jetzt relevant:
        · Beim nächsten Schuheanziehen Zehenraum prüfen
          (Passender Moment, Schnell erledigt, Dein Verantwortungsbereich)
  Ohne Verantwortung  → familie.versicherungen, kinder.kind_a.kita
```

Jede Zeile unter „Jetzt relevant“ trägt ihre Begründung mit sich. Das ist keine Nettigkeit,
sondern eine erzwungene Eigenschaft ([INV-008](docs/08-invariants.md)): Das Begründungsfeld ist
`NOT NULL`.

---

## Projektstruktur

```
apps/
  api/              Fastify-HTTP-API: Routen, Plugins, Fehlerabbildung
  worker/           Hintergrundjobs: Outbox-Relay, Monitoring, Kalender-Sync, Zustellung
  web/              React-PWA mit eigenem Designsystem
packages/
  domain/           Reine Fachlogik – ohne Datenbank, ohne Netz, ohne Systemuhr
  services/         Anwendungsdienste (von API und Worker gemeinsam genutzt)
  contracts/        Zod-Schemas, kontrollierte Vokabulare, Umgebungsvalidierung
  db/               Schema, SQL-Migrationen, RLS-Policies, Ledger-Schreiber
  crypto/           AES-256-GCM-Envelope, Argon2id, Token-Hashing
  observability/    Logger mit Redaction-Allowlist, Metriken
ops/
  docker/ ci/ scripts/ runbooks/
docs/               Architektur, Invarianten, ADRs, Betriebshandbücher
```

**Abhängigkeitsregel:** `@thealotta/domain` importiert nichts aus `db`, `api` oder `worker` und
liest die Systemuhr nicht. Die gesamte Fachlogik ist damit ohne Datenbank testbar – die
Voraussetzung dafür, dass die Invarianten schnelle, deterministische Tests haben. Eine
ESLint-Regel setzt beides durch; guter Wille reicht dafür nicht.

---

## Die Oberfläche

Ansichten sind nach **Situationen** geschnitten, nicht nach Datenmodell. Die Informationsarchitektur
steht an genau einer Stelle (`apps/web/src/lib/navigation.ts`); Seitenleiste, mobile Übersicht und
Befehlspalette lesen dieselbe Liste, damit keine Funktion unauffindbar wird
([docs/45](docs/45-navigation-model.md)).

Die Gruppen folgen dem Produktmodell: **Täglich** (Jetzt, Der Plan, Eingang) – **Verantwortung**
(Bereiche, Familie) – **Übersicht** (Vorgänge, Wissen, Regeln, Essen, Kalender, Abläufe).

Über allem liegt eine Kopfleiste: links Marke und Haushalt, rechts Suche (`⌘K`), Meldungen, Hilfe,
Einstellungen, eigenes Konto. Suchen, Meldungen und Konto sind **Werkzeuge, keine Orte** – in der
Ortsliste standen sie gleichrangig neben „Bereiche“ und konkurrierten mit ihr um Aufmerksamkeit.

Mobil bleiben vier Ziele im Daumenbereich plus die erhöhte Erfassen-Taste; **Übersicht** listet
alle Orte mit je einem Satz dazu, wofür sie da sind – kein Sammelbecken für Reste, sondern ein
erklärtes Verzeichnis.

Die Bereichsdetailseite ist **eine** Seite statt sechs Reitern, in Prioritätsreihenfolge, mit
Zuständigkeit, Beobachtung und Verlauf ab 1180 px in einer Nebenspalte
([docs/61](docs/61-bereichskopf.md)).

### Gestaltung: Papier & Stempel

Ein Designsystem mit Tokens für Farbe, Typografie, Abstand, Radius, Tiefe und Bewegung
([docs/42](docs/42-design-system.md)), seit [docs/69](docs/69-papier-und-stempel.md) in der
Richtung „Papier & Stempel“:

- **Der Rand ist Tinte.** Zwei Pixel, schwarz, sichtbar – an jeder Karte, jedem Feld, jedem Knopf.
  Eine Gruppe ist ein Bogen Papier auf dem Tisch, und ein Bogen hat eine Kante.
- **Der versetzte Schatten bedeutet etwas.** Drei Pixel nach rechts unten, ohne Weichzeichnung,
  und **nur an Dingen, die man drücken kann**. Beim Drücken senkt sich das Element auf seinen
  eigenen Abdruck. Flächen bekommen ihn nie.
- **Die Schraffur zeigt das Fehlende.** Ein Bereich ohne Zuständigkeit ist ein sichtbar
  unbestelltes Feld.
- **Eine Schrift, zwei Ausprägungen.** Bricolage Grotesque über Gewicht und Breitenachse statt
  zweier Familien; zwei Schriftdateien, 128 kB für deutschen Text.
- **Vier Flächenfarben mit fester Bedeutung** auf Haferpapier (`#f3ede0`) und Tinte (`#141210`):
  Tomate für Kritisches, Senf für Aufmerksamkeit, Tanne für Handlung, Flieder für Termine. Keine
  Verläufe, keine Zwischentöne, keine fünfte. Im Dunkeln dreht sich das Paar Papier/Tinte um.

**Rot bleibt echten Konsequenzen vorbehalten** – ein überschrittener Zeitpunkt ist kein Notfall.
Vier Fremdpaletten (Dracula, Catppuccin, Nord, Solarized) überschreiben nur Farbe
([docs/47](docs/47-color-schemes.md)); zwölf geprüfte Personenfarben sind je Betrachter wählbar
([docs/49](docs/49-color-coding.md)).

Barrierefreiheit ist Teil der Definition of Done, nicht Nacharbeit: semantisches HTML, sichtbarer
Fokus, Trefferflächen ≥ 44 px, jede Statusfarbe zusätzlich als Text, Fokusfalle und Escape in
Overlays, Live-Regionen, `prefers-reduced-motion`, `prefers-color-scheme`. Alle vierzehn
Kontrastpaare sind in beiden Modi durchgerechnet: null Verstöße.

Die Seiten werden einzeln nachgeladen; der Einstieg braucht neben dem Vendor-Brocken 92 kB.

---

## Tests

```bash
pnpm test                        # Fachlogik, API, Worker, Oberfläche (benötigt den Stack)
pnpm vitest run packages/domain  # reine Fachlogik, ohne I/O, < 5 s
pnpm test:web                    # nur die Oberfläche in jsdom, ohne Stack
pnpm test:e2e                    # echter Browser: Layout, Breakpoints, Barrierefreiheit
pnpm test:all                    # alles zusammen
pnpm lint
pnpm typecheck
```

**1004 Tests** in jsdom und Node (995 grün, 9 bewusst übersprungen), dazu **374 Prüfungen im
echten Browser**:

| Bereich | Was geprüft wird |
|---|---|
| `packages/domain` | Autorisierung, Zustandsautomaten, Monitoring-Regeln, Konfliktauflösung, Priorisierung |
| `packages/db` | RLS-Abdeckung, Rollen-Grant-Matrix, Schema-Parität zwischen Drizzle und Datenbank |
| `apps/api` | Akzeptanzszenario §44, Tenant-Isolation, Invarianten INV-001…015, Playbooks, Einstellungen, Kalender, Suche, Berechtigungen, Einladungen, Care Mode, Verteilung, Essensplanung |
| `apps/worker` | ICS-Parsing inklusive Sommerzeit, SSRF-Schutz, Job-Idempotenz |
| `apps/web` | Jede Ansicht in jedem Zustand, Barrierefreiheit, Farbkontraste, zentrale Abläufe, **Erreichbarkeit jeder Funktion** |
| `apps/web/e2e` | Chromium: Layout bei fünf Breiten, Trefferflächen am Finger, axe nach WCAG A/AA, Typografie an 22 Seiten ([docs/46](docs/46-browser-verification.md)) |

Die Oberflächentests laufen gegen **echte, mitgeschnittene Serverantworten**
(`apps/web/test/fixtures/api.json`, erneuerbar mit `pnpm fixtures`). Attrappen bestätigen nur,
was man beim Schreiben des Tests ohnehin geglaubt hat; ein Mitschnitt fällt auf, wenn sich ein
Vertrag ändert.

### Vier Tests, die stellvertretend für die Haltung stehen

- **`apps/api/test/acceptance/shoe-scenario.spec.ts`** fährt das vollständige Szenario aus §44
  ab – Bereichsanlage, veralteter Zustand, erzeugtes Signal, Idempotenz der zweiten Auswertung,
  Kontextprüfung, Abschluss durch eine andere Person, ohne dass sich Verantwortung verschiebt.
  Mit kontrollierter Uhr, ohne Wartezeit.
- **`apps/api/test/tenant-isolation.spec.ts`** liest die *tatsächlich registrierten* Routen aus
  Fastify und prüft jede einzelne gegen einen fremden Haushalt. Eine neue Route ohne Isolation
  lässt die CI fehlschlagen, ohne dass jemand daran denken muss.
- **`apps/api/test/invariants/invariant-coverage.spec.ts`** vergleicht die in
  `docs/08-invariants.md` dokumentierten Invarianten mit den vorhandenen Testdateien. Ohne ihn
  wäre die Invariantenliste eine Absichtserklärung.
- **`apps/api/test/write-durability.spec.ts`** hält fest, dass eine bestätigte Schreiboperation
  auch geschehen ist. Bis zum dritten Durchgang ging jede Antwort **vor** dem COMMIT hinaus –
  ein gescheitertes COMMIT hätte einen Client hinterlassen, der „201 Created“ gelesen hat
  ([docs/44](docs/44-ux-audit-3.md), Befund C3).

### Zwei Fallen beim Browserlauf

Vor dem ersten Lauf einmal `npx playwright install chromium`. Dann:

**1. Die Uhr.** Der API-Harness hat eine feste Uhr (`apps/api/test/helpers.ts`). Jedes Datum in
einem Test muss aus `h.clock` kommen. Wer `Date.now()` gegen einen Wert stellt, den der Dienst
aus der festen Uhr gerechnet hat, schreibt einen Test, der irgendwann von selbst rot wird
([docs/71](docs/71-zeitbomben-in-tests.md)).

**2. Das Konto.** `E2E_EMAIL` darf nicht irgendein Demokonto sein: Die Browsertests rufen
Bereiche über feste IDs auf, und die gehören dem Haushalt, den der **erste** Seed angelegt hat.
Ein zweiter `pnpm db:seed` legt einen weiteren Haushalt an; mit dessen Konto fallen rund 45
Tests, ohne dass etwas kaputt ist. Die passende Adresse findet man über genau die ID, auf die
die Suite zeigt (`SCHUHE` in `apps/web/e2e/domain-view.spec.ts`) – nicht über den Namen des
Bereichs, den gibt es nach mehreren Seeds mehrfach:

```bash
docker exec thealotta-postgres-1 psql -U thealotta -d thealotta -t -A -c \
  "SELECT u.email FROM household_memberships m JOIN users u ON u.id = m.user_id
   WHERE m.household_id = (SELECT household_id FROM domains WHERE id = '01a07d11-afa5-7f8e-90a0-ed9ba4d53687')
     AND m.role = 'admin';"
```

---

## Betrieb

Container-basiert, ohne Bindung an einen Cloud-Anbieter. Vorausgesetzt werden ein verwaltetes
PostgreSQL 16 mit Point-in-Time-Recovery und ein Redis 7.

### 1. Datenbankrollen anlegen (einmalig, als Superuser)

```bash
psql "$ADMIN_URL" -f ops/scripts/create-roles.sql
```

> **Das ist kein optionaler Härtungsschritt.** Postgres umgeht Row Level Security für Superuser
> und Tabelleneigentümer – auch bei `FORCE ROW LEVEL SECURITY`. Verbindet die Anwendung als
> Superuser, ist die Mandantentrennung wirkungslos, und der Test, der sie prüft, wäre trotzdem
> grün. Deshalb: `thealotta_app_user` besitzt keine Tabelle und ist kein Superuser.

### 2. Migrationen

```bash
DATABASE_URL="$ADMIN_URL" pnpm db:migrate
```

Migrationen sind unveränderlich: Eine nachträglich geänderte Datei wird beim nächsten Lauf über
ihre Prüfsumme abgelehnt. Alle Migrationen sind additiv (Expand/Contract,
[ADR-0014](docs/adr/ADR-0014-expand-contract-migrations.md)), sodass ein Rollback ohne
Datenbankeingriff möglich bleibt.

### 3. Ausrollen

```bash
docker compose -f ops/docker/docker-compose.yml --profile app up -d --build
```

In Produktion laufen **drei getrennte Worker-Deployments mit unterschiedlichen `DATABASE_URL`s**:

| Deployment | Rolle | Warum |
|---|---|---|
| `worker-default` | `thealotta_app` | Wartung, Outbox-Relay |
| `worker-sync` | `thealotta_sync` | Kalender – **kann keine Aufgaben löschen oder abschließen** (INV-012) |
| `worker-notify` | `thealotta_notifier` | Zustellung – **kann fachliche Objekte nur lesen** (INV-006) |

Zwei Invarianten sind damit keine Konvention, sondern Berechtigung.
`packages/db/test/role-grants.spec.ts` prüft die Matrix bei jedem CI-Lauf.

### 4. Erforderliche Konfiguration

Alle Werte werden beim Start gegen ein Zod-Schema geprüft; fehlt ein Geheimnis, bricht der
Prozess sofort ab, statt später unauffällig zu scheitern.

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Anwendungsrolle, **nicht** Superuser |
| `SESSION_SECRETS` | ≥ 32 Zeichen, kommagetrennt für Rotation |
| `ENCRYPTION_KEYS` | `{"keyId":"<32 Byte base64>"}` – alte Schlüssel bleiben zum Entschlüsseln |
| `ENCRYPTION_ACTIVE_KEY_ID` | Schlüssel für neue Chiffrate |
| `REDIS_URL` | Nur Transport – die Wahrheit steht in Postgres |
| `VAPID_*` | Web Push (optional) |
| `SMTP_URL` | E-Mail-Zustellung (optional) |

### 5. Laufender Betrieb

- Health: `/health/live`, `/health/ready`
- Metriken: `/metrics` (Prometheus)
- Betriebshandbücher: [`ops/runbooks/`](ops/runbooks/) – Restore, Kalenderausfall, DLQ,
  Schlüsselrotation, Haushaltslöschung

Ein Backup zählt erst als Backup, wenn der Restore getestet wurde. Die Metrik
`backup_restore_verified_timestamp` alarmiert, wenn die letzte erfolgreiche Verifikation älter
als zehn Tage ist ([docs/29](docs/29-backup-recovery.md)).

---

## Sicherheit

| Thema | Umsetzung |
|---|---|
| Mandantentrennung | Drei Schichten: Anwendungsprüfung, Transaktionskontext, **Postgres RLS** ([ADR-0003](docs/adr/ADR-0003-tenant-isolation.md)) |
| Autorisierung | Eine einzige reine Funktion `decide()`; Default deny; Deny schlägt Allow; Sensitivity-Obergrenze je Berechtigung |
| Passwörter | Argon2id (64 MiB, t=3), Rehash beim Login bei Parameteränderung |
| Sitzungen | Opake Token, nur als Hash gespeichert, Rotation mit Reuse-Detection |
| Geheimnisse | AES-256-GCM mit AAD und `key_id` für unterbrechungsfreie Rotation |
| Logging | Redaction als **Allowlist** – neue Felder lecken nicht von selbst |
| SSRF | Nutzergesteuerte Kalender-URLs: Schema-, DNS-, Redirect- und Größenprüfung vor jedem Abruf |
| Automatisierung | Autonomiestufen im Typsystem: Verantwortungs- und Rechteänderungen sind für System-Akteure **technisch unerreichbar** ([ADR-0008](docs/adr/ADR-0008-autonomy-levels.md)) |

Bewusst **nicht** vorhanden, weil das Produkt kein Kontrollwerkzeug sein soll: keine Standortdaten,
keine Aktivitätsprofile einzelner Personen, keine Punktestände, keine Serien, keine frei
formulierbaren Push-Nachrichten an andere Familienmitglieder.

---

## Bekannte Einschränkungen

Ehrlich benannt statt beschönigt.

1. **iOS-Push nur als installierte PWA.** Web Push funktioniert auf iOS ab 16.4 erst, wenn die
   App auf dem Home-Bildschirm liegt. In-App und E-Mail sind die Rückfallebene; beim Aktivieren
   wird darauf hingewiesen ([Q-12](docs/12-open-questions.md)).
2. **Keine Ende-zu-Ende-Verschlüsselung.** Serverseitiges Monitoring und Antizipation sind der
   Produktkern; E2EE würde sie unmöglich machen. Stattdessen: strikte Autorisierung,
   Feldverschlüsselung für die sensibelste Datenklasse, minimales Logging
   ([docs/13](docs/13-risks.md)).
3. **Kalender: ICS/CalDAV produktiv, Google hinter einem Schalter.** ICS ist Polling, kein Push.
   Microsoft/Exchange fehlt ([ADR-0010](docs/adr/ADR-0010-calendar-ics-first.md)). Schreibender
   Zugriff existiert nur für Google und verlangt zusätzlich eine aktivierte Automatisierungsregel.
4. **Kalendertermine sind noch nicht mit Bereichen und Vorbereitung verknüpft.** Die Verknüpfung
   existiert im Modell, die Oberfläche bietet sie nicht an ([docs/43](docs/43-ux-audit-2.md)).
5. **Playbook-Verzweigungen** sind im Schema vorgesehen, werden aber linear ausgewertet.
6. **Die Verteilungsansicht ist standardmäßig aus.** Sie zeigt Bänder („deutlich mehr“,
   „ausgeglichen“, …), nie Prozentzahlen, und benennt ihre eigene Datenqualität. Eine Prozentzahl
   wäre etwas, worüber man streiten kann, ohne dass sie etwas misst
   ([ADR-0012](docs/adr/ADR-0012-no-fairness-percentages.md)).
7. **Löschung eines Haushalts** ist als Antrag, Zustandsmaschine und Betriebshandbuch vollständig
   modelliert; der ausführende Job `deletion.execute` fehlt noch. Export und Import sind
   dagegen fertig ([docs/58](docs/58-import-export.md)).
8. **Die Essensplanung hat keine Evidenzgrundlage.** Sie ist die am schwächsten belegte Funktion
   im Produkt; was zuerst gemessen werden müsste, steht in [docs/68](docs/68-evidenz-audit-2.md).
9. **Keine Volltextsuche.** Die Suche ist unscharf über Namen und Titel; die Spalten für mehr
   sind vorbereitet.
10. **Keine Mehrsprachigkeit.** Ausgeliefert wird Deutsch.
11. **Kein MFA, keine Passkeys.** Das Auth-Modul ist gekapselt, die Ereignisse sind reserviert.
12. **Kein visueller Abgleich gegen Referenzbilder.** Der Browserlauf prüft Geometrie und
    Barrierefreiheit, nicht Pixelgleichheit: Ein Rückschritt in der Optik fiele erst auf, wenn er
    ein geometrisches Kriterium verletzt ([docs/46](docs/46-browser-verification.md)).
13. **Nur Chromium.** Firefox und WebKit sind nicht eingerichtet; der Dunkelmodus ist rechnerisch
    geprüft, aber nicht in jedem Browser gerendert.

---

## Dokumentation

Das vollständige Verzeichnis steht in [`docs/README.md`](docs/README.md) – 57 Dokumente in vier
Phasen plus 14 [Architecture Decision Records](docs/adr/) mit Begründung und verworfenen
Alternativen. Der schnellste Einstieg:

| Wenn du wissen willst … | … lies |
|---|---|
| was das Produkt verspricht und woran es hängt | [08 – Invarianten](docs/08-invariants.md) |
| wie die Teile zusammenhängen | [20 – Architektur](docs/20-architecture.md) |
| warum die Oberfläche so geschnitten ist | [45 – Navigationsmodell](docs/45-navigation-model.md) |
| wie es aussieht und warum | [69 – Papier & Stempel](docs/69-papier-und-stempel.md) |
| was gegen Forschung belegt ist – und was eine Wette | [60](docs/60-evidenz-audit.md) · [68](docs/68-evidenz-audit-2.md) |
| wo widersprüchliche Anforderungen aufgelöst wurden | [12 – Offene Fragen](docs/12-open-questions.md) |
| was der Browser gefunden hat, was jsdom nicht sieht | [46 – Prüfung im Browser](docs/46-browser-verification.md) |

Die Dokumentation ist an mehreren Stellen im Code verankert – welche Datei welches Dokument
durchsetzt, steht am Ende von [`docs/README.md`](docs/README.md).

---

## Produktphilosophie

Der Erfolg dieses Systems misst sich nicht daran, wie viele Aufgaben abgeschlossen werden. Er
misst sich daran, ob eine Familie weniger im Kopf behalten muss, ob Verantwortung sichtbar bleibt
statt still verloren zu gehen, und ob auch an einem schlechten Tag beantwortbar ist:

> Was braucht gerade Aufmerksamkeit? Warum? Wer trägt die Verantwortung?
> Was ist der nächste machbare Schritt?

Das System versucht nicht, Menschen zu disziplinieren. Es respektiert, dass Kapazität schwankt.
