# 12 – Offene, mehrdeutige und widersprüchliche Anforderungen

Für jede Mehrdeutigkeit ist die **gewählte Interpretation** dokumentiert (§0: „Treffe keine
irreversible Produktentscheidung stillschweigend“). Reversibilität ist jeweils bewertet.

---

### Q-01 · „Trigger“ hat zwei Bedeutungen
**Spannung**: §3 listet `Trigger` in der Ontologie; §2 nutzt TRIGGER für „wann ist der richtige
Kontext“; §11 nutzt Trigger für Monitoring-Auslöser.
**Interpretation**: Zwei getrennte Konzepte. `MonitoringRule` (zeit-/zustandsbasiert, erzeugt Signale)
und `TaskContextRequirement` (situationsbasiert, steuert Sichtbarkeit). Kein gemeinsames `Trigger`-Objekt.
**Reversibel**: ja, ein späteres Fassaden-Objekt ist möglich.

### Q-02 · `NextAction` als Entität oder Projektion?
**Interpretation**: Projektion über `Task` (ADR-0006). Eine eigene Tabelle erzeugt zwei Wahrheiten
über denselben Sachverhalt und damit Sync-Fehler.
**Konsequenz**: `GET /processes/:id` liefert `nextActions: Task[]`. §12 ist erfüllt, weil die API
die Frage direkt beantwortet.
**Reversibel**: ja.

### Q-03 · Primary Owner + Shared Ownership gleichzeitig?
**Spannung**: §7.4 erlaubt beides, §7.6 verlangt explizite Modellierung.
**Interpretation**: Sich ausschließend je Domain. Entweder es gibt einen Primary Owner (mit optionalen
Secondaries) **oder** geteilte Ownership ohne Rangfolge. Sonst wäre bei Eskalation und
Vertretungsplanung unklar, wer gemeint ist – das verletzt Priorität 5 aus §47 („klare Ownership“).
**Reversibel**: teilweise – Datenmigration nötig.

### Q-04 · Ownership-Vererbung
**Spannung**: §8 verbietet unklare implizite Vererbung, verlangt aber explizite Modellierung, falls vererbt wird.
**Interpretation**: `Domain.ownership_inheritance ∈ {inherit, own}`, Default `inherit` für neu
angelegte Kind-Domains. Effektiver Owner wird zur Lesezeit aufgelöst und in der UI **immer** als
„geerbt von *Kleidung*“ ausgewiesen. Erste eigene Zuweisung schaltet auf `own`.
**Reversibel**: ja.

### Q-05 · Wer darf `sensitive`-Daten sehen – auch Admins?
**Interpretation**: Nein, nicht automatisch. Admin-Rechte sind Verwaltungsrechte, keine
Einsichtsrechte in die intimsten Inhalte anderer Erwachsener. Selbst-Erhöhung ist möglich, aber
auditiert und wird der betroffenen Person gemeldet.
**Spannung mit**: §7.2 („Systemeinstellungen verwalten“). Aufgelöst zugunsten §47 Priorität 1.
**Reversibel**: ja (Konfiguration je Household denkbar).

### Q-06 · Dürfen Kinder eigene Logins haben?
**Interpretation**: Ja, Rolle `child`/`teen`, aber nur durch einen Admin angelegt, ohne
household-weite Leserechte, ohne E-Mail-Pflicht (Login über Household-Code + PIN, Post-MVP).
Im MVP: `child`-Membership ohne User ist der Normalfall; ein Login ist optional.
**Reversibel**: ja.

### Q-07 · Was passiert bei Ende einer temporären Vertretung, wenn niemand bestätigt?
**Interpretation**: Zustand `pending_return`. Die Vertretung bleibt verantwortlich, bis bestätigt
wird. Alternative („fällt automatisch zurück“) würde INV-014 verletzen, wenn die ursprüngliche
Person noch pausiert ist.
**Reversibel**: ja, `return_mode` ist konfigurierbar.

### Q-08 · Mental-Load-Balance – wie berechnen ohne Scheinpräzision (INV-015)?
**Interpretation**: Keine Zahl. Ausgabe sind **Bänder** je Dimension (Bereiche, Check-Frequenz,
Planungsintensität, Unsicherheit, externe Abhängigkeiten, Care) plus explizite Datenqualitätsangabe
(„beruht auf 12 von 34 Bereichen mit Aufwandsangabe“). Formulierung ist Gesprächsanstoß, nie Urteil.
**Nicht reversibel ohne Produktbruch**: die Entscheidung, nie Prozente zu zeigen, ist bewusst hart.

### Q-09 · Automatische Task-Erzeugung aus Monitoring?
**Spannung**: §11 („Monitoring kann Task erzeugen“) vs. §6 („nur nach definierter Regel“) vs. §4
(kein Todo-Berg).
**Interpretation**: Default ist `AttentionItem`. Task-Erzeugung erfordert eine `AutomationRule`
je Monitor (`default_response='create_task'`), die ein Mensch aktiviert hat.
**Reversibel**: ja, reine Konfiguration.

### Q-10 · Wie tief geht Field-Level Access im MVP?
**Interpretation**: Architektur vorbereitet (`capability = 'read:field:<name>'`), aktiv nur für
`Person.birth_date` und `CalendarEvent.title`. Voll ausgerollt wäre der Wartungsaufwand im MVP
höher als der Nutzen.
**Reversibel**: ja.

### Q-11 · Kalender: welcher Provider zuerst?
**Interpretation**: Provider-Interface + zwei Implementierungen: **CalDAV/ICS** (funktioniert ohne
OAuth-Verträge, sofort testbar, deckt Apple/Nextcloud/Fastmail ab) und **Google Calendar**
(hinter Feature-Flag, benötigt OAuth-Credentials). Microsoft Graph ist Post-MVP.
Begründung: Kalenderintegration ist laut §14 Kernfunktion – eine Implementierung, die ohne
externe Vertragsbeziehung E2E-testbar ist, macht das Produkt sofort belastbar.
**Reversibel**: ja.

### Q-12 · Push ohne native App?
**Interpretation**: Web Push (VAPID) in einer installierbaren PWA. Deckt Android/Desktop
vollständig ab; iOS ab 16.4 nur nach „Zum Home-Bildschirm“. Diese Einschränkung ist in
[bekannte Einschränkungen](../README.md#bekannte-einschränkungen) dokumentiert und wird dem Nutzer
beim Aktivieren erklärt. Native Apps sind Post-MVP.
**Reversibel**: ja, Delivery-Kanäle sind pluggable.

### Q-13 · „Person A pausiert“ – dürfen andere das sehen?
**Interpretation**: Das `level` ja (sonst funktioniert Entlastung nicht, §25.2), der Freitext-`note`
nein. Kein Grund („Krankheit“, „Depression“) wird gespeichert – nur eine optionale, grobe
`reason_category` mit dem Wert `unspecified` als Default. Das System ist kein Diagnosewerkzeug (§42).
**Reversibel**: ja.

### Q-14 · Wie verhindert man, dass die Now View doch zur Todo-Liste wird?
**Interpretation**: Harte Produktgrenzen: max. 3 Einträge unter „Jetzt“ im Normalmodus, max. 1 im
Low-Capacity-Modus; jeder Eintrag braucht `why_now`; die Gesamtliste ist nur über einen bewussten
Klick erreichbar. Diese Grenzen sind Konfigurationskonstanten, keine Nutzereinstellung im MVP.
**Reversibel**: ja.

**Nachtrag (docs/60).** Die naheliegende Begründung „zu viel Auswahl überfordert" trägt
nicht: Die große Meta-Analyse zu Choice Overload findet einen mittleren Effekt von praktisch
null (Scheibehenne, Greifeneder & Todd 2010). Eine zweite Meta-Analyse (Chernev et al. 2015)
findet Moderatoren, von denen einige hier zutreffen könnten – für diesen Kontext belegt ist
das nicht.

Die Grenze bleibt, aber als **Produktentscheidung**: „Dies ist keine Liste." Sie ist über
`THEALOTTA_NOW_LIMIT` verstellbar, damit 3 gegen 7 gemessen werden kann, statt geglaubt zu werden.


### Q-15 · Löschen vs. Nachvollziehbarkeit
**Spannung**: §33/§40 vs. INV-013.
**Interpretation**: Ownership-Historie wird bei Household-Löschung mitgelöscht; bei Löschung einer
**einzelnen Person** bleibt die Historie mit pseudonymisiertem Akteur (`membership_id` bleibt,
Klarname entfällt). Die Familie behält die Nachvollziehbarkeit ihrer eigenen Vorgänge, die Person
verliert ihre Identifizierbarkeit.
**Reversibel**: nein (Löschung). Bewusst dokumentiert.

### Q-16 · „Produktionsreif“ – welche Betriebsumgebung?
**Interpretation**: Container-basiert, Zielbild „ein Docker-Compose-Stack oder ein
Kubernetes-Deployment mit verwalteter Postgres + Redis“. Kein Cloud-Anbieter fest verdrahtet.
`ops/` enthält beides. Managed Postgres wird für PITR vorausgesetzt.
**Reversibel**: ja.

---

## Bewusst nicht entschieden (bleibt offen für den Nutzer)

| Thema | Warum offen |
|---|---|
| Ob Kinder überhaupt Logins bekommen | Familienentscheidung, keine Produktentscheidung |
| Ob die Balance-Ansicht aktiviert wird | Opt-in je Household; kann in manchen Familien schaden |
| Ob Care Mode Verantwortungen automatisch vorschlägt | Vorschlag ja, Zuweisung nie (A3) |
| Standard-Domainstruktur | Vorlage wird angeboten, ist aber vollständig editierbar |
