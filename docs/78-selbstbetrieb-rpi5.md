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
sudo apt install -y unattended-upgrades
sudo apt install -y nfs-common    # oder cifs-utils, je nach §3
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

## 2b. Wenn der Pi schon läuft

Steht das Gerät bereits in Betrieb, fällt §2 bis auf fünf Prüfungen weg. Vier davon sind
wichtig, weil ein benutztes Gerät Zustand hat, den ein frisches nicht hat – und zwei der
Befehle aus §2 würden diesen Zustand beschädigen.

```bash
uname -m                      # aarch64
docker compose version        # v2 nötig; v1 (docker-compose) genügt nicht
docker info 2>&1 | grep -i 'memory limit'   # darf NICHTS ausgeben
```

**cgroup-Speicherbuchhaltung prüfen, nicht blind setzen.** Gibt die dritte Zeile
`WARNING: No memory limit support` aus, fehlt der Kernel-Parameter und die Grenzen aus dem
Compose sind wirkungslos. Dann – und nur dann – `cgroup_enable=memory cgroup_memory=1` an die
eine Zeile in `/boot/firmware/cmdline.txt` anhängen (bei Ubuntu: `/boot/firmware/cmdline.txt`
oder `extraargs` in `config.txt`) und neu starten. Steht es schon da, zweimal anhängen hilft
nicht, sondern verwirrt.

**Die ufw-Zeilen aus §2 nicht übernehmen.** `ufw default deny incoming` auf einem Gerät mit
laufenden Diensten schneidet diese ab. Läuft ufw schon, ist nichts zu tun: Thealotta
veröffentlicht genau einen Port, und den nur lokal.

**Port 127.0.0.1:8080 muss frei sein** – der einzige veröffentlichte Port des Stacks
(`web`, nur für Diagnose auf dem Gerät):

```bash
ss -lntp | grep ':8080' || echo '8080 frei'
```

**Liegt `DATA_DIR` wirklich auf der SSD?** Bootet der Pi von SSD, trifft
`/srv/thealotta` sie von allein. Bootet er von SD-Karte mit SSD daneben, muss `DATA_DIR`
auf den SSD-Mount zeigen – sonst schreibt Postgres auf die Karte, und das ist der Fall aus §2,
der nach Monaten wie ein Datenbankfehler aussieht.

```bash
findmnt -no SOURCE,FSTYPE --target /srv    # und: steht da wirklich die SSD?
```

### Was der Stack beansprucht

Die Obergrenzen aus dem Compose, nicht der tatsächliche Verbrauch – im Ruhezustand liegt er
deutlich darunter:

| Dienst | Grenze |
|---|---|
| `postgres` (`shared_buffers=1GB`) | 4,0 GB |
| `api` | 1,0 GB |
| `worker-default` | 1,0 GB |
| `redis` (`maxmemory 512mb`) | 768 MB |
| `worker-sync`, `worker-notify` | je 512 MB |
| `backup` | 512 MB |
| `web`, `cloudflared` | je 256 MB |
| **Summe** | **≈ 8,75 GB** |

Auf 16 GB bleiben damit gut 7 GB für Betriebssystem und das, was schon läuft. Vorher
`free -h` ansehen: belegen die bestehenden Dienste mehr als 6 GB, wird es eng.

`effective_cache_size=4GB` ist dabei kein Verbrauch, sondern ein Hinweis an den
Planer, wie viel Seitencache er erwarten darf. Auf einem geteilten Gerät ist der Wert
leicht optimistisch – das kostet höchstens einen schlechteren Abfrageplan, keinen Speicher.

Platz ist bei 512 GB kein Thema: die Daten eines Haushalts sind klein. `preflight` warnt
unter 10 GB frei, weil die wöchentliche Restore-Prüfung eine Wegwerf-Datenbank in
Datenbankgröße anlegt. Was wächst, ist nicht der Bestand, sondern der Docker-Baucache und
die drei zum Rückweg aufbewahrten Image-Stände – dagegen gibt es
`ops/scripts/thealotta prune-images`.

## 3. Synology: Freigabe für die Sicherungen

1. **Systemsteuerung → Gemeinsamer Ordner**: `thealotta-backup` anlegen, Papierkorb aus,
   Verschlüsselung optional (die Dumps sind ohnehin verschlüsselt).
2. **Snapshot Replication** auf diese Freigabe einschalten. Das ist der Schutz, den
   docs/29 §2 mit Object-Lock meint: Wer die Sicherungen löschen kann, hat keine Sicherungen.

Für das Einbinden auf dem Pi taugen **NFS und SMB gleichermaßen**. Der Sicherungsdienst
schreibt eine Datei, verschiebt sie mit `mv` innerhalb desselben Verzeichnisses und räumt über
`find -mtime` auf (`ops/scripts/backup-loop.sh`) – POSIX-Semantik jenseits davon braucht er
nicht. Entscheidend ist nur, was §2 über `DATA_DIR` sagt: **die Datenbank** gehört auf keine
Freigabe, egal über welches Protokoll.

### Variante A – NFS

Systemsteuerung → Dateidienste → NFS aktivieren. Bei der Freigabe **NFS-Berechtigungen**:
Regel für die feste IP des Pi, `rw`, Squash „Keine Zuordnung", asynchron *aus*.

`/etc/fstab`:

```
192.168.x.y:/volume1/thealotta-backup  /mnt/synology/thealotta  nfs4  rw,hard,noatime,_netdev  0  0
```

### Variante B – SMB

Systemsteuerung → Dateidienste → SMB aktivieren, in den erweiterten Einstellungen SMB3
zulassen. Der Freigabe ein Konto mit Lese-/Schreibrecht geben – am besten ein eigenes,
das nur diese Freigabe sieht.

Gibt es auf dem Pi schon eine Zugangsdatei für dieselbe Synology, wird sie
wiederverwendet – dann entfällt der folgende Block. Sonst anlegen, damit die Zugangsdaten
nicht in `/etc/fstab` stehen:

```bash
sudo apt install -y cifs-utils
sudo install -d -m 700 /etc/samba/credentials
sudo tee /etc/samba/credentials/thealotta >/dev/null <<'EOF'
username=thealotta-backup
password=DAS_PASSWORT
EOF
sudo chmod 600 /etc/samba/credentials/thealotta
```

`/etc/fstab` (eine Zeile):

```
//192.168.x.y/thealotta-backup  /mnt/synology/thealotta  cifs  credentials=/etc/samba/credentials/thealotta,vers=3.1.1,uid=1000,gid=1000,file_mode=0660,dir_mode=0770,nofail,_netdev  0  0
```

`uid`/`gid` sind die des Pi-Benutzers (`id -u`), damit die Dateien dem gehören, der sie im
Ernstfall auch zurückspielt. Der `backup`-Container schreibt als root und kommt dadurch
ohnehin an alles.

`_netdev` statt `x-systemd.automount`: Diese Freigabe soll beim Hochfahren hängen, bevor
Docker startet. Der `backup`-Container bindet den Pfad beim Start ein und hält ihn wochenlang –
eine Einbindung, die erst beim ersten Zugriff entsteht, ist dafür die schwächere Zusage.

### Beide Varianten

```bash
sudo mkdir -p /mnt/synology/thealotta && sudo mount -a
touch /mnt/synology/thealotta/.probe && rm /mnt/synology/thealotta/.probe   # muss klappen
```

`preflight` prüft nicht nur, ob `BACKUP_DIR` beschreibbar ist, sondern auch, ob es auf einer
**eigenen Einbindung** liegt. Der Grund: Hängt die Freigabe nicht, ist das Verzeichnis ein
leerer Ordner auf der lokalen Platte – beschreibbar, und die Sicherungen landen neben den
Daten, die sie absichern sollen. Das fällt sonst genau dann auf, wenn die Platte weg ist.
Ein Unterordner einer Freigabe (`/mnt/synology` eingebunden, `BACKUP_DIR` darunter) gilt
dabei als eingebunden.

> **Warum die Datenbank nicht dorthin gehört.** Postgres verlässt sich darauf, dass ein
> erfolgreiches `fsync` bedeutet, dass die Daten liegen, und dass Dateisperren gelten.
> NFS gibt das nur unter bestimmten Mount-Optionen her, SMB gar nicht – Postgres unterstützt
> es nicht. Für die **Sicherungsdateien** ist beides gleichgültig; es geht hier allein um
> `DATA_DIR`. Ein `PGDATA` auf einer Freigabe läuft monatelang unauffällig und ist dann
> nach einem Netzaussetzer beschädigt. Wenn die Datenbankdateien zwingend auf dem NAS liegen
> sollen, ist der einzige saubere Weg ein iSCSI-LUN als Blockgerät – dann gilt aber:
> Netz weg = Datenbank steht.

## 4. Domain, Tunnel, Access

**Domain**: `thealotta.app`, bei Cloudflare Registrar gekauft. Damit liegt die Zone schon
dort und ist sofort aktiv – der Umweg über einen fremden Registrar und das Umstellen der
Nameserver entfällt.

> **`.app` erzwingt HTTPS, und das ist hier ein Geschenk.** Die gesamte TLD steht auf der
> HSTS-Preload-Liste; Browser verweigern `http://` für jede `.app`-Adresse von sich aus.
> Damit ist der Fehler aus §6 über die öffentliche Adresse ausgeschlossen: ein Sitzungscookie
> mit `Secure` kann nicht mehr stillschweigend verworfen werden, weil es nie über `http`
> angefragt wird. Auf dem Pi selbst über `http://127.0.0.1:8080` gilt das nicht – das bleibt
> Diagnosewerkzeug und kein Anmeldeweg.

Nebenwirkung der Apex-Entscheidung: die Problem-URIs der API zeigen auf
`https://thealotta.app/errors/*` (`apps/api/src/lib/problem.ts`). Liegt die Anwendung auf der
Apex, laufen diese Pfade in die Oberfläche und liefern dort keine Fehlerbeschreibung. Das ist
nicht falsch – RFC 7807 verlangt nicht, dass ein `type` auflöst (docs/64) – es nützt nur
niemandem. Wer das ändern will, braucht eine Seite hinter diesen Pfaden, nicht eine andere
Adresse für die App.

> **Die Menüpfade unten gelten für den Stand Oktober 2026.** Cloudflare hat Zero Trust ins
> Haupt-Dashboard integriert und die Menüs mehrfach umbenannt: aus *Zero Trust → Networks →
> Tunnels* wurde **Networking → Tunnels**, aus *Access* wurde **Zero Trust → Access controls**,
> und *Public Hostname* heißt jetzt **Routes → Add route → Published application**. Weichen die
> Namen bei dir ab, führen die Direktlinks trotzdem hin.

**Tunnel** – <https://dash.cloudflare.com/?to=/:account/tunnels>, im Menü **Networking →
Tunnels**:

- *Create a tunnel* → **Cloudflared**, Name `thealotta-pi` → *Create Tunnel*
- Auf der folgenden Seite steht ein Installationsbefehl. Daraus **nur den langen Wert hinter
  `--token`** kopieren. Der Befehl selbst wird nicht gebraucht – cloudflared läuft als Dienst
  im Compose.
- **Hier endet §4.** Der Assistent will als nächstes einen verbundenen Connector sehen und
  lässt sich ohne ihn nicht abschließen – der Tunnel ist aber bereits angelegt und steht in
  der Liste. Den Connector liefert in §6 der Compose-Dienst `cloudflared`, und die Route wird
  danach angelegt (§6 am Ende). Den Assistenten also schließen; mit dem Token ist alles
  geholt, was jetzt gebraucht wird.

**Access** – <https://dash.cloudflare.com/>, im Menü **Zero Trust → Access controls →
Applications**:

- *Create new application* → **Self-hosted and private** → *Add public hostname*
- Domain: `thealotta.app`
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

Von Hand nachzutragen: nur `CF_TUNNEL_TOKEN` und die beiden VAPID-Schlüssel.
`PUBLIC_BASE_URL` steht in der Vorlage schon richtig.

Die VAPID-Schlüssel erzeugst du am besten **auf dem Arbeitsrechner** – dann braucht der Pi
kein Node. Alles andere an diesem Aufbau läuft in Containern; auf dem Gerät genügen Docker,
Git und Bash.

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

### Route im Tunnel anlegen

Jetzt läuft `cloudflared` als Dienst im Stack und meldet sich bei Cloudflare. Erst dadurch
ist der Tunnel im Dashboard „Healthy", und erst dann nimmt er eine Route an.

<https://dash.cloudflare.com/?to=/:account/tunnels> → der Tunnel `thealotta-pi` → Reiter
**Routes** → *Add route* → **Published application**:

- Subdomain **leer lassen**, Domain `thealotta.app`. Die Anwendung liegt auf der Apex;
  Cloudflare zeigt sie per CNAME-Flattening auf den Tunnel.
- *Service URL*: **`http://web:8080`**

`web` ist der Dienstname im Compose-Netz; cloudflared läuft im selben Netz und löst ihn über
Compose-DNS auf. Darum steht hier nicht `localhost`, wie es die Cloudflare-Beispiele zeigen.

## 7. Erster Haushalt

1. `https://thealotta.app` öffnen, bei Access mit der eigenen Adresse anmelden.
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

Seit Oktober 2026 liegt das Projekt auf GitHub, **öffentlich**:
<https://github.com/RahelPuest/mental_load_system>. Auf dem Pi also schlicht:

```bash
git clone https://github.com/RahelPuest/mental_load_system.git ~/thealotta
```

`thealotta update` zieht den neuen Stand danach selbst (`git pull --ff-only`) – kein
Spiegeln per rsync, und kein SSH-Zugang vom Pi auf den Arbeitsrechner.

Dass das Repository öffentlich ist, hat eine Folge, die man kennen muss: `ops/scripts/seed-demo.ts`
trägt ein festes Demopasswort im Klartext. Für den Betrieb ist das ohne Belang, solange §6
eingehalten wird – **`pnpm db:seed` läuft nie in Produktion**. Gefährlich wäre erst das
Gegenteil: der Demohaushalt auf einer erreichbaren Instanz, mit einem Passwort, das jeder
nachlesen kann.

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

**Beide Skripte gibt es jetzt** (docs/84): `ops/scripts/verify-restore.ts` prüft den
zurückgespielten Bestand in acht Punkten, `ops/scripts/reapply-deletions.ts` wendet
festgehaltene Löschungen erneut an — ohne `--jetzt` nur als Bericht.

**Was noch offen ist:** Löschanträge werden angelegt und lassen sich abbrechen, aber niemand
führt sie aus. Damit schreibt auch nichts Grabsteine, und Schritt 4 findet heute nichts. Die
API verspricht „die Löschung wird in 30 Tagen ausgeführt"; eingelöst wird das nicht.

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
2. ~~**Die Rollentrennung der Worker ist nicht in Kraft.**~~ **Behoben.** `WORKER_QUEUES`
   stand im Zod-Schema und wurde nie gelesen; jeder Prozess startete alle drei BullMQ-Worker.
   Jetzt bedient jeder Prozess genau die konfigurierten Schlangen, und das Produktions-Compose
   fährt drei Worker mit je eigener Datenbankrolle: `worker-default` (`thealotta_app_user`),
   `worker-sync` (`thealotta_sync_user`), `worker-notify` (`thealotta_notifier_user`).
   INV-006 und INV-012 sind damit durch Berechtigungen durchgesetzt statt durch Disziplin
   (docs/84).
3. ~~**`ops/scripts/create-roles.sql` enthält die Entwicklungspasswörter.**~~ **Behoben.**
   Die Datei nimmt die Passwörter jetzt als psql-Variablen (`-v app_pw=…`); fehlt eine,
   bleibt ein Platzhalter stehen, mit dem sich niemand anmelden kann (docs/85). Für den
   Produktivbetrieb auf dem eigenen Gerät ist sie ohnehin nicht nötig:
   `ops/docker/initdb-prod/01-roles.sh` legt die Anmelderollen beim ersten Start mit den
   Werten aus `.env.prod` an.
4. **`COOKIE_SECURE` lässt sich nicht abschalten.** `z.coerce.boolean()` macht aus dem
   String `"false"` ein `true` – jeder nichtleere Wert ist wahr. Für Produktion ist das
   richtig; es erklärt aber, warum ein Zugriff über `http` im LAN nie funktionieren wird.
