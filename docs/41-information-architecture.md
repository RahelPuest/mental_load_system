# 41 – Informationsarchitektur und Navigationsmodell

## 1. Leitfrage

Die alte Struktur bildete das **Datenmodell** ab (Bereiche, Vorgänge, Wissen, Playbooks …).
Die neue bildet die **Situation des Nutzers** ab:

| Situation | Bereich |
|---|---|
| „Ich habe gerade fünf Minuten." | **Jetzt** |
| „Mir ist etwas eingefallen." | **Erfassen** (global, überall) |
| „Ich will das Erfasste sortieren." | **Eingang** |
| „Ich will etwas nachschlagen oder pflegen." | **Bereiche** |
| „Wie geht es uns als Familie gerade?" | **Familie** |
| „Ich suche etwas Bestimmtes." | **Suche / ⌘K** |

## 2. Drei Ebenen

```
Ebene 1 – Primär (immer sichtbar)
  Jetzt · Bereiche · ⊕ Erfassen · Eingang · Familie

Ebene 2 – Kontextuell (aus Ebene 1 erreichbar, nie als eigener Tab)
  Bereichsdetail          ← aus Bereiche, aus jedem Eintrag der Jetzt-Ansicht
  Vorgangsdetail          ← aus Bereichsdetail, aus Jetzt
  Hinweise (Attention)    ← Abschnitt in Jetzt + Reiter im Bereich
  Wissen · Fragen         ← Reiter im Bereich + globale Suche
  Beobachtungsregeln      ← Reiter im Bereich
  Verantwortung/Verlauf   ← Reiter im Bereich
  Playbooks               ← aus Bereich („Ablauf starten") + Bibliothek in Familie
  Kalender                ← in Familie und im Bereichsdetail (Termine des Bereichs)

Ebene 3 – Selten (über Kopfzeile / Menü)
  Einstellungen (Haushalt · Mitglieder & Rechte · Benachrichtigungen ·
                 Geräte · Datenschutz · Daten · Protokoll)
  Konto, Abmelden
```

**Entfallene eigene Seiten:** „Mehr" (Sammelseite ohne Zweck), „Vorgänge" (gehört in den Bereich
und in Jetzt), „Wissen" als Toplevel (wird von der Suche und dem Bereich abgelöst),
„Aufmerksamkeit" als Toplevel (ist ein Abschnitt in Jetzt).

**Begründung:** Eine Sammelseite „Mehr" ist ein Eingeständnis, dass die IA nicht trägt.
Jeder Inhalt bekommt einen Ort, an dem man ihn *situativ* sucht – nicht eine Liste aller Features.

## 3. Navigationsmodell je Gerät

### Mobile (< 720 px)

```
┌──────────────────────────────┐
│  Thealotta        Familie M.  ⌕ ⋮ │  Kopfzeile: Suche + Menü
├──────────────────────────────┤
│                              │
│           Inhalt             │
│                              │
├──────────────────────────────┤
│  ◎      ⌂     ⊕      ↧    ☗  │  Jetzt Bereiche [FAB] Eingang Familie
│ Jetzt Bereiche      Eingang  │
└──────────────────────────────┘
```

- **⊕ ist ein erhöhter, zentraler Knopf.** Quick Capture ist die häufigste Aktion und liegt
  im Daumenbereich (§1.8, §16).
- Er öffnet ein **Bottom Sheet**, keine Seite: der Kontext bleibt erhalten.
- Detailseiten erhalten oben links ein Zurück-Ziel mit Klartextbezeichnung.
- Formulare und mehrstufige Aktionen laufen in Sheets.

### Tablet (720–1079 px)

Bottom-Navigation weicht einer **schmalen Seitenleiste mit Symbolen**; Inhalt bekommt mehr
Breite, aber weiterhin eine Spalte. Sheets werden zu zentrierten Dialogen.

### Desktop (≥ 1080 px)

```
┌────────────┬──────────────────────────────┬────────────────┐
│ Thealotta       │  Jetzt                       │                │
│ Familie M. │                              │  Kontextpanel  │
│            │  Was zählt gerade            │                │
│ ⊕ Erfassen │  ┌────────────────────────┐  │  Wo bist du?   │
│ ⌕ Suchen   │  │ Karte                  │  │  ○ zuhause     │
│            │  └────────────────────────┘  │  ○ unterwegs   │
│ ◎ Jetzt    │                              │                │
│ ↧ Eingang  │                              │  Kapazität     │
│            │                              │                │
│ ⌂ Bereiche │                              │  Wartet auf    │
│ ☗ Familie  │                              │  andere        │
│            │                              │                │
│ ⚙ Einstell.│                              │                │
└────────────┴──────────────────────────────┴────────────────┘
```

- **Dreispaltig**: Navigation · Inhalt · Kontext.
- Das rechte Panel trägt, was mobil als eigener Abschnitt erscheint: Kontextschalter,
  Kapazität, „Wartet auf andere". So bleibt die Hauptspalte ruhig.
- **⌘K / Strg+K** öffnet die Command Palette (Suche + Aktionen).
- Bereichsdetail wird **Master-Detail**: Bereichsbaum links im Inhalt, Detail rechts.

## 4. Navigationsprinzipien

1. **Höchstens zwei Ebenen bis zu jeder Handlung.** Aktion → Detail. Nie Detail → Detail → Detail.
2. **Position wichtiger Aktionen ist stabil.** Primäraktion einer Seite immer an derselben
   Stelle (§39: wiedererkennbare Muster bei schwankender Aufmerksamkeit).
3. **Kein Reiter für Selteneres.** Was seltener als wöchentlich gebraucht wird, gehört ins Menü.
4. **Jeder Ort hat genau eine Primäraktion.** Sekundäres wird zurückgenommen.
5. **Kontext geht nie verloren.** Erfassen, Bestätigen und kurze Bearbeitungen laufen in
   Sheets/Dialogen über der aktuellen Seite.

## 5. Suche und Command Palette

**Globale Suche** über Personen, Bereiche, Zustandsangaben, Wissen, Fragen, Entscheidungen,
Vorgänge, Aufgaben und Playbooks. Serverseitig, unscharf (Teilwort, ohne Groß-/Kleinschreibung).

**Command Palette** (Desktop, ⌘K) verbindet Suche mit Aktionen:

```
⌘K  →  "schuh"
       Bereiche      Kinder / Kind A / Kleidung / Schuhe
       Wissen        Marke X passt gut
       Playbook      Neue Schuhe                      ↵ starten
       ---
       Aktionen      Notiz erfassen
                     Wenig Kapazität heute
                     Einstellungen öffnen
```

Sie ist **Ergänzung**, kein Ersatz: Jede Aktion bleibt auch über die normale Navigation erreichbar.

## 6. Responsive-Strategie je Ansicht

| Ansicht | Mobile | Tablet | Desktop |
|---|---|---|---|
| Jetzt | eine Spalte, Kontext als aufklappbarer Kopf | eine Spalte, breiter | Inhalt + Kontextpanel rechts |
| Bereiche | Liste → Detailseite | Liste → Detailseite | Master-Detail nebeneinander |
| Bereichsdetail | Abschnitte untereinander, Sprungmarken | wie mobil, breiter | zweispaltig: Zustand+Wissen \| Arbeit+Regeln |
| Vorgang | Schrittliste, Sheet für Bearbeitung | wie mobil | Schritte + Kontextpanel |
| Familie | Abschnitte untereinander | zweispaltig | zweispaltig + Kontextpanel |
| Einstellungen | Liste → Unterseite | Liste → Unterseite | Master-Detail |
| Erfassen | Bottom Sheet | Dialog | Dialog, per ⌘N |

## 7. Was bewusst nicht als Seite existiert

| Nicht als Seite | Stattdessen | Warum |
|---|---|---|
| „Mehr" | – | Sammelseiten verstecken schlechte IA |
| „Alle Aufgaben" | Jetzt + Bereichsdetail | Verhindert Rückfall zur To-do-Liste (§42) |
| „Alle Hinweise" | Abschnitt in Jetzt + Bereichsreiter | Hinweise sind kontextgebunden |
| „Berechtigungsmatrix" | pro Person und pro Bereich in Klartext | Matrizen versteht niemand (§44) |
| „Dashboard" | Jetzt | Ein Dashboard ohne Handlungsbezug ist Dekoration (§53) |
