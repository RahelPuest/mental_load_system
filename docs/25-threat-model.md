# 25 – Threat Model

Methode: STRIDE je Vertrauensgrenze + gezielte Betrachtung der produktspezifischen Risiken
(Familienkontext, Kinderdaten, Gesundheitsdaten, Missbrauch zwischen Partner:innen).

## 1. Vertrauensgrenzen

```
[Browser] ──1──► [API] ──2──► [Postgres]
                   │  └──3──► [Redis]
                   └──4──► [Kalender-Provider] / [Push] / [SMTP]
[Worker] ──2/3/4──► ...
[Betreiber/Ops] ──5──► [Infrastruktur]
```

## 2. STRIDE

### Grenze 1 – Browser ↔ API
| Bedrohung | Gegenmaßnahme |
|---|---|
| **S** Session-Diebstahl | HttpOnly + Secure + SameSite=Lax Cookie; Rotation bei jedem Refresh; Reuse-Detection invalidiert die gesamte Token-Familie; Session-Bindung an UA-Hash |
| **S** Credential Stuffing | Argon2id (m=64 MiB, t=3, p=1), Rate-Limit 10/min/IP + 5/15min/Konto, exponentielle Verzögerung, Breach-Passwortliste bei Registrierung |
| **T** CSRF | Double-Submit-Token + SameSite; alle mutierenden Requests prüfen `X-CSRF-Token` |
| **R** Abstreiten einer Rechteänderung | `AUDIT_EVENT` mit Hash-Chain |
| **I** XSS → Datenabfluss | Strikte CSP (`default-src 'self'`, keine Inline-Skripte, Nonces), React-Escaping, kein `dangerouslySetInnerHTML`, Markdown über sanitizer, Trusted Types |
| **D** Ressourcenerschöpfung | Rate-Limits, Body-Limit 1 MB, Query-Komplexitätsgrenzen, Paginierungs-Maximum |
| **E** Rechteausweitung | Default-deny `decide()`, Deny schlägt Allow, Sensitivity-Ceiling, Owner-Rechte nur auf Subtree, Property-Tests |

### Grenze 2 – API/Worker ↔ Postgres
| Bedrohung | Gegenmaßnahme |
|---|---|
| **I** Cross-Tenant-Leak | Drei Schichten: `decide()`, `withTenant()`, **RLS**. Route-übergreifender Isolationstest. |
| **T** SQL-Injection | Ausschließlich parametrisierte Queries via Drizzle; `sql.raw` per Lint verboten |
| **E** Übermäßige DB-Rechte | Fünf getrennte Rollen (siehe [20](20-architecture.md#5)); Grant-Matrix-Test |
| **T** Manipulation der Historie | Kein `UPDATE`/`DELETE`-Grant auf Ledger-Tabellen für App-Rollen; Hash-Chain |

### Grenze 3 – Redis
| Bedrohung | Gegenmaßnahme |
|---|---|
| **I** Sensible Daten in Job-Payloads | Payloads enthalten nur IDs, nie Inhalte. Worker lädt Daten aus der DB. |
| **T** Job-Manipulation | Redis nicht öffentlich exponiert, TLS + AUTH, eigenes Netzwerksegment |
| **D** Verlust | DB ist Quelle der Wahrheit; Rekonstruktion über Scanner |

### Grenze 4 – Externe Dienste
| Bedrohung | Gegenmaßnahme |
|---|---|
| **I** Token-Diebstahl | AES-256-GCM Envelope-Verschlüsselung, `key_id` für Rotation, Klartext nur im Worker-Speicher |
| **T** Manipulierte Kalenderdaten | Behandlung als **nicht vertrauenswürdige Eingabe**: Größenlimits, Feldlängen, keine HTML-Interpretation, `sequence`-Gate; ICS-Parser mit Rekursionslimit (Zip/XML-Bomb-Analogon) |
| **S** SSRF über nutzergesteuerte ICS-URL | **Wichtig**: URL-Allowlist-Prüfung (nur http/https), DNS-Auflösung mit Blockliste für private/link-local/metadata-Bereiche, Redirect-Limit 3, Auflösung und Verbindung gegen dieselbe IP (DNS-Rebinding-Schutz), Timeout 10 s, Antwortgröße max. 10 MB |
| **R** Replay externer Webhooks | Signaturprüfung + `PROCESSED_EVENT` |

### Grenze 5 – Betrieb
| Bedrohung | Gegenmaßnahme |
|---|---|
| **I** Secrets in Logs/Images | Redaction-Allowlist, `.dockerignore`, Secret-Scanning (gitleaks) in CI, keine Secrets in Build-Args |
| **E** Ops-Zugriff auf Nutzerdaten | Produktionszugriff auditiert; Support-Impersonation (Post-MVP) erfordert Zustimmung und erzeugt `admin.impersonation_started` |
| **T** Kompromittierte Abhängigkeit | Lockfile, `pnpm audit` in CI, Dependabot, SBOM (CycloneDX) je Release, signierte Images |

## 3. Produktspezifische Bedrohungen

| Bedrohung | Warum sie hier zählt | Gegenmaßnahme |
|---|---|---|
| **Missbrauch durch eine:n Partner:in** (Überwachung, Kontrolle) | Das System kennt Routinen, Gesundheit, Belastung. | Keine Standortdaten, keine Aktivitätsprofile, keine freien Push-Texte, Kalenderinhalte per Default verborgen, Capacity-Gründe nicht gespeichert, `sensitive` auch für Admins nur per auditiertem Grant, Notification an Betroffene bei Selbst-Erhöhung |
| **Kinderdaten** | Besonders schutzbedürftig. | Kinder-Rollen ohne Household-Leserechte; keine externen Tracker; Export kindbezogener Daten nur durch Admin |
| **Ex-Partner:in behält Zugriff** nach Trennung | Realistischer und folgenschwerer Fall. | Membership-Entzug wirkt sofort (Sessions dieses Households werden invalidiert), Grants kaskadieren, Audit-Eintrag, Export für die ausscheidende Person möglich |
| **Datenweitergabe an Dritte** | Sensible Familiendaten. | Keine Analytics-Drittanbieter, keine externen Fonts/CDNs, Telemetrie self-hosted |
| **Gesundheitsdaten in Logs** | Häufigster realer Leak-Pfad. | Allowlist-Redaction, Events tragen `valueOmitted`, Log-Review in CI (Test schreibt Klasse-D-Daten und prüft, dass sie in keinem Log-Ausgabestream auftauchen) |

## 4. Least Privilege {#least-privilege}

- DB: 5 Rollen (oben).
- Container: non-root, read-only Root-FS, `no-new-privileges`, minimale Capabilities.
- Netzwerk: API ↔ DB/Redis nur intern; Worker ohne eingehende Ports; ausgehend nur zu
  Kalender-/Push-/SMTP-Zielen.
- Secrets: nur über Umgebungsvariablen aus einem Secret-Store (K8s Secrets/SOPS/Vault),
  nie im Image, nie im Repo. Rotation ohne Deployment möglich (`key_id`-Mechanismus).

## 5. Authentifizierung im Detail

| Aspekt | Umsetzung |
|---|---|
| Passwort-Hash | Argon2id, m=64 MiB, t=3, p=1, 16-Byte-Salt; Rehash bei Parameteränderung beim Login |
| Session | Opaker 256-Bit-Token, nur Hash in der DB (SHA-256), 30 Tage, Rotation bei Refresh |
| Reuse-Detection | Wiederverwendung eines rotierten Refresh-Tokens invalidiert die `family_id` komplett + Alert |
| Passwort-Reset | Single-Use-Token, 30 min gültig, nur Hash gespeichert, Antwort immer `202` (keine Kontoauskunft), invalidiert alle Sessions |
| Einladungen | Single-Use-Token, 7 Tage, an E-Mail gebunden |
| MFA | Post-MVP; `auth.mfa_*`-Events und Spalten reserviert |
| Logout | Serverseitige Invalidierung, nicht nur Cookie löschen |

## 6. Sicherheitstests in CI

`pnpm audit`, gitleaks, `npm-audit`-Gate, ZAP-Baseline gegen die laufende API,
Tenant-Isolationstest, Rollen-Grant-Matrix-Test, Auth-Negativtests (fehlendes CSRF, abgelaufene
Session, rotiertes Token), SSRF-Testsuite gegen den ICS-Fetcher (127.0.0.1, 169.254.169.254,
`.internal`, Redirect-Kette).
