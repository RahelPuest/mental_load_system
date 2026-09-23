# 11 – Audit- und History-Modell

## 1. Zwei getrennte Ströme

| | **History** (`DOMAIN_EVENT`) | **Audit** (`AUDIT_EVENT`) |
|---|---|---|
| Zweck | „Was ist mit diesem Objekt passiert?“ – Produktfunktion | „Wer hat sicherheitsrelevant gehandelt?“ – Nachweis |
| Adressat | Familienmitglieder | Household-Admin, Betreiber, Betroffene |
| Inhalt | fachlicher Diff, sensitivity-gefiltert | Aktion, Ergebnis, pseudonyme Subjekt-ID, IP-Hash, UA-Hash |
| Sensible Werte | ausgelassen (`valueOmitted`) | nie enthalten |
| Sichtbarkeit | `history:read` + Objektberechtigung | `audit:read` (nur `admin`) |
| Löschung | mit dem Objekt (Payload wird redigiert, Zeile bleibt) | **überlebt** die Objektlöschung |
| Retention | 24 Monate, dann Archiv | 12 Monate, dann Löschung |
| Speicherort | Haupt-DB, `household_id`-partitioniert (Range auf `occurred_at`) | separate Tabelle, kein FK, eigene RLS-Policy |
| Änderbarkeit | append-only (kein `UPDATE`/`DELETE`-Grant für die App-Rolle) | append-only, zusätzlich Hash-Chain |

Die Trennung ist ausdrücklich zulässig (§33) und hier notwendig: Der History-Strom muss bei einer
DSGVO-Löschung mitgehen, der Audit-Strom darf es nicht.

## 2. Audit-Ereignisse (abschließende Liste MVP)

```
auth.login_succeeded, auth.login_failed, auth.logout, auth.password_changed,
auth.password_reset_requested, auth.password_reset_completed, auth.session_revoked,
auth.mfa_enrolled, auth.mfa_removed
membership.invited, membership.accepted, membership.role_changed, membership.removed
grant.created, grant.revoked, grant.self_elevated
sensitive.read            (Zugriff auf Sensitivity 'sensitive' – Zugriffsprotokoll)
calendar.connected, calendar.disconnected, calendar.scope_changed
export.requested, export.downloaded
deletion.requested, deletion.cancelled, deletion.executed
household.created, household.deleted
admin.impersonation_started, admin.impersonation_ended   (Betreiber-Support, Post-MVP)
```

`sensitive.read` ist bewusst enthalten: Wenn ein Admin sich Zugriff auf `sensitive`-Inhalte gibt,
sollen die Betroffenen das nachvollziehen können. Diese Zeilen tragen `subject_id`, aber keinen Inhalt.

## 3. Manipulationsschutz

`AUDIT_EVENT` führt eine Hash-Chain:
```
row_hash = sha256(prev_row_hash || id || occurred_at || action || subject || outcome || metadata_canonical)
```
Ein täglicher Job verifiziert die Kette und alarmiert bei Bruch. Das ist kein Schutz gegen einen
Angreifer mit DB-Vollzugriff, aber es macht nachträgliche Manipulation sichtbar –
inklusive versehentlicher (fehlerhafte Migration, falsches Skript).

DB-Grants: Die Anwendungsrolle hat auf beiden Tabellen `INSERT` und `SELECT`, aber **kein**
`UPDATE`/`DELETE`. Retention-Löschungen laufen über eine separate Wartungsrolle.

## 4. History-Ansichten im Produkt

| Ansicht | Quelle | Filter |
|---|---|---|
| Objekt-Historie (Task, State, Domain) | `DOMAIN_EVENT` nach `subject_id` | Berechtigung des Objekts |
| Ownership-Historie einer Domain | `ownership.*` nach `domain_id` | `history:read` |
| „Was ist heute in unserer Familie passiert?“ | `DOMAIN_EVENT` nach `household_id`, gruppiert | nur Events, deren Subjekt der Betrachter sehen darf |
| Wertverlauf eines States | `STATE_OBSERVATION` | `state:read` + Ceiling |

**Kein** Feature: „Aktivitätsprofil einer Person“. Die History-API akzeptiert `actor_membership_id`
nur zusammen mit einem Objekt- oder Domain-Scope (§34, §42).

## 5. Rekonstruktion

Für Ownership gilt zusätzlich zur Event-Historie ein **bitemporales Tabellenmodell**
(`effective_from`/`effective_to` + `created_at`). Damit ist „Wer war am 12.08.2026 verantwortlich?“
eine simple SQL-Abfrage und hängt nicht davon ab, dass der Event-Strom vollständig ist (INV-013).
Der Event-Strom ist die Erzählung, die Tabelle ist die Wahrheit.

## 6. Was nicht geloggt wird

- Inhalte der Datenklassen C–E in Audit-Zeilen.
- Lesezugriffe unterhalb Sensitivity `sensitive` (sonst entstünde ein Überwachungsdatensatz, §34).
- Volltext von Quick-Capture-Eingaben in Logs (nur Länge und ID).
- IP-Adressen im Klartext – nur `sha256(ip || tagesrotierendes_salt)`.
