# 04 – Permission Model

## 1. Prinzip

Autorisierung ist eine **reine Funktion**:

```
decide(actor: EffectiveContext, capability: Capability, resource: ResourceRef) -> Decision
Decision = { allowed: boolean, reason: string, matchedGrant?: GrantRef, ceiling: Sensitivity }
```

Sie lebt in `packages/domain/src/authz` und hat **keinen** DB-Zugriff. Der Service-Layer lädt einen
`EffectiveContext` (Memberships, Rolle, Grants, Domainpfade, Capacity) und übergibt ihn.
Das macht die Autorisierung vollständig unit-testbar und erlaubt es, jede Entscheidung mit einer
menschenlesbaren Begründung zu protokollieren.

**Default ist `deny`.** Es gibt keinen impliziten Zugriff über Household-Mitgliedschaft allein –
außer den explizit unten aufgeführten Rollen-Basisrechten.

## 2. Vier Ebenen + Ceiling

| Ebene | `scope_type` | Beispiel |
|---|---|---|
| Household | `household` | „Erwachsene dürfen Domains anlegen“ |
| Domain (inkl. Subtree) | `domain` | „Oma darf Kind A → Gesundheit sehen“ |
| Objekt | `object` | „Nur Person A darf diese eine Notiz bearbeiten“ |
| Sensitivity | – (Attribut jedes Grants) | `max_sensitivity` als **Obergrenze** |

**Feld-Ebene** ist architektonisch vorbereitet (`ACCESS_GRANT.capability` kann `read:field:<name>`
tragen und die Serializer im API-Layer fragen pro Feld ab), im MVP aber nur für
`Person.birth_date` und `CalendarEvent.title` aktiv genutzt.

### Sensitivity-Skala (total geordnet)

```
public(0) < normal(1) < private(2) < health(3) < sensitive(4)
```

Zugriff erfordert `resource.sensitivity <= grant.max_sensitivity`. Ein Domain-Grant auf
„Kind A → Gesundheit“ mit `max_sensitivity='health'` gewährt **keinen** Zugriff auf ein
`KnowledgeItem` mit `sensitivity='sensitive'` innerhalb derselben Domain – exakt das Beispiel aus §7.3.

### Auswertungsreihenfolge

1. **Tenant-Gate**: `resource.household_id ∈ actor.householdIds`, sonst `deny` (INV-005). Antwort ist
   `404`, nicht `403` – Existenz fremder Objekte wird nicht offengelegt.
2. **Explizites `deny`-Grant** (`effect='deny'`) auf beliebiger Ebene → sofort `deny`. Deny schlägt Allow.
3. **Object-Grant** (`scope_type='object'`, `scope_id=resource.id`).
4. **Domain-Grant**: engster passender Grant entlang `resource.domainPath` (Subtree-Vererbung, längster Pfad gewinnt).
5. **Household-Rollenrecht** aus der Rollenmatrix.
6. Sonst `deny`.

In jedem Fall danach: **Sensitivity-Ceiling** des gewinnenden Grants prüfen.
`Decision.reason` nennt die gewinnende Regel, z. B.
`domain_grant:manage:domain=/kinder/kind-a/kleidung ceiling=normal`.

## 3. Rollen (Household-Basisrechte)

| Rolle | Zielgruppe | Basis-Sensitivity |
|---|---|---|
| `admin` | Erwachsene mit Systemverantwortung | `sensitive` |
| `adult` | Erwachsene Haushaltsmitglieder | `health` |
| `caregiver` | Betreuungspersonen, Großeltern | `normal` (Domain-Grants heben gezielt an) |
| `teen` | Jugendliche mit eingeschränktem Zugriff | `normal`, nur eigene + explizit freigegebene Domains |
| `child` | Kinder | `public`, nur explizit freigegebene Domains |
| `guest` | Temporäre Betreuung (Babysitter) | `public`, nur explizit freigegeben, zeitlich befristet |

> **§7.2**: Kinder erhalten **nie** automatisch Erwachsenenrechte. `teen`/`child`/`guest` haben
> household-weit *keinerlei* Leserecht auf Domains; jeder Zugriff braucht ein explizites Grant.

## 4. Permission-Matrix

Legende: ✔ = erlaubt · ○ = nur mit explizitem Grant · ✖ = nie über Rolle · **O** = zusätzlich Owner-Recht der Domain

| Capability | admin | adult | caregiver | teen | child | guest |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `household:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `household:manage` (Name, TZ, Einstellungen) | ✔ | ○ | ✖ | ✖ | ✖ | ✖ |
| `member:invite` / `member:manage` | ✔ | ○ | ✖ | ✖ | ✖ | ✖ |
| `role:assign` | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| `grant:manage` (Rechte vergeben) | ✔ | ○ | ✖ | ✖ | ✖ | ✖ |
| `person:read` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `person:manage` | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| `domain:read` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `domain:create` / `domain:manage` | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| `domain:archive` | ✔ | **O** | ✖ | ✖ | ✖ | ✖ |
| `ownership:claim` (selbst übernehmen) | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `ownership:assign` (anderen zuweisen) | ✔ | **O** | ✖ | ✖ | ✖ | ✖ |
| `ownership:transfer` (permanent übertragen) | ✔ | **O** | ✖ | ✖ | ✖ | ✖ |
| `coverage:create` (temporäre Vertretung) | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `state:read` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `state:write` | ✔ | ✔ | ○ | ○ | ✖ | ✖ |
| `state:define` (StateDefinition anlegen) | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `knowledge:read` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `knowledge:write` | ✔ | ✔ | ○ | ○ | ✖ | ✖ |
| `decision:write` (Familienregel setzen) | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| `monitor:read` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `monitor:manage` | ✔ | **O** | ✖ | ✖ | ✖ | ✖ |
| `attention:read` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `attention:triage` (confirm/snooze/dismiss) | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `attention:suppress` (`mark_irrelevant`) | ✔ | **O** | ✖ | ✖ | ✖ | ✖ |
| `process:read` / `task:read` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `process:manage` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `task:create` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `task:assign` (anderen zuweisen) | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `task:complete` (eigene) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `task:complete_others` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `task:drop` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `inbox:capture` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `inbox:process` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `calendar:connect` (eigenen Kalender) | ✔ | ✔ | ✔ | ○ | ✖ | ✖ |
| `calendar:read_shared` | ✔ | ✔ | ○ | ○ | ○ | ○ |
| `calendar:write_external` | ✔ | ○ | ✖ | ✖ | ✖ | ✖ |
| `health:read` (Sensitivity ≥ health) | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `sensitive:read` (Sensitivity = sensitive) | ○ | ○ | ○ | ✖ | ✖ | ✖ |
| `capacity:declare_self` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `capacity:read_others` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `history:read` | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| `audit:read` | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| `export:request` | ✔ | ○ | ✖ | ✖ | ✖ | ✖ |
| `household:delete` | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |

**`sensitive:read` ist auch für `admin` nur per Grant erreichbar.** Administrative Macht ≠ Einblick in
die intimsten Daten anderer Erwachsener. Ein Admin kann sich das Grant selbst geben – aber das ist ein
sichtbares, protokolliertes und der betroffenen Person gemeldetes Ereignis
(`audit:grant.self_elevated` → Notification an den Sensitivity-Subjekt-Owner).

## 5. Owner-Recht (**O**)

Wer `primary_owner`, `secondary_owner` oder `shared_owner` einer Domain ist, erhält für **diese Domain
und ihren Subtree** implizit: `domain:manage`, `domain:archive`, `monitor:manage`,
`attention:suppress`, `ownership:assign`, `ownership:transfer`, `state:define`.

Ein aktiver `TemporaryCoverage` verleiht dem Vertretenden dieselben Rechte für die Laufzeit –
mit **Ausnahme** von `ownership:transfer`. Eine Vertretung darf die permanente Ownership nicht
verändern (INV-003). Der Versuch liefert `403 coverage_cannot_transfer_ownership`.

## 6. Capacity und Autorisierung

`CapacityState` beeinflusst Autorisierung **nicht** (INV-007). Ein pausierter Nutzer behält alle Rechte.
Was sich ändert:
- `accepts_new_assignments=false` → `task:assign` **an diese Person** liefert `409 recipient_not_accepting`
  mit Override-Möglichkeit (`?override=true` + Pflichtbegründung, geloggt).
- `mute_push=true` → Notification-Kanal `push` wird `suppressed`, das Objekt bleibt unverändert.

## 7. Guest / Zeitlich befristete Grants

Jedes Grant kann `expires_at` tragen. Ein abgelaufenes Grant wird beim Laden des `EffectiveContext`
ignoriert und nächtlich aufgeräumt. Für `guest`-Memberships ist `expires_at` **Pflicht** (max. 90 Tage,
verlängerbar).

## 8. Cross-Household-Isolation

- Der `EffectiveContext` enthält die Menge `householdIds` des Users.
- Jede Query im Repository-Layer geht durch `withTenant(householdId, fn)`, das
  `SET LOCAL app.household_ids` setzt; Postgres-RLS erzwingt die Filterung zusätzlich (ADR-0003).
- Ein Integrationstest (`tenant-isolation.spec.ts`) fährt für **jede** API-Route einen
  Cross-Tenant-Zugriff und erwartet `404`.
