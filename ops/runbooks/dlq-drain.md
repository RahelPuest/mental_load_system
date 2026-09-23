# Runbook: Fehlgeschlagene Hintergrundjobs

## Symptome
Alert `queue_dlq_depth > 10` oder `outbox_lag_seconds > 300`.

## Grundsatz
Kein Event geht verloren. Fehlgeschlagene Outbox-Einträge bleiben in der Tabelle und werden mit
exponentiellem Backoff erneut versucht; nach 20 Versuchen stehen sie auf `dead` – auch dann sind
sie noch da (ADR-0007).

## Diagnose
```sql
SELECT topic, state, count(*), min(created_at) AS aeltestes, max(last_error) AS letzter_fehler
FROM outbox_events WHERE state <> 'published'
GROUP BY topic, state ORDER BY count DESC;
```

```bash
# BullMQ-Warteschlangen
redis-cli --scan --pattern 'bull:*:failed' | head
```

## Behebung
1. Ursache im `last_error` lesen. Häufig: Schema-Änderung ohne Rückwärtskompatibilität,
   nicht erreichbarer Provider, fehlerhafte Monitor-Konfiguration.
2. Ursache beheben, dann erneut freigeben:
```sql
UPDATE outbox_events
SET state = 'pending', attempt_count = 0, available_at = now(), last_error = NULL
WHERE state = 'dead' AND topic = '<topic>';
```
3. Einen einzelnen defekten Monitor stilllegen, statt alle zu blockieren:
```sql
UPDATE monitors SET enabled = false, last_error = 'manuell deaktiviert nach DLQ-Analyse'
WHERE id = '<monitor-id>';
```
Danach den Haushalt informieren: eine stillgelegte Beobachtungsregel ist ein Verlust an
Verlässlichkeit, den die Familie kennen muss.
