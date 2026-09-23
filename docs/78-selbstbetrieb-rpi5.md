# 78 – Selbstbetrieb auf einem Raspberry Pi 5

Ein Haushalt, ein Gerät, eine öffentliche Adresse. Dieses Dokument beschreibt den
vollständigen Weg von einem leeren Pi zu einer aus dem Netz erreichbaren Installation –
ohne VPN für die Nutzenden, ohne offene Ports am Router, mit den Sicherungen auf der Synology.

Alles läuft in **einem** `docker compose`. Bedient wird es über **ein** Skript:
`ops/scripts/thealotta`.

> Diese Anleitung *bereitet vor*. Der letzte Schritt – das erste `thealotta up` – gehört
> bewusst in deine Hand, nicht in die eines Automaten.

## 1. Was hier entsteht

```
Internet ──HTTPS──▶ Cloudflare (TLS, Bot-Filter, Access-Anmeldung)
                        │
                        │ ausgehender Tunnel, kein Port am Router
                        ▼
   Raspberry Pi 5 ─ docker compose ─────────────────────────────┐
     cloudflared ──▶ web (nginx, SPA + /api-Weiterleitung)      │
                         └──▶ api (Fastify)                     │
                                ├──▶ postgres  ← lokale NVMe    │
                                └──▶ redis     ← lokale NVMe    │
                         worker (Jobs, Kalender, Zustellung)    │
                         backup ──▶ /mnt/synology/thealotta (NFS)    │
   ───────────────────────────────────────────────────────────── ┘
```

Bewusst **nicht** dabei: kein Reverse Proxy mit eigenem Zertifikat (macht Cloudflare),
keine Registry (Images entstehen auf dem Gerät), kein Staging (dafür ist der Aufbau zu klein),
keine Hochverfügbarkeit. Dieses Gerät ist ein Single Point of Failure – siehe §11.

### Die vier Entscheidungen und ihre Preise

| Entscheidung | Gewählt | Preis |
|---|---|---|
| Weg ins Netz | Cloudflare Tunnel + Access | Cloudflare beendet TLS und sieht den Klartext |
| Adresse | eigene Domain (~5 €/Jahr) | die einzige laufende Ausgabe |
| Datenablage | Postgres auf lokaler NVMe, Sicherung aufs NAS | die Datenbankdateien liegen nicht auf dem NAS |
| Paketierung | ein Compose auf dem Pi | kein Ausweichgerät |

## 2. Hardware und Betriebssystem

**Kein SD-Karten-Betrieb.** Der Stack schreibt dauernd: `outbox.relay` läuft alle zwei
Sekunden (`apps/worker/src/main.ts`), Redis führt ein Append-Only-Log, Postgres sein WAL.
Eine SD-Karte ist damit in Monaten verbraucht, und ihr Ausfall sieht wie ein Datenbankfehler
aus. Also NVMe über HAT oder eine USB-3-SSD.

```bash
# 64 Bit ist Pflicht – das API-Image ist arm64.
uname -m                       # muss aarch64 ausgeben

sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades nfs-common
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # danach neu anmelden
```

Auf Raspberry Pi OS greifen die Speichergrenzen aus dem Compose erst, wenn der Kernel
cgroup-Speicherbuchhaltung führt. In `/boot/firmware/cmdline.txt` **an die bestehende Zeile
anhängen** (die Datei hat genau eine Zeile):

```
cgroup_enable=memory cgroup_memory=1
```

Datenverzeichnis auf der SSD anlegen:

```bash
sudo mkdir -p /srv/thealotta/{pgdata,redis}
sudo chown -R "$USER":"$USER" /srv/thealotta
# In /etc/fstab gehört die SSD mit noatime eingebunden.
```

Nach außen wird nichts geöffnet – der Tunnel baut nur ausgehende Verbindungen auf:

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp   # SSH nur aus dem LAN
sudo ufw enable
```

## 3. Synology: Freigabe für die Sicherungen

1. **Systemsteuerung → Gemeinsamer Ordner**: `thealotta-backup` anlegen, Papierkorb aus,
   Verschlüsselung optional (die Dumps sind ohnehin verschlüsselt).
2. **Systemsteuerung → Dateidienste → NFS**: NFS aktivieren.
3. Bei der Freigabe **NFS-Berechtigungen**: Regel für die feste IP des Pi, `rw`,
   Squash „Keine Zuordnung", asynchron *aus*.
4. **Snapshot Replication** auf diese Freigabe einschalten. Das ist der Schutz, den
   docs/29 §2 mit Object-Lock meint: Wer die Sicherungen löschen kann, hat keine Sicherungen.

Auf dem Pi einbinden (`/etc/fstab`):

```
192.168.x.y:/volume1/thealotta-backup  /mnt/synology/thealotta  nfs4  rw,hard,noatime,_netdev  0  0
```

```bash
sudo mkdir -p /mnt/synology/thealotta && sudo mount -a
touch /mnt/synology/thealotta/.probe && rm /mnt/synology/thealotta/.probe   # muss klappen
```

> **Warum die Datenbank nicht dorthin gehört.** Postgres verlässt sich darauf, dass ein
> erfolgreiches `fsync` bedeutet, dass die Daten liegen, und dass Dateisperren gelten.
> NFS gibt das nur unter bestimmten Mount-Optionen her, SMB gar nicht – Postgres unterstützt
> es nicht. Ein `PGDATA` auf einer Freigabe läuft monatelang unauffällig und ist dann
> nach einem Netzaussetzer beschädigt. Wenn die Datenbankdateien zwingend auf dem NAS liegen
> sollen, ist der einzige saubere Weg ein iSCSI-LUN als Blockgerät – dann gilt aber:
> Netz weg = Datenbank steht.

## 4. Domain, Tunnel, Access

**Domain** bei einem Registrar kaufen (`.de` ab etwa 5 €/Jahr), bei Cloudflare als Zone
hinzufügen, beim Registrar die Nameserver auf die von Cloudflare umstellen. Warten, bis
die Zone „Active" zeigt.

**Tunnel** – Cloudflare Zero Trust → *Networks* → *Tunnels* → *Create a tunnel* → **Cloudflared**:

- Name: `thealotta-pi`
- Bei „Install and run a connector" **nur den Token** aus dem angezeigten Befehl kopieren
  (der lange Wert hinter `--token`). Der Befehl selbst wird nicht ausgeführt –
  cloudflared läuft als Dienst im Compose.
- *Public Hostname* anlegen:
  - Subdomain `thealotta`, Domain `example.de`
  - Type `HTTP`, URL **`web:8080`**
  
  `web` ist der Dienstname im Compose-Netz; cloudflared löst ihn über Compose-DNS auf.

**Access** – Zero Trust → *Access* → *Applications* → *Add an application* → *Self-hosted*:

- Domain: `thealotta.example.de`
- *Session Duration*: **1 Monat**. Kürzer und die Familie wird wöchentlich zur Anmeldung
  geschickt, was in einer als App installierten Oberfläche besonders lästig ist.
- Policy: *Allow*, Include → *Emails* → die Adressen der Familie.
- Login method: *One-time PIN*. Damit braucht niemand ein Konto irgendwo.

Das ist nicht nur Bequemlichkeit: `POST /api/v1/auth/register`
(`apps/api/src/routes/auth.routes.ts:30`) ist offen, es gibt keinen Schalter, der die
Registrierung nach dem ersten Konto schließt. Access ist die Tür davor – ohne sie könnte
jeder, der die Adresse kennt, ein Konto anlegen.

## 5. Geheimnisse

```bash
cp ops/docker/env.prod.example ops/docker/.env.prod
chmod 600 ops/docker/.env.prod
ops/scripts/thealotta secrets          # erzeugt alle Zufallswerte, lässt gesetzte unberührt
npx web-push generate-vapid-keys  # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY eintragen
```

Von Hand nachzutragen: `PUBLIC_BASE_URL` (`https://thealotta.example.de`), `CF_TUNNEL_TOKEN`,
die beiden VAPID-Schlüssel.

**`ENCRYPTION_KEYS` ist der einzige Wert, dessen Verlust nicht zu reparieren ist.**
Die Sicherungen enthalten die Chiffrate, nicht den Schlüssel. Ohne ihn sind alle
verschlüsselten Felder für immer verloren. Er gehört in den Passwortmanager **und** auf
Papier, an einen anderen Ort als die Sicherungen. `BACKUP_PASSPHRASE` genauso –
sie steht absichtlich nicht neben den Dateien, die sie öffnet.

Dass Web Push hier eingerichtet wird und E-Mail nicht, hat einen Grund: Push kostet nichts
und braucht keinen Dienstleister. Ohne `SMTP_URL` bleiben Benachrichtigungen in der App,
und die Passwort-Zurücksetzung per Mail funktioniert nicht.

## 6. Start

```bash
ops/scripts/thealotta preflight   # prüft Geheimnisse, Mounts, Dateisystemtypen, Platz
ops/scripts/thealotta build       # baut die Images, rollt nichts aus (dauert auf dem Pi Minuten)
ops/scripts/thealotta up          # startet alles und wartet auf /health/ready
ops/scripts/thealotta status
```

`preflight` verweigert unter anderem einen Start, wenn `DATA_DIR` auf NFS liegt oder
`PUBLIC_BASE_URL` nicht `https` ist. Letzteres wäre sonst ein besonders zäher Fehler:
Das Sitzungscookie wird mit `Secure` gesetzt, ein Browser verwirft es über `http`
stillschweigend, und der Login „tut einfach nichts". Aus demselben Grund taugt
`http://127.0.0.1:8080` auf dem Pi zur Diagnose, aber nicht zum Anmelden.

**Kein `pnpm db:seed` in Produktion** – das legt den Demohaushalt an.

## 7. Erster Haushalt

1. `https://thealotta.example.de` öffnen, bei Access mit der eigenen Adresse anmelden.
2. In der Oberfläche registrieren; dieses erste Konto legt den Haushalt an.
3. Familienmitglieder über die Einladungsfunktion hinzufügen (`joinRoutes`,
   `InvitationService`) – und ihre Adressen vorher in die Access-Policy aufnehmen,
   sonst kommen sie nicht bis zur Einladung.

## 8. Updates und der Rückweg

```bash
ops/scripts/thealotta update      # der ganze Ablauf in einem Befehl
ops/scripts/thealotta rollback    # zurück auf den vorigen Stand
```

`update` macht der Reihe nach: Preflight → Quellstand aktualisieren → **Sicherung** →
Images mit neuem Tag bauen → Migrationen → Dienste austauschen → `/health/ready` prüfen.
Wird der neue Stand nicht gesund, geht es **automatisch** auf das vorige Image-Tag zurück.

Dass das ohne Datenbankeingriff geht, ist kein Glück, sondern die Gegenleistung für die
Expand/Contract-Pflicht aus [ADR-0014](adr/ADR-0014-expand-contract-migrations.md):
Migrationen sind additiv, der alte Code läuft mit dem neuen Schema. Der Migrationsläufer
ignoriert Einträge in `schema_migrations`, zu denen im älteren Image keine Datei gehört –
ein Rückweg löst also keinen Fehler aus.

Die letzten drei Image-Stände bleiben auf dem Gerät, damit der Rückweg nicht daran
scheitert, dass das Image aufgeräumt wurde.

Seit September 2026 liegt das Projekt unter Versionsverwaltung, aber **ohne Remote**. Für den
Pi gibt es damit zwei Wege:

```bash
# A – vom Arbeitsrechner klonen (SSH muss vom Pi zum Mac gehen)
pi$ git clone ssh://benutzer@arbeitsrechner/Users/axon/Documents/development/web/mental_load_system thealotta

# B – ohne Git: spiegeln. Auch hier gilt: Geheimnisse bleiben hier.
mac$ rsync -a --delete --exclude node_modules --exclude .env --exclude 'ops/docker/.env.prod' \
       ./ pi@raspberrypi:/home/pi/thealotta/
```

Mit Weg A zieht `thealotta update` den neuen Stand selbst (`git pull --ff-only`); mit Weg B
muss vor jedem Update gespiegelt werden. Ein Remote auf GitHub würde beides vereinfachen –
dann aber mit privatem Repository, denn `ops/scripts/seed-demo.ts` trägt ein festes
Demopasswort (§docs/79 und die Anmerkung unten).

> **Wenn die Bauzeit auf dem Pi störend wird**, ist der nächste Schritt eine GitHub Action,
> die `linux/arm64`-Images in die GitHub Container Registry schiebt; `thealotta update` würde
> dann ziehen statt bauen. Solange es einmal im Monat ein Update gibt, sind die Minuten
> billiger als die zusätzliche Bewegtteile.

## 9. Sicherung und geprüfte Wiederherstellung

Der `backup`-Dienst läuft mit und tut nachts um `BACKUP_AT`:

| Was | Wohin | Aufbewahrung |
|---|---|---|
| `pg_dump -Fc`, AES-256 mit PBKDF2 | `daily/` auf dem NAS | 35 Tage |
| Kopie am Monatsersten | `monthly/` | 12 Stück |
| Restore-Prüfung (wöchentlich) | Wegwerf-Datenbank auf dem Pi | Ergebnis in `state/` |
| Redis | **nicht gesichert** | rekonstruierbar aus der Datenbank (docs/29 §2) |

Die Restore-Prüfung ist der Punkt, an dem dieser Aufbau sich von „ich habe da Dateien"
unterscheidet: Sie spielt die jüngste Sicherung wirklich zurück und vergleicht Tabellenzahl
und Migrationsstand mit der laufenden Datenbank. `thealotta status` warnt, wenn die letzte
erfolgreiche Prüfung älter als zehn Tage ist – dieselbe Schwelle wie die Metrik
`backup_restore_verified_timestamp` in docs/29 §5.

Von Hand:

```bash
ops/scripts/thealotta backup-now
ops/scripts/thealotta verify-restore
```

Eine Sicherung zurückspielen (der echte Ernstfall) folgt
[`ops/runbooks/restore.md`](../ops/runbooks/restore.md):

```bash
openssl enc -d -aes-256-cbc -md sha512 -pbkdf2 -iter 300000 \
  -pass env:BACKUP_PASSPHRASE < thealotta-20260920-0230.dump.enc \
  | docker compose ... exec -T postgres pg_restore -U thealotta -d thealotta --clean --if-exists
```

**Achtung, offene Stelle:** docs/29 §3 macht Schritt 4 zur Pflicht –
`ops/scripts/reapply-deletions.ts` soll nach einem Restore die Löschanträge erneut anwenden,
weil ein Restore sonst gelöschte Daten wiederherstellt und damit ein Datenschutzvorfall wäre.
**Dieses Skript existiert nicht**, `verify-restore.ts` ebenso wenig. Vor dem ersten echten
Restore ist das nachzuholen.

## 10. Laufender Betrieb

```bash
ops/scripts/thealotta status          # Dienste, Image-Tag, Alter der Sicherung
ops/scripts/thealotta logs api        # oder worker, web, cloudflared, backup
ops/scripts/thealotta psql
```

`/metrics` (Prometheus) und `/health/*` liegen an der Wurzel der API und damit **außerhalb**
des `/api/`-Pfads, den nginx weiterleitet: aus dem Internet sind sie nicht erreichbar,
aus dem Compose-Netz schon. Das ist Absicht.

Schlüsselrotation folgt [`ops/runbooks/rotate-encryption-key.md`](../ops/runbooks/rotate-encryption-key.md):
neuen Schlüssel in `ENCRYPTION_KEYS` **aufnehmen** (den alten stehen lassen),
`ENCRYPTION_ACTIVE_KEY_ID` umstellen, `thealotta update`.

## 11. Was dieser Aufbau nicht leistet

Ehrlich und vollständig, damit niemand sich täuscht:

- **Ein Gerät, keine Redundanz.** Fällt der Pi aus, ist der Dienst weg, bis er ersetzt ist.
  Die Daten sind dank NAS-Sicherung da; die Wiederherstellungszeit hängt daran, wie schnell
  ein zweiter Pi bereitsteht.
- **RPO 24 Stunden.** Zwischen zwei nächtlichen Sicherungen liegt ein Tag. Die fünf Minuten
  aus docs/29 §1 bräuchten WAL-Archivierung oder pgBackRest – nachrüstbar, aber dann muss
  man auch den Fall „NAS nicht erreichbar, WAL läuft voll" beherrschen.
- **Cloudflare sieht den Klartext.** Das ist der Preis für „keine offenen Ports und ein
  Filter davor". Wer das nicht will, braucht Tailscale Funnel (TLS endet auf dem Pi,
  dafür keine Adresse aus der eigenen Domain und kein Bot-Filter) oder eine
  Portweiterleitung mit eigenem Zertifikat.
- **Zwei Anmeldungen.** Erst Cloudflare Access, dann die Anwendung. Genau diese Doppelung
  ist der Schutz, solange die Registrierung offen ist.
- **Kein Staging.** Geprüft wird auf dem Arbeitsrechner, dann auf dem Gerät. `thealotta update`
  federt das mit Sicherung, Gesundheitsprüfung und automatischem Rückweg ab – ein Ersatz
  für eine Vorabumgebung ist es nicht.

## 12. Vor dem Livegang im Code zu klären

Beim Vorbereiten dieses Aufbaus sind vier Dinge aufgefallen, die den Produktivbetrieb
unmittelbar betreffen:

1. ~~**`monitor.evaluate` schlägt immer fehl.**~~ **Behoben.** Eingereiht wurde
   `{ id, householdId }`, gelesen `{ householdId, monitorId }` – `monitorId` war immer
   `undefined` und Drizzle lehnte das ab (`UNDEFINED_VALUE`). Im Betrieb hieß das: keine
   Signale, keine Aufmerksamkeitsposten, der ANTICIPATE-Schritt tot. Die Übergabe liegt
   jetzt in `monitorEvaluateInput()` (`apps/worker/src/jobs/maintenance.ts`), die Leseseite
   prüft die Nutzlast statt sie zu behaupten, und
   `apps/worker/test/monitor-scan-naht.spec.ts` deckt die Naht ab.
2. **Die Rollentrennung der Worker ist nicht in Kraft.** `WORKER_QUEUES` steht im
   Zod-Schema (`packages/contracts/src/env.ts:56`) und wird von `main.ts` nie gelesen;
   jeder Prozess startet alle drei BullMQ-Worker. Die drei Deployments aus
   README §Betrieb und docs/27 §2 sind deshalb heute nicht möglich – drei Container würden
   sich die Jobs wegnehmen und an fehlenden Rechten scheitern. INV-006 und INV-012 sind
   damit dokumentiert, aber nicht durch Berechtigungen durchgesetzt. Das Compose fährt
   deshalb bewusst **einen** Worker mit `thealotta_app_user`.
3. ~~**`ops/scripts/create-roles.sql` enthält die Entwicklungspasswörter.**~~ **Behoben.**
   Die Datei arbeitet jetzt mit `\set`-Platzhaltern (`BITTE_ERSETZEN_*`), die vor dem
   Ausführen ersetzt werden müssen. Für den Produktivbetrieb auf dem eigenen Gerät ist sie
   ohnehin nicht nötig: `ops/docker/initdb-prod/01-roles.sh` legt die Anmelderollen beim
   ersten Start mit den Werten aus `.env.prod` an.
4. **`COOKIE_SECURE` lässt sich nicht abschalten.** `z.coerce.boolean()` macht aus dem
   String `"false"` ein `true` – jeder nichtleere Wert ist wahr. Für Produktion ist das
   richtig; es erklärt aber, warum ein Zugriff über `http` im LAN nie funktionieren wird.
