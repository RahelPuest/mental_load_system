-- Anmelderollen für Betreiber, die keinen Zugriff auf das initdb-Verzeichnis haben
-- (verwaltete Datenbanken) oder Rollen von Hand anlegen wollen.
--
-- Die Passwörter kommen als psql-Variablen herein:
--
--   psql "$DATABASE_ADMIN_URL" \
--     -v app_pw="…" -v monitor_pw="…" -v notifier_pw="…" -v sync_pw="…" \
--     -f ops/scripts/create-roles.sql
--
-- Wer eine Variable weglässt, bekommt einen Platzhalter, mit dem sich niemand anmelden
-- kann. Das ist Absicht: ein vergessenes Passwort soll den Zugang verwehren und nicht
-- still ein bekanntes setzen. Für den Produktivbetrieb auf dem eigenen Gerät nimmt
-- ops/docker/initdb-prod/01-roles.sh die Werte direkt aus .env.prod.
--
-- Die Anwendung darf NIE als Superuser oder Tabelleneigentümer verbinden: Postgres umgeht
-- Row Level Security für beide, auch bei FORCE ROW LEVEL SECURITY. Dann wäre die
-- Mandantentrennung wirkungslos, und der Test, der sie prüft, wäre trotzdem grün (ADR-0003).
--
-- Nur Anmelderollen. Die Gruppenrollen mit den Tabellenrechten kommen aus den Migrationen
-- 0001, 0003 und 0012; 0012 hängt die Anmelderollen dort als Mitglieder ein.
\if :{?app_pw}
\else
\set app_pw 'BITTE_ERSETZEN_app'
\endif
\if :{?monitor_pw}
\else
\set monitor_pw 'BITTE_ERSETZEN_monitor'
\endif
\if :{?notifier_pw}
\else
\set notifier_pw 'BITTE_ERSETZEN_notifier'
\endif
\if :{?sync_pw}
\else
\set sync_pw 'BITTE_ERSETZEN_sync'
\endif

CREATE ROLE thealotta_app_user      LOGIN PASSWORD :'app_pw';
CREATE ROLE thealotta_monitor_user  LOGIN PASSWORD :'monitor_pw';
CREATE ROLE thealotta_notifier_user LOGIN PASSWORD :'notifier_pw';
CREATE ROLE thealotta_sync_user     LOGIN PASSWORD :'sync_pw';

GRANT CONNECT ON DATABASE thealotta
  TO thealotta_app_user, thealotta_monitor_user, thealotta_notifier_user, thealotta_sync_user;
