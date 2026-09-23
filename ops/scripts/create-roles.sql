-- Anmelderollen für Betreiber, die keinen Zugriff auf das initdb-Verzeichnis haben
-- (verwaltete Datenbanken) oder Rollen von Hand anlegen wollen.
--
-- **Die Passwörter hier sind Platzhalter.** Vor dem Ausführen ersetzen – oder für den
-- Produktivbetrieb auf dem eigenen Gerät gleich ops/docker/initdb-prod/01-roles.sh
-- benutzen, das die Werte aus .env.prod nimmt.
--
-- Die Anwendung darf NIE als Superuser oder Tabelleneigentümer verbinden: Postgres umgeht
-- Row Level Security für beide, auch bei FORCE ROW LEVEL SECURITY. Dann wäre die
-- Mandantentrennung wirkungslos, und der Test, der sie prüft, wäre trotzdem grün (ADR-0003).
--
-- Nur Anmelderollen. Die Gruppenrollen mit den Tabellenrechten kommen aus den Migrationen
-- 0001, 0003 und 0012; 0012 hängt die Anmelderollen dort als Mitglieder ein.
\set app_pw      'BITTE_ERSETZEN_app'
\set monitor_pw  'BITTE_ERSETZEN_monitor'
\set notifier_pw 'BITTE_ERSETZEN_notifier'
\set sync_pw     'BITTE_ERSETZEN_sync'

CREATE ROLE thealotta_app_user      LOGIN PASSWORD :'app_pw';
CREATE ROLE thealotta_monitor_user  LOGIN PASSWORD :'monitor_pw';
CREATE ROLE thealotta_notifier_user LOGIN PASSWORD :'notifier_pw';
CREATE ROLE thealotta_sync_user     LOGIN PASSWORD :'sync_pw';

GRANT CONNECT ON DATABASE thealotta
  TO thealotta_app_user, thealotta_monitor_user, thealotta_notifier_user, thealotta_sync_user;
