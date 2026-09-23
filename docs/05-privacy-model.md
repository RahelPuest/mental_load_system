# 05 – Privacy Model

## 1. Datenklassen

| Klasse | Beispiele | Sensitivity | Speicherung | Logging |
|---|---|---|---|---|
| **A – Identität** | E-Mail, Anzeigename | `normal` | Klartext, E-Mail als `citext` UNIQUE | nur User-ID, nie E-Mail |
| **B – Familienstruktur** | Personen, Rollen, Domains | `normal` | Klartext | IDs |
| **C – Alltagszustand** | Schuhgröße, „Regenhose fehlt“ | `normal` | Klartext | IDs, **nie** Werte |
| **D – Gesundheit** | Arzttermine, Diagnosen, Medikamente | `health` | Klartext in DB, verschlüsselte Backups, RLS + Ceiling | **nur** IDs |
| **E – Besonders sensibel** | Therapie, psychische Belastung, Kinderschutz | `sensitive` | zusätzlich anwendungsseitige Verschlüsselung (`pgcrypto`-freies AES-GCM im App-Layer, Key aus KMS) | nur Existenz-Metrik |
| **F – Geheimnisse** | OAuth-Tokens, Push-Keys, Passwort-Hashes | – | AES-256-GCM (Tokens), Argon2id (Passwörter) | nie |
| **G – Telemetrie** | Correlation-IDs, Latenzen | – | Klartext | vollständig |

**Regel**: In strukturierten Logs erscheinen ausschließlich Klasse-A-IDs, Klasse-B-IDs und Klasse-G.
Der Logger besitzt eine Redaction-Allowlist (`packages/observability`): alles, was nicht explizit
erlaubt ist, wird zu `[redacted]`. Das ist eine Allow-, keine Denylist – neue Felder lecken nicht by default.

## 2. Sichtbarkeitsentscheidungen im Produkt

| Entscheidung | Default | Begründung |
|---|---|---|
| Kalendertitel anderer Mitglieder | **verborgen** (`busy`-Anzeige) | Termine offenbaren Aufenthaltsort und Gesundheit. Freigabe pro Kalender via `CALENDAR_SELECTION.share_level ∈ {none, busy, title, full}`. |
| Capacity-Level anderer | `level` sichtbar, `note` nicht | Das Produkt braucht Sichtbarkeit für Entlastung, nicht für Diagnose (§25.2). |
| Gesundheitsdomains von Kindern | für `adult` sichtbar | Elterliche Sorge ist der Normalfall; `caregiver` braucht Grant. |
| Gesundheitsdomains von Erwachsenen | nur eigene | Partner:innen sind kein Zugriffsargument. Freigabe explizit. |
| Mental-Load-Balance-Ansicht | opt-in je Household, Anzeige nur aggregiert | §32 – kein Leistungsranking. |
| Notizen zu Personen | erben `Person.sensitivity_default` | Sicher per Default. |

## 3. Kein Kontrollwerkzeug (§42)

Technisch durchgesetzte Nicht-Ziele:

- Es existiert **keine** API, die Standortdaten speichert oder abfragt.
- `ActivityEvent`-Abfragen sind **nicht** nach Akteur filterbar mit dem Ziel „was hat Person X den ganzen Tag gemacht“:
  Die History-API akzeptiert `subject_type/subject_id` (objektzentriert) oder `domain_id`,
  aber `actor_membership_id` **nur** in Kombination mit einem Objekt-Scope und nur für `admin`.
- Es gibt keine Completion-Rate, keinen Score, keine Streak-Felder im Schema.
- Push-Nachrichten an andere Personen können nicht frei formuliert werden – nur systemdefinierte
  Vorlagen (`notification_kind`), um Nudging/Nörgeln über das System zu verhindern.

## 4. Datenexport (§40)

`POST /households/:id/exports` → Job → signierter Download, 7 Tage gültig, einmalig auflösbar.

Format: ZIP mit
```
manifest.json          Schemaversion, Zeitpunkt, Umfang, Prüfsumme je Datei
data/*.jsonl           je Entität eine Zeile pro Objekt (maschinenlesbar)
readable/*.md          Domains, Wissen, Entscheidungen, offene Fragen (menschenlesbar)
attachments/<id>.<ext> Dateien
```
Der Export enthält nur, was der anfordernde Nutzer **effektiv sehen darf** – geprüft mit derselben
`decide()`-Funktion wie die API. Ein Admin-Export kennzeichnet ausgelassene Objekte als
`{"omitted": true, "reason": "insufficient_sensitivity"}`, damit kein falscher Eindruck von
Vollständigkeit entsteht.

## 5. Löschung (§40)

| Scope | Modus | Verhalten |
|---|---|---|
| Einzelobjekt (Notiz, State-Wert) | Soft Delete (30 T) → Hard | Wiederherstellbar; `DomainEvent` bleibt, Payload wird auf `{redacted:true}` reduziert |
| `Person` | Soft (30 T) → Hard | Domains mit `subject_person_id` werden **nicht** automatisch gelöscht, sondern als `orphaned` markiert und dem Admin zur Entscheidung vorgelegt (kein stiller Verlust) |
| `User` | Deaktivierung sofort, Purge nach 30 T | Memberships → `left`; Assignments dieser Person werden zu `unowned` und erzeugen `AttentionItem` je Domain (INV-014) |
| `Household` | Karenzzeit 30 T, dann Hard Delete | Nur `admin`; alle anderen Admins werden benachrichtigt und können abbrechen |

**Hard Delete umfasst**: Zeilen, Attachments im Object Storage, Kalender-Tokens (zusätzlich Widerruf
beim Provider), Push-Subscriptions, Export-Artefakte, Suchindizes.

**Backups**: Point-in-Time-Backups können gelöschte Daten bis zum Ende der Retention (35 Tage)
enthalten. Das ist dokumentiert und in der Datenschutzerklärung ausgewiesen; ein
`deletion_tombstone` (User-ID + Zeitpunkt, keine Inhalte) wird 90 Tage aufbewahrt, damit ein
Restore die Löschung **erneut anwendet** (`ops/scripts/reapply-deletions.ts`, Teil des Restore-Runbooks).

**Verbleibende Daten nach Hard Delete**: `AUDIT_EVENT`-Zeilen (Aktion, Zeitpunkt, pseudonyme
Subjekt-ID) für 1 Jahr – Nachweispflicht bei Rechteänderungen und Sicherheitsvorfällen.
Sie enthalten keine Inhalte der Klassen C–E.

## 6. Rechtsgrundlagen-Mapping (DSGVO)

| Anforderung | Umsetzung |
|---|---|
| Art. 15 Auskunft | Selbstbedienungs-Export |
| Art. 16 Berichtigung | Alle Objekte editierbar; History bleibt |
| Art. 17 Löschung | §5 oben |
| Art. 20 Portabilität | JSONL + Manifest |
| Art. 25 Privacy by Design | Default-deny Autorisierung, Sensitivity-Ceiling, Redaction-Allowlist |
| Art. 32 Sicherheit | [25-threat-model](25-threat-model.md) |
| Art. 30 Verzeichnis | `docs/compliance/ropa.md` (Post-MVP, Platzhalter angelegt) |
| Kinder (Art. 8) | Kinderkonten nur durch Household-Admin erstellbar, keine Marketing-Kommunikation, kein externes Tracking |
