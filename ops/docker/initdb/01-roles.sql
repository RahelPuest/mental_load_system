-- Anmelderollen für die lokale Entwicklung.
--
-- Wichtig: Die Anwendung darf NIE als Superuser oder als Tabelleneigentümer verbinden –
-- Postgres umgeht Row Level Security für beide. Das ist der häufigste Grund, warum RLS in
-- der Praxis wirkungslos bleibt.
--
-- Hier stehen **nur die Anmelderollen**. Die Gruppenrollen, die die Tabellenrechte tragen,
-- legt Migration 0001 an (unter den alten Namen, sie ist unveränderlich), Migration 0003
-- gibt ihnen die Rechte, und Migration 0012 benennt sie um und hängt diese Anmelderollen
-- als Mitglieder ein. Würde diese Datei die Gruppenrollen selbst anlegen, gäbe es nach dem
-- Frischaufbau zwei Sätze davon – und die Rechte hingen am falschen.
CREATE ROLE thealotta_app_user      LOGIN PASSWORD 'thealotta_dev_only';
CREATE ROLE thealotta_monitor_user  LOGIN PASSWORD 'thealotta_dev_only';
CREATE ROLE thealotta_notifier_user LOGIN PASSWORD 'thealotta_dev_only';
CREATE ROLE thealotta_sync_user     LOGIN PASSWORD 'thealotta_dev_only';

GRANT CONNECT ON DATABASE thealotta
  TO thealotta_app_user, thealotta_monitor_user, thealotta_notifier_user, thealotta_sync_user;
