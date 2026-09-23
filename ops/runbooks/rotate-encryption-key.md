# Runbook: Verschlüsselungsschlüssel rotieren

Betrifft `credentials_ciphertext` (Kalender-Zugangsdaten) und künftige Klasse-E-Felder.

## Prinzip
Jedes Chiffrat trägt seine `key_id`. Alte Schlüssel bleiben zum **Entschlüsseln** aktiv, während
neue Daten bereits mit dem neuen Schlüssel geschrieben werden. Dadurch ist kein Ausfallfenster nötig.

## Ablauf
1. Neuen Schlüssel erzeugen:
   ```bash
   openssl rand -base64 32
   ```
2. `ENCRYPTION_KEYS` erweitern – **alten Schlüssel behalten**:
   ```json
   {"k1":"<alt>","k2":"<neu>"}
   ```
3. `ENCRYPTION_ACTIVE_KEY_ID=k2` setzen und ausrollen. Ab jetzt wird mit `k2` verschlüsselt.
4. Bestandsdaten neu verschlüsseln (batched, wiederaufnehmbar):
   ```bash
   DATABASE_URL="$ADMIN_URL" pnpm tsx ops/scripts/rewrap-secrets.ts --batch 200
   ```
5. Prüfen, dass kein Chiffrat mehr auf den alten Schlüssel zeigt:
   ```sql
   SELECT credentials_key_id, count(*) FROM calendar_connections
   WHERE credentials_ciphertext IS NOT NULL GROUP BY 1;
   ```
6. Erst dann `k1` aus `ENCRYPTION_KEYS` entfernen und erneut ausrollen.

## Wenn Schritt 6 zu früh passiert
Die betroffenen Kalenderverbindungen lassen sich nicht mehr entschlüsseln. Sie sind dann auf
`needs_reauth` zu setzen; die Nutzer müssen neu autorisieren. Fachliche Daten gehen nicht verloren.
