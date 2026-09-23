# 21 – API Contract

REST über JSON, OpenAPI 3.1 wird aus den Zod-Schemas in `packages/contracts` generiert
(`GET /openapi.json`, Swagger-UI unter `/docs` außerhalb von Produktion).

## 1. Konventionen

| Thema | Regel |
|---|---|
| Basis | `/api/v1` |
| Tenant | Household ist Teil des Pfads (`/households/:householdId/...`) – nie implizit aus der Session |
| Auth | HttpOnly-Cookie `thealotta_session` (SameSite=Lax) + `X-CSRF-Token` bei mutierenden Requests |
| IDs | UUIDv7 (zeitlich sortierbar) |
| Zeit | ISO-8601 mit Offset; Eingaben ohne Offset werden abgelehnt |
| Paginierung | Cursor: `?cursor=&limit=` (max 100), Antwort `{ items, nextCursor }` |
| Concurrency | `ETag` auf Einzelressourcen, `If-Match` Pflicht bei `PATCH`/`PUT` (sonst `428`) |
| Idempotenz | `Idempotency-Key` bei allen `POST` (Pflicht bei Quick Capture) |
| Fehler | RFC 9457 Problem Details |
| Rate Limit | global 300/min/IP, Auth 10/min/IP, Quick Capture 60/min/User |
| Korrelation | `X-Request-Id` wird übernommen oder erzeugt und in allen Logs/Events geführt |

### Fehlerformat

```json
{
  "type": "https://thealotta.app/errors/version_conflict",
  "title": "Das Objekt wurde zwischenzeitlich geändert.",
  "status": 409,
  "code": "version_conflict",
  "detail": "Erwartet Version 4, aktuell ist Version 5.",
  "instance": "/api/v1/households/.../tasks/...",
  "requestId": "01J...",
  "current": { }
}
```

**Fehlercodes** (Auszug): `unauthenticated`, `forbidden`, `not_found`, `version_conflict`,
`invalid_transition`, `precondition_required`, `idempotency_key_reused`, `request_in_flight`,
`validation_failed`, `recipient_not_accepting`, `coverage_cannot_transfer_ownership`,
`requires_human_actor`, `already_claimed`, `rate_limited`, `integration_unavailable`.

**Wichtig (INV-005)**: Fehlende Berechtigung auf ein Objekt eines fremden Households liefert `404`.
`403` erscheint nur, wenn der Nutzer die Existenz des Objekts ohnehin kennen darf.

## 2. Ressourcen

### Auth
```
POST   /auth/register                 { email, password, displayName }
POST   /auth/login                    { email, password } → Session-Cookie
POST   /auth/logout
POST   /auth/refresh                  Rotation, Reuse-Detection → Familie invalidieren
POST   /auth/password-reset/request   { email }        (immer 202, keine Existenzauskunft)
POST   /auth/password-reset/confirm   { token, password }
GET    /auth/me                       → { user, memberships[] }
```

### Household & Menschen
```
GET    /households                          eigene Households
POST   /households                          { name, timezone, template? }
GET    /households/:hid
PATCH  /households/:hid                     If-Match
POST   /households/:hid/invitations         { email, role, expiresAt? }
POST   /invitations/:token/accept
GET    /households/:hid/members
PATCH  /households/:hid/members/:mid        { role?, status? }        → AuditEvent
GET    /households/:hid/persons
POST   /households/:hid/persons             { displayName, personKind, birthDate?, sensitivityDefault? }
PATCH  /households/:hid/persons/:pid
GET    /households/:hid/grants
POST   /households/:hid/grants              { membershipId, scopeType, scopeId, capability, maxSensitivity, effect, expiresAt? }
DELETE /households/:hid/grants/:gid
```

### Domains & Ownership
```
GET    /households/:hid/domains                    ?tree=true&includeEffectiveOwner=true
POST   /households/:hid/domains                    { name, parentId?, subjectPersonId?, criticality, sensitivity, ownershipInheritance }
PATCH  /households/:hid/domains/:did
POST   /households/:hid/domains/:did/archive
POST   /households/:hid/domains/:did/move-items   { targetDomainId, items: [{ kind, id }] }
                                                  Quelle steht in der Adresse. `domain:manage` auf beiden
                                                  Bereichen. → { moved, mitgenommen } (docs/72)
GET    /households/:hid/domains/:did/assignments
POST   /households/:hid/domains/:did/assignments   { membershipId, assignmentKind, note? }
DELETE /households/:hid/domains/:did/assignments/:aid   { reason }
POST   /households/:hid/domains/:did/claim         eigene Ownership übernehmen
POST   /households/:hid/domains/:did/transfer      { toMembershipId, reason }   → nie für Coverage-Inhaber
GET    /households/:hid/domains/:did/ownership-history  ?at=<ISO>
GET    /households/:hid/coverages                  ?state=active
POST   /households/:hid/coverages                  { domainId, coveringMembershipId, startsAt, endsAt, returnMode, reasonCategory? }
POST   /households/:hid/coverages/:cid/confirm-return
POST   /households/:hid/coverages/:cid/cancel
GET    /households/:hid/unowned                    Domains ohne effektiven Owner
```

### State & Wissen
```
GET    /households/:hid/domains/:did/state-definitions
POST   /households/:hid/domains/:did/state-definitions  { key, label, dataType, options?, freshnessInterval?, isCritical, sensitivity, unit? }
PATCH  /households/:hid/state-definitions/:sdid   { label?, dataType?, unit?, freshnessInterval?,
                                                   isCritical?, description? }  – nie `key` (docs/77)
GET    /households/:hid/state-definitions/:sdid/value
PUT    /households/:hid/state-definitions/:sdid/value   { valueKind, value?, note?, confirm? }  If-Match
GET    /households/:hid/state-definitions/:sdid/observations
POST   /households/:hid/state-values/:svid/resolve-conflict { chosenObservationId, note }
GET    /households/:hid/knowledge            ?domainId=&kind=&q=
POST   /households/:hid/knowledge            { domainId?, scope, kind, title, body, sensitivity }
GET    /households/:hid/questions            ?state=open
POST   /households/:hid/questions            { domainId?, body, directedTo? }
POST   /households/:hid/questions/:qid/answer { body, promoteToKnowledge }
GET    /households/:hid/decisions
POST   /households/:hid/decisions            { domainId?, title, body, decisionKind, bindingLevel, reviewAfter? }
```

### Monitoring & Attention
```
GET    /households/:hid/monitors             ?domainId=
POST   /households/:hid/monitors             { domainId, stateDefinitionId?, name, ruleKind, config, defaultResponse }
PATCH  /households/:hid/monitors/:mid
POST   /households/:hid/monitors/:mid/evaluate     manuelle Auswertung (Debug/Test)
GET    /households/:hid/attention                  ?state=open&domainId=
GET    /households/:hid/attention/:aid              inkl. supportingSignals[]
POST   /households/:hid/attention/:aid/confirm
POST   /households/:hid/attention/:aid/snooze       { until, reason? }
POST   /households/:hid/attention/:aid/dismiss      { reason? }
POST   /households/:hid/attention/:aid/mark-irrelevant { reason }      → MonitorSuppression
POST   /households/:hid/attention/:aid/promote      { processTitle?, playbookId? } → Process
```

### Arbeit
```
GET    /households/:hid/processes            ?state=active&domainId=
POST   /households/:hid/processes            { domainId, title, goal?, playbookId?, ownerMembershipId? }
GET    /households/:hid/processes/:pid       → { process, tasks[], nextActions[] }
PATCH  /households/:hid/processes/:pid
POST   /households/:hid/processes/:pid/complete  { outcome, learnings? }
POST   /households/:hid/processes/:pid/abandon   { reason }
GET    /households/:hid/tasks                ?state=&assignee=&domainId=&context=
POST   /households/:hid/tasks                { title, domainId?, processId?, contextRequirements[], estimatedMinutes?, mentalEnergy?, dueAt?, deferUntil? }
PATCH  /households/:hid/tasks/:tid           If-Match
POST   /households/:hid/tasks/:tid/complete  { note?, stateUpdates?[] }   idempotent
POST   /households/:hid/tasks/:tid/start
POST   /households/:hid/tasks/:tid/defer     { until, reason? }
POST   /households/:hid/tasks/:tid/wait      { waitingKind, description, recheckAt, waitingOnMembershipId? }
POST   /households/:hid/tasks/:tid/release-wait
POST   /households/:hid/tasks/:tid/drop      { reason }
POST   /households/:hid/tasks/:tid/assign    { membershipId, delegationKind, override? }
GET    /households/:hid/context-tags
POST   /households/:hid/context-tags         { key, label, tagKind, personId? }
GET    /households/:hid/playbooks
POST   /households/:hid/playbooks            { domainId?, title, triggerDescription, steps[] }
POST   /households/:hid/playbooks/:pbid/instantiate { domainId, title? } → Process
```

### Now View, Capture, Inbox, Kapazität
```
GET    /households/:hid/now      ?contexts=home,child:<personId>&capacity=low&at=<ISO>
       → { sections: [{ key, label, items: [{ subjectType, subjectId, title, why[],
                       contextStatus, owner, nextStep, estimatedMinutes, energy }] }],
           capacity, activeContexts, generatedAt }
POST   /households/:hid/capture  { text, occurredAt? }   Idempotency-Key Pflicht
GET    /households/:hid/inbox    ?state=captured
POST   /households/:hid/inbox/:iid/process { targetType, payload }
POST   /households/:hid/inbox/:iid/discard { reason }
GET    /households/:hid/capacity/me
PUT    /households/:hid/capacity/me  { level, endsAt?, acceptsNewAssignments, criticalOnly, mutePush, reasonCategory? }
DELETE /households/:hid/capacity/me
GET    /households/:hid/overview     Familienübersicht (§31)
```

### Kalender
```
GET    /households/:hid/calendar-connections                  eigene im Detail, fremde nur gezählt
POST   /households/:hid/calendar-connections                  { provider: 'ics'|'caldav', config } → Adresse verschlüsselt
PATCH  /households/:hid/calendar-connections/:cid/selection    { externalCalendarId, readEnabled, writeEnabled, shareLevel }
POST   /households/:hid/calendar-connections/:cid/sync         setzt den Abgleich auf „jetzt fällig"
DELETE /households/:hid/calendar-connections/:cid              → AuditEvent; gespiegelte Termine bleiben (INV-012)
GET    /households/:hid/calendar-events   ?from=&to=           Inhalte gemäß share_level maskiert
```

### Playbooks (§15)
```
GET    /households/:hid/playbooks                    ?domainId=  → inkl. Schritten
POST   /households/:hid/playbooks                    { domainId?, title, triggerDescription, steps[] }
POST   /households/:hid/playbooks/:pbid/instantiate  { domainId, title? } → Process mit verketteten Tasks
GET    /households/:hid/playbook-suggestions         ?domainId=&title=  (Autonomiestufe A1: Vorschlag mit Begründung)
```

### Bereichs-Detailansicht
```
GET    /households/:hid/domains/:did/detail
       → { domain, children[], states[], monitors[], knowledge[], questions[], decisions[],
           processes[], attention[] }
```
Eine Anfrage statt sieben: §41 verlangt geringe Navigationstiefe, und die Oberfläche zeigt
einen Bereich als Ganzes.

### Einstellungen
```
GET    /households/:hid/settings                     inkl. Klartext-Erklärungen je Option
PATCH  /households/:hid/settings                     { name?, timezone?, notificationContentLevel?, balanceViewEnabled? }
PATCH  /households/:hid/members/:mid/role            { role }  → AuditEvent, letzter Admin geschützt
GET    /households/:hid/push-subscriptions
```

### Notifications, History, Governance
```
GET    /households/:hid/notifications           ?state=unread
POST   /households/:hid/notifications/:nid/ack
GET    /households/:hid/notification-preferences
PUT    /households/:hid/notification-preferences [{ notificationKind, priorityFloor, channels, quietHours }]
POST   /households/:hid/push-subscriptions      { endpoint, keys }
DELETE /households/:hid/push-subscriptions/:sid
GET    /households/:hid/history                 ?subjectType=&subjectId=&domainId=&cursor=
GET    /households/:hid/audit                   nur admin
POST   /households/:hid/exports                 { scope }
GET    /households/:hid/exports/:eid            → { state, downloadUrl? }
POST   /households/:hid/deletion-requests       { scope, subjectId?, mode }
DELETE /households/:hid/deletion-requests/:did  Abbruch in der Karenzzeit
GET    /health/live   /health/ready   /metrics  (intern)
```

## 3. Antwortbeispiel: Now View

```json
{
  "generatedAt": "2026-09-07T09:12:00+02:00",
  "capacity": { "level": "reduced", "source": "self_declared" },
  "activeContexts": ["home", "person:kind-a", "weekend"],
  "sections": [
    {
      "key": "now",
      "label": "Jetzt relevant",
      "limit": 3,
      "items": [{
        "subjectType": "task",
        "subjectId": "01J...",
        "title": "Beim nächsten Schuheanziehen Zehenraum prüfen",
        "domain": { "id": "01J...", "path": "Kinder / Kind A / Kleidung / Schuhe" },
        "owner": { "membershipId": "01J...", "displayName": "Anna", "isYou": false },
        "assignee": { "membershipId": "01J...", "displayName": "Ben", "isYou": true },
        "why": [
          { "code": "state_stale", "label": "Information könnte veraltet sein",
            "explanation": "Schuhgröße zuletzt am 12.08.2026 bestätigt, Prüfintervall 6 Wochen.",
            "contribution": 34 },
          { "code": "context_match", "label": "Passender Moment",
            "explanation": "Kind A ist anwesend und ihr seid zuhause.", "contribution": 25 },
          { "code": "low_cost", "label": "Schnell erledigt",
            "explanation": "2 Minuten, wenig Energie nötig.", "contribution": 12 }
        ],
        "ifItWaits": "Keine akute Folge. Bei weiterem Warten steigt das Risiko drückender Schuhe.",
        "contextStatus": { "satisfied": ["home", "person:kind-a"], "missing": [] },
        "nextStep": "Zehenraum prüfen (Daumenbreite vor dem großen Zeh)",
        "estimatedMinutes": 2,
        "mentalEnergy": "low"
      }]
    },
    { "key": "needs_clarification", "label": "Braucht Klärung", "items": [] },
    { "key": "waiting", "label": "Wartet auf jemand anderen", "items": [] },
    { "key": "soon", "label": "Demnächst relevant", "items": [] }
  ]
}
```

`why` ist **immer** nicht leer (INV-008). Die Summe der `contribution`-Werte ergibt den Score,
der bewusst nicht ausgegeben wird – der Nutzer sieht Gründe, keine Punktzahl.

## 4. Versionierung

Additiv innerhalb `v1`: neue optionale Felder, neue Endpunkte. Breaking Changes → `/api/v2`,
`v1` bleibt mindestens 6 Monate. Clients müssen unbekannte Felder ignorieren
(Contract-Test erzwingt Vorwärtskompatibilität).
