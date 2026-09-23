#!/bin/bash
# Anmelderollen für den Produktivbetrieb.
#
# Läuft genau einmal: beim ersten Start mit leerem Datenverzeichnis. Danach werden
# Passwörter über `ops/scripts/thealotta rotate-db-passwords` geändert, nicht hier.
#
# Warum diese Trennung nicht optional ist: Postgres umgeht Row Level Security für Superuser
# UND für Tabelleneigentümer – auch bei FORCE ROW LEVEL SECURITY. Verbindet die Anwendung als
# einer von beiden, ist die Mandantentrennung wirkungslos, und der Test, der sie prüft, wäre
# trotzdem grün (ADR-0003).
#
# Die Tabellenrechte selbst vergibt die Migration 0003_rls_and_grants.sql an die
# NOLOGIN-Gruppenrollen; die Anmelderollen erben sie über IN ROLE.
set -euo pipefail

for var in APP_DB_PASSWORD MONITOR_DB_PASSWORD NOTIFIER_DB_PASSWORD SYNC_DB_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "FEHLER: $var ist nicht gesetzt – Rollen werden nicht angelegt." >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$APP_DB_PASSWORD" \
  -v monitor_pw="$MONITOR_DB_PASSWORD" \
  -v notifier_pw="$NOTIFIER_DB_PASSWORD" \
  -v sync_pw="$SYNC_DB_PASSWORD" <<'SQL'
-- Nur Anmelderollen: kein Superuser, kein Tabelleneigentümer.
--
-- Die Gruppenrollen, die die Tabellenrechte tragen, kommen aus den Migrationen: 0001 legt sie
-- an, 0003 vergibt die Rechte, 0012 benennt sie um und hängt diese Anmelderollen als
-- Mitglieder ein. Würde diese Datei sie selbst anlegen, gäbe es nach dem Frischaufbau zwei
-- Sätze von Gruppenrollen – und die Rechte hingen am falschen.
CREATE ROLE thealotta_app_user      LOGIN PASSWORD :'app_pw';
CREATE ROLE thealotta_monitor_user  LOGIN PASSWORD :'monitor_pw';
CREATE ROLE thealotta_notifier_user LOGIN PASSWORD :'notifier_pw';
CREATE ROLE thealotta_sync_user     LOGIN PASSWORD :'sync_pw';

GRANT CONNECT ON DATABASE thealotta
  TO thealotta_app_user, thealotta_monitor_user, thealotta_notifier_user, thealotta_sync_user;

-- Keine der Anwendungsrollen darf eigene Objekte im Schema anlegen; sonst wäre sie
-- Eigentümerin und würde RLS für diese Tabelle umgehen.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL

echo "Anmelderollen angelegt; Gruppen und Rechte folgen aus den Migrationen."
