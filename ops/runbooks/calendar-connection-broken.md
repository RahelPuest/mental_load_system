# Runbook: Kalenderverbindung liefert keine Daten

## Symptome
- Alert `calendar_sync_age_seconds > 6h`
- Nutzerbericht: „Termine tauchen nicht mehr auf"
- Aufmerksamkeitseintrag `integration_unhealthy` im Haushalt

## Wichtig zuerst
Ein Sync-Ausfall verändert **keine** fachlichen Daten (INV-012). Offene Vorgänge, Aufgaben und
Verantwortungen sind unberührt. Es fehlt nur neuer Kontext.

## Diagnose
```sql
SELECT id, provider, state, consecutive_failures, last_error_code, last_sync_at, next_sync_at
FROM calendar_connections
WHERE state IN ('degraded','needs_reauth') ORDER BY last_sync_at NULLS FIRST;
```

| `state` | Bedeutung | Maßnahme |
|---|---|---|
| `degraded` | ≥ 3 aufeinanderfolgende technische Fehler | Netz/Provider prüfen, Backoff abwarten |
| `needs_reauth` | 401/403 vom Provider | Nutzer muss die Verbindung neu autorisieren |

## Häufige Ursachen
1. **ICS-URL geändert oder zurückgezogen** → `last_error_code = 'SsrfBlockedError'` oder 404.
   Der Nutzer muss eine neue URL hinterlegen.
2. **Antwort zu groß** (`ICS_MAX_BYTES`) → prüfen, ob der Kalender wirklich so groß ist,
   bevor das Limit angehoben wird.
3. **Provider-Ausfall** → Backoff greift automatisch, nichts zu tun.

## Manuell erneut versuchen
```sql
UPDATE calendar_connections SET next_sync_at = now(), consecutive_failures = 0
WHERE id = '<connection-id>';
```

## Wenn die Verbindung dauerhaft tot ist
Nicht löschen. Auf `disconnected` setzen – die gespiegelten Termine bleiben als Historie erhalten:
```sql
UPDATE calendar_connections SET state = 'disconnected' WHERE id = '<connection-id>';
```
