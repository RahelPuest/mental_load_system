# 43 – UX-Audit, zweiter Durchgang

Derselbe Maßstab, angewandt auf das Ergebnis des ersten Durchgangs
([docs/40](40-ux-audit.md)). Der erste Durchgang hat Struktur, Gestaltung und Interaktion
geordnet. Dieser prüft, was dabei **nicht** in der Oberfläche angekommen ist.

---

## 1. Der Hauptbefund

Der erste Durchgang hat die Oberfläche ruhiger gemacht – teilweise dadurch, dass Funktionen
nicht mitgezogen wurden. Das verstößt gegen §64 des Auftrags: *komplexe Funktionen dürfen nicht
einfach versteckt werden, ohne weiterhin auffindbar zu sein.*

Neun fachlich fertige, getestete Backend-Funktionen sind aus der Oberfläche **nicht erreichbar**:

| Funktion | Backend | Oberfläche | Folge |
|---|:--:|:--:|---|
| Aufgabe jemandem zuweisen (Delegation, §26) | ✓ | ✗ | Der Kernunterschied Verantwortung ↔ Ausführung ist nicht herstellbar |
| Warten auf etwas (§27) | ✓ | ✗ | „Wartet auf jemand anderen" erscheint in der Jetzt-Ansicht, lässt sich aber nie erzeugen |
| Kontextbedingungen an Aufgaben (§13) | ✓ | ✗ | Der Kontextfilter der Jetzt-Ansicht bleibt für neue Aufgaben wirkungslos |
| Verlauf je Objekt und Bereich (§33) | ✓ | ✗ | Nachvollziehbarkeit existiert, ist aber unsichtbar |
| In-App-Benachrichtigungen (§28) | ✓ | ✗ | Benachrichtigungen werden erzeugt und nie angezeigt |
| Entscheidungen anlegen (§17) | ✓ | ✗ | **Regression** aus Durchgang 1: Anzeige blieb, Anlegen verschwand |
| Ownership-Arten: Secondary, Shared, Support, Observer (§7.4) | ✓ | ✗ | Nur „übernehmen" und „übergeben" – vier von fünf Arten fehlen |
| Aufgabe starten / Warten freigeben | ✓ | ✗ | – |
| Ownerlose Bereiche gezielt anzeigen | ✓ | ✗ | Nur als Textzeile, nicht als Arbeitsliste |

Zusätzlich fehlt der **Einladungs- und Beitrittsfluss vollständig** – auch im Backend. Ein
Mehrpersonenprodukt, in dem die zweite Person nur per SQL entstehen kann, ist unvollständig.

---

## 2. Spezifiziert, nie gebaut

Vier Bereiche aus §4 des Auftrags existieren weder im Backend noch in der Oberfläche:

| # | Bereich | Warum es zählt |
|---|---|---|
| **F1** | **Care Mode** (§25.2) | Der Fall, für den das Produkt gedacht ist: „Person A braucht gerade Entlastung." Ohne ihn bleibt Kapazität eine Einzelanzeige statt eines Familienwerkzeugs. |
| **F2** | **Mental-Load-Balance** (§32) | Der Schalter dafür ist in den Einstellungen bereits vorhanden und schaltet nichts. Ein Schalter ohne Wirkung ist schlimmer als kein Schalter. |
| **F3** | **Knowledge Transfer** (§19) | Der dokumentierte Weg, wie Verantwortung übergeht, ohne dass die abgebende Person Projektleitung spielt. |
| **F4** | **Needs** (§4) | Die Ebene zwischen Hinweis und Vorgang: ein Bedürfnis, das fortbesteht, auch wenn das auslösende Signal weg ist. |

---

## 3. UX-Qualität: was im ersten Durchgang offenblieb

| # | Befund | UX | VIS | A11Y | E |
|---|---|:--:|:--:|:--:|:--:|
| Q1 | Nur zwei Breakpoints (720/1080). §50 verlangt fünf; Large Mobile und Wide Desktop fehlen | ●● | ●● | – | S |
| Q2 | Kein Zustand für fehlende Berechtigung – nur ein 404 oder eine leere Liste | ●●● | ● | ●● | S |
| Q3 | Keine Swipe-Aktionen; auf Mobile ist Abhaken zwei Fingerbewegungen entfernt | ●● | – | ● | M |
| Q4 | Keine Dichte-Einstellung (§41 Personalisierung) | ● | ●● | ● | S |
| Q5 | Passwort ändern nicht möglich (Account Settings unvollständig) | ●● | – | – | M |
| Q6 | Sehr lange Namen und Inhalte nicht geprüft (§67) | ● | ●● | – | S |
| Q7 | Kalendertermine ohne Bezug zu Bereich und Vorbereitung (§18) | ●● | ● | – | M |
| Q8 | Ownerlose Bereiche sind eine Textzeile, keine bearbeitbare Liste | ●● | ● | – | S |

---

## 4. Was der erste Durchgang richtig gemacht hat

Bewusst unverändert: Navigationsmodell, Designtokens, Komponentenbibliothek, Sheet- und
Toast-Muster, kuratierte Begründungen, Erfassen als Overlay, Suche und Command Palette.
Diese tragen – der zweite Durchgang baut darauf auf, statt sie zu ersetzen.

---

## 5. Priorisierte Liste für diesen Durchgang

**Critical** (Funktion existiert, ist aber unerreichbar – §64):
C1 Delegation · C2 Warten · C3 Kontextbedingungen · C4 Verlauf · C5 In-App-Benachrichtigungen ·
C6 Entscheidungen anlegen · C7 Ownership-Arten · C8 Einladung und Beitritt · C9 Ownerlose Bereiche

**High** (spezifiziert, nie gebaut):
F1 Care Mode · F2 Balance als Bänder · F3 Wissensübergabe · F4 Needs

**High** (UX-Qualität):
Q1 Breakpoints · Q2 Berechtigungszustand · Q4 Dichte · Q5 Passwort · Q8 Ownerlose Liste

**Medium**: Q3 Swipe · Q6 lange Inhalte · Q7 Kalenderkontext
