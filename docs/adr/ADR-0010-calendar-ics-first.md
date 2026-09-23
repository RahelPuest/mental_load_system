# ADR-0010 – ICS/CalDAV zuerst, Google hinter Feature-Flag

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§14 macht Kalenderintegration zur Kernfunktion. Google/Microsoft erfordern OAuth-Verträge,
Verifizierungsprozesse und lassen sich nicht ohne externe Zugänge end-to-end testen.

## Entscheidung
Provider-Interface mit `ics` (read-only URL) und `caldav` als produktiven MVP-Implementierungen;
Google Calendar hinter einem Feature-Flag.

## Begründung
Die Integration muss vom ersten Tag an belastbar und automatisiert testbar sein – inklusive
Recurrence, DST, gelöschten Terminen und Reconnect. Mit ICS-Fixtures geht das vollständig in CI.
Apple iCloud, Nextcloud, Fastmail sowie viele Schul- und Kita-Kalender sind damit abgedeckt.

## Konsequenzen
+ Kalender-Sync ist deterministisch testbar; kein Blocker durch externe Freigabeprozesse.
− Kein Schreiben in Kalender ohne Google; ICS-Sync ist Polling statt Push.
