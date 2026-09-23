#!/usr/bin/env bash
# Einmaliger Umzug des **bestehenden Entwicklungsbestands** von mira nach thealotta.
#
# Für einen Frischaufbau ist dieses Skript unnötig: Dort legt initdb die Rollen gleich unter
# den neuen Namen an, und Migration 0012 zieht Gruppenrollen und SQL-Funktionen nach.
#
# Nötig ist es nur, weil zwei Dinge nicht in einer Migration stehen können:
#
#   1. Der Docker-Projektname bestimmt den Namensraum der Volumes. Aus `name: mira` wurde
#      `name: thealotta`, also sucht Compose ab jetzt `thealotta_pgdata` – und fände ein
#      leeres Verzeichnis, während der bisherige Bestand als `mira_pgdata` daneben liegt.
#   2. Datenbank- und Superusername lassen sich nicht aus der laufenden Verbindung heraus
#      umbenennen: Man kann weder die Datenbank umbenennen, mit der man verbunden ist, noch
#      die Rolle, als die man angemeldet ist. Dafür braucht es eine zweite Superuser-Rolle,
#      die hinterher wieder verschwindet.
#
# Der bisherige Bestand wird **kopiert, nicht verschoben**: `mira_pgdata` bleibt unberührt
# liegen und ist der Rückweg, solange du ihn nicht selbst entfernst.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="$REPO_ROOT/ops/docker/docker-compose.yml"
ALT_PROJEKT=mira
NEU_PROJEKT=thealotta
NEU_PW=thealotta_dev_only
TMP_ROLLE=umbenenner_einmalig
PORT=55432

c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
info() { echo "${c_dim}·${c_off} $*"; }
ok()   { echo "${c_green}✓${c_off} $*"; }
warn() { echo "${c_yellow}!${c_off} $*"; }
die()  { echo "${c_red}✗${c_off} $*" >&2; exit 1; }

plan() {
  cat <<TXT
Der Umzug macht der Reihe nach:

  1. Entwicklungsstack anhalten (docker compose -p $ALT_PROJEKT down)
  2. Volumes kopieren:  ${ALT_PROJEKT}_pgdata → ${NEU_PROJEKT}_pgdata
                        ${ALT_PROJEKT}_redisdata → ${NEU_PROJEKT}_redisdata
     (die alten bleiben als Rückweg liegen)
  3. Nur Postgres im neuen Projekt starten
  4. Testdatenbank mira_test verwerfen (wird als thealotta_test neu angelegt)
  5. Vorübergehende Superuser-Rolle $TMP_ROLLE anlegen
  6. Datenbank mira → thealotta, Superuser mira → thealotta, Passwörter auf $NEU_PW
  7. Migration 0012 anwenden: Gruppen-/Anmelderollen und SQL-Funktionen umbenennen
  8. $TMP_ROLLE wieder entfernen
  9. Restlichen Stack starten und als thealotta_app_user gegenprüfen

Danach zeigt \`docker volume ls\` beide Sätze. Wenn alles läuft, kannst du die alten
mit \`docker volume rm ${ALT_PROJEKT}_pgdata ${ALT_PROJEKT}_redisdata\` entfernen – aber
erst dann, und nicht durch dieses Skript.
TXT
}

if [ "${1:-}" != "--jetzt" ]; then
  plan
  echo
  warn "Nichts ausgeführt. Zum Ausführen: ops/scripts/umbenennung-datenbank.sh --jetzt"
  exit 0
fi

command -v docker >/dev/null || die "docker fehlt"
docker volume inspect "${ALT_PROJEKT}_pgdata" >/dev/null 2>&1 \
  || die "Volume ${ALT_PROJEKT}_pgdata gibt es nicht – dann ist hier nichts umzuziehen"
if docker volume inspect "${NEU_PROJEKT}_pgdata" >/dev/null 2>&1; then
  die "Volume ${NEU_PROJEKT}_pgdata gibt es schon. Entweder ist der Umzug gelaufen, oder ein
    Frischaufbau liegt dort. Beides will von Hand angesehen werden, nicht überschrieben."
fi

info "1/9 Entwicklungsstack anhalten"
docker compose -p "$ALT_PROJEKT" -f "$COMPOSE" down 2>/dev/null || true
warn "Laufende 'pnpm dev:api' / 'dev:worker' / 'dev:web' bitte selbst beenden – sie halten die alten Zugangsdaten."

info "2/9 Volumes kopieren (235 MB dauern wenige Sekunden)"
for v in pgdata redisdata; do
  docker volume create "${NEU_PROJEKT}_${v}" >/dev/null
  docker run --rm \
    -v "${ALT_PROJEKT}_${v}:/von:ro" -v "${NEU_PROJEKT}_${v}:/nach" \
    alpine sh -c 'cd /von && cp -a . /nach/' >/dev/null
  ok "${ALT_PROJEKT}_${v} → ${NEU_PROJEKT}_${v}"
done

info "3/9 Postgres im neuen Projekt starten"
docker compose -p "$NEU_PROJEKT" -f "$COMPOSE" up -d postgres >/dev/null
# Der Healthcheck fragt nach der neuen Rolle und schlägt hier noch fehl – das ist erwartet.
for i in $(seq 1 60); do
  docker exec "${NEU_PROJEKT}-postgres-1" pg_isready -U mira -d mira >/dev/null 2>&1 && break
  [ "$i" = 60 ] && die "Postgres im neuen Projekt wurde nicht erreichbar"
  sleep 1
done
ok "Postgres erreichbar (noch unter den alten Namen)"

R() { docker exec -i "${NEU_PROJEKT}-postgres-1" psql -v ON_ERROR_STOP=1 -U "$1" -d "$2"; }

info "4/9 Testdatenbank verwerfen"
R mira postgres <<'SQL' >/dev/null
DROP DATABASE IF EXISTS mira_test;
SQL
ok "mira_test entfernt (wird als thealotta_test neu angelegt)"

info "5/9 Vorübergehende Superuser-Rolle anlegen"
R mira postgres >/dev/null <<SQL
DROP ROLE IF EXISTS $TMP_ROLLE;
CREATE ROLE $TMP_ROLLE SUPERUSER LOGIN PASSWORD 'einmalig';
SQL

info "6/9 Datenbank und Superuser umbenennen"
docker exec -e PGPASSWORD=einmalig -i "${NEU_PROJEKT}-postgres-1" \
  psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$TMP_ROLLE" -d postgres >/dev/null <<SQL
ALTER DATABASE mira RENAME TO thealotta;
ALTER ROLE mira RENAME TO thealotta;
ALTER ROLE thealotta PASSWORD '$NEU_PW';
SQL
ok "Datenbank mira → thealotta, Superuser mira → thealotta"

info "7/9 Migration 0012 anwenden (Gruppenrollen, Anmelderollen, SQL-Funktionen)"
DATABASE_URL="postgres://thealotta:${NEU_PW}@localhost:${PORT}/thealotta" \
  pnpm --dir "$REPO_ROOT" db:migrate 2>&1 | sed 's/^/    /'

info "8/9 Passwörter der Anmelderollen setzen und Hilfsrolle entfernen"
R thealotta thealotta >/dev/null <<SQL
ALTER ROLE thealotta_app_user      PASSWORD '$NEU_PW';
ALTER ROLE thealotta_monitor_user  PASSWORD '$NEU_PW';
ALTER ROLE thealotta_notifier_user PASSWORD '$NEU_PW';
ALTER ROLE thealotta_sync_user     PASSWORD '$NEU_PW';
DROP ROLE $TMP_ROLLE;
SQL
ok "Zugangsdaten passen jetzt zu .env und docker-compose.yml"

info "9/9 Restlichen Stack starten und gegenprüfen"
docker compose -p "$NEU_PROJEKT" -f "$COMPOSE" up -d >/dev/null
docker exec -e PGPASSWORD="$NEU_PW" "${NEU_PROJEKT}-postgres-1" \
  psql -h 127.0.0.1 -U thealotta_app_user -d thealotta -tAc \
  "select 'Anmeldung als '||current_user||' auf '||current_database()||' – '||count(*)||' Tabellen' from information_schema.tables where table_schema='public'"

rest=$(docker exec "${NEU_PROJEKT}-postgres-1" psql -U thealotta -d thealotta -tAc \
  "select count(*) from pg_roles where rolname like 'mira%'")
[ "$rest" = "0" ] && ok "Keine mira-Rolle mehr im Cluster" || die "$rest Rollen heißen noch mira*"

echo
ok "Umzug fertig."
warn "Rückweg, solange die alten Volumes liegen: docker compose -p $NEU_PROJEKT -f $COMPOSE down"
warn "und dann mit der vorigen Fassung des Repositories und -p $ALT_PROJEKT weiterarbeiten."
warn "Wenn alles läuft: docker volume rm ${ALT_PROJEKT}_pgdata ${ALT_PROJEKT}_redisdata"
