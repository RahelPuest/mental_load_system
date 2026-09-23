# Runbook: Haushalt löschen

## Ablauf im Produkt
1. Ein Admin stellt den Antrag (`POST /deletion-requests`, `scope: household`).
2. Alle anderen Admins werden benachrichtigt.
3. **30 Tage Karenzzeit.** Der Antrag kann jederzeit zurückgenommen werden.
4. Der Job `deletion.execute` führt die Löschung phasenweise aus.

## Phasen
| Phase | Umfang |
|---|---|
| `revoke` | Sitzungen beenden, Kalender-Tokens beim Provider widerrufen, Push-Registrierungen löschen |
| `files` | Anhänge im Objektspeicher entfernen |
| `rows` | Fachliche Zeilen in Abhängigkeitsreihenfolge löschen |
| `ledger` | `domain_events` löschen; `audit_events` bleiben (ohne Inhalte, 12 Monate) |
| `tombstone` | Grabstein schreiben, damit ein Restore die Löschung erneut anwenden kann |

## Manuelle Ausführung
```bash
DATABASE_URL="$ADMIN_URL" pnpm tsx ops/scripts/execute-deletion.ts --request <id>
```
Das Skript ist wiederaufnehmbar: die erreichte Phase steht in `deletion_requests.phase`.

## Was danach noch existiert
- `audit_events`: Aktion, Zeitpunkt, pseudonyme Subjekt-ID – **keine** Inhalte.
- `deletion_tombstones`: Objekttyp, ID, Zeitpunkt – 90 Tage.
- Point-in-Time-Backups bis zum Ende der Aufbewahrung (35 Tage). Das ist in der
  Datenschutzerklärung ausgewiesen; Schritt 4 des Restore-Runbooks stellt sicher, dass eine
  Wiederherstellung die Löschung nicht rückgängig macht.
